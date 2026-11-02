import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Pantalla from '../components/Pantalla';
import { Boton, Seccion, Tarjeta, Titulo } from '../components/ui';
import { api, guardarConfig, leerConfig } from '../lib/api';
import { avisar } from '../lib/avisar';
import { useDatos } from '../lib/useDatos';
import { color } from '../lib/tema';

export default function Ajustes() {
  const actual = leerConfig();
  const [modo, setModo] = useState(actual.modo);
  const [url, setUrl] = useState(actual.url);
  const [probando, setProbando] = useState(false);
  const { datos: e } = useDatos(api.estado, 2000);

  const guardar = async () => {
    await guardarConfig({ modo, url: url.trim() });
    router.back();
  };

  const probar = async () => {
    setProbando(true);
    const antes = leerConfig();
    await guardarConfig({ modo: 'robot', url: url.trim() });
    try {
      const r = await api.estado();
      avisar('Conexión correcta', `El robot respondió. Modo: ${r.modo}, batería: ${r.bateria}%`);
    } catch (err) {
      avisar('Sin respuesta', `${err.message}.\nRevisa que el celular y la Pi estén en la misma red y que la API esté corriendo.`);
    } finally {
      await guardarConfig(antes);
      setProbando(false);
    }
  };

  return (
    <Pantalla>
      <Titulo derecha={
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={26} color={color.texto} />
        </Pressable>
      }>Ajustes</Titulo>

      <Seccion>Origen de los datos</Seccion>
      <Tarjeta style={{ gap: 10 }}>
        {[
          ['demo', 'Modo demo', 'Robot simulado. Sirve para probar la app sin hardware.'],
          ['robot', 'Robot real', 'La app se conecta por HTTP a la API de la Raspberry Pi.'],
        ].map(([id, t, d]) => (
          <Pressable key={id} onPress={() => setModo(id)} style={[est.opcion, modo === id && est.opcionSel]}>
            <Ionicons name={modo === id ? 'radio-button-on' : 'radio-button-off'} size={22} color={color.primario} />
            <View style={{ flex: 1 }}>
              <Text style={est.fuerte}>{t}</Text>
              <Text style={est.sub}>{d}</Text>
            </View>
          </Pressable>
        ))}
      </Tarjeta>

      {modo === 'robot' && (
        <Tarjeta style={{ gap: 10 }}>
          <Text style={est.fuerte}>Dirección de la Raspberry Pi</Text>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder="http://192.168.1.50:5000" style={est.input} placeholderTextColor={color.suave} />
          <Text style={est.sub}>En la Pi ejecuta: hostname -I  para ver su IP.</Text>
          <Boton tipo="secundario" titulo={probando ? 'Probando…' : 'Probar conexión'} icono="wifi" deshabilitado={probando} onPress={probar} />
        </Tarjeta>
      )}

      <Boton titulo="Guardar" icono="checkmark" onPress={guardar} />

      {actual.modo === 'demo' && (
        <>
          <Seccion>Solo para la presentación</Seccion>
          <Tarjeta style={[est.opcion, { borderWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={est.fuerte}>Simular fuga de agua</Text>
              <Text style={est.sub}>Muestra la alerta como si el sensor detectara agua.</Text>
            </View>
            <Switch value={!!e?.fuga} onValueChange={(v) => api.simularFuga(v)} trackColor={{ true: color.alerta }} />
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}

const est = StyleSheet.create({
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: color.borde },
  opcionSel: { borderColor: color.primario, backgroundColor: color.primarioClaro },
  fuerte: { fontSize: 15, fontWeight: '600', color: color.texto },
  sub: { fontSize: 13, color: color.suave },
  input: { borderWidth: 1, borderColor: color.borde, borderRadius: 10, padding: 12, fontSize: 15, color: color.texto, backgroundColor: '#fff' },
});
