// Hoja inferior que se puede arrastrar: sube al abrirse, se arrastra con el dedo desde la
// barrita (o cualquier parte de la hoja) y, si se baja lo suficiente o con un gesto rápido, se
// cierra; si no, vuelve a su lugar. También cierra tocando el fondo oscuro.
// Hecha con Animated + PanResponder de React Native (funciona en Expo Go sin módulos nativos).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';

const SCREEN_H = Dimensions.get('window').height;
const CLOSE_DISTANCE = 110; // px arrastrados hacia abajo para cerrar
const CLOSE_VELOCITY = 0.9; // o un gesto rápido hacia abajo

export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(SCREEN_H)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(SCREEN_H);
      Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(y, { toValue: SCREEN_H, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        () => setMounted(false),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    Animated.timing(y, { toValue: SCREEN_H, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setMounted(false);
      onCloseRef.current();
    });
  }
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const handlers = {
    onPanResponderMove: (_: unknown, g: { dy: number }) => y.setValue(g.dy > 0 ? g.dy : g.dy / 6), // arriba: resistencia
    onPanResponderRelease: (_: unknown, g: { dy: number; vy: number }) => {
      if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) dismissRef.current();
      else Animated.spring(y, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
  };
  // La barrita de arriba toma el gesto desde el primer toque; el resto de la hoja, solo si el dedo
  // se mueve en vertical (así los botones y los textos se siguen tocando normal).
  const handlePan = useRef(PanResponder.create({ onStartShouldSetPanResponder: () => true, ...handlers })).current;
  const bodyPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      ...handlers,
    }),
  ).current;

  const backdrop = y.interpolate({ inputRange: [0, 400], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, st.backdrop, { opacity: backdrop }]}>
          <Pressable style={{ flex: 1 }} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Cerrar" />
        </Animated.View>
        <Animated.View
          {...bodyPan.panHandlers}
          style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 4, transform: [{ translateY: y }] }]}
        >
          <View {...handlePan.panHandlers} style={st.grabArea} accessibilityLabel="Arrastrá hacia abajo para cerrar">
            <View style={st.grab} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(13,27,69,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 18,
    maxHeight: SCREEN_H * 0.92,
  },
  grabArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 14, marginHorizontal: -18, userSelect: 'none' },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.fieldBorder },
});
