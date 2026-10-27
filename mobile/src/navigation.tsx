// Navegación: barra inferior con 4 secciones (como el prototipo) y una pila para los flujos.
// Los flujos (transferir, pagar tarjeta, etc.) se abren encima y esconden la barra.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Account, BillProvider, FraudReason, SavedBill, SupportCase } from './api/types';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';

import { CardInstallmentsScreen, CardLimitsScreen, CardLinkedScreen, CardPayScreen } from './screens/cards/CardFlows';
import { CardsScreen } from './screens/cards/CardsScreen';
import { AccountDetailScreen } from './screens/AccountDetailScreen';
import { MovementsScreen } from './screens/MovementsScreen';
import { BillCategoryScreen, BillDetailScreen, BillServiceScreen, BillsScreen } from './screens/bills/BillsScreens';
import {
  EnvelopeScreen,
  GrowScreen,
  NewEnvelopeScreen,
  NewSavingScreen,
  TermDepositScreen,
} from './screens/grow/GrowScreens';
import { CaseScreen, FraudScreen, HelpScreen } from './screens/help/HelpScreens';
import { HomeScreen } from './screens/HomeScreen';
import {
  LoanApplyScreen,
  LoanDoneScreen,
  LoanOptionsScreen,
  LoanReviewScreen,
  LoanSimScreen,
  LoanTrackScreen,
} from './screens/loans/LoanScreens';
import { IbanScreen } from './screens/transfer/IbanScreen';
import { PullScreen } from './screens/transfer/PullScreen';
import { ReceiveScreen } from './screens/transfer/ReceiveScreen';
import { SinpeAmountScreen, SinpeNumberScreen } from './screens/transfer/SinpeScreens';
import { TransferDoneScreen } from './screens/transfer/TransferDoneScreen';
import { TransferHubScreen } from './screens/transfer/TransferHubScreen';
import { ProfileScreen } from './screens/profile/ProfileScreen';
import { AutoRuleScreen, RedeemDoneScreen, RedeemScreen, RewardsScreen } from './screens/rewards/RewardsScreens';
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
  Bills: undefined;
  BillCategory: { category: string };
  BillService: { provider: BillProvider };
  BillDetail: { bill: SavedBill };
  LoanSim: undefined;
  LoanOptions: { amount: number; term: number };
  LoanReview: { amount: number; term: number; monthly: string; total: string };
  LoanDone: { amount: string; firstDue: string };
  LoanApply: undefined;
  LoanTrack: undefined;
  NewEnvelope: undefined;
  NewSaving: undefined;
  Envelope: { account: Account };
  TermDeposit: { term: number };
  AccountDetail: { account: Account };
  Movements: undefined;
  Profile: undefined;
  Rewards: undefined;
  Redeem: undefined;
  RedeemDone: { title: string; sub: string };
  AutoRule: undefined;
  Fraud: { reason?: FraudReason };
  Case: { supportCase: SupportCase; fresh?: boolean };
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
      <Tab.Screen name="Grow" component={GrowScreen} />
      <Tab.Screen name="Help" component={HelpScreen} />
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
      <Stack.Screen name="Bills" component={BillsScreen} />
      <Stack.Screen name="BillCategory" component={BillCategoryScreen} />
      <Stack.Screen name="BillService" component={BillServiceScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="LoanSim" component={LoanSimScreen} />
      <Stack.Screen name="LoanOptions" component={LoanOptionsScreen} />
      <Stack.Screen name="LoanReview" component={LoanReviewScreen} />
      <Stack.Screen name="LoanDone" component={LoanDoneScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="LoanApply" component={LoanApplyScreen} />
      <Stack.Screen name="LoanTrack" component={LoanTrackScreen} />
      <Stack.Screen name="NewSaving" component={NewSavingScreen} />
      <Stack.Screen name="NewEnvelope" component={NewEnvelopeScreen} />
      <Stack.Screen name="Envelope" component={EnvelopeScreen} />
      <Stack.Screen name="TermDeposit" component={TermDepositScreen} />
      <Stack.Screen name="AccountDetail" component={AccountDetailScreen} />
      <Stack.Screen name="Movements" component={MovementsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Rewards" component={RewardsScreen} />
      <Stack.Screen name="Redeem" component={RedeemScreen} />
      <Stack.Screen name="RedeemDone" component={RedeemDoneScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="AutoRule" component={AutoRuleScreen} />
      <Stack.Screen name="Fraud" component={FraudScreen} />
      <Stack.Screen name="Case" component={CaseScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
