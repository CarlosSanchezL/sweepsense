"""API HTTP de SweepSense (corre en la Raspberry Pi).

La app (React Native) y Alexa usan esta API. Las lecturas llegan del robot por el
puente serial (puente_robot.py) y de la estación base por MQTT (mqtt_estacion.py)
o por HTTP (POST /api/estacion).

Ejecutar:  python3 app.py           -> http://<ip-de-la-pi>:5000
           PUERTO=5050 python3 app.py   (en Mac, donde AirPlay ocupa el 5000)
"""
import json
import os
from datetime import datetime

from flask import Flask, jsonify, request

import db

app = Flask(__name__)
ACCIONES = {"iniciar", "pausar", "reanudar", "detener", "regresar"}
ZONAS = {"completa", "izquierda", "derecha"}
TIPOS = {"aspirar", "aspirar_trapear"}


@app.after_request
def permitir_app_web(resp):
    # Permite que la versión web de la app (otro puerto/origen) consulte la API
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


def error(msg, codigo=400):
    return jsonify({"error": msg}), codigo


def segundos_desde(iso):
    return (datetime.now() - datetime.fromisoformat(iso)).total_seconds()


def celdas_zona(con, zona):
    filtro = {"izquierda": "AND cx <= 4", "derecha": "AND cx >= 5"}.get(zona, "")
    return con.execute(f"SELECT COUNT(*) FROM celdas_en_mapa WHERE es_obstaculo = 0 {filtro}").fetchone()[0]


def celdas_sesion(con, id_sesion):
    filas = con.execute(
        """SELECT c.cx, c.cy FROM sesion_celda sc JOIN celdas_en_mapa c USING (id_celda)
           WHERE sc.id_sesion = ? ORDER BY sc.momento, sc.rowid""",
        (id_sesion,),
    ).fetchall()
    return [[f["cx"], f["cy"]] for f in filas]


def sesion_json(con, s, con_celdas=True):
    celdas = celdas_sesion(con, s["id_sesion"])
    total = max(1, celdas_zona(con, s["zona"]))
    obstaculos = con.execute(
        "SELECT COUNT(*) FROM eventos WHERE id_sesion = ? AND tipo = 'obstaculo'", (s["id_sesion"],)
    ).fetchone()[0]
    r = {
        "id": s["id_sesion"],
        "zona": s["zona"],
        "tipo": s["modo"],
        "hora_inicio": s["hora_inicio"],
        "hora_fin": s["hora_fin"],
        "bateria_inicio": s["bateria_inicio"],
        "bateria_final": s["bateria_final"],
        "area_m2": round(len(celdas) * db.CELDA_M ** 2, 2),
        "area_total_m2": round(total * db.CELDA_M ** 2, 2),
        "cobertura": round(100 * len(celdas) / total),
        "obstaculos": obstaculos,
    }
    if con_celdas:
        r["celdas"] = celdas
    return r


# ---------- Lectura ----------

@app.get("/api/estado")
def estado():
    with db.conectar() as con:
        l = db.ultima_lectura(con)
        est = con.execute("SELECT * FROM estacion ORDER BY id DESC LIMIT 1").fetchone()
        activa = con.execute("SELECT * FROM sesiones WHERE hora_fin IS NULL ORDER BY id_sesion DESC LIMIT 1").fetchone()
        ultima = con.execute(
            "SELECT * FROM sesiones WHERE hora_fin IS NOT NULL ORDER BY id_sesion DESC LIMIT 1"
        ).fetchone()

        online = bool(l) and segundos_desde(l["momento"]) < 10
        en_base = bool(est) and segundos_desde(est["momento"]) < 10 and bool(est["cargando"])
        sesion = None
        if activa:
            sesion = sesion_json(con, activa, con_celdas=False)
            sesion["tiempo_s"] = int(segundos_desde(activa["hora_inicio"]))

        return jsonify({
            "online": online,
            "modo": (l["modo"] if l else "en_espera") if online else "desconectado",
            "bateria": l["bateria"] if l else None,
            "voltaje": l["voltaje"] if l else None,
            "corriente_ma": l["corriente_ma"] if l else None,
            "cargando": en_base or (bool(l) and l["modo"] == "cargando"),
            "fuga": bool(l and l["fuga"]),
            "posicion": [l["cx"], l["cy"]] if l and l["cx"] is not None else None,
            "actualizado": l["momento"] if l else None,
            "sesion": sesion,
            "ultima_sesion": sesion_json(con, ultima, con_celdas=False) if ultima else None,
            "estacion": dict(est) if est else None,
        })


@app.get("/api/mapa")
def mapa():
    id_sesion = request.args.get("sesion", type=int)
    with db.conectar() as con:
        obst = [[f["cx"], f["cy"]] for f in con.execute("SELECT cx, cy FROM celdas_en_mapa WHERE es_obstaculo = 1")]
        l = db.ultima_lectura(con)
        activa = db.sesion_activa(con)
        if id_sesion is None:
            id_sesion = activa or (con.execute("SELECT MAX(id_sesion) FROM sesiones").fetchone()[0])
        celdas = celdas_sesion(con, id_sesion) if id_sesion else []
        return jsonify({
            "ancho": db.ANCHO, "alto": db.ALTO, "celda_m": db.CELDA_M, "base": list(db.BASE),
            "obstaculos": obst,
            "celdas": celdas,
            "ruta": celdas if id_sesion == activa else [],
            "robot": [l["cx"], l["cy"]] if l and l["cx"] is not None else None,
        })


