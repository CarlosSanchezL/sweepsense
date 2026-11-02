import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Polyline, Circle, Path, G } from 'react-native-svg';
import { color } from '../lib/tema';

// Dibuja la cuadrícula del área (10×10 celdas de 30 cm) con lo limpio, la ruta, obstáculos, base y robot.
export default function MapaRobot({ mapa, mini = false }) {
  const [ancho, setAncho] = useState(0);
  if (!mapa) return <View style={{ aspectRatio: 1 }} />;
  const { ancho: nx, alto: ny, celdas = [], ruta = [], obstaculos = [], base, robot } = mapa;
  const c = ancho / nx;
  const limpio = new Set(celdas.map(([x, y]) => `${x},${y}`));
  const gap = mini ? 0.6 : 1.5;

  return (
    <View style={{ width: '100%', aspectRatio: nx / ny }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {ancho > 0 && (
        <Svg width={ancho} height={(ancho * ny) / nx}>
          {Array.from({ length: ny }).map((_, y) =>
            Array.from({ length: nx }).map((__, x) => (
              <Rect key={`${x}-${y}`} x={x * c + gap / 2} y={y * c + gap / 2} width={c - gap} height={c - gap} rx={mini ? 1 : 3}
                fill={limpio.has(`${x},${y}`) ? color.limpio : color.pendiente} />
            ))
          )}
          {obstaculos.map(([x, y]) => (
            <Rect key={`o${x}-${y}`} x={x * c + c * 0.18} y={y * c + c * 0.18} width={c * 0.64} height={c * 0.64} rx={c * 0.12} fill={color.obstaculo} />
          ))}
          {!mini && ruta.length > 1 && (
            <Polyline points={ruta.map(([x, y]) => `${x * c + c / 2},${y * c + c / 2}`).join(' ')}
              fill="none" stroke={color.primario} strokeWidth={2} strokeDasharray="5,4" strokeLinejoin="round" />
          )}
          {base && (
            <G x={base[0] * c + c / 2} y={base[1] * c + c / 2}>
              <Circle r={c * 0.42} fill="#fff" stroke={color.primario} strokeWidth={mini ? 1 : 2} />
              <Path d={`M ${-c * 0.2} ${c * 0.02} L 0 ${-c * 0.2} L ${c * 0.2} ${c * 0.02} L ${c * 0.2} ${c * 0.2} L ${-c * 0.2} ${c * 0.2} Z`} fill={color.primario} />
            </G>
          )}
          {robot && !mini && (
            <G x={robot[0] * c + c / 2} y={robot[1] * c + c / 2}>
              <Circle r={c * 0.4} fill="#fff" stroke={color.texto} strokeWidth={2.5} />
              <Circle r={c * 0.14} fill={color.texto} />
            </G>
          )}
        </Svg>
      )}
    </View>
  );
}
