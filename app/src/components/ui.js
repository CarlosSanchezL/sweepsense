import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, radio, sombra } from '../lib/tema';

export function Tarjeta({ children, style }) {
  return <View style={[est.tarjeta, style]}>{children}</View>;
}

// Indicador: ícono + valor grande + etiqueta
export function Indicador({ icono, valor, etiqueta, tono = color.primario, style }) {
  return (
    <Tarjeta style={[est.indicador, style]}>
      <Ionicons name={icono} size={20} color={tono} />
      <Text style={est.valor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text style={est.etiqueta} numberOfLines={1}>{etiqueta}</Text>
    </Tarjeta>
  );
}

export function Boton({ titulo, icono, onPress, tipo = 'primario', deshabilitado, style }) {
  const prim = tipo === 'primario';
  const peligro = tipo === 'peligro';
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      style={({ pressed }) => [
        est.boton,
        prim && { backgroundColor: color.primario, borderColor: color.primario },
        peligro && { borderColor: color.alerta },
        (pressed || deshabilitado) && { opacity: deshabilitado ? 0.4 : 0.75 },
        style,
      ]}
    >
      {icono ? <Ionicons name={icono} size={18} color={prim ? '#fff' : peligro ? color.alerta : color.texto} /> : null}
      <Text style={[est.botonTxt, prim && { color: '#fff' }, peligro && { color: color.alerta }]}>{titulo}</Text>
    </Pressable>
  );
}

export function Titulo({ children, derecha }) {
  return (
    <View style={est.tituloFila}>
      <Text style={est.titulo}>{children}</Text>
      {derecha}
    </View>
  );
}

export function Seccion({ children }) {
  return <Text style={est.seccion}>{children}</Text>;
}

export function Aviso({ texto, tipo = 'error' }) {
  const c = tipo === 'error' ? color.alerta : color.aviso;
  return (
    <View style={[est.aviso, { borderColor: c, backgroundColor: c + '14' }]}>
      <Ionicons name={tipo === 'error' ? 'warning' : 'information-circle'} size={18} color={c} />
      <Text style={[est.avisoTxt, { color: c }]}>{texto}</Text>
    </View>
  );
}

export function Cargando() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={color.primario} />
    </View>
  );
}

export function Pastilla({ texto, tono = color.primario }) {
  return (
    <View style={[est.pastilla, { backgroundColor: tono + '1A' }]}>
      <View style={[est.punto, { backgroundColor: tono }]} />
      <Text style={[est.pastillaTxt, { color: tono }]}>{texto}</Text>
    </View>
  );
}

export const est = StyleSheet.create({
  tarjeta: { backgroundColor: color.tarjeta, borderRadius: radio, padding: 16, borderWidth: 1, borderColor: color.borde, ...sombra },
  indicador: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: 4, paddingVertical: 14 },
  valor: { fontSize: 22, fontWeight: '700', color: color.texto, marginTop: 2 },
  etiqueta: { fontSize: 12.5, color: color.suave },
  boton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta },
  botonTxt: { fontSize: 15, fontWeight: '600', color: color.texto },
  tituloFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  titulo: { fontSize: 28, fontWeight: '800', color: color.texto },
  seccion: { fontSize: 13, fontWeight: '700', color: color.suave, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1 },
  avisoTxt: { flex: 1, fontSize: 14, fontWeight: '600' },
  pastilla: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  punto: { width: 8, height: 8, borderRadius: 4 },
  pastillaTxt: { fontSize: 13, fontWeight: '600' },
});
