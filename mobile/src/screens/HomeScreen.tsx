// Pantalla de inicio aprobada: "Mis cuentas" con borde degradado, saldos reales por cuenta,
// ojito para ocultar saldos, botones rápidos y movimientos de la cuenta en colones.
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, api } from '../api/client';
import type { Account, Me, Transaction } from '../api/types';
import { money, shortDate } from '../format';
import { accountsGlow, colors, radius, type } from '../theme';

const HIDE_KEY = 'neo.hideBalances';
const QUICK = ['SINPE Móvil', 'Transferir dinero', 'Pagar recibos', 'Pedí un préstamo'];
const ICON: Record<string, string> = { savings: '', capital: '◈', envelope: '◎', term: '◷' };

export function HomeScreen({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [moves, setMoves] = useState<Transaction[]>([]);
  const [hidden, setHidden] = useState(false);
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
    SecureStore.getItemAsync(HIDE_KEY).then((v) => setHidden(v === '1'));
    load();
  }, [load]);

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    SecureStore.setItemAsync(HIDE_KEY, next ? '1' : '0');
  }

  const mask = (v: string) => (hidden ? '••••••' : v);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={s.header}>
        <View>
          <Text style={type.itemSub}>Hola,</Text>
          <Text style={s.name}>{me?.full_name.split(' ').slice(0, 2).join(' ')}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.pill}><Text style={s.pillText}>★ {me?.points.toLocaleString('en-US')}</Text></View>
          <Pressable style={s.avatar} onPress={onSignOut} accessibilityLabel="Mi perfil">
            <Text style={s.pillText}>{me?.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <LinearGradient colors={accountsGlow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.glow}>
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>Mis cuentas</Text>
            <Pressable onPress={toggleHidden} style={s.eye} accessibilityLabel={hidden ? 'Mostrar saldos' : 'Ocultar saldos'}>
              <Text style={{ color: colors.muted }}>{hidden ? '◡' : '◉'}</Text>
            </Pressable>
          </View>
          {accounts.map((a) => (
            <View key={a.id} style={s.row}>
              <Text style={s.icon}>{a.type === 'savings' ? (a.currency === 'USD' ? '$' : '₡') : ICON[a.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.itemTitle}>{a.name}</Text>
                <Text style={type.itemSub}>{a.subtitle}</Text>
              </View>
              <Text style={type.amount}>{mask(money(a.balance, a.currency))}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={s.quick}>
        {QUICK.map((q) => (
          <View key={q} style={s.quickItem}>
            <View style={s.quickIcon} />
            <Text style={s.quickText}>{q}</Text>
          </View>
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: 18, paddingTop: 64, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.title, fontSize: 19 },
  pill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { color: colors.primaryInk, fontWeight: '700', fontSize: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
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
  icon: { width: 28, textAlign: 'center', fontSize: 20, fontWeight: '600', color: colors.primary },
  quick: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, marginBottom: 6 },
  quickItem: { width: '24%', alignItems: 'center', gap: 6 },
  quickIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft },
  quickText: { fontSize: 11, textAlign: 'center', color: colors.ink },
  section: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 4 },
});