@app.get("/api/sesiones")
def sesiones():
    limite = request.args.get("limite", 30, type=int)
    with db.conectar() as con:
        filas = con.execute(
            "SELECT * FROM sesiones WHERE hora_fin IS NOT NULL ORDER BY id_sesion DESC LIMIT ?", (limite,)
        ).fetchall()
        return jsonify([sesion_json(con, s) for s in filas])


@app.get("/api/tareas")
def tareas():
    with db.conectar() as con:
        filas = con.execute("SELECT * FROM tareas ORDER BY id_tarea").fetchall()
        return jsonify([
            {"id": t["id_tarea"], "zona": t["zona"], "tipo": t["tipo"], "estado": t["estado"], "sesion_id": t["id_sesion"]}
            for t in filas
        ])


@app.get("/api/eventos")
def eventos():
    limite = request.args.get("limite", 20, type=int)
    with db.conectar() as con:
        filas = con.execute("SELECT * FROM eventos ORDER BY id_evento DESC LIMIT ?", (limite,)).fetchall()
        return jsonify([
            {"id": e["id_evento"], "momento": e["momento"], "tipo": e["tipo"], "detalle": e["detalle"], "sesion_id": e["id_sesion"]}
            for e in filas
        ])


@app.get("/api/lecturas")
def lecturas():
    """Historial de lecturas para gráficas (por ejemplo batería en el tiempo)."""
    minutos = request.args.get("minutos", 30, type=int)
    with db.conectar() as con:
        filas = con.execute(
            "SELECT momento, modo, bateria, voltaje, corriente_ma, fuga FROM lecturas "
            "WHERE momento >= datetime('now', 'localtime', ?) ORDER BY id",
            (f"-{minutos} minutes",),
        ).fetchall()
        return jsonify([dict(f) for f in filas])


# ---------- Escritura ----------

@app.post("/api/comando")
def comando():
    """Órdenes de la app o de Alexa. Se guardan en la tabla `comandos` y el puente las manda al robot."""
    d = request.get_json(silent=True) or {}
    accion = d.get("accion")
    if accion not in ACCIONES:
        return error(f"Acción no válida. Usa una de: {', '.join(sorted(ACCIONES))}")
    zona = d.get("zona", "completa")
    tipo = d.get("tipo", "aspirar")
    if zona not in ZONAS or tipo not in TIPOS:
        return error("Zona o tipo no válido")
    origen = d.get("origen", "app")

    with db.conectar() as con:
        l = db.ultima_lectura(con)
        bateria = l["bateria"] if l else None

        def cerrar_sesion():
            db.cerrar_sesion(con, bateria)

        if accion == "iniciar":
            if l and l["fuga"]:
                return error("Hay agua detectada. Revisa el robot antes de iniciar.", 409)
            if bateria is not None and bateria < 20:
                return error("Batería muy baja para iniciar.", 409)
            cerrar_sesion()
            cur = con.execute(
                "INSERT INTO sesiones (modo, zona, hora_inicio, bateria_inicio) VALUES (?, ?, ?, ?)",
                (tipo, zona, db.ahora(), bateria),
            )
            id_sesion = cur.lastrowid
            id_tarea = d.get("tarea_id")
            con.execute("UPDATE tareas SET estado = 'pendiente' WHERE estado = 'en_proceso'")
            if id_tarea:
                con.execute("UPDATE tareas SET estado = 'en_proceso', id_sesion = ? WHERE id_tarea = ?", (id_sesion, id_tarea))
            else:
                con.execute(
                    "INSERT INTO tareas (zona, tipo, estado, id_sesion) VALUES (?, ?, 'en_proceso', ?)",
                    (zona, tipo, id_sesion),
                )
        elif accion in ("detener", "regresar"):
            cerrar_sesion()

        con.execute(
            "INSERT INTO comandos (momento, accion, parametros, origen) VALUES (?, ?, ?, ?)",
            (db.ahora(), accion, json.dumps({"zona": zona, "tipo": tipo}), origen),
        )
        db.evento(con, "voz" if origen == "alexa" else "comando", f"{accion.capitalize()} ({origen})")
        return jsonify({"ok": True, "accion": accion})


@app.post("/api/tareas")
def nueva_tarea():
    d = request.get_json(silent=True) or {}
    if d.get("zona") not in ZONAS or d.get("tipo") not in TIPOS:
        return error("Zona o tipo no válido")
    with db.conectar() as con:
        cur = con.execute("INSERT INTO tareas (zona, tipo) VALUES (?, ?)", (d["zona"], d["tipo"]))
        return jsonify({"ok": True, "id": cur.lastrowid})


@app.post("/api/estacion")
def estacion():
    """Alternativa HTTP para la ESP8266 (si no usan MQTT). Cuerpo: {"v":12.4,"ma":850,"cargando":true,"rssi":-58}"""
    d = request.get_json(silent=True) or {}
    with db.conectar() as con:
        con.execute(
            "INSERT INTO estacion (momento, voltaje, corriente_ma, cargando, rssi) VALUES (?, ?, ?, ?, ?)",
            (db.ahora(), d.get("v"), d.get("ma"), int(bool(d.get("cargando"))), d.get("rssi")),
        )
        modo = (db.ultima_lectura(con) or {"modo": ""})["modo"]
    # La respuesta le dice a la estación si debe encender el faro
    return jsonify({"ok": True, "faro": modo == "regresando"})


if __name__ == "__main__":
    db.crear()
    app.run(host="0.0.0.0", port=int(os.environ.get("PUERTO", 5000)), debug=False)
