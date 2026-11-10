"""Puente entre el ESP32 (serial USB) y la base de datos.

- Lee las tramas del ESP32 y guarda lecturas, eventos y celdas recorridas.
- Lee los comandos pendientes (de la app o Alexa) y los manda al ESP32.

Protocolo (decisión D17 de la bóveda, 115200 baud, una trama cada 200 ms):
  ESP32 -> Pi: S,t_ms,encI,encD,yaw,tof0,tof1,tof2,piso,bump,ir,mV,mA,fuga,estado,alerta
               estado = ok | paro | fuga     alerta = texto sin comas ("ninguna" si no hay)
  Pi -> ESP32: M,vI,vD  (velocidades)  ·  C,turbina%,cepillo,bomba  ·  X (paro)
               R (quita el paro)  ·  Z (pone el yaw en 0)
  El paro X se queda trabado en el ESP32 hasta que llega R.
  El cepillo va con la turbina en el mismo MOSFET, así que el ESP32 ignora ese campo.

Ejecutar:
  python3 puente_robot.py                  # con el robot en /dev/ttyUSB0
  python3 puente_robot.py --simular        # sin hardware: robot simulado para probar API y app
"""
import argparse
import math
import random
import time
from datetime import datetime

import db
from navegacion import Navegacion

CUENTAS_POR_VUELTA = 495     # encoder GM25-370: verificar con 10 vueltas a mano (plan de pruebas)
DIAMETRO_RUEDA_M = 0.065
GUARDAR_CADA_S = 0.5         # una lectura en la base cada medio segundo
TURBINA = 80                 # % de la turbina al limpiar (la turbina necesita 50 % o más)


def bateria_pct(mv):
    """Batería 3S: 10.5 V = 0 %, 12.6 V = 100 %.
    El ESP32 usa la misma fórmula para el tema MQTT roomba/robot/bateria (D17)."""
    return max(0, min(100, round((mv / 1000 - 10.5) / (12.6 - 10.5) * 100)))


def estacion_cargando(con):
    """Lo que dice la estación base: True o False.
    None si la estación no ha mandado nada en los últimos 10 s (por ejemplo, en el simulador)."""
    fila = con.execute("SELECT momento, cargando FROM estacion ORDER BY id DESC LIMIT 1").fetchone()
    if not fila:
        return None
    momento = datetime.fromisoformat(fila["momento"])
    if (datetime.now() - momento).total_seconds() > 10:
        return None
    return bool(fila["cargando"])


