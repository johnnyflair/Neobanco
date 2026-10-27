// ¡Listo! común a todo movimiento de dinero (SINPE, IBAN, traer de otro banco, recibos, tarjeta,
// ahorro, préstamo, canje): fondo claro, check lima con confeti, monto grande, puntos ganados,
// comprobante y compartir. Mismo diseño que el aprobado para SINPE Móvil.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Btn } from '../../ui/kit';
import { Confetti, Rows } from '../../ui/Receipt';
import { Text } from '../../ui/typography';

export function TransferDoneScreen({ route }: RootProps<'TransferDone'>) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { hi, amount, currency = 'CRC', amountLabel, points, rows, shareText, next, back = 'Home' } = route.params;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <View style={[st.screen, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Confetti />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={st.top}>
          <Animated.View style={[st.halo, { transform: [{ scale: pop }] }]}>
            <View style={st.check}>
              <Icon name="check" size={46} color={colors.navy} />
            </View>
          </Animated.View>
          <Text style={st.hi}>{hi}</Text>
          {amount ? (
            <>
              {amountLabel ? <Text style={st.label}>{amountLabel}</Text> : null}
              <Text style={st.amount} adjustsFontSizeToFit numberOfLines={1}>
                {money(amount, currency)}
              </Text>
            </>
          ) : null}
          {points ? (
            <View style={st.points}>
              <Icon name="star" size={14} color={colors.primaryInk} />
              <Text style={st.pointsTxt}>+{points} puntos</Text>
            </View>
          ) : null}
        </View>
        {rows.length > 0 && (
          <View style={st.card}>
            <Rows rows={rows} />
          </View>
        )}
      </ScrollView>
      <View style={{ gap: 10, marginTop: 12 }}>
        {shareText ? <Btn label="Compartir comprobante" icon="share" onPress={() => Share.share({ message: shareText })} /> : null}
        {next ? <Btn label={next.label} variant={shareText ? 'o' : 'p'} onPress={() => nav.navigate(next.route)} /> : null}
        <Btn label="Listo" variant={shareText || next ? 'o' : 'p'} onPress={() => nav.navigate('Tabs', { screen: back })} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 20 },
  top: { alignItems: 'center', gap: 8, marginTop: 30 },
  halo: { width: 128, height: 128, borderRadius: 64, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  check: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  hi: { fontSize: 16, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  amount: { fontSize: 46, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  points: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pointsTxt: { fontSize: 13, fontWeight: '700', color: colors.primaryInk },
  card: { marginTop: 28, backgroundColor: colors.card, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 4 },
});
