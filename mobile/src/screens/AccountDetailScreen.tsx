// Detalle de cuenta (según el prototipo): saldo, accesos a Transferir y Recibir, y todos los
// movimientos, cargados de a páginas.
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '../api/client';
import { errorMessage } from '../api/hooks';
import type { Transaction } from '../api/types';
import { money, shortDate } from '../format';
import type { RootProps } from '../navigation';
import { colors, type } from '../theme';
import { Btn, ErrorText, Hero, Screen, Sect, Small } from '../ui/kit';
import { Text } from '../ui/typography';

const TITLES: Record<string, string> = { savings: 'Cuenta', capital: 'Capital social', envelope: 'Sobre', term: 'Ahorro a plazo' };

export function AccountDetailScreen({ route }: RootProps<'AccountDetail'>) {
  const nav = useNavigation();
  const [account, setAccount] = useState(route.params.account);
  const [items, setItems] = useState<Transaction[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = account.currency;
  const title =
    account.type === 'savings' ? (cur === 'CRC' ? 'Cuenta colones' : 'Cuenta dólares') : (TITLES[account.type] ?? account.name);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, page] = await Promise.all([api.account(route.params.account.id), api.transactions(route.params.account.id)]);
      setAccount(a);
      setItems(page.items);
      setNext(page.next_before);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [route.params.account.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function more() {
    if (!next) return;
    setBusy(true);
    try {
      const page = await api.transactions(account.id, next);
      setItems((x) => [...x, ...page.items]);
      setNext(page.next_before);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const canMove = account.type === 'savings';
  return (
    <Screen title={title}>
      <Hero title="Saldo disponible" big={money(account.balance, cur)} up={account.iban_masked ?? account.subtitle} />
      {canMove && (
        <View style={st.actions}>
          <Btn label="Transferir" icon="send" onPress={() => nav.navigate('TransferHub')} style={{ flex: 1 }} />
          <Btn label="Recibir" icon="qr" variant="o" onPress={() => nav.navigate('Receive')} style={{ flex: 1 }} />
        </View>
      )}
      <Sect>Movimientos</Sect>
      {items.map((t, i) => (
        <View key={t.id} style={[st.row, i === 0 && { borderTopWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={type.itemTitle}>{t.description}</Text>
            <Text style={type.itemSub}>{shortDate(t.created_at)}</Text>
          </View>
          <Text style={[type.amount, Number(t.amount) > 0 && { color: colors.primary }]}>
            {`${Number(t.amount) > 0 ? '+' : ''}${money(t.amount, cur)}`}
          </Text>
        </View>
      ))}
      {!items.length && !error && <Small>Sin movimientos todavía.</Small>}
      {next && <Btn label="Ver más" variant="l" onPress={more} loading={busy} />}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
});
