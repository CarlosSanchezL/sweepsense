import { useEffect, useState } from 'react';
import Stack from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { cargarConfig } from '../lib/api';
import { color } from '../lib/tema';

// Raíz: las pestañas y, encima, la pantalla de Ajustes
export default function Layout() {
  const [listo, setListo] = useState(false);
  useEffect(() => { cargarConfig().finally(() => setListo(true)); }, []);
  if (!listo) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ajustes" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
