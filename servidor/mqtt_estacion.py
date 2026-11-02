"""Enlace MQTT con la estación base (ESP8266).

  sweepsense/base/estado  (ESP8266 -> Pi)  {"v":12.4,"ma":850,"cargando":true,"rssi":-58}  cada 2 s
  sweepsense/base/cmd     (Pi -> ESP8266)  faro_on | faro_off

Requiere Mosquitto en la Pi:  sudo apt install mosquitto mosquitto-clients
Ejecutar:  python3 mqtt_estacion.py
"""
import json
import time

import paho.mqtt.client as mqtt  # pip install paho-mqtt

import db

BROKER = "localhost"
faro_actual = None


def al_conectar(cliente, datos, flags, codigo, props=None):
    print("Conectado al broker MQTT")
    cliente.subscribe("sweepsense/base/estado")


def al_recibir(cliente, datos, msg):
    try:
        d = json.loads(msg.payload.decode())
    except ValueError:
        return
    with db.conectar() as con:
        con.execute(
            "INSERT INTO estacion (momento, voltaje, corriente_ma, cargando, rssi) VALUES (?, ?, ?, ?, ?)",
            (db.ahora(), d.get("v"), d.get("ma"), int(bool(d.get("cargando"))), d.get("rssi")),
        )


def main():
    global faro_actual
    db.crear()
    cliente = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="sweepsense-pi")
    cliente.on_connect = al_conectar
    cliente.on_message = al_recibir
    cliente.connect(BROKER, 1883)
    cliente.loop_start()
    while True:
        # El faro IR solo se enciende cuando el robot regresa a la base
        with db.conectar() as con:
            l = db.ultima_lectura(con)
        faro = "faro_on" if l and l["modo"] == "regresando" else "faro_off"
        if faro != faro_actual:
            cliente.publish("sweepsense/base/cmd", faro, retain=True)
            faro_actual = faro
        time.sleep(1)


if __name__ == "__main__":
    main()