class Puente:
    def __init__(self, enviar, marcar_obstaculos=True):
        self.enviar = enviar           # función que manda una línea al ESP32
        self.marcar_obstaculos = marcar_obstaculos
        self.modo = "en_espera"
        self.nav = Navegacion()
        self.x = (db.BASE[0] + 0.5) * db.CELDA_M
        self.y = (db.BASE[1] + 0.5) * db.CELDA_M
        self.enc = None
        self.t_guardado = 0
        self.ultimo_choque = 0
        self.fuga_antes = False
        self.bateria_baja_avisada = False
        self.celda_antes = None
        self.bomba = 0                 # 1 si la tarea en curso es aspirar y trapear
        self.alerta_antes = "ninguna"
        self.t_rearme = 0              # cuándo se mandó la última R

    def rearmar(self):
        """Quita el paro trabado del ESP32 (comando R)."""
        self.enviar("R")
        self.t_rearme = time.time()

    # ---- comandos de la app / Alexa ----
    def atender_comandos(self, con):
        for c in db.comandos_pendientes(con):
            a, p = c["accion"], c["parametros"]
            if a == "iniciar":
                self.modo = "limpiando"
                self.bomba = 1 if p.get("tipo") == "aspirar_trapear" else 0
                self.rearmar()         # por si el robot quedó en paro
                self.enviar(f"C,{TURBINA},0,{self.bomba}")
                self.nav.iniciar(p.get("zona", "completa"))
            elif a == "pausar":
                self.modo = "pausado"
                self.enviar("X")
                self.enviar("C,0,0,0")
            elif a == "reanudar":
                self.modo = "limpiando"
                self.rearmar()
                self.enviar(f"C,{TURBINA},0,{self.bomba}")   # la bomba sigue como en la tarea
            elif a == "detener":
                self.modo = "en_espera"
                self.enviar("X")
                self.enviar("C,0,0,0")
                self.nav.detener()
            elif a == "regresar":
                self.modo = "regresando"
                self.rearmar()
                self.enviar("C,0,0,0")
                self.nav.regresar()
            db.comando_atendido(con, c["id"])

    # ---- trama del ESP32 ----
    def procesar(self, linea, con):
        partes = linea.strip().split(",")
        if len(partes) != 16 or partes[0] != "S":
            return
        try:
            _, t, encI, encD, yaw, tof0, tof1, tof2, piso, bump, ir, mv, ma, fuga, estado, alerta = partes
            encI, encD, bump, mv, ma, fuga = int(encI), int(encD), int(bump), int(mv), int(ma), int(fuga)
            yaw = float(yaw)
            tof = [int(tof0), int(tof1), int(tof2)]
        except ValueError:
            return

        self.odometria(encI, encD, yaw)
        cx = min(db.ANCHO - 1, max(0, int(self.x / db.CELDA_M)))
        cy = min(db.ALTO - 1, max(0, int(self.y / db.CELDA_M)))
        bat = bateria_pct(mv)

        # Eventos
        if (bump or min(tof) < 120) and time.time() - self.ultimo_choque > 2:
            self.ultimo_choque = time.time()
            db.evento(con, "obstaculo", f"Obstáculo en ({cx}, {cy})")
            ox, oy = cx + round(math.sin(math.radians(yaw))), cy - round(math.cos(math.radians(yaw)))
            # Solo se marca si esa celda no se limpió ya en esta sesión (si el robot pasó, no es obstáculo fijo)
            if self.marcar_obstaculos and 0 <= ox < db.ANCHO and 0 <= oy < db.ALTO:
                ya_pasado = con.execute(
                    """SELECT 1 FROM sesion_celda sc JOIN celdas_en_mapa c USING (id_celda)
                       WHERE sc.id_sesion = ? AND c.cx = ? AND c.cy = ?""",
                    (db.sesion_activa(con), ox, oy),
                ).fetchone()
                if not ya_pasado:
                    db.marcar_obstaculo(con, ox, oy)
        if fuga and not self.fuga_antes:
            self.enviar("C,0,0,0")
            self.modo = "pausado"
            db.evento(con, "fuga", "Agua detectada: bomba y turbina apagadas")
        self.fuga_antes = bool(fuga)
        # Alertas del ESP32: se anotan cuando cambian
        if alerta != self.alerta_antes and alerta != "ninguna":
            db.evento(con, "sistema", f"Alerta del robot: {alerta}")
        self.alerta_antes = alerta
        # Paro trabado en el ESP32 (llegó una X, por ejemplo desde la app MQTT): la Pi pasa a pausa
        # (se esperan 0.5 s después de una R: la trama que ya venía en camino todavía dice "paro")
        if estado == "paro" and self.modo in ("limpiando", "regresando") and time.time() - self.t_rearme > 0.5:
            self.modo = "pausado"
            self.enviar("C,0,0,0")
            db.evento(con, "sistema", "El robot recibió un paro (X): en pausa hasta reanudar")
        if bat < 20 and not self.bateria_baja_avisada and self.modo == "limpiando":
            self.bateria_baja_avisada = True
            db.evento(con, "bateria_baja", "Batería baja: regresando a la base")
            self.modo = "regresando"
            self.nav.regresar()
        if bat > 30:
            self.bateria_baja_avisada = False
        # Llegada a la base. El robot no ve su corriente de carga (el INA219 está después
        # del interruptor), así que manda la estación: roomba/base/cargando = 1.
        # Si la estación no está mandando datos (simulador), se usa la celda de la base.
        cargando = estacion_cargando(con)
        if cargando is None:
            en_base = (cx, cy) == db.BASE
        else:
            en_base = cargando
        if self.modo == "regresando" and en_base:
            self.modo = "cargando"
            self.enviar("C,0,0,0")
            self.enviar("Z")           # el yaw vuelve a 0 en la base
            db.evento(con, "base", "Robot en la base")
        if self.modo == "cargando" and (bat >= 100 or cargando is False):
            self.modo = "en_espera"

        # Mapa: celdas recorridas
        if self.modo == "limpiando" and (cx, cy) != self.celda_antes:
            db.marcar_celda(con, cx, cy)
            self.celda_antes = (cx, cy)
            if self.nav.termino(cx, cy):
                db.cerrar_sesion(con, bat)
                db.evento(con, "regreso", "Zona terminada: regresando a la base")
                self.modo = "regresando"
                self.enviar("C,0,0,0")
                self.nav.regresar()

        # Navegación (Adrián): decide velocidades con los sensores
        if self.modo in ("limpiando", "regresando"):
            vI, vD = self.nav.paso(cx=cx, cy=cy, yaw=yaw, tof=tof, piso=int(piso), bump=bump, ir=int(ir))
            self.enviar(f"M,{vI},{vD}")

        if time.time() - self.t_guardado >= GUARDAR_CADA_S:
            self.t_guardado = time.time()
            con.execute(
                "INSERT INTO lecturas (momento, modo, bateria, voltaje, corriente_ma, fuga, cx, cy) VALUES (?,?,?,?,?,?,?,?)",
                (db.ahora(), self.modo, bat, round(mv / 1000, 2), ma, fuga, cx, cy),
            )

    def odometria(self, encI, encD, yaw):
        if self.enc is None:
            self.enc = (encI, encD)
            return
        dI, dD = encI - self.enc[0], encD - self.enc[1]
        self.enc = (encI, encD)
        metros = (dI + dD) / 2 / CUENTAS_POR_VUELTA * math.pi * DIAMETRO_RUEDA_M
        # yaw de la IMU: 0° = hacia el frente del área (arriba del mapa)
        self.x += metros * math.sin(math.radians(yaw))
        self.y -= metros * math.cos(math.radians(yaw))


