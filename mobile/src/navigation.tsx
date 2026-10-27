// Navegación: barra inferior con 4 secciones (como el prototipo) y una pila para los flujos.
// Los flujos (transferir, pagar tarjeta, etc.) se abren encima y esconden la barra.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';

import { CardInstallmentsScreen, CardLimitsScreen, CardLinkedScreen, CardPayScreen } from './screens/cards/CardFlows';
import { CardsScreen } from './screens/cards/CardsScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { HomeScreen } from './screens/HomeScreen';
import { IbanScreen } from './screens/transfer/IbanScreen';
import { PullScreen } from './screens/transfer/PullScreen';
import { ReceiveScreen } from './screens/transfer/ReceiveScreen';
import { SinpeAmountScreen, SinpeNumberScreen } from './screens/transfer/SinpeScreens';
import { TransferDoneScreen } from './screens/transfer/TransferDoneScreen';
import { TransferHubScreen } from './screens/transfer/TransferHubScreen';
import { colors } from './theme';
import { TabBar } from './ui/TabBar';

export type TabParams = { Home: undefined; Cards: undefined; Grow: undefined; Help: undefined };

export type RootParams = {
  Tabs: NavigatorScreenParams<TabParams>;
  TransferHub: undefined;
  SinpeNumber: undefined;
  SinpeAmount: { phone: string; name: string };
  Iban: undefined;
  Pull: undefined;
  Receive: undefined;
  TransferDone: { title: string; sub: string; points?: number; shareText?: string };
  CardLinked: { cardId: string };
  CardLimits: { cardId: string };
  CardPay: { cardId: string };
  CardInstallments: { cardId: string };
};

export type RootProps<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootParams {}
  }
}

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Cards" component={CardsScreen} />
      <Tab.Screen name="Grow" component={ComingSoonScreen} initialParams={undefined} />
      <Tab.Screen name="Help" component={ComingSoonScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.white } }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="TransferHub" component={TransferHubScreen} />
      <Stack.Screen name="SinpeNumber" component={SinpeNumberScreen} />
      <Stack.Screen name="SinpeAmount" component={SinpeAmountScreen} />
      <Stack.Screen name="Iban" component={IbanScreen} />
      <Stack.Screen name="Pull" component={PullScreen} />
      <Stack.Screen name="Receive" component={ReceiveScreen} />
      <Stack.Screen name="TransferDone" component={TransferDoneScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="CardLinked" component={CardLinkedScreen} />
      <Stack.Screen name="CardLimits" component={CardLimitsScreen} />
      <Stack.Screen name="CardPay" component={CardPayScreen} />
      <Stack.Screen name="CardInstallments" component={CardInstallmentsScreen} />
    </Stack.Navigator>
  );
}
