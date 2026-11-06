"""Enlace MQTT con la estación base (ESP8266) y modo de la Pi.

Temas (decisión D17 de la bóveda; todos con texto simple):
  roomba/base/en_linea     (ESP8266 -> Pi)  online | offline        retenido
  roomba/base/cargando     (ESP8266 -> Pi)  1 | 0                   retenido, cuando cambia
  roomba/base/corriente_ma (ESP8266 -> Pi)  mA de carga             cuando cambia >= 20 mA
  roomba/base/faro         (ESP8266 -> Pi)  1 | 0                   retenido, cuando cambia
  roomba/base/faro/set     (Pi -> ESP8266)  1 | 0                   retenido; 1 solo al regresar
  roomba/pi/modo           (Pi -> app MQTT) modo de la Pi           retenido, cuando cambia

Usuario y contraseña del broker: variables MQTT_USUARIO y MQTT_CLAVE, o el archivo
servidor/.env (copia .env.ejemplo a .env y escribe la contraseña; .env no se sube a GitHub).

Requiere Mosquitto en la Pi:  sudo apt install mosquitto mosquitto-clients
Ejecutar:  python3 mqtt_estacion.py
"""
import os
import time
from datetime import datetime

import paho.mqtt.client as mqtt  # pip install paho-mqtt

import db

T_EN_LINEA = "roomba/base/en_linea"
T_CARGANDO = "roomba/base/cargando"
T_CORRIENTE = "roomba/base/corriente_ma"
T_FARO = "roomba/base/faro"
T_FARO_SET = "roomba/base/faro/set"
T_MODO_PI = "roomba/pi/modo"

GUARDAR_CADA_S = 2   # una fila en la tabla estacion cada 2 s

# Últimos valores que mandó la estación
estacion = {"en_linea": None, "cargando": None, "corriente_ma": None}
# Lo último que publicó la Pi (se borra al reconectar para volver a publicarlo)
publicado = {"faro": None, "modo": None}


def leer_env():
    """Lee servidor/.env (líneas NOMBRE=valor) sin pisar las variables que ya existan."""
    ruta = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(ruta):
        return
    with open(ruta, encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                nombre, valor = linea.split("=", 1)
                os.environ.setdefault(nombre.strip(), valor.strip())


def al_conectar(cliente, datos, flags, codigo, props=None):
    if codigo != 0:
        print("El broker rechazó la conexión:", codigo, "(revisa usuario y contraseña)")
        return
    print("Conectado al broker MQTT")
    publicado["faro"] = None
    publicado["modo"] = None
    # Solo estos temas: con roomba/base/# también llegarían los faro/set que publica la Pi
    for tema in (T_EN_LINEA, T_CARGANDO, T_CORRIENTE, T_FARO):
        cliente.subscribe(tema)


def al_recibir(cliente, datos, msg):
    texto = msg.payload.decode(errors="ignore").strip()
    if texto == "":
        # Mensaje vacío = alguien borró el valor retenido: se olvida ese dato
        if msg.topic == T_CARGANDO:
            estacion["cargando"] = None
        return
    if msg.topic == T_EN_LINEA:
        estacion["en_linea"] = texto
    elif msg.topic == T_CARGANDO:
        estacion["cargando"] = 1 if texto == "1" else 0
    elif msg.topic == T_CORRIENTE:
        try:
            estacion["corriente_ma"] = int(float(texto))
        except ValueError:
            pass


def modo_de_la_pi(con):
    """El modo de la última lectura del robot, o 'desconectado' si pasaron más de 10 s."""
    l = db.ultima_lectura(con)
    if not l:
        return "desconectado"
    if (datetime.now() - datetime.fromisoformat(l["momento"])).total_seconds() > 10:
        return "desconectado"
    return l["modo"]


def main():
    leer_env()
    db.crear()
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="roomba-pi")
    cliente.username_pw_set(os.environ.get("MQTT_USUARIO", "roomba"), os.environ.get("MQTT_CLAVE", ""))
    cliente.on_connect = al_conectar
    cliente.on_message = al_recibir
    cliente.connect(os.environ.get("MQTT_HOST", "localhost"), 1883)
    cliente.loop_start()

    t_guardado = 0
    while True:
        with db.conectar() as con:
            modo = modo_de_la_pi(con)

            # Una fila cada 2 s con los últimos valores (la API toma la estación como
            # "en línea" solo si su último dato tiene menos de 10 s). voltaje y rssi quedan vacíos.
            hay_datos = estacion["cargando"] is not None and estacion["en_linea"] != "offline"
            if hay_datos and time.time() - t_guardado >= GUARDAR_CADA_S:
                t_guardado = time.time()
                con.execute(
                    "INSERT INTO estacion (momento, voltaje, corriente_ma, cargando, rssi) VALUES (?, NULL, ?, ?, NULL)",
                    (db.ahora(), estacion["corriente_ma"], estacion["cargando"]),
                )

        # El faro IR solo se enciende cuando el robot regresa a la base
        faro = "1" if modo == "regresando" else "0"
        if faro != publicado["faro"]:
            cliente.publish(T_FARO_SET, faro, retain=True)
            publicado["faro"] = faro

        # El modo de la Pi, para verlo también en la app MQTT
        if modo != publicado["modo"]:
            cliente.publish(T_MODO_PI, modo, retain=True)
            publicado["modo"] = modo

        time.sleep(1)


if __name__ == "__main__":
    main()
