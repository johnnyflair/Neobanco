// ¡Listo! del SINPE Móvil: fondo claro, check lima con confeti, monto grande, puntos ganados,
// comprobante y botón para compartirlo (WhatsApp u otra app).
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatPhone, money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Btn } from '../../ui/kit';
import { Text } from '../../ui/typography';
import { Kv } from './SinpeScreens';

const W = Dimensions.get('window').width;
const CONFETTI = [colors.lime, colors.orange, colors.primary, colors.navy, '#FAEEDA'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: (i * 97) % W,
        drift: ((i * 53) % 60) - 30,
        delay: (i % 7) * 70,
        fall: 260 + ((i * 37) % 220),
        rot: (i * 47) % 360,
        tall: i % 3 === 0,
        color: CONFETTI[i % CONFETTI.length],
      })),
    [],
  );
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => {
        const local = t.interpolate({ inputRange: [0, 1], outputRange: [-p.delay / 1800, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: -20,
              width: 8,
              height: p.tall ? 16 : 9,
              borderRadius: 3,
              backgroundColor: p.color,
              opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.fall], extrapolate: 'clamp' }) },
                { translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift], extrapolate: 'clamp' }) },
                { rotate: local.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 300}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

export function SinpeDoneScreen({ route }: RootProps<'SinpeDone'>) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { amount, name, phone, reference, createdAt, points, note } = route.params;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, [pop]);

  const when = new Date(createdAt);
  const date = `${when.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '')} · ${when.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}`;
  const share = () =>
    Share.share({
      message: `✅ Te envié ${money(amount)} por SINPE Móvil${note ? ` (${note})` : ''}.\nComprobante ${reference} · ${date}`,
    });

  return (
    <View style={[st.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Confetti />
      <View style={st.top}>
        <Animated.View style={[st.halo, { transform: [{ scale: pop }] }]}>
          <View style={st.check}>
            <Icon name="check" size={46} color={colors.navy} />
          </View>
        </Animated.View>
        <Text style={st.hi}>¡Listo! Le enviaste a {name.split(' ')[0]}</Text>
        <Text style={st.amount} adjustsFontSizeToFit numberOfLines={1}>
          {money(amount)}
        </Text>
        {points > 0 && (
          <View style={st.points}>
            <Icon name="star" size={14} color={colors.primaryInk} />
            <Text style={st.pointsTxt}>+{points} puntos</Text>
          </View>
        )}
      </View>

      <View style={st.card}>
        <Kv k="Para" v={`${name} · ${formatPhone(phone)}`} />
        <Kv k="Comprobante" v={reference} />
        <Kv k="Fecha" v={date} last={!note} />
        {note ? <Kv k="Motivo" v={note} last /> : null}
      </View>

      <View style={{ flex: 1 }} />
      <View style={{ gap: 10 }}>
        <Btn label="Compartir comprobante" icon="share" onPress={share} />
        <Btn label="Listo" variant="o" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 20 },
  top: { alignItems: 'center', gap: 8, marginTop: 30 },
  halo: { width: 128, height: 128, borderRadius: 64, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  check: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  hi: { fontSize: 16, fontWeight: '600', color: colors.muted },
  amount: { fontSize: 46, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  points: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pointsTxt: { fontSize: 13, fontWeight: '700', color: colors.primaryInk },
  card: { marginTop: 28, backgroundColor: colors.card, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 4 },
});
