import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pantalla from '../../components/Pantalla';
import MapaRobot from '../../components/MapaRobot';
import { Aviso, Cargando, Indicador, Seccion, Tarjeta, Titulo } from '../../components/ui';
import { api } from '../../lib/api';
import { useDatos, fechaCorta, minutosEntre } from '../../lib/useDatos';
import { color, nombreTipo, nombreZona } from '../../lib/tema';

const OBST = [[3, 3], [6, 6], [7, 2], [2, 7]];
const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function Historial() {
  const { datos: ses, error, refrescar } = useDatos(api.sesiones, 5000);
  const { datos: m } = useDatos(() => api.mapa(), 0);

  const lista = ses ?? [];
  const minutos = lista.map((s) => minutosEntre(s.hora_inicio, s.hora_fin));
  const consumo = lista.map((s) => (s.bateria_inicio - s.bateria_final) / Math.max(1, minutosEntre(s.hora_inicio, s.hora_fin)));

  return (
    <Pantalla alRefrescar={refrescar}>
      <Titulo>Historial</Titulo>
      {error && <Aviso texto={`Sin conexión con el robot: ${error}`} />}
      {!ses && !error && <Cargando />}

      {ses && (
        <>
          <Seccion>Resumen</Seccion>
          <View style={est.grid}>
            <Indicador icono="albums-outline" valor={`${lista.length}`} etiqueta="Limpiezas" />
            <Indicador icono="grid-outline" valor={`${Math.round(promedio(lista.map((s) => s.cobertura)))}%`} etiqueta="Cobertura prom." />
          </View>
          <View style={est.grid}>
            <Indicador icono="time-outline" valor={`${Math.round(promedio(minutos))} min`} etiqueta="Duración prom." />
            <Indicador icono="battery-half" valor={`${promedio(consumo).toFixed(1)}%/min`} etiqueta="Consumo de batería" />
          </View>

          <Seccion>Limpiezas</Seccion>
          {lista.map((s) => (
            <Tarjeta key={s.id} style={est.fila}>
              <View style={{ width: 84 }}>
                <MapaRobot mini mapa={{ ancho: m?.ancho ?? 10, alto: m?.alto ?? 10, celdas: s.celdas ?? [], obstaculos: m?.obstaculos ?? OBST, base: m?.base ?? [4, 9] }} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={est.fuerte}>Limpieza completada</Text>
                <Text style={est.sub}>{fechaCorta(s.hora_inicio)}</Text>
                <Text style={est.sub}>{nombreZona[s.zona]} · {nombreTipo[s.tipo]}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
                  <Dato i="time-outline" t={`${minutosEntre(s.hora_inicio, s.hora_fin)} min`} />
                  <Dato i="resize-outline" t={`${s.area_m2} m²`} />
                  <Dato i="grid-outline" t={`${s.cobertura}%`} />
                  <Dato i="alert-circle-outline" t={`${s.obstaculos}`} />
                </View>
              </View>
            </Tarjeta>
          ))}
        </>
      )}
    </Pantalla>
  );
}

function Dato({ i, t }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={i} size={13} color={color.suave} />
      <Text style={est.sub}>{t}</Text>
    </View>
  );
}

const est = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fuerte: { fontSize: 15, fontWeight: '600', color: color.texto },
  sub: { fontSize: 13, color: color.suave },
});