# ---------------- robot simulado ----------------

class RobotSimulado:
    """Genera tramas 'S,...' como si fuera el ESP32, para probar todo sin hardware."""

    def __init__(self):
        self.mv = 12300
        self.yaw = 0.0
        self.enc = 0
        self.lineas = []
        self.moviendo = False
        self.fuga = 0
        self.ruta = []
        self.i = 0
        self.pos = list(db.BASE)
        self.paro = False          # igual que el ESP32: X traba el paro hasta que llega R

    def escribir(self, linea):
        if linea == "X":
            self.paro = True
            self.moviendo = False
        elif linea == "R":
            self.paro = False
        elif linea == "Z":
            self.yaw = 0.0
        elif self.paro:
            return                 # con el paro trabado se ignoran M y C
        elif linea.startswith("C,") and linea != "C,0,0,0":
            self.moviendo = True
        elif linea == "C,0,0,0":
            self.moviendo = False

    def leer(self, puente):
        if puente.modo == "limpiando" and self.moviendo:
            if self.ruta is not puente.nav.ruta:      # empezó una limpieza nueva
                self.ruta = puente.nav.ruta or []
                self.i = 0
            if self.i < len(self.ruta):
                self.pos = list(self.ruta[self.i])
                self.i += 1
            self.mv -= 4
        elif puente.modo == "regresando":
            bx, by = db.BASE
            x, y = self.pos
            self.pos = [x + (bx > x) - (bx < x), y] if x != bx else [x, y + (by > y) - (by < y)]
            self.mv -= 2
        elif puente.modo == "cargando":
            self.mv = min(12600, self.mv + 25)
        # El simulador pone la posición directo (sin encoders)
        puente.x = (self.pos[0] + 0.5) * db.CELDA_M
        puente.y = (self.pos[1] + 0.5) * db.CELDA_M
        bump = 1 if random.random() < 0.04 and puente.modo == "limpiando" else 0
        ma = {"limpiando": 2600, "regresando": 900, "cargando": -1500}.get(puente.modo, 600) + random.randint(-40, 40)
        if self.paro:
            estado = "paro"
        elif self.fuga:
            estado = "fuga"
        else:
            estado = "ok"
        return f"S,{int(time.time()*1000)},0,0,{self.yaw},800,800,800,0,{bump},0,{self.mv},{ma},{self.fuga},{estado},ninguna"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--puerto", default="/dev/ttyUSB0")
    ap.add_argument("--simular", action="store_true", help="no usa el ESP32; simula el robot")
    ap.add_argument("--ver", action="store_true", help="en --simular, también muestra las órdenes de motores (M,...)")
    args = ap.parse_args()
    db.crear()

    if args.simular:
        sim = RobotSimulado()

        def enviar(linea):
            # Muestra en pantalla cada orden que la Pi le manda al robot
            if not linea.startswith("M,") or args.ver:
                print(f"  Pi → robot   {linea}", flush=True)
            sim.escribir(linea)

        puente = Puente(enviar, marcar_obstaculos=False)  # los choques simulados no crean obstáculos
        print("Robot simulado corriendo. Ctrl+C para salir.")
        print("Cada segundo verás la línea que manda el robot y su estado.\n", flush=True)
        while True:
            with db.conectar() as con:
                puente.atender_comandos(con)
                trama = sim.leer(puente)
                puente.procesar(trama, con)
            cx = int(puente.x / db.CELDA_M)
            cy = int(puente.y / db.CELDA_M)
            bat = bateria_pct(int(trama.split(",")[11]))
            print(f"robot → Pi   {trama}", flush=True)
            print(f"             modo: {puente.modo:<11} celda: ({cx}, {cy})   batería: {bat} %", flush=True)
            time.sleep(1.0)
    else:
        import serial  # pip install pyserial
        esp = serial.Serial(args.puerto, 115200, timeout=0.1)
        puente = Puente(lambda l: esp.write((l + "\n").encode()))
        print(f"Conectado al ESP32 en {args.puerto}")
        ultimo_rx = time.time()
        while True:
            with db.conectar() as con:
                puente.atender_comandos(con)
                linea = esp.readline().decode(errors="ignore")
                if linea:
                    ultimo_rx = time.time()
                    puente.procesar(linea, con)
            if time.time() - ultimo_rx > 0.5 and puente.modo == "limpiando":
                esp.write(b"X\n")  # seguridad: sin datos del ESP32, paro


if __name__ == "__main__":
    main()
