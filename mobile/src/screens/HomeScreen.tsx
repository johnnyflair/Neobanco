// Inicio (opción X aprobada): logo completo arriba con campana y perfil, saludo según la hora con la
// fecha, "Mis cuentas" sin recuadro (con "Ver todas" debajo), cinco accesos fijos (el último abre
// "Más"), y movimientos con el nombre de la persona. Títulos con el resaltador lima suave (1B).
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, api } from '../api/client';
import { loadNotices } from '../api/notices';
import type { Account, Me, Transaction } from '../api/types';
import { money } from '../format';
import { secureStore } from '../secureStore';
import { AccountSheet } from './AccountSheet';
import { colors, MAX_FONT_SCALE_TIGHT, radius, type } from '../theme';
import { Highlight, KooaLogo } from '../ui/Brand';
import { BottomSheet } from '../ui/BottomSheet';
import { MoveList, MoveSheet } from '../ui/Moves';
import { Icon, type IconName } from '../ui/Icon';
import { Band, HelpButton, useEdgeColumns } from '../ui/kit';
import { Text } from '../ui/typography';
import { Cents } from '../ui/Money';

const HIDE_KEY = 'neo.hideBalances';
const MAIN_TYPES = new Set(['savings', 'capital']); // colones, dólares y capital social

