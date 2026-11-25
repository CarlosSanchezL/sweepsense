"""Prueba del ESP32 real conectado por USB, paso a paso.

Úsalo ANTES de correr puente_robot.py, para confirmar que el robot habla bien con la Pi.
(Si puente_robot.py está corriendo, detenlo: solo un programa puede usar el puerto a la vez.)

  python3 probar_robot.py                       # lectura de sensores + paro (no mueve nada)
  python3 probar_robot.py --motores             # además mueve las ruedas (robot LEVANTADO)
  python3 probar_robot.py --motores --turbina   # además prende la turbina 2 s
  python3 probar_robot.py --puerto /dev/ttyACM0 # si el ESP32 aparece con otro nombre

Al final imprime un resumen con PASA / FALLA de cada prueba.
"""
import argparse
import sys
import time

import serial  # pip install pyserial

from puente_robot import bateria_pct

CAMPOS = ["S", "t_ms", "encI", "encD", "yaw", "tof0", "tof1", "tof2", "piso", "bump",
          "ir", "mV", "mA", "fuga", "estado", "alerta"]
resultados = []


def resultado(nombre, ok, detalle=""):
    resultados.append((nombre, ok, detalle))
    print(f"  {'PASA ' if ok else 'FALLA'}  {nombre}" + (f"  ({detalle})" if detalle else ""), flush=True)


def leer_trama(linea):
    """Convierte una línea S,... en un diccionario, o None si no es válida."""
    partes = linea.strip().split(",")
    if len(partes) != 16 or partes[0] != "S":
        return None
    d = dict(zip(CAMPOS, partes))
    try:
        for k in ("t_ms", "encI", "encD", "tof0", "tof1", "tof2", "piso", "bump", "ir", "mV", "mA", "fuga"):
            d[k] = int(d[k])
        d["yaw"] = float(d["yaw"])
    except ValueError:
        return None
    return d


