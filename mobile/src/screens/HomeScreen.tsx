// Pantalla de inicio aprobada (opción A): encabezado amplio con perfil y recompensas, "Mis cuentas"
// con colones, dólares y capital social a la vista y "Ver todas" que despliega el resto, ojo para
// ocultar saldos, botones rápidos y movimientos de la cuenta en colones.
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, api } from '../api/client';
import type { Account, Me, Transaction } from '../api/types';
import { money, shortDate } from '../format';
import { secureStore } from '../secureStore';
import { AccountSheet } from './AccountSheet';
import { useSession } from '../session';
import { accountsGlow, colors, radius, type } from '../theme';
import { Icon, type IconName } from '../ui/Icon';

const HIDE_KEY = 'neo.hideBalances';
const MAIN_TYPES = new Set(['savings', 'capital']); // colones, dólares y capital social

export function HomeScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const soon = (what: string) => Alert.alert(what, 'Esta sección se construye en la próxima etapa.');
  const [me, setMe] = useState<Me | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [moves, setMoves] = useState<Transaction[]>([]);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, accts] = await Promise.all([api.me(), api.accounts()]);
      setMe(m);
      setAccounts(accts);
      const crc = accts.find((a) => a.type === 'savings' && a.currency === 'CRC');
      if (crc) setMoves((await api.transactions(crc.id)).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos cargar tus cuentas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    secureStore.get(HIDE_KEY).then((v) => setHidden(v === '1'));
  }, []);
  // Recarga saldos cada vez que se vuelve al inicio (por ejemplo, después de un SINPE).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    secureStore.set(HIDE_KEY, next ? '1' : '0');
  }

  const mask = (v: string) => (hidden ? '••••••' : v);
  // Punto lima en SINPE Móvil: te entró un SINPE en las últimas 24 horas.
  const newSinpe = moves.some(
    (t) => t.category === 'sinpe' && Number(t.amount) > 0 && Date.now() - new Date(t.created_at).getTime() < 86_400_000,
  );
  // Accesos rápidos (opción C aprobada): texto en dos renglones; el préstamo destacado en naranja.
  const QUICK: { label: string; icon: IconName; go: () => void; accent?: boolean; badge?: boolean }[] = [
    { label: 'SINPE\nMóvil', icon: 'phone', go: () => nav.navigate('SinpeNumber'), badge: newSinpe },
    { label: 'Transferir\ndinero', icon: 'swap', go: () => nav.navigate('TransferHub') },
    { label: 'Pagar\nrecibos', icon: 'receipt', go: () => soon('Pagar recibos') },
    { label: 'Pedí un\npréstamo', icon: 'cash', go: () => soon('Préstamos'), accent: true },
  ];

  const main = accounts.filter((a) => MAIN_TYPES.has(a.type));

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={s.header}>
        <View>
          <Text style={type.itemSub}>Hola,</Text>
          <Text style={s.name}>{me?.full_name.split(' ').slice(0, 2).join(' ')}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.pill} accessibilityLabel={`${me?.points ?? 0} puntos de recompensas`}>
            <Icon name="star" size={15} color={colors.primaryInk} />
            <Text style={s.pillText}>{me?.points.toLocaleString('en-US')}</Text>
          </View>
          <Pressable style={s.avatar} onPress={signOut} accessibilityLabel="Mi perfil">
            <Text style={s.avatarText}>{me?.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <LinearGradient colors={accountsGlow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.glow}>
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>Mis cuentas</Text>
            <Pressable onPress={toggleHidden} style={s.eye} accessibilityLabel={hidden ? 'Mostrar saldos' : 'Ocultar saldos'}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={19} color={colors.muted} />
            </Pressable>
          </View>
          {(showAll ? accounts : main).map((a) => {
            // Colones y dólares reciben dinero: al tocarlas se abren sus datos para compartir.
            const receives = a.type === 'savings';
            return (
            <Pressable
              key={a.id}
              style={({ pressed }) => [s.row, pressed && receives && { opacity: 0.6 }]}
              onPress={receives ? () => setSheet(a) : undefined}
              disabled={!receives}
              accessibilityRole={receives ? 'button' : undefined}
              accessibilityHint={receives ? 'Muestra los datos para recibir dinero' : undefined}
            >
              <View style={s.iconBox}>
                {a.type === 'savings' ? (
                  <Text style={s.icon}>{a.currency === 'USD' ? '$' : '₡'}</Text>
                ) : (
                  <Icon name={a.type === 'capital' ? 'hands' : 'pig'} size={21} color={colors.primary} />
                )}
              </View>
              <Text style={[type.itemTitle, { flex: 1 }]}>{a.name}</Text>
              <Text style={type.amount}>{mask(money(a.balance, a.currency))}</Text>
              {receives ? <Icon name="chev" size={16} color={colors.muted} /> : <View style={{ width: 16 }} />}
            </Pressable>
            );
          })}
          {accounts.length > main.length && (
            <Pressable
              style={s.more}
              onPress={() => setShowAll((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
            >
              <Text style={s.moreText}>{showAll ? 'Ver menos' : `Ver todas (${accounts.length})`}</Text>
              <Icon name={showAll ? 'chevUp' : 'chevDown'} size={16} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <View style={s.quick}>
        {QUICK.map((q) => (
          <Pressable
            key={q.label}
            style={({ pressed }) => [s.quickItem, pressed && { opacity: 0.7 }]}
            onPress={q.go}
            accessibilityRole="button"
            accessibilityLabel={q.label.replace('\n', ' ') + (q.badge ? ', tenés un SINPE nuevo' : '')}
          >
            <View style={[s.quickIcon, q.accent && { backgroundColor: colors.orangeSoft }]}>
              <Icon name={q.icon} size={25} color={q.accent ? colors.orangeInk : colors.emeraldDark} />
              {q.badge && <View style={s.badge} />}
            </View>
            <Text style={s.quickText}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.section}>Movimientos</Text>
      {moves.map((t) => (
        <View key={t.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={type.itemTitle}>{t.description}</Text>
            <Text style={type.itemSub}>{shortDate(t.created_at)}</Text>
          </View>
          <Text style={[type.amount, Number(t.amount) > 0 && { color: colors.primary }]}>
            {mask(`${Number(t.amount) > 0 ? '+' : ''}${money(t.amount)}`)}
          </Text>
        </View>
      ))}
      <AccountSheet account={sheet} sinpePhone={me?.sinpe_phone} onClose={() => setSheet(null)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 26 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.title, fontSize: 21 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  pillText: { color: colors.primaryInk, fontWeight: '700', fontSize: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginBottom: 8 },
  glow: {
    borderRadius: radius.lg,
    padding: 1.5,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.lg - 1.5, paddingHorizontal: 14, paddingBottom: 4 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  eye: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line },
  iconBox: { width: 28, alignItems: 'center' },
  icon: { fontSize: 20, fontWeight: '600', color: colors.primary },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line },
  moreText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  quick: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  quickItem: { width: '24%', alignItems: 'center', gap: 7 },
  quickIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12.5, lineHeight: 16, fontWeight: '600', textAlign: 'center', color: colors.ink },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.lime,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
  section: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 4 },
});
