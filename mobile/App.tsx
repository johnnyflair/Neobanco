import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api, hasSavedSession, refreshSession, setSessionLostHandler } from './src/api/client';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors } from './src/theme';

type Stage = 'booting' | 'signedOut' | 'signedIn';

export default function App() {
  const [stage, setStage] = useState<Stage>('booting');

  useEffect(() => {
    setSessionLostHandler(() => setStage('signedOut'));
    (async () => {
      // Si hay sesión guardada, se desbloquea con Face ID / huella antes de renovarla.
      if (await hasSavedSession()) {
        const bio = await LocalAuthentication.authenticateAsync({ promptMessage: 'Ingresá a tu cuenta' });
        if (bio.success && (await refreshSession())) {
          setStage('signedIn');
          return;
        }
      }
      setStage('signedOut');
    })();
  }, []);

  if (stage === 'booting') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {stage === 'signedIn' ? (
        <HomeScreen
          onSignOut={async () => {
            await api.logout();
            setStage('signedOut');
          }}
        />
      ) : (
        <LoginScreen onSignedIn={() => setStage('signedIn')} />
      )}
    </>
  );
}
