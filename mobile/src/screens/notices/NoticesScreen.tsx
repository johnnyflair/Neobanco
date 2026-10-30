// Avisos (campana del inicio, mockup aprobado): "Nuevos" con punto lima y "Anteriores". Al tocar uno
// se abre el movimiento, Recibos o la tarjeta. Al entrar, todo lo que había queda como visto.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ago, loadNotices, markNoticesSeen, type Notice } from '../../api/notices';
import type { Transaction } from '../../api/types';
import { colors, type } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Loading, Screen, Small } from '../../ui/kit';
import { MoveSheet } from '../../ui/Moves';
import { Text } from '../../ui/typography';

export function NoticesScreen() {
  const nav = useNavigation();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [move, setMove] = useState<Transaction | null>(null);

  useEffect(() => {
    loadNotices().then((n) => {
      setItems(n);
      markNoticesSeen();
    });
  }, []);

  if (!items) return <Loading />;
  const fresh = items.filter((n) => n.isNew);
  const old = items.filter((n) => !n.isNew);

  function open(n: Notice) {
    if ('tx' in n.go) setMove(n.go.tx);
    else if ('route' in n.go) nav.navigate(n.go.route);
    else nav.navigate('Tabs', { screen: n.go.tab });
  }

  const list = (rows: Notice[]) =>
    rows.map((n, i) => (
      <Pressable
        key={n.id}
        style={({ pressed }) => [st.row, i === 0 && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
        onPress={() => open(n)}
        accessibilityRole="button"
        accessibilityLabel={`${n.isNew ? 'Nuevo: ' : ''}${n.title}. ${n.sub}`}
      >
        <View style={st.ic}>
          <Icon name={n.icon} size={22} color={n.incoming ? colors.primary : colors.amount} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.itemTitle, !n.isNew && { fontWeight: '500' }]}>{n.title}</Text>
          <Text style={type.itemSub}>{n.sub}</Text>
          <Text style={[type.itemSub, { marginTop: 2 }]}>{n.when ?? ago(n.at)}</Text>
        </View>
        {n.isNew && <View style={st.dot} />}
      </Pressable>
    ));

  return (
    <Screen title="Avisos">
      {items.length === 0 && <Small center style={{ marginTop: 24 }}>No tenés avisos por ahora.</Small>}
      {fresh.length > 0 && (
        <>
          <Text style={st.group}>Nuevos</Text>
          {list(fresh)}
        </>
      )}
      {old.length > 0 && (
        <>
          <Text style={[st.group, { marginTop: 18 }]}>Anteriores</Text>
          {list(old)}
        </>
      )}
      <MoveSheet t={move} accountName="Cuenta colones" onClose={() => setMove(null)} />
    </Screen>
  );
}

const st = StyleSheet.create({
  group: { fontSize: 13, color: colors.muted, marginTop: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  ic: { width: 24, alignItems: 'center', paddingTop: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.lime, marginTop: 6 },
});
