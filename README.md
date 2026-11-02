# SweepSense · App, API y base de datos

```
app/        App móvil y web (React Native + Expo)
servidor/   API HTTP, base de datos SQLite, puente con el ESP32 y MQTT de la estación (Raspberry Pi)
docs/       Diagrama de arquitectura para la presentación
```

## 1. Probar la app (sin robot)

Necesitas Node.js LTS en la compu y la app **Expo Go** en el celular.

```bash
cd app
npm install
npx expo start          # escanea el QR con Expo Go (celular y compu en la misma red)
npx expo start --web    # o ábrela como página web
```

La app arranca en **modo demo**: un robot simulado que limpia, choca con obstáculos, regresa a la base y carga. Sirve para presentar aunque el robot no esté listo. En **Ajustes** (engrane) hay un interruptor para simular una fuga de agua.

## 2. Servidor en la Raspberry Pi

```bash
cd servidor
pip install -r requirements.txt
sudo apt install mosquitto mosquitto-clients     # broker MQTT

python3 app.py                  # API HTTP en el puerto 5000 (crea sweepsense.db)
python3 puente_robot.py         # lee el ESP32 por /dev/ttyUSB0
python3 mqtt_estacion.py        # recibe la estación base por MQTT
```

Sin el robot armado se puede probar todo así:

```bash
python3 datos_prueba.py             # (una vez) limpiezas pasadas para el Historial
python3 app.py
python3 puente_robot.py --simular   # robot simulado en lugar del ESP32
```

En la app: **Ajustes → Robot real**, escribe `http://<IP de la Pi>:5000` (la IP sale con `hostname -I`) y toca **Probar conexión**.

## 3. Cómo viajan los datos

| Conexión | Protocolo | Detalle |
|---|---|---|
| ESP32 ↔ Pi | Serial USB | Trama `S,...` 20 veces por segundo; la Pi responde `M,`, `C,` y `X` |
| Estación ESP8266 ↔ Pi | **MQTT** | `sweepsense/base/estado` (cada 2 s) y `sweepsense/base/cmd` (`faro_on`/`faro_off`) |
| App ↔ Pi | **HTTP** | API REST en JSON (tabla de abajo) |
| Alexa → Pi | **HTTP** | `POST /api/comando` con `"origen": "alexa"` |

La app pide el estado cada 2 s y los comandos se guardan en la tabla `comandos`; el puente los lee y los manda al ESP32. Así la base de datos es el punto de comunicación entre dispositivos y de control en tiempo real.

## 4. API

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/estado` | Modo, batería, voltaje, corriente, fuga, posición, sesión en curso y última sesión |
| GET | `/api/mapa` (`?sesion=id`) | Cuadrícula 10×10, celdas limpias, ruta, obstáculos, base y robot |
| GET | `/api/sesiones` | Limpiezas terminadas con sus celdas |
| GET | `/api/tareas` | Tareas pendientes, en proceso y completadas |
| GET | `/api/eventos?limite=20` | Obstáculos, fugas, batería baja, comandos… |
| GET | `/api/lecturas?minutos=30` | Lecturas para gráficas |
| POST | `/api/comando` | `{"accion": "iniciar" \| "pausar" \| "reanudar" \| "detener" \| "regresar", "zona", "tipo", "origen"}` |
| POST | `/api/tareas` | `{"zona", "tipo"}` |
| POST | `/api/estacion` | Alternativa HTTP para la estación: `{"v", "ma", "cargando", "rssi"}` |

## 5. Base de datos

`servidor/esquema.sql` sigue el modelo entidad-relación del equipo (`sesiones`, `eventos`, `celdas_en_mapa` y la relación M:N `sesion_celda`) y agrega cuatro tablas: `lecturas`, `estacion`, `comandos` y `tareas`.

## 6. Indicadores de la app

Batería, voltaje y corriente, tiempo limpiando, cobertura (%), área limpiada (m²), obstáculos y sensor de fuga en tiempo real. En Historial: número de limpiezas, cobertura promedio, duración promedio y consumo de batería por minuto.

## 7. Pendientes para integrar

- **Navegación (Adrián):** reemplazar `servidor/navegacion.py` manteniendo los métodos `iniciar`, `paso`, `termino`, `detener` y `regresar`.
- **Encoders:** medir `CUENTAS_POR_VUELTA` en `puente_robot.py` (10 vueltas a mano).
- **Estación:** el sketch `estacion_base.ino` de la guía ya usa los temas MQTT correctos; solo cambiar `MQTT_HOST` por la IP de la Pi.
- **Alexa (Javier):** que la skill mande `POST /api/comando`. Para eso la API debe ser accesible desde internet (túnel HTTPS con Cloudflare Tunnel o ngrok).
- **Firmware del ESP32:** ya no necesita Wi-Fi ni Blynk, porque todo pasa por la Pi. Con el Wi-Fi apagado, los pines ADC2 vuelven a funcionar.
