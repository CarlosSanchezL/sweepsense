import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { color } from '../lib/tema';

// Gráfica de línea de una columna de `lecturas` en el tiempo.
// Las franjas de fondo marcan cuándo el robot estaba limpiando o cargando.
const ALTO = 170;
const IZQ = 40, DER = 12, ARR = 14, ABA = 24;

const redondear = (v, paso, arriba) => (arriba ? Math.ceil(v / paso) : Math.floor(v / paso)) * paso;
const hora = (iso) => {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Grafica({ datos, campo, unidad, paso = 10, min: minFijo, max: maxFijo, cero = false }) {
  const [ancho, setAncho] = useState(0);
  const puntos = (datos ?? []).filter((d) => d[campo] != null);

  if (puntos.length < 2) {
    return <Text style={est.vacio}>Todavía no hay lecturas suficientes para graficar.</Text>;
  }

  const valores = puntos.map((d) => d[campo]);
  let min = minFijo ?? redondear(Math.min(...valores), paso, false);
  let max = maxFijo ?? redondear(Math.max(...valores), paso, true);
  if (cero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (max === min) max = min + paso;

  const t0 = new Date(puntos[0].momento).getTime();
  const t1 = new Date(puntos[puntos.length - 1].momento).getTime();
  const w = Math.max(1, ancho - IZQ - DER), h = ALTO - ARR - ABA;
  const X = (iso) => IZQ + ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v) => ARR + (1 - (v - min) / (max - min)) * h;

  const linea = puntos.map((d, i) => `${i ? 'L' : 'M'}${X(d.momento).toFixed(1)},${Y(d[campo]).toFixed(1)}`).join('');
  const base = Y(cero ? 0 : min);
  const area = `${linea}L${X(puntos[puntos.length - 1].momento).toFixed(1)},${base}L${X(puntos[0].momento).toFixed(1)},${base}Z`;

  // Tramos continuos en el mismo modo, para las franjas de fondo
  const tramos = [];
  puntos.forEach((d, i) => {
    const ult = tramos[tramos.length - 1];
    if (ult && ult.modo === d.modo) ult.fin = d.momento;
    else tramos.push({ modo: d.modo, ini: i ? puntos[i - 1].momento : d.momento, fin: d.momento });
  });
  const fondo = { limpiando: color.primarioClaro, cargando: color.ok + '1F' };

  // Marcas del eje en múltiplos redondos (máximo 6)
  let pasoMarca = paso;
  while ((max - min) / pasoMarca > 5) pasoMarca *= 2;
  const marcas = [];
  for (let m = Math.ceil(min / pasoMarca) * pasoMarca; m <= max; m += pasoMarca) marcas.push(m);
  const ultimo = puntos[puntos.length - 1];

  return (
    <View>
      <View style={{ width: '100%', height: ALTO }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
        {ancho > 0 && (
          <Svg width={ancho} height={ALTO}>
            {tramos.filter((t) => fondo[t.modo]).map((t, i) => (
              <Rect key={`f${i}`} x={X(t.ini)} y={ARR} width={Math.max(1, X(t.fin) - X(t.ini))} height={h} fill={fondo[t.modo]} />
            ))}
            {marcas.map((m) => (
              <Line key={`g${m}`} x1={IZQ} x2={IZQ + w} y1={Y(m)} y2={Y(m)} stroke={cero && m === 0 ? color.suave : color.borde} strokeWidth={1} />
            ))}
            {marcas.map((m) => (
              <SvgText key={`t${m}`} x={IZQ - 6} y={Y(m) + 4} fontSize="10.5" fill={color.suave} textAnchor="end">{m}</SvgText>
            ))}
            <Path d={area} fill={color.primario} fillOpacity={0.08} />
            <Path d={linea} fill="none" stroke={color.primario} strokeWidth={2} strokeLinejoin="round" />
            <Circle cx={X(ultimo.momento)} cy={Y(ultimo[campo])} r={4} fill={color.primario} />
            <SvgText x={IZQ} y={ALTO - 6} fontSize="10.5" fill={color.suave}>{hora(puntos[0].momento)}</SvgText>
            <SvgText x={IZQ + w} y={ALTO - 6} fontSize="10.5" fill={color.suave} textAnchor="end">{hora(ultimo.momento)}</SvgText>
          </Svg>
        )}
      </View>
      <View style={est.pie}>
        <Text style={est.valor}>Ahora: {ultimo[campo]} {unidad}</Text>
        <View style={est.leyenda}>
          <View style={[est.cuadro, { backgroundColor: color.primarioClaro }]} /><Text style={est.txt}>Limpiando</Text>
          <View style={[est.cuadro, { backgroundColor: color.ok + '1F' }]} /><Text style={est.txt}>Cargando</Text>
        </View>
      </View>
    </View>
  );
}

const est = StyleSheet.create({
  vacio: { fontSize: 13, color: color.suave, paddingVertical: 24, textAlign: 'center' },
  pie: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 6 },
  valor: { fontSize: 13.5, fontWeight: '600', color: color.texto, fontVariant: ['tabular-nums'] },
  leyenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cuadro: { width: 12, height: 12, borderRadius: 3, marginLeft: 6 },
  txt: { fontSize: 12, color: color.suave },
});
