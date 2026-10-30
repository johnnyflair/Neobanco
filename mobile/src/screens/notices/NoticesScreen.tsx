// Avisos (opción A): "Por pagar" (recibos y tarjeta, cada uno con su botón Pagar) separado de
// "Lo que pasó" (plata recibida, sobres). Los avisos nuevos dicen "Nuevo" en palabras.
// Al tocar uno se abre el movimiento, Recibos o la tarjeta. Al entrar, todo queda como visto.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ago, loadNotices, markNoticesSeen, type Notice } from '../../api/notices';
import type { Transaction } from '../../api/types';
import { colors, MAX_FONT_SCALE_TIGHT, type } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Loading, Screen, Sect, Small } from '../../ui/kit';
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
  const toPay = items.filter((n) => n.due).sort((a, b) => a.at - b.at);
  const news = items.filter((n) => !n.due).sort((a, b) => b.at - a.at);

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
        accessibilityLabel={`${!n.due && n.isNew ? 'Nuevo: ' : ''}${n.title}. ${n.sub}`}
      >
        <View style={st.ic}>
          <Icon name={n.icon} size={22} color={n.incoming ? colors.primary : colors.amount} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.itemTitle}>{n.title}</Text>
          <Text style={type.itemSub}>{n.sub}</Text>
          {!n.due && <Text style={[type.itemSub, { marginTop: 2 }]}>{n.when ?? ago(n.at)}</Text>}
        </View>
        {n.due ? (
          <View style={st.pay}>
            <Text style={st.payT} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
              Pagar
            </Text>
          </View>
        ) : n.isNew ? (
          <Text style={st.new} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
            Nuevo
          </Text>
        ) : null}
      </Pressable>
    ));

  return (
    <Screen title="Avisos">
      {items.length === 0 && <Small center style={{ marginTop: 24 }}>No tenés avisos por ahora.</Small>}
      {toPay.length > 0 && (
        <>
          <Sect first>Por pagar</Sect>
          {list(toPay)}
        </>
      )}
      {news.length > 0 && (
        <>
          <Sect first={!toPay.length}>Lo que pasó</Sect>
          {list(news)}
        </>
      )}
      <MoveSheet t={move} accountName="Cuenta colones" onClose={() => setMove(null)} />
    </Screen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  ic: { width: 24, alignItems: 'center', height: 22, justifyContent: 'center' },
  pay: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'center' },
  payT: { fontSize: 15, fontWeight: '700', color: colors.primary },
  new: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 1 },
});
