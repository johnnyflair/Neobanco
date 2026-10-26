// Llavero del teléfono (Keychain en iOS, Keystore en Android): solo este dispositivo, solo desbloqueado.
import * as SecureStore from 'expo-secure-store';

const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureStore = {
  get: (key: string) => SecureStore.getItemAsync(key, OPTS),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, OPTS),
  remove: (key: string) => SecureStore.deleteItemAsync(key, OPTS),
};
