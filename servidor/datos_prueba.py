"""Llena la base con limpiezas pasadas para probar las pantallas de Historial.
Ejecutar una vez:  python3 datos_prueba.py
"""
import random
from datetime import datetime, timedelta

import db

OBSTACULOS = [(3, 3), (6, 6), (7, 2), (2, 7)]


def main():
    db.crear()
    random.seed(7)
    with db.conectar() as con:
        for x, y in OBSTACULOS:
            db.marcar_obstaculo(con, x, y)
        hoy = datetime.now().replace(second=0, microsecond=0)
        sesiones = [
            (3, "izquierda", "aspirar", 14, 95, 88, 0.9, 2),
            (2, "completa", "aspirar_trapear", 22, 100, 81, 0.84, 4),
            (1, "completa", "aspirar", 25, 98, 79, 0.92, 3),
        ]
        for dias, zona, tipo, minutos, b0, b1, frac, obst in sesiones:
            ini = (hoy - timedelta(days=dias)).replace(hour=random.randint(9, 17))
            fin = ini + timedelta(minutes=minutos)
            cur = con.execute(
                "INSERT INTO sesiones (modo, zona, hora_inicio, hora_fin, bateria_inicio, bateria_final) VALUES (?,?,?,?,?,?)",
                (tipo, zona, ini.isoformat(), fin.isoformat(), b0, b1),
            )
            sid = cur.lastrowid
            x0, x1 = {"izquierda": (0, 4), "derecha": (5, 9)}.get(zona, (0, 9))
            t = ini
            for y in range(db.ALTO):
                for x in range(x0, x1 + 1):
                    if (x, y) in OBSTACULOS or random.random() > frac:
                        continue
                    t += timedelta(seconds=5)
                    cid = con.execute("SELECT id_celda FROM celdas_en_mapa WHERE cx=? AND cy=?", (x, y)).fetchone()[0]
                    con.execute("INSERT INTO sesion_celda VALUES (?,?,?)", (sid, cid, t.isoformat()))
            for _ in range(obst):
                con.execute(
                    "INSERT INTO eventos (id_sesion, momento, tipo, detalle) VALUES (?,?,?,?)",
                    (sid, ini.isoformat(), "obstaculo", "Obstáculo evitado"),
                )
            con.execute("INSERT INTO tareas (zona, tipo, estado, id_sesion) VALUES (?,?,'completada',?)", (zona, tipo, sid))
        for zona, tipo in [("completa", "aspirar_trapear"), ("izquierda", "aspirar"), ("derecha", "aspirar")]:
            con.execute("INSERT INTO tareas (zona, tipo) VALUES (?, ?)", (zona, tipo))
    print("Datos de prueba listos.")


if __name__ == "__main__":
    main()