export function HomeScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [moves, setMoves] = useState<Transaction[]>([]);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<Account | null>(null);
  const [move, setMove] = useState<Transaction | null>(null);
  const [more, setMore] = useState(false);
  // Cada vez que se llega al inicio, el logo saluda levantando las cejas dos veces.
  const [visits, setVisits] = useState(0);
  const [unread, setUnread] = useState(0);
  const edge = useEdgeColumns(5, 56);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, accts] = await Promise.all([api.me(), api.accounts()]);
      setMe(m);
      setAccounts(accts);
      // Los últimos movimientos de todas las cuentas, como en "Ver todos".
      setMoves((await api.allTransactions()).items);
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
      setVisits((v) => v + 1);
      loadNotices().then((n) => setUnread(n.filter((x) => x.isNew).length)).catch(() => {});
    }, [load]),
  );

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    secureStore.set(HIDE_KEY, next ? '1' : '0');
  }

  const mask = (v: string) => (hidden ? '••••••' : v);
  // Punto lima en SINPE Móvil: te entró un SINPE en las últimas 24 horas.
  const lastIn = moves.find(
    (t) => t.category === 'sinpe' && Number(t.amount) > 0 && Date.now() - new Date(t.created_at).getTime() < 86_400_000,
  );
  const newSinpe = !!lastIn;
  // Cinco accesos fijos que caben completos; el último abre el resto.
  const QUICK: { label: string; icon: IconName; go: () => void; badge?: boolean; main?: boolean; more?: boolean }[] = [
    { label: 'SINPE', icon: 'phone', go: () => nav.navigate('SinpeNumber'), badge: newSinpe, main: true },
    { label: 'Transferir', icon: 'swap', go: () => nav.navigate('TransferHub') },
    { label: 'Pagos', icon: 'receipt', go: () => nav.navigate('Bills') },
    { label: 'Préstamo', icon: 'cash', go: () => nav.navigate('LoanSim') },
    { label: 'Más', icon: 'dots', go: () => setMore(true), more: true },
  ];
  const MORE: { label: string; sub: string; icon: IconName; go: () => void }[] = [
    { label: 'Mis puntos', sub: 'Canjealos por dinero', icon: 'star', go: () => nav.navigate('Rewards') },
    { label: 'Recibir dinero', sub: 'Compartí tu número o tu IBAN', icon: 'qr', go: () => nav.navigate('Receive') },
    { label: 'Traer de otro banco', sub: 'Pasá dinero a tu cuenta Kooa', icon: 'pull', go: () => nav.navigate('Pull') },
    { label: 'Ahorrar e invertir', sub: 'Sobres y ahorro a plazo', icon: 'pig', go: () => nav.navigate('Tabs', { screen: 'Grow' }) },
  ];
  const first = me?.full_name.split(' ')[0] ?? '';

  const main = accounts.filter((a) => MAIN_TYPES.has(a.type));

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 12 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={s.header}>
        <KooaLogo height={32} greet={visits} />
        <View style={s.headerRight}>
          {/* Píldora de puntos (opción B): muestra cuántos tenés y lleva a Mis puntos. */}
          <Pressable
            style={({ pressed }) => [s.points, pressed && { opacity: 0.7 }]}
            onPress={() => nav.navigate('Rewards')}
            accessibilityRole="button"
            accessibilityLabel={`Mis puntos: ${(me?.points ?? 0).toLocaleString('en-US')}`}
          >
            <Icon name="star" size={15} color={colors.orange} />
            <Text style={s.pointsText}>{(me?.points ?? 0).toLocaleString('en-US')}</Text>
          </Pressable>
          <HelpButton />
          <Pressable
            onPress={() => nav.navigate('Notices')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Avisos: ${unread} nuevos` : 'Avisos'}
          >
            <Icon name="bell" size={25} color={colors.ink} />
            {unread > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <Text style={s.hello}>
        {greeting()}, {first}
      </Text>
      <Text style={s.date}>{today()}</Text>

      {error && <Text style={s.error}>{error}</Text>}

      <Band style={{ marginTop: 22 }} />
      <View style={s.sectionRow}>
        <Highlight soft header align="flex-start" style={s.sectionTitle}>
          Mis cuentas
        </Highlight>
        <Pressable onPress={toggleHidden} hitSlop={10} accessibilityLabel={hidden ? 'Mostrar saldos' : 'Ocultar saldos'}>
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={21} color={colors.muted} />
        </Pressable>
      </View>
      {(showAll ? accounts : main).map((a, i) => (
        // Toda cuenta se toca: abre la hoja con sus datos (y para compartir, si recibe dinero).
        <Pressable
          key={a.id}
          style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
          onPress={() => setSheet(a)}
          accessibilityRole="button"
          accessibilityHint="Muestra los datos de la cuenta"
        >
          <View style={s.iconBox}>
            {a.type === 'savings' ? (
              <Text style={s.icon}>{a.currency === 'USD' ? '$' : '₡'}</Text>
            ) : (
              <Icon name={a.type === 'capital' ? 'hands' : 'pig'} size={21} color={colors.primary} />
            )}
          </View>
          <Text style={[type.itemTitle, { flex: 1 }]}>{a.name}</Text>
          <Cents style={[type.amount, s.amt]}>{mask(money(a.balance, a.currency))}</Cents>
          <Icon name="chev" size={16} color={colors.muted} />
        </Pressable>
      ))}
      {accounts.length > main.length && (
        <Pressable style={s.more} onPress={() => setShowAll((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showAll }}>
          <Text style={s.moreText}>{showAll ? 'Ver menos cuentas' : `Ver todas mis cuentas (${accounts.length})`}</Text>
          <Icon name={showAll ? 'chevUp' : 'chevDown'} size={16} color={colors.primary} />
        </Pressable>
      )}

      <Band style={{ marginTop: 18 }} />
      <View style={[s.quick, { marginHorizontal: edge.bleed }]}>
        {QUICK.map((q) => (
          <Pressable
            key={q.label}
            style={({ pressed }) => [s.quickItem, { width: edge.col }, pressed && { opacity: 0.7 }]}
            onPress={q.go}
            accessibilityRole="button"
            accessibilityLabel={(q.more ? 'Más opciones' : q.label) + (q.badge ? ', tenés un SINPE nuevo' : '')}
          >
            <View style={[s.quickIcon, q.main && { backgroundColor: colors.teal }, q.more && { backgroundColor: colors.card }]}>
              <Icon name={q.icon} size={24} color={q.main ? colors.lime : q.more ? colors.ink : colors.emeraldDark} />
              {q.badge && <View style={s.badge} />}
            </View>
            <Text style={s.quickText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
              {q.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.sectionRow, { marginTop: 34 }]}>
        <Highlight soft header align="flex-start" style={s.sectionTitle}>
          Movimientos
        </Highlight>
        <Pressable onPress={() => nav.navigate('Movements')} hitSlop={10} accessibilityRole="button">
          <Text style={s.link}>Ver todos</Text>
        </Pressable>
      </View>
      <MoveList items={moves.slice(0, 8)} mask={mask} showAccount hideAccountName onPress={setMove} />
      <MoveSheet t={move} accountName="Cuenta colones" onClose={() => setMove(null)} />
      <Text style={s.version}>Versión {(process.env.EXPO_PUBLIC_APP_VERSION ?? 'local').slice(0, 7)}</Text>
      <BottomSheet visible={more} onClose={() => setMore(false)}>
        <Text style={s.sheetTitle}>Más opciones</Text>
        {MORE.map((m, i) => (
          <Pressable
            key={m.label}
            style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
            onPress={() => {
              setMore(false);
              m.go();
            }}
            accessibilityRole="button"
          >
            <View style={s.moreIcon}>
              <Icon name={m.icon} size={21} color={colors.emeraldDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.itemTitle}>{m.label}</Text>
              <Text style={type.itemSub}>{m.sub}</Text>
            </View>
            <Icon name="chev" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </BottomSheet>
      <AccountSheet
        account={sheet}
        sinpePhone={me?.sinpe_phone}
        onClose={() => setSheet(null)}
        onMovements={(a) => {
          setSheet(null);
          nav.navigate('AccountDetail', { account: a });
        }}
      />
    </ScrollView>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function today() {
  const d = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
  return d.charAt(0).toUpperCase() + d.slice(1).replace(',', '');
}

const s = StyleSheet.create({
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  points: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orangeSoft, borderRadius: 16, paddingVertical: 5, paddingLeft: 9, paddingRight: 11 },
  pointsText: { fontSize: 13.5, fontWeight: '700', color: colors.orangeInk, fontVariant: ['tabular-nums'] },
  bellBadge: {
    position: 'absolute',
    top: -5,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  bellBadgeText: { color: colors.white, fontSize: 9.5, fontWeight: '700' },
  hello: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 20 },
  date: { fontSize: 14, color: colors.muted, marginTop: 2 },
  error: { color: colors.danger, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  iconBox: { width: 22, alignItems: 'center' },
  icon: { fontSize: 20, fontWeight: '600', color: colors.primary },
  amt: { fontSize: 16 },
  // "Ver todas" como botón con borde (opción A): se nota que se toca.
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, marginTop: 6 },
  moreText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  quick: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  quickItem: { alignItems: 'center', gap: 7 },
  quickIcon: { width: 56, height: 56, borderRadius: 17, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13.5, fontWeight: '600', textAlign: 'center', color: colors.ink },
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
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  moreIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  version: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 18 },
});
