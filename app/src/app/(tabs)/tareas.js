import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pantalla from '../../components/Pantalla';
import { Aviso, Boton, Cargando, Seccion, Tarjeta, Titulo } from '../../components/ui';
import { api } from '../../lib/api';
import { avisar } from '../../lib/avisar';
import { useDatos } from '../../lib/useDatos';
import { color, nombreTipo, nombreZona } from '../../lib/tema';

const PESTANAS = [
  { id: 'pendiente', t: 'Pendientes' },
  { id: 'en_proceso', t: 'En proceso' },
  { id: 'completada', t: 'Completadas' },
];
const iconoZona = { completa: 'square-outline', izquierda: 'arrow-back-circle-outline', derecha: 'arrow-forward-circle-outline' };
const areaZona = { completa: '9 m²', izquierda: '4.5 m²', derecha: '4.5 m²' };

export default function Tareas() {
  const { datos: tareas, error, refrescar } = useDatos(api.tareas, 2500);
  const [pestana, setPestana] = useState('pendiente');
  const [zona, setZona] = useState('completa');
  const [tipo, setTipo] = useState('aspirar');
  const [enviando, setEnviando] = useState(false);

  const iniciar = async (cuerpo) => {
    setEnviando(true);
    try { await api.comando({ accion: 'iniciar', ...cuerpo }); await refrescar(); setPestana('en_proceso'); }
    catch (e) { avisar('No se pudo iniciar', e.message); }
    finally { setEnviando(false); }
  };

  const lista = (tareas ?? []).filter((t) => t.estado === pestana);

  return (
    <Pantalla alRefrescar={refrescar}>
      <Titulo>Tareas</Titulo>
      {error && <Aviso texto={`Sin conexión con el robot: ${error}`} />}

      <Tarjeta style={{ gap: 12 }}>
        <Text style={est.fuerte}>Nueva limpieza</Text>
        <Opciones valor={zona} cambiar={setZona} opciones={Object.entries(nombreZona)} />
        <Opciones valor={tipo} cambiar={setTipo} opciones={Object.entries(nombreTipo)} />
        <Boton titulo="Iniciar ahora" icono="play" deshabilitado={enviando} onPress={() => iniciar({ zona, tipo })} />
      </Tarjeta>

      <View style={est.pestanas}>
        {PESTANAS.map((p) => {
          const n = (tareas ?? []).filter((t) => t.estado === p.id).length;
          const sel = p.id === pestana;
          return (
            <Pressable key={p.id} onPress={() => setPestana(p.id)} style={[est.pestana, sel && est.pestanaSel]}>
              <Text style={[est.pestanaTxt, sel && { color: '#fff' }]}>{p.t} ({n})</Text>
            </Pressable>
          );
        })}
      </View>

      {!tareas && !error && <Cargando />}
      {tareas && !lista.length && <Text style={[est.sub, { textAlign: 'center', padding: 24 }]}>No hay tareas aquí.</Text>}
      {lista.map((t) => (
        <Tarjeta key={t.id} style={est.fila}>
          <View style={est.icono}><Ionicons name={iconoZona[t.zona]} size={22} color={color.primario} /></View>
          <View style={{ flex: 1 }}>
            <Text style={est.fuerte}>{nombreZona[t.zona]}</Text>
            <Text style={est.sub}>{nombreTipo[t.tipo]} · ~{areaZona[t.zona]}</Text>
          </View>
          {t.estado === 'pendiente' && (
            <Pressable onPress={() => iniciar({ zona: t.zona, tipo: t.tipo, tarea_id: t.id })} disabled={enviando} hitSlop={8} accessibilityLabel="Iniciar tarea">
              <Ionicons name="play-circle-outline" size={34} color={color.primario} />
            </Pressable>
          )}
          {t.estado === 'en_proceso' && <Ionicons name="sync" size={24} color={color.aviso} />}
          {t.estado === 'completada' && <Ionicons name="checkmark-circle" size={26} color={color.ok} />}
        </Tarjeta>
      ))}
      <Seccion> </Seccion>
    </Pantalla>
  );
}

function Opciones({ valor, cambiar, opciones }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {opciones.map(([id, t]) => (
        <Pressable key={id} onPress={() => cambiar(id)} style={[est.chip, valor === id && est.chipSel]}>
          <Text style={[est.chipTxt, valor === id && { color: color.primario }]}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const est = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 44, height: 44, borderRadius: 12, backgroundColor: color.primarioClaro, alignItems: 'center', justifyContent: 'center' },
  fuerte: { fontSize: 15.5, fontWeight: '600', color: color.texto },
  sub: { fontSize: 13, color: color.suave },
  pestanas: { flexDirection: 'row', gap: 6 },
  pestana: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: color.tarjeta, borderWidth: 1, borderColor: color.borde },
  pestanaSel: { backgroundColor: color.primario, borderColor: color.primario },
  pestanaTxt: { fontSize: 13, fontWeight: '600', color: color.texto },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: color.borde, backgroundColor: '#fff' },
  chipSel: { borderColor: color.primario, backgroundColor: color.primarioClaro },
  chipTxt: { fontSize: 13.5, fontWeight: '500', color: color.texto },
});
