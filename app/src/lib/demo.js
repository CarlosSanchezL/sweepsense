// Robot simulado. Responde con la MISMA forma de datos que la API de la Raspberry Pi,
// así la app funciona igual en modo demo y con el robot real.

const ANCHO = 10; // celdas (3 m / 0.30 m)
const ALTO = 10;
const CELDA_M = 0.3;
const BASE = [4, 9];
const OBSTACULOS = [[3, 3], [6, 6], [7, 2], [2, 7]];
const esObstaculo = (x, y) => OBSTACULOS.some(([a, b]) => a === x && b === y);

const ahora = () => Date.now();
const iso = (t) => new Date(t).toISOString();

function rutaZona(zona) {
  const [x0, x1] = zona === 'izquierda' ? [0, 4] : zona === 'derecha' ? [5, 9] : [0, 9];
  const ruta = [];
  let choques = 0;
  for (let y = 0; y < ALTO; y++) {
    const xs = [];
    for (let x = x0; x <= x1; x++) xs.push(x);
    if (y % 2) xs.reverse();
    for (const x of xs) {
      if (esObstaculo(x, y)) { choques++; continue; }
      ruta.push([x, y]);
    }
  }
  return { ruta, choques };
}

function celdasAleatorias(zona, fraccion, semilla) {
  const { ruta } = rutaZona(zona);
  let s = semilla;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return ruta.filter(() => rnd() < fraccion);
}

