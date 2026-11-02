-- Base de datos de SweepSense (SQLite, en la Raspberry Pi)
-- Basada en el modelo entidad-relación del equipo: Sesiones, Eventos, Celdas_en_mapa
-- y la relación M:N "Está en". Se agregan 4 tablas para el tiempo real y el control.

PRAGMA foreign_keys = ON;

-- ===== Modelo E-R original =====

-- Una limpieza completa del robot
CREATE TABLE IF NOT EXISTS sesiones (
  id_sesion       INTEGER PRIMARY KEY AUTOINCREMENT,
  modo            TEXT NOT NULL DEFAULT 'aspirar',      -- aspirar | aspirar_trapear
  zona            TEXT NOT NULL DEFAULT 'completa',     -- completa | izquierda | derecha
  hora_inicio     TEXT NOT NULL,                        -- ISO 8601
  hora_fin        TEXT,                                 -- NULL mientras está limpiando
  bateria_inicio  INTEGER,
  bateria_final   INTEGER
);

-- Lo que pasa durante una sesión (relación 1:N "Genera")
CREATE TABLE IF NOT EXISTS eventos (
  id_evento  INTEGER PRIMARY KEY AUTOINCREMENT,
  id_sesion  INTEGER REFERENCES sesiones(id_sesion),   -- puede ser NULL (eventos fuera de sesión)
  momento    TEXT NOT NULL,
  tipo       TEXT NOT NULL,     -- obstaculo | fuga | bateria_baja | voz | comando | base | fin | sistema
  detalle    TEXT
);

-- Cuadrícula del área de 3x3 m en celdas de 30 cm
CREATE TABLE IF NOT EXISTS celdas_en_mapa (
  id_celda      INTEGER PRIMARY KEY AUTOINCREMENT,
  cx            INTEGER NOT NULL,
  cy            INTEGER NOT NULL,
  es_obstaculo  INTEGER NOT NULL DEFAULT 0,             -- agregado: 1 si ahí hay un obstáculo fijo
  UNIQUE (cx, cy)
);

-- Relación M:N "Está en": qué celdas recorrió cada sesión
CREATE TABLE IF NOT EXISTS sesion_celda (
  id_sesion  INTEGER NOT NULL REFERENCES sesiones(id_sesion),
  id_celda   INTEGER NOT NULL REFERENCES celdas_en_mapa(id_celda),
  momento    TEXT NOT NULL,                             -- agregado: orden de la ruta
  PRIMARY KEY (id_sesion, id_celda)
);

-- ===== Tablas agregadas =====

-- Lecturas del robot (ESP32 -> Pi por serial). Alimenta los indicadores en tiempo real.
CREATE TABLE IF NOT EXISTS lecturas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  momento      TEXT NOT NULL,
  modo         TEXT NOT NULL,     -- en_espera | limpiando | pausado | regresando | cargando
  bateria      INTEGER,
  voltaje      REAL,
  corriente_ma INTEGER,
  fuga         INTEGER,           -- 0 / 1
  cx           INTEGER,           -- posición del robot en celdas
  cy           INTEGER
);

-- Estado de la estación base (ESP8266 -> Pi por MQTT o HTTP)
CREATE TABLE IF NOT EXISTS estacion (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  momento      TEXT NOT NULL,
  voltaje      REAL,
  corriente_ma INTEGER,
  cargando     INTEGER,
  rssi         INTEGER
);

-- Órdenes de la app o de Alexa. El robot las lee de aquí: la base de datos
-- es el punto de comunicación entre dispositivos y permite el control en tiempo real.
CREATE TABLE IF NOT EXISTS comandos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  momento     TEXT NOT NULL,
  accion      TEXT NOT NULL,      -- iniciar | pausar | reanudar | detener | regresar
  parametros  TEXT,               -- JSON: {"zona": "...", "tipo": "..."}
  origen      TEXT NOT NULL DEFAULT 'app',   -- app | alexa
  atendido    INTEGER NOT NULL DEFAULT 0
);

-- Limpiezas programadas desde la pantalla Tareas
CREATE TABLE IF NOT EXISTS tareas (
  id_tarea   INTEGER PRIMARY KEY AUTOINCREMENT,
  zona       TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  estado     TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | en_proceso | completada
  id_sesion  INTEGER REFERENCES sesiones(id_sesion)
);

CREATE INDEX IF NOT EXISTS idx_lecturas_momento ON lecturas(momento);
CREATE INDEX IF NOT EXISTS idx_eventos_sesion ON eventos(id_sesion);
CREATE INDEX IF NOT EXISTS idx_comandos_pend ON comandos(atendido);
