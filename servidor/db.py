"""Funciones compartidas para usar la base de datos SQLite de SweepSense."""
import json
import os
import sqlite3
from datetime import datetime

RUTA_DB = os.environ.get("SWEEPSENSE_DB", os.path.join(os.path.dirname(__file__), "sweepsense.db"))
ESQUEMA = os.path.join(os.path.dirname(__file__), "esquema.sql")

# Área de prueba: 3 x 3 m en celdas de 30 cm
ANCHO, ALTO, CELDA_M = 10, 10, 0.3
BASE = (4, 9)


def ahora():
    return datetime.now().isoformat(timespec="seconds")


def conectar():
    con = sqlite3.connect(RUTA_DB, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")  # permite que la API lea mientras el puente escribe
    return con


def crear():
    """Crea las tablas y la cuadrícula del área si no existen."""
    with conectar() as con, open(ESQUEMA, encoding="utf-8") as f:
        con.executescript(f.read())
        con.executemany(
            "INSERT OR IGNORE INTO celdas_en_mapa (cx, cy) VALUES (?, ?)",
            [(x, y) for y in range(ALTO) for x in range(ANCHO)],
        )


def evento(con, tipo, detalle, id_sesion=None):
    if id_sesion is None:
        id_sesion = sesion_activa(con)
    con.execute(
        "INSERT INTO eventos (id_sesion, momento, tipo, detalle) VALUES (?, ?, ?, ?)",
        (id_sesion, ahora(), tipo, detalle),
    )


def sesion_activa(con):
    fila = con.execute("SELECT id_sesion FROM sesiones WHERE hora_fin IS NULL ORDER BY id_sesion DESC LIMIT 1").fetchone()
    return fila["id_sesion"] if fila else None


def ultima_lectura(con):
    return con.execute("SELECT * FROM lecturas ORDER BY id DESC LIMIT 1").fetchone()


def marcar_celda(con, cx, cy, id_sesion=None):
    """La navegación llama esto cada vez que el robot pasa por una celda."""
    id_sesion = id_sesion or sesion_activa(con)
    if id_sesion is None:
        return
    celda = con.execute("SELECT id_celda FROM celdas_en_mapa WHERE cx=? AND cy=?", (cx, cy)).fetchone()
    if celda:
        con.execute(
            "INSERT OR IGNORE INTO sesion_celda (id_sesion, id_celda, momento) VALUES (?, ?, ?)",
            (id_sesion, celda["id_celda"], ahora()),
        )


def marcar_obstaculo(con, cx, cy):
    con.execute("UPDATE celdas_en_mapa SET es_obstaculo = 1 WHERE cx=? AND cy=?", (cx, cy))


def cerrar_sesion(con, bateria=None):
    """Termina la limpieza en curso (la usan la API y el puente)."""
    activa = sesion_activa(con)
    if not activa:
        return None
    if bateria is None:
        l = ultima_lectura(con)
        bateria = l["bateria"] if l else None
    con.execute("UPDATE sesiones SET hora_fin = ?, bateria_final = ? WHERE id_sesion = ?", (ahora(), bateria, activa))
    con.execute("UPDATE tareas SET estado = 'completada' WHERE id_sesion = ?", (activa,))
    evento(con, "fin", "Limpieza terminada", activa)
    return activa


def obstaculos(con):
    return {(f["cx"], f["cy"]) for f in con.execute("SELECT cx, cy FROM celdas_en_mapa WHERE es_obstaculo = 1")}


def comandos_pendientes(con):
    filas = con.execute("SELECT * FROM comandos WHERE atendido = 0 ORDER BY id").fetchall()
    return [dict(f, parametros=json.loads(f["parametros"] or "{}")) for f in filas]


def comando_atendido(con, id_comando):
    con.execute("UPDATE comandos SET atendido = 1 WHERE id = ?", (id_comando,))
