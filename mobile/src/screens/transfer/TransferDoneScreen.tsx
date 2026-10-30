// Listo común a todo movimiento de dinero (SINPE, IBAN, traer de otro banco, recibos, tarjeta,
// ahorro, préstamo, canje), con la marca Kooa: fondo blanco, los ojos de Kooa (contenta al enviar
// o pagar, ¡guau! al recibir), monto con subrayado lima, puntos ganados, tarjeta de detalles y
// compartir. Sin signos de exclamación en el texto (aprobado).
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Highlight, KooaEyes } from '../../ui/Brand';
import { Btn } from '../../ui/kit';
import { Rows } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

export function TransferDoneScreen({ route }: RootProps<'TransferDone'>) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { hi, amount, currency = 'CRC', amountLabel, points, rows, shareText, next, back = 'Home', face = 'contenta' } = route.params;
  const pop = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [pop]);

  return (
    <View style={[st.screen, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={st.top}>
          <Animated.View style={{ transform: [{ scale: pop }], marginBottom: 14 }}>
            <KooaEyes size={128} expression={face} />
          </Animated.View>
          <Text style={st.hi}>{hi}</Text>
          {amount ? (
            <>
              {amountLabel ? <Text style={st.label}>{amountLabel}</Text> : null}
              <Highlight style={st.amount}>
                <Cents style={st.amount}>{money(amount, currency)}</Cents>
              </Highlight>
            </>
          ) : null}
          {points ? (
            <View style={st.points}>
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
  hi: { fontSize: 16, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 4 },
  amount: { fontSize: 40, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  points: { borderWidth: 1.5, borderColor: colors.teal, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  pointsTxt: { fontSize: 13, fontWeight: '700', color: colors.teal },
  card: { marginTop: 28, backgroundColor: colors.card, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 4 },
});
