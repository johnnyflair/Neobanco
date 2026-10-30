// Barra del menú principal (marca Kooa): rayita lima arriba que se desliza hasta la pestaña
// activa, ícono activo en verde que sube un poco; esquinas de arriba redondeadas y sombra verde suave
// hacia arriba para que el menú resalte sobre el contenido.
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './typography';

const TABS: Record<string, { label: string; icon: IconName }> = {
  Home: { label: 'Inicio', icon: 'home' },
  Cards: { label: 'Tarjeta', icon: 'card' },
  Grow: { label: 'Invertir', icon: 'pig' },
  Account: { label: 'Cuenta', icon: 'userCircle' },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const tabW = width / state.routes.length;
  const x = useRef(new Animated.Value(0)).current;
  const lifts = useRef(state.routes.map((_, i) => new Animated.Value(i === state.index ? 1 : 0))).current;

  useEffect(() => {
    Animated.spring(x, { toValue: state.index * tabW, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    lifts.forEach((v, i) =>
      Animated.spring(v, { toValue: i === state.index ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start(),
    );
  }, [state.index, tabW, x, lifts]);

  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={[st.indicator, { width: tabW * 0.5, left: tabW * 0.25, transform: [{ translateX: x }] }]} />
      )}
      <View style={st.row}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const tab = TABS[route.name] ?? { label: route.name, icon: 'home' as IconName };
          const color = focused ? colors.primary : colors.muted;
          const lift = lifts[i];
          return (
            <Pressable
              key={route.key}
              style={st.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <Animated.View
                style={{
                  transform: [
                    { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                    { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
                  ],
                }}
              >
                <Icon name={tab.icon} color={color} size={29} />
              </Animated.View>
              <Text style={[st.label, { color }, focused && { fontWeight: '700' }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
  indicator: { position: 'absolute', top: 0, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.lime },
  row: { flexDirection: 'row', paddingTop: 10 },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  label: { fontSize: 12, fontWeight: '500' },
});
