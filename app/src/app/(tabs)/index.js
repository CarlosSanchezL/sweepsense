import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Pantalla from '../../components/Pantalla';
import { Aviso, Boton, Cargando, Indicador, Pastilla, Seccion, Tarjeta, Titulo } from '../../components/ui';
import { api, leerConfig } from '../../lib/api';
import { useDatos, duracion, fechaCorta, minutosEntre } from '../../lib/useDatos';
import { color, nombreModo, nombreTipo, nombreZona } from '../../lib/tema';

import { avisar } from '../../lib/avisar';

const tonoModo = { limpiando: color.primario, pausado: color.aviso, regresando: color.aviso, cargando: color.ok, en_espera: color.suave };
const iconoBateria = (b, carga) => (carga ? 'battery-charging' : b > 60 ? 'battery-full' : b > 25 ? 'battery-half' : 'battery-dead');

export default function Inicio() {
  const { datos: e, error, refrescar } = useDatos(api.estado, 2000);
  const { datos: ev, refrescar: refEv } = useDatos(() => api.eventos(5), 3000);
  const [enviando, setEnviando] = useState(false);

  const mandar = async (cuerpo) => {
    setEnviando(true);
    try { await api.comando(cuerpo); await refrescar(); await refEv(); }
    catch (err) { avisar('No se pudo', err.message); }
    finally { setEnviando(false); }
  };

  const demo = leerConfig().modo === 'demo';
  const se = e?.sesion;
  const ult = e?.ultima_sesion;
  const activo = e && ['limpiando', 'pausado'].includes(e.modo);

  return (
    <Pantalla alRefrescar={refrescar}>
      <Titulo derecha={
        <Pressable onPress={() => router.push('/ajustes')} hitSlop={12} accessibilityLabel="Ajustes">
          <Ionicons name="settings-outline" size={24} color={color.texto} />
        </Pressable>
      }>SweepSense</Titulo>

      {demo && <Aviso tipo="info" texto="Modo demo: datos simulados. Cámbialo en Ajustes para usar el robot." />}
      {error && <Aviso texto={`Sin conexión con el robot: ${error}`} />}
      {!e && !error && <Cargando />}

      {e && (
        <>
          <Tarjeta style={{ gap: 12 }}>
            <View style={est.fila}>
              <View style={est.robot}><Ionicons name="disc" size={44} color={color.primario} /></View>
              <View style={{ flex: 1, gap: 6 }}>
                <Pastilla texto={nombreModo[e.modo] ?? e.modo} tono={tonoModo[e.modo] ?? color.suave} />
                <Text style={est.sub}>
                  {se ? `${nombreZona[se.zona]} · ${nombreTipo[se.tipo]}` : e.online ? 'Robot en línea' : 'Robot sin conexión'}
                </Text>
              </View>
            </View>
            {se && (
              <View style={{ gap: 6 }}>
                <View style={est.barra}><View style={[est.barraLlena, { width: `${se.cobertura}%` }]} /></View>
                <Text style={est.sub}>{se.cobertura}% del área · {se.area_m2} de {se.area_total_m2} m²</Text>
              </View>
            )}
          </Tarjeta>

          {e.fuga && <Aviso texto="¡Agua detectada! La bomba y la turbina se apagaron. Revisa el robot." />}
          {e.bateria < 20 && !e.cargando && <Aviso tipo="info" texto="Batería baja: conviene mandarlo a la base." />}

          <Seccion>Indicadores en tiempo real</Seccion>
          <View style={est.grid}>
            <Indicador icono={iconoBateria(e.bateria, e.cargando)} valor={`${e.bateria}%`} etiqueta={e.cargando ? 'Batería · cargando' : 'Batería'}
              tono={e.bateria < 20 ? color.alerta : color.primario} />
            <Indicador icono="flash" valor={`${e.voltaje} V`} etiqueta={`${Math.abs(e.corriente_ma)} mA`} />
            <Indicador icono="timer-outline" valor={se ? duracion(se.tiempo_s) : '—'} etiqueta="Tiempo limpiando" />
            <Indicador icono="grid-outline" valor={`${(se ?? ult)?.cobertura ?? 0}%`} etiqueta={se ? 'Cobertura' : 'Cobertura (última)'} />
            <Indicador icono="resize-outline" valor={`${(se ?? ult)?.area_m2 ?? 0} m²`} etiqueta={se ? 'Área limpiada' : 'Área (última)'} />
            <Indicador icono="alert-circle-outline" valor={`${(se ?? ult)?.obstaculos ?? 0}`} etiqueta={se ? 'Obstáculos' : 'Obstáculos (última)'} />
            <Indicador icono="water-outline" valor={e.fuga ? 'Fuga' : 'Seco'} etiqueta="Sensor de fuga" tono={e.fuga ? color.alerta : color.ok} />
          </View>

          <Seccion>Control</Seccion>
          {!activo ? (
            <Boton titulo="Iniciar limpieza" icono="play" deshabilitado={enviando} onPress={() => mandar({ accion: 'iniciar', zona: 'completa', tipo: 'aspirar' })} />
          ) : e.modo === 'limpiando' ? (
            <Boton titulo="Pausar" icono="pause" deshabilitado={enviando} onPress={() => mandar({ accion: 'pausar' })} />
          ) : (
            <Boton titulo="Reanudar" icono="play" deshabilitado={enviando || e.fuga} onPress={() => mandar({ accion: 'reanudar' })} />
          )}
          <View style={est.fila}>
            <Boton style={{ flex: 1 }} tipo="secundario" titulo="Detener" icono="stop" deshabilitado={enviando || !activo} onPress={() => mandar({ accion: 'detener' })} />
            <Boton style={{ flex: 1 }} tipo="secundario" titulo="A la base" icono="home" deshabilitado={enviando || e.modo === 'cargando'} onPress={() => mandar({ accion: 'regresar' })} />
          </View>

          {ult && (
            <>
              <Seccion>Última limpieza</Seccion>
              <Tarjeta style={est.fila}>
                <Ionicons name="checkmark-circle" size={28} color={color.ok} />
                <View style={{ flex: 1 }}>
                  <Text style={est.fuerte}>{nombreZona[ult.zona]} · {nombreTipo[ult.tipo]}</Text>
                  <Text style={est.sub}>{fechaCorta(ult.hora_inicio)} · {minutosEntre(ult.hora_inicio, ult.hora_fin)} min · {ult.area_m2} m²</Text>
                </View>
              </Tarjeta>
            </>
          )}

          {ev?.length ? (
            <>
              <Seccion>Eventos recientes</Seccion>
              <Tarjeta style={{ gap: 10 }}>
                {ev.map((x) => (
                  <View key={x.id} style={est.fila}>
                    <Ionicons name={iconoEvento[x.tipo] ?? 'ellipse-outline'} size={16} color={x.tipo === 'fuga' ? color.alerta : color.suave} />
                    <Text style={[est.sub, { flex: 1, color: color.texto }]}>{x.detalle}</Text>
                    <Text style={est.hora}>{new Date(x.momento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                ))}
              </Tarjeta>
            </>
          ) : null}
        </>
      )}
    </Pantalla>
  );
}

const iconoEvento = { obstaculo: 'alert-circle-outline', fuga: 'water', bateria_baja: 'battery-dead', comando: 'phone-portrait-outline', voz: 'mic-outline', base: 'home-outline', fin: 'checkmark-done', regreso: 'return-down-back' };

const est = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  robot: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.primarioClaro, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 13.5, color: color.suave },
  fuerte: { fontSize: 15, fontWeight: '600', color: color.texto },
  hora: { fontSize: 12, color: color.suave, fontVariant: ['tabular-nums'] },
  barra: { height: 8, borderRadius: 4, backgroundColor: color.pendiente, overflow: 'hidden' },
  barraLlena: { height: 8, backgroundColor: color.primario },
});