class Robot:
    def __init__(self, puerto):
        self.esp = serial.Serial(puerto, 115200, timeout=0.05)
        self.ultima = None
        self.basura = 0

    def enviar(self, orden):
        print(f"    Pi → robot   {orden}", flush=True)
        self.esp.write((orden + "\n").encode())

    def escuchar(self, segundos, cada_s=None, orden=None):
        """Lee tramas durante `segundos`. Si se da `orden`, la repite cada `cada_s` (para los motores)."""
        tramas = []
        fin = time.time() + segundos
        proxima = 0
        while time.time() < fin:
            if orden and time.time() >= proxima:
                self.esp.write((orden + "\n").encode())
                proxima = time.time() + cada_s
            linea = self.esp.readline().decode(errors="ignore")
            if not linea.strip():
                continue
            d = leer_trama(linea)
            if d:
                tramas.append(d)
                self.ultima = d
            else:
                self.basura += 1
        return tramas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--puerto", default="/dev/ttyUSB0")
    ap.add_argument("--motores", action="store_true", help="mueve las ruedas (el robot debe estar levantado)")
    ap.add_argument("--turbina", action="store_true", help="prende la turbina 2 s (requiere --motores)")
    args = ap.parse_args()

    print(f"Abriendo {args.puerto} a 115200 baud...")
    try:
        r = Robot(args.puerto)
    except serial.SerialException as e:
        print(f"No se pudo abrir el puerto: {e}")
        print("Revisa el cable y el nombre del puerto:  ls /dev/ttyUSB* /dev/ttyACM*")
        sys.exit(1)
    time.sleep(2)  # el ESP32 se reinicia al abrir el puerto
    r.esp.reset_input_buffer()

    # 1. Tramas
    print("\n1. Escuchando al robot 5 segundos...")
    tramas = r.escuchar(5)
    hz = len(tramas) / 5
    resultado("Llegan tramas S de 16 campos", len(tramas) > 0, f"{len(tramas)} tramas, {r.basura} líneas inválidas")
    if not tramas:
        print("\nNo llegó ninguna trama válida. Revisa que el firmware esté cargado y el baud en 115200.")
        sys.exit(1)
    resultado("Frecuencia cerca de 5 por segundo (cada 200 ms)", 3.5 <= hz <= 6.5, f"{hz:.1f} por segundo")
    resultado("Pocas líneas inválidas", r.basura <= len(tramas) // 10, f"{r.basura}")

    # 2. Sensores
    d = r.ultima
    print("\n2. Lo que mide el robot ahora:")
    print(f"     batería    {d['mV'] / 1000:.2f} V  ({bateria_pct(d['mV'])} %)   corriente {d['mA']} mA")
    print(f"     ToF (mm)   izq {d['tof0']}   centro {d['tof1']}   der {d['tof2']}")
    print(f"     piso {d['piso']}   bumper {d['bump']}   IR {d['ir']}   fuga {d['fuga']}   yaw {d['yaw']:.1f}°")
    print(f"     estado {d['estado']}   alerta {d['alerta']}   encoders {d['encI']} / {d['encD']}")
    resultado("Voltaje de batería creíble (9 a 13 V)", 9000 <= d["mV"] <= 13000, f"{d['mV']} mV")
    resultado("ToF dan distancias (no 0 ni todos iguales a 8190)",
              all(0 < d[k] < 8190 for k in ("tof0", "tof1", "tof2")), f"{d['tof0']}, {d['tof1']}, {d['tof2']}")
    resultado("Sensor de fuga seco", d["fuga"] == 0, "acércale agua para probarlo a mano")
    resultado("Estado conocido (ok, paro o fuga)", d["estado"] in ("ok", "paro", "fuga"), d["estado"])

    # 3. Paro y quitar paro (no mueve nada)
    print("\n3. Paro de emergencia (X) y quitar paro (R)...")
    r.enviar("X")
    t = r.escuchar(1.0)
    resultado("Con X el robot reporta paro", bool(t) and t[-1]["estado"] == "paro", t[-1]["estado"] if t else "sin datos")
    r.enviar("R")
    t = r.escuchar(1.0)
    resultado("Con R vuelve a ok", bool(t) and t[-1]["estado"] == "ok", t[-1]["estado"] if t else "sin datos")
    r.enviar("Z")
    t = r.escuchar(0.6)
    resultado("Con Z el yaw queda cerca de 0", bool(t) and abs(t[-1]["yaw"]) < 3, f"{t[-1]['yaw']:.1f}°" if t else "sin datos")

    # 4. Motores (opcional)
    if args.motores:
        print("\n4. MOTORES. Levanta el robot para que las ruedas giren en el aire.")
        if input("   Escribe si y Enter cuando esté levantado: ").strip().lower() not in ("si", "sí", "s"):
            print("   Prueba de motores cancelada.")
        else:
            r.enviar("R")
            r.escuchar(0.3)
            for nombre, orden, signo in (("adelante", "M,400,400", 1), ("atrás", "M,-400,-400", -1)):
                antes = r.ultima
                t = r.escuchar(1.0, cada_s=0.1, orden=orden)
                r.enviar("M,0,0")
                r.escuchar(0.4)
                if not t:
                    resultado(f"Ruedas {nombre}", False, "sin datos")
                    continue
                dI, dD = t[-1]["encI"] - antes["encI"], t[-1]["encD"] - antes["encD"]
                resultado(f"Encoders cuentan {nombre} en las dos ruedas", dI * signo > 20 and dD * signo > 20,
                          f"izq {dI:+d}, der {dD:+d}")
            r.enviar("X")
            t = r.escuchar(0.6, cada_s=0.1, orden="M,400,400")
            if len(t) >= 2:
                resultado("Con X trabado, los motores no obedecen M",
                          abs(t[-1]["encI"] - t[0]["encI"]) < 10, f"izq {t[-1]['encI'] - t[0]['encI']:+d}")
            r.enviar("R")
            r.enviar("M,0,0")
            if args.turbina:
                print("\n5. Turbina al 60 % por 2 segundos...")
                antes = r.ultima["mA"]
                t = r.escuchar(2.0, cada_s=0.5, orden="C,60,0,0")
                r.enviar("C,0,0,0")
                if t:
                    resultado("La corriente sube con la turbina", t[-1]["mA"] > antes + 300, f"{antes} → {t[-1]['mA']} mA")

    r.enviar("C,0,0,0")
    r.enviar("M,0,0")
    r.esp.close()

    fallas = [x for x in resultados if not x[1]]
    print(f"\nResumen: {len(resultados) - len(fallas)} de {len(resultados)} pruebas pasan.")
    for nombre, _, detalle in fallas:
        print(f"  FALLA  {nombre}  ({detalle})")
    if not fallas:
        print("Todo bien. Ya puedes correr:  python3 puente_robot.py")


if __name__ == "__main__":
    main()
