import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { color } from '../../lib/tema';

const icono = (nombre) => ({ color: c, size }) => <Ionicons name={nombre} size={size} color={c} />;

// Las 4 pestañas de abajo
export default function LayoutPestanas() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primario,
        tabBarInactiveTintColor: color.suave,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: color.borde },
        sceneStyle: { backgroundColor: color.fondo },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home') }} />
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: icono('map') }} />
      <Tabs.Screen name="tareas" options={{ title: 'Tareas', tabBarIcon: icono('list') }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: icono('time') }} />
    </Tabs>
  );
}
