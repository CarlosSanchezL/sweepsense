import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { alCambiarConfig } from './api';

// Pide datos al iniciar y luego cada `cadaMs` milisegundos (tiempo real por consulta HTTP).
// Solo consulta mientras la pantalla está visible, para no cargar de más a la Raspberry Pi.
export function useDatos(pedir, cadaMs = 2000, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const vivo = useRef(true);
  const visible = useIsFocused();

  const refrescar = useCallback(async () => {
    try {
      const d = await pedir();
      if (vivo.current) { setDatos(d); setError(null); }
    } catch (e) {
      if (vivo.current) setError(e.message || 'Error de conexión');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!visible) return undefined;
    vivo.current = true;
    refrescar();
    const t = cadaMs ? setInterval(refrescar, cadaMs) : null;
    const quitar = alCambiarConfig(() => { setDatos(null); refrescar(); });
    return () => { vivo.current = false; if (t) clearInterval(t); quitar(); };
  }, [refrescar, cadaMs, visible]);

  return { datos, error, refrescar, cargando: !datos && !error };
}

export const duracion = (seg) => {
  if (seg == null) return '—';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
};

export const minutosEntre = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaCorta = (iso) => {
  const d = new Date(iso);
  const hoy = new Date();
  const hh = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${hh}`;
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hh}`;
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}, ${hh}`;
};