const hora = (diasAtras, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

function sesionPasada(id, dias, h, m, minutos, zona, tipo, fraccion, bIni, bFin, obst) {
  const celdas = celdasAleatorias(zona, fraccion, id * 7 + 3);
  return {
    id, zona, tipo,
    hora_inicio: iso(hora(dias, h, m)),
    hora_fin: iso(hora(dias, h, m) + minutos * 60000),
    bateria_inicio: bIni, bateria_final: bFin,
    area_m2: +(celdas.length * CELDA_M * CELDA_M).toFixed(2),
    cobertura: Math.round((100 * celdas.length) / rutaZona(zona).ruta.length),
    obstaculos: obst,
    celdas,
  };
}

const s = {
  modo: 'en_espera',
  bateria: 86,
  fuga: false,
  pos: [...BASE],
  sesion: null, // sesión en curso
  ultimo: ahora(),
  sesiones: [
    sesionPasada(1, 3, 11, 20, 14, 'izquierda', 'aspirar', 0.9, 95, 88, 2),
    sesionPasada(2, 2, 15, 45, 22, 'completa', 'aspirar_trapear', 0.84, 100, 81, 4),
    sesionPasada(3, 1, 10, 15, 25, 'completa', 'aspirar', 0.92, 98, 79, 3),
    sesionPasada(4, 0, 9, 30, 12, 'derecha', 'aspirar_trapear', 0.88, 92, 86, 2),
  ],
  tareas: [
    { id: 1, zona: 'completa', tipo: 'aspirar_trapear', estado: 'pendiente' },
    { id: 2, zona: 'izquierda', tipo: 'aspirar', estado: 'pendiente' },
    { id: 3, zona: 'derecha', tipo: 'aspirar', estado: 'pendiente' },
    { id: 4, zona: 'completa', tipo: 'aspirar', estado: 'completada', sesion_id: 3 },
    { id: 5, zona: 'derecha', tipo: 'aspirar_trapear', estado: 'completada', sesion_id: 4 },
  ],
  eventos: [],
  idEvento: 1,
  lecturas: [],
};

function evento(tipo, detalle) {
  s.eventos.unshift({ id: s.idEvento++, momento: iso(ahora()), tipo, detalle, sesion_id: s.sesion?.id ?? null });
  s.eventos = s.eventos.slice(0, 60);
}
evento('sistema', 'Modo demo iniciado');

function terminarSesion() {
  const se = s.sesion;
  if (!se) return;
  const fin = ahora();
  const cel = se.ruta.slice(0, se.paso);
  s.sesiones.push({
    id: se.id, zona: se.zona, tipo: se.tipo,
    hora_inicio: iso(se.inicio), hora_fin: iso(fin),
    bateria_inicio: se.bateria_inicio, bateria_final: Math.round(s.bateria),
    area_m2: +(cel.length * CELDA_M * CELDA_M).toFixed(2),
    cobertura: Math.round((100 * cel.length) / se.ruta.length),
    obstaculos: se.obstaculos,
    celdas: cel,
  });
  const t = s.tareas.find((x) => x.id === se.tarea_id);
  if (t) { t.estado = 'completada'; t.sesion_id = se.id; }
  evento('fin', `Limpieza terminada: ${cel.length} celdas`);
  s.sesion = null;
}

// Avanza la simulación: 1 paso por segundo
function avanzar() {
  const pasos = Math.min(Math.floor((ahora() - s.ultimo) / 1000), 30);
  if (pasos <= 0) return;
  s.ultimo += pasos * 1000;
  for (let i = 0; i < pasos; i++) {
    paso();
    const t = s.ultimo - (pasos - 1 - i) * 1000;
    if (Math.floor(t / 1000) % 5 === 0) grabarLectura(t); // una lectura cada 5 s
  }
}

// Historial de lecturas para las gráficas (como la tabla `lecturas` de la Pi)
function grabarLectura(t, modo = s.modo, bateria = s.bateria) {
  s.lecturas.push({
    momento: iso(t), modo, bateria: Math.round(bateria), voltaje: voltaje(bateria),
    corriente_ma: corriente(modo) + Math.round(Math.random() * 80 - 40), fuga: s.fuga ? 1 : 0,
  });
  if (s.lecturas.length > 720) s.lecturas.shift(); // una hora como máximo
}

function paso() {
  if (s.fuga && (s.modo === 'limpiando')) {
    s.modo = 'pausado';
    evento('fuga', 'Agua detectada: bomba y turbina apagadas');
  }
  if (s.modo === 'limpiando') {
    const se = s.sesion;
    se.tiempo_s += 1;
    s.bateria = Math.max(0, s.bateria - 0.12);
    if (se.paso < se.ruta.length) {
      const [x, y] = se.ruta[se.paso];
      // ¿la siguiente celda de la ruta topa con un obstáculo?
      const sig = se.ruta[se.paso + 1];
      if (sig && Math.abs(sig[0] - x) + Math.abs(sig[1] - y) > 1 && Math.random() < 0.6) {
        se.obstaculos += 1;
        evento('obstaculo', `Obstáculo evitado cerca de (${x}, ${y})`);
      }
      s.pos = [x, y];
      se.paso += 1;
    } else {
      terminarSesion();
      s.modo = 'regresando';
      evento('regreso', 'Regresando a la base');
    }
    if (s.bateria < 20 && s.modo === 'limpiando') {
      evento('bateria_baja', 'Batería baja: regresando a la base');
      terminarSesion();
      s.modo = 'regresando';
    }
  } else if (s.modo === 'regresando') {
    const [x, y] = s.pos;
    const [bx, by] = BASE;
    if (x === bx && y === by) {
      s.modo = 'cargando';
      evento('base', 'Robot en la base, cargando');
    } else {
      s.pos = x !== bx ? [x + Math.sign(bx - x), y] : [x, y + Math.sign(by - y)];
      s.bateria = Math.max(0, s.bateria - 0.05);
    }
  } else if (s.modo === 'cargando') {
    s.bateria = Math.min(100, s.bateria + 0.8);
    if (s.bateria >= 100) { s.modo = 'en_espera'; evento('base', 'Batería completa'); }
  }
}

const voltaje = (b) => +(10.5 + (12.6 - 10.5) * (b / 100)).toFixed(2);
const corriente = (modo) => ({ limpiando: 2600, regresando: 900, pausado: 650, cargando: -1500 }[modo] ?? 600);

// Los últimos 30 minutos simulados (una limpieza, el regreso y la carga), para que la gráfica no empiece vacía
(function sembrarLecturas() {
  const fin = ahora();
  for (let seg = 30 * 60; seg > 0; seg -= 5) {
    const min = (30 * 60 - seg) / 60; // minuto 0 a 30
    let modo = 'en_espera', b = 96;
    if (min >= 3 && min < 17) { modo = 'limpiando'; b = 96 - (min - 3) * 1.1; }
    else if (min >= 17 && min < 19) { modo = 'regresando'; b = 80.6 - (min - 17) * 0.3; }
    else if (min >= 19 && min < 27) { modo = 'cargando'; b = 80 + (min - 19) * 0.75; }
    else if (min >= 27) { modo = 'en_espera'; b = 86; }
    grabarLectura(fin - seg * 1000, modo, b);
  }
})();

export function estado() {
  avanzar();
  const se = s.sesion;
  return {
    online: true,
    modo: s.modo,
    bateria: Math.round(s.bateria),
    voltaje: voltaje(s.bateria),
    corriente_ma: corriente(s.modo) + Math.round(Math.random() * 80 - 40),
    cargando: s.modo === 'cargando',
    fuga: s.fuga,
    posicion: s.pos,
    actualizado: iso(ahora()),
    ultima_sesion: s.sesiones[s.sesiones.length - 1] ? resumen(s.sesiones[s.sesiones.length - 1]) : null,
    sesion: se ? {
      id: se.id, zona: se.zona, tipo: se.tipo, hora_inicio: iso(se.inicio),
      tiempo_s: se.tiempo_s,
      cobertura: Math.round((100 * se.paso) / se.ruta.length),
      area_m2: +(se.paso * CELDA_M * CELDA_M).toFixed(2),
      area_total_m2: +(se.ruta.length * CELDA_M * CELDA_M).toFixed(2),
      obstaculos: se.obstaculos,
    } : null,
  };
}

const resumen = ({ celdas, ...r }) => r;

export function mapa(sesionId) {
  avanzar();
  const base = { ancho: ANCHO, alto: ALTO, celda_m: CELDA_M, base: BASE, obstaculos: OBSTACULOS };
  if (sesionId) {
    const se = s.sesiones.find((x) => x.id === Number(sesionId));
    return { ...base, celdas: se ? se.celdas : [], ruta: se ? se.celdas : [], robot: null };
  }
  const se = s.sesion;
  if (!se) {
    const ult = s.sesiones[s.sesiones.length - 1];
    return { ...base, celdas: ult?.celdas ?? [], ruta: [], robot: s.pos, pendientes: [] };
  }
  const hechas = se.ruta.slice(0, se.paso);
  return { ...base, celdas: hechas, ruta: hechas, robot: s.pos, pendientes: se.ruta.slice(se.paso) };
}

export function sesiones() {
  avanzar();
  return [...s.sesiones].reverse();
}

export function tareas() {
  avanzar();
  return s.tareas;
}

export function eventos(limite = 20) {
  avanzar();
  return s.eventos.slice(0, limite);
}

export function comando({ accion, zona = 'completa', tipo = 'aspirar', tarea_id }) {
  avanzar();
  if (accion === 'iniciar') {
    if (s.fuga) throw new Error('Hay agua detectada. Revisa el robot antes de iniciar.');
    if (s.bateria < 20) throw new Error('Batería muy baja para iniciar.');
    if (s.sesion) terminarSesion();
    const { ruta } = rutaZona(zona);
    const id = (s.sesiones.at(-1)?.id ?? 0) + 1;
    let tid = tarea_id;
    if (!tid) {
      tid = Math.max(...s.tareas.map((t) => t.id)) + 1;
      s.tareas.push({ id: tid, zona, tipo, estado: 'pendiente' });
    }
    s.tareas.forEach((t) => { if (t.estado === 'en_proceso') t.estado = 'pendiente'; });
    s.tareas.find((t) => t.id === tid).estado = 'en_proceso';
    s.sesion = { id, zona, tipo, tarea_id: tid, ruta, paso: 0, tiempo_s: 0, obstaculos: 0, inicio: ahora(), bateria_inicio: Math.round(s.bateria) };
    s.modo = 'limpiando';
    evento('comando', `Iniciar: ${zona}, ${tipo}`);
  } else if (accion === 'pausar' && s.modo === 'limpiando') {
    s.modo = 'pausado'; evento('comando', 'Pausar');
  } else if (accion === 'reanudar' && s.modo === 'pausado' && s.sesion) {
    s.modo = 'limpiando'; evento('comando', 'Reanudar');
  } else if (accion === 'detener') {
    terminarSesion(); s.modo = 'en_espera'; evento('comando', 'Detener');
  } else if (accion === 'regresar') {
    terminarSesion(); s.modo = 'regresando'; evento('comando', 'Regresar a base');
  }
  return { ok: true, modo: s.modo };
}

// Solo en demo: para enseñar la alerta de fuga en la presentación
export function lecturas(minutos = 30) {
  avanzar();
  const desde = ahora() - minutos * 60000;
  return s.lecturas.filter((l) => new Date(l.momento).getTime() >= desde);
}

export function crearTarea({ zona = 'completa', tipo = 'aspirar' }) {
  const id = Math.max(0, ...s.tareas.map((t) => t.id)) + 1;
  s.tareas.push({ id, zona, tipo, estado: 'pendiente' });
  evento('comando', `Tarea guardada: ${zona}, ${tipo}`);
  return { ok: true, id };
}

export function simularFuga(valor) {
  s.fuga = valor;
  evento(valor ? 'fuga' : 'sistema', valor ? 'Sensor de fuga activado' : 'Sensor de fuga seco');
}
