import { Alert, Platform } from 'react-native';

export const avisar = (titulo, msg) =>
  Platform.OS === 'web' ? window.alert(`${titulo}\n${msg}`) : Alert.alert(titulo, msg);
