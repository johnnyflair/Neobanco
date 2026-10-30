// Listo común a todo movimiento de dinero (SINPE, IBAN, traer de otro banco, recibos, tarjeta,
// ahorro, préstamo, canje), con la marca Kooa: fondo blanco, los ojos de Kooa (contenta al enviar
// o pagar, ¡guau! al recibir), monto grande sin resaltador (opción A), puntos ganados, tarjeta de detalles y
// compartir. Sin signos de exclamación en el texto (aprobado).
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors } from '../../theme';
import { KooaEyes } from '../../ui/Brand';
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
    <View style={[st.screen, { paddingTop: insets.top + 16 }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }} showsVerticalScrollIndicator={false}>
        <View style={st.top}>
          <Animated.View style={{ transform: [{ scale: pop }], marginBottom: 10 }}>
            <KooaEyes size={104} expression={face} />
          </Animated.View>
          <Text style={st.hi} accessibilityRole="header">
            {hi}
          </Text>
          {amount ? (
            <>
              <Cents style={st.amount}>{money(amount, currency)}</Cents>
              {amountLabel ? <Text style={st.label}>{amountLabel}</Text> : null}
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
        {/* Opción A (aprobada): botones justo después del detalle, no pegados al fondo. */}
        <View style={{ gap: 8, marginTop: 22 }}>
          <Btn label="Listo" onPress={() => nav.navigate('Tabs', { screen: back })} />
          {shareText ? <Btn label="Compartir comprobante" icon="share" variant="o" onPress={() => Share.share({ message: shareText })} /> : null}
          {next ? <Btn label={next.label} variant="l" onPress={() => nav.navigate(next.route)} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 20 },
  top: { alignItems: 'center', gap: 6, marginTop: 24 },
  hi: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  label: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  amount: { fontSize: 34, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  points: { borderWidth: 1.5, borderColor: colors.teal, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  pointsTxt: { fontSize: 13, fontWeight: '700', color: colors.teal },
  card: { marginTop: 20, borderTopWidth: 1, borderTopColor: colors.line },
});
