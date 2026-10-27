import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api, hasSavedSession, refreshSession, setSessionLostHandler } from './src/api/client';
import { RootNavigator } from './src/navigation';
import { LoginScreen } from './src/screens/LoginScreen';
import { SessionContext } from './src/session';
import { colors } from './src/theme';
import { Loading } from './src/ui/kit';
import { PinProvider } from './src/ui/PinSheet';

type Stage = 'booting' | 'signedOut' | 'signedIn';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.white, primary: colors.primary } };

export default function App() {
  const [stage, setStage] = useState<Stage>('booting');
  // Plus Jakarta Sans viene dentro de la App (no se descarga de internet al abrir).
  const [fontsReady] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    setSessionLostHandler(() => setStage('signedOut'));
    (async () => {
      // Si hay sesión guardada, se desbloquea con Face ID / huella antes de renovarla.
      if (await hasSavedSession()) {
        const bio =
          Platform.OS === 'web'
            ? { success: true }
            : await LocalAuthentication.authenticateAsync({ promptMessage: 'Ingresá a tu cuenta' });
        if (bio.success && (await refreshSession())) {
          setStage('signedIn');
          return;
        }
      }
      setStage('signedOut');
    })();
  }, []);

  const session = useMemo(
    () => ({
      signOut: async () => {
        await api.logout();
        setStage('signedOut');
      },
    }),
    [],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {stage === 'booting' || !fontsReady ? (
        <Loading />
      ) : stage === 'signedIn' ? (
        <SessionContext.Provider value={session}>
          <PinProvider>
            <NavigationContainer theme={theme}>
              <RootNavigator />
            </NavigationContainer>
          </PinProvider>
        </SessionContext.Provider>
      ) : (
        <LoginScreen onSignedIn={() => setStage('signedIn')} />
      )}
    </SafeAreaProvider>
  );
}
