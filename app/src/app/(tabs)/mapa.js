import { StyleSheet, Text, View } from 'react-native';
import Pantalla from '../../components/Pantalla';
import MapaRobot from '../../components/MapaRobot';
import { Aviso, Cargando, Indicador, Pastilla, Tarjeta, Titulo } from '../../components/ui';
import { api } from '../../lib/api';
import { useDatos, duracion } from '../../lib/useDatos';
import { color, nombreModo, nombreZona } from '../../lib/tema';

export default function Mapa() {
  const { datos: m, error } = useDatos(() => api.mapa(), 1500);
  const { datos: e } = useDatos(api.estado, 1500);
  const se = e?.sesion;
  const ult = e?.ultima_sesion;

  return (
    <Pantalla>
      <Titulo>Mapa de limpieza</Titulo>
      {error && <Aviso texto={`Sin conexión con el robot: ${error}`} />}
      {!m && !error && <Cargando />}
      {m && e && (
        <>
          <Tarjeta style={est.fila}>
            <View style={{ gap: 4, flex: 1 }}>
              <Pastilla texto={se ? 'En proceso' : nombreModo[e.modo]} tono={se ? color.primario : color.suave} />
              <Text style={est.sub}>{se ? nombreZona[se.zona] : ult ? `Última: ${nombreZona[ult.zona]}` : 'Sin limpiezas'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={est.grande}>{(se ?? ult)?.cobertura ?? 0}%</Text>
              <Text style={est.sub}>completado</Text>
            </View>
          </Tarjeta>

          <Tarjeta style={{ padding: 12 }}>
            <MapaRobot mapa={m} />
            <View style={est.leyenda}>
              <Item c={color.limpio} t="Área limpiada" />
              <Item c={color.pendiente} t="Pendiente" />
              <Item c={color.obstaculo} t="Obstáculo" />
              <Item c={color.primario} t="Ruta" linea />
            </View>
            <Text style={[est.sub, { textAlign: 'center', marginTop: 6 }]}>
              Área de {m.ancho * m.celda_m} × {m.alto * m.celda_m} m · celdas de {m.celda_m * 100} cm
            </Text>
          </Tarjeta>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Indicador icono="timer-outline" valor={se ? duracion(se.tiempo_s) : '—'} etiqueta="Tiempo" />
            <Indicador icono="resize-outline" valor={`${(se ?? ult)?.area_m2 ?? 0} m²`} etiqueta="Área" />
            <Indicador icono="alert-circle-outline" valor={`${(se ?? ult)?.obstaculos ?? 0}`} etiqueta="Obstáculos" />
          </View>
        </>
      )}
    </Pantalla>
  );
}

function Item({ c, t, linea }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={linea ? { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: c } : { width: 12, height: 12, borderRadius: 3, backgroundColor: c }} />
      <Text style={est.sub}>{t}</Text>
    </View>
  );
}

const est = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sub: { fontSize: 13, color: color.suave },
  grande: { fontSize: 26, fontWeight: '800', color: color.texto },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 12 },
});
