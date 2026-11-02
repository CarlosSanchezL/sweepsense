import { ScrollView, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { color } from '../lib/tema';

export default function Pantalla({ children, alRefrescar }) {
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = alRefrescar
    ? async () => { setRefrescando(true); try { await alRefrescar(); } finally { setRefrescando(false); } }
    : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.fondo }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' }}
        refreshControl={refrescar ? <RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={color.primario} /> : undefined}
      >
        <View style={{ gap: 14 }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
