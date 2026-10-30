// "Deslizá para enviar": la bolita se arrastra hasta el final para confirmar un envío de dinero,
// así no se manda plata por un toque accidental. Con lector de pantalla funciona como un botón.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Icon } from './Icon';
import { Text } from './typography';

const KNOB = 54;
const PAD = 5;

/** `danger`: en rojo, para acciones que no se pueden deshacer (por ejemplo, eliminar un sobre). */
export function SlideToConfirm({ label, onConfirm, busy, danger }: { label: string; onConfirm: () => void; busy?: boolean; danger?: boolean }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const max = Math.max(0, width - KNOB - PAD * 2);
  const maxRef = useRef(max);
  maxRef.current = max;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Si el envío falla (deja de estar ocupado), la bolita vuelve al inicio para intentar de nuevo.
  useEffect(() => {
    if (!busy) Animated.spring(x, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
  }, [busy, x]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !busyRef.current,
      onMoveShouldSetPanResponder: () => !busyRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(g.dx, 0), maxRef.current)),
      onPanResponderRelease: (_, g) => {
        if (g.dx >= maxRef.current * 0.85) {
          Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: true }).start();
          confirmRef.current();
        } else {
          Animated.spring(x, { toValue: 0, bounciness: 6, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });
  const fill = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [KNOB + PAD * 2, Math.max(KNOB + PAD * 2, width)], extrapolate: 'clamp' });

  return (
    <View
      style={[st.track, danger && { backgroundColor: colors.dangerSoft }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Desliza a la derecha para confirmar"
      accessibilityState={{ busy: !!busy }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !busy && onConfirm()}
    >
      <Animated.View style={[st.fill, danger && { backgroundColor: 'rgba(163,45,45,0.14)' }, { width: fill }]} />
      <Animated.View style={[st.labelWrap, { opacity: busy ? 1 : labelOpacity }]} pointerEvents="none">
        <Text style={[st.label, danger && { color: colors.danger }]}>{busy ? (danger ? 'Eliminando…' : 'Enviando…') : label}</Text>
      </Animated.View>
      <Animated.View style={[st.knob, danger && { backgroundColor: colors.danger }, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Icon name="chev" size={24} color={colors.white} />}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  track: { height: KNOB + PAD * 2, borderRadius: (KNOB + PAD * 2) / 2, backgroundColor: colors.mint, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: (KNOB + PAD * 2) / 2, backgroundColor: 'rgba(23,128,108,0.18)' },
  labelWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingLeft: KNOB },
  label: { fontSize: 16, fontWeight: '700', color: colors.primaryInk },
  knob: {
    position: 'absolute',
    left: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
