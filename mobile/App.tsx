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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api, hasSavedSession, refreshSession, setDemoBlockedHandler, setSessionLostHandler } from './src/api/client';
import { RootNavigator } from './src/navigation';
import { PublicNavigator, type PublicParams } from './src/publicNavigation';
import { SessionContext } from './src/session';
import { colors } from './src/theme';
import { DemoFrame, DemoSheet } from './src/ui/Demo';
import { Loading } from './src/ui/kit';
import { PinProvider } from './src/ui/PinSheet';

type Stage = 'booting' | 'signedOut' | 'signedIn' | 'demo';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.white, primary: colors.primary } };

export default function App() {
  const [stage, setStage] = useState<Stage>('booting');
  // Pantalla con la que arranca la parte pública (al salir de la demo para abrir cuenta, va directo).
  const [publicStart, setPublicStart] = useState<keyof PublicParams>('Welcome');
  const [demoBlocked, setDemoBlocked] = useState(false);
  // Plus Jakarta Sans viene dentro de la App (no se descarga de internet al abrir).
  const [fontsReady] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    setSessionLostHandler(() => setStage('signedOut'));
    setDemoBlockedHandler(() => setDemoBlocked(true));
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

  const signedIn = useCallback(() => setStage('signedIn'), []);
  const startDemo = useCallback(() => setStage('demo'), []);
  const leave = useCallback(async (to: keyof PublicParams) => {
    setDemoBlocked(false);
    await api.logout();
    setPublicStart(to);
    setStage('signedOut');
  }, []);
  const demo = stage === 'demo';
  const session = useMemo(
    () => ({ signOut: () => leave('Welcome'), demo, openAccount: () => leave('OnbPhone') }),
    [leave, demo],
  );
  const app = (
    <SessionContext.Provider value={session}>
      <PinProvider>
        <NavigationContainer theme={theme}>
          <RootNavigator />
        </NavigationContainer>
      </PinProvider>
    </SessionContext.Provider>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style={demo ? 'light' : 'dark'} />
      {stage === 'booting' || !fontsReady ? (
        <Loading />
      ) : stage === 'signedIn' ? (
        app
      ) : demo ? (
        <DemoFrame onOpen={() => leave('OnbPhone')}>
          {app}
          <DemoSheet visible={demoBlocked} onClose={() => setDemoBlocked(false)} onOpen={() => leave('OnbPhone')} />
        </DemoFrame>
      ) : (
        <NavigationContainer theme={theme}>
          <PublicNavigator onSignedIn={signedIn} onDemo={startDemo} initial={publicStart} />
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}
