// Navegación sin sesión: bienvenida, ingresar, recuperar clave, modo visitante y registro.
// Es una pila aparte de la App con sesión: aquí ninguna pantalla llama a la API con token.
import { createNativeStackNavigator, type NativeStackNavigationProp, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { createContext, useContext, useMemo, useRef } from 'react';

import type { Kyc } from './api/types';
import {
  OnbCodeScreen,
  OnbDataScreen,
  OnbDoneScreen,
  OnbKycScreen,
  OnbPhoneScreen,
  OnbPinScreen,
  OnbReviewScreen,
  OnbScanScreen,
  OnbSelfieScreen,
} from './screens/onboarding/OnboardingScreens';
import {
  ExploreScreen,
  GuestLoanScreen,
  GuestSaveScreen,
  RecoverScreen,
  SignInScreen,
  WelcomeScreen,
} from './screens/public/PublicScreens';
import { colors } from './theme';

export type PublicParams = {
  Welcome: undefined;
  SignIn: undefined;
  Recover: undefined;
  Explore: undefined;
  GuestLoan: undefined;
  GuestSave: undefined;
  OnbPhone: undefined;
  OnbCode: { phone: string; challengeId: string; debugCode: string | null; resendIn: number };
  OnbScan: undefined;
  OnbSelfie: undefined;
  OnbData: undefined;
  OnbKyc: undefined;
  OnbPin: undefined;
  OnbDone: { firstName: string; phone: string };
  OnbReview: { phone: string };
};
export type PublicProps<K extends keyof PublicParams> = NativeStackScreenProps<PublicParams, K>;
export const usePublicNav = () => useNavigation<NativeStackNavigationProp<PublicParams>>();

/** Lo que el asociado va llenando durante el registro (vive solo en memoria). */
export type Draft = {
  phone?: string;
  onboardingToken?: string;
  selfieOk?: boolean;
  cedula?: string;
  fullName?: string;
  email?: string;
  province?: string;
  canton?: string;
  kyc?: Kyc;
};

type Ctx = { draft: Draft; onSignedIn: () => void };
const PublicContext = createContext<Ctx>({ draft: {}, onSignedIn: () => {} });
export const usePublic = () => useContext(PublicContext);

const Stack = createNativeStackNavigator<PublicParams>();

export function PublicNavigator({ onSignedIn }: { onSignedIn: () => void }) {
  const draft = useRef<Draft>({}).current;
  const ctx = useMemo(() => ({ draft, onSignedIn }), [draft, onSignedIn]);
  return (
    <PublicContext.Provider value={ctx}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Recover" component={RecoverScreen} />
        <Stack.Screen name="Explore" component={ExploreScreen} />
        <Stack.Screen name="GuestLoan" component={GuestLoanScreen} />
        <Stack.Screen name="GuestSave" component={GuestSaveScreen} />
        <Stack.Screen name="OnbPhone" component={OnbPhoneScreen} />
        <Stack.Screen name="OnbCode" component={OnbCodeScreen} />
        <Stack.Screen name="OnbScan" component={OnbScanScreen} />
        <Stack.Screen name="OnbSelfie" component={OnbSelfieScreen} />
        <Stack.Screen name="OnbData" component={OnbDataScreen} />
        <Stack.Screen name="OnbKyc" component={OnbKycScreen} />
        <Stack.Screen name="OnbPin" component={OnbPinScreen} />
        <Stack.Screen name="OnbDone" component={OnbDoneScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="OnbReview" component={OnbReviewScreen} options={{ gestureEnabled: false }} />
      </Stack.Navigator>
    </PublicContext.Provider>
  );
}
