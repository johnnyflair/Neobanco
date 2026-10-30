// Demo para visitantes (opción A): el App completa con una asociada de ejemplo. Arriba, una franja
// recuerda que es una demo; si se intenta mover plata, la hoja invita a abrir la cuenta.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, MAX_FONT_SCALE_TIGHT } from '../theme';
import { BottomSheet } from './BottomSheet';
import { KooaEyes } from './Brand';
import { Btn, Small } from './kit';
import { Text } from './typography';

/** Franja de la demo encima de todo el App. Las pantallas de abajo ya no suman el borde superior
 *  del teléfono (lo ocupa la franja). */
export function DemoFrame({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={[st.bar, { paddingTop: insets.top + 8 }]}>
        <Text style={st.barT} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
          Estás viendo una demo con datos de ejemplo
        </Text>
        <Pressable onPress={onOpen} style={st.barBtn} accessibilityRole="button" hitSlop={8}>
          <Text style={st.barBtnT} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
            Abrir cuenta
          </Text>
        </Pressable>
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

/** "Para mover plata, abrí tu cuenta": aparece cuando la demo intenta hacer algo de verdad. */
export function DemoSheet({ visible, onClose, onOpen }: { visible: boolean; onClose: () => void; onOpen: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <KooaEyes size={64} expression="guau" style={{ alignSelf: 'center', marginBottom: 10 }} />
      <Text style={st.sheetT}>Para hacerlo de verdad, abrí tu cuenta</Text>
      <Small center>En la demo podés ver todo, pero no mover plata ni cambiar datos. Abrir tu cuenta toma 3 minutos.</Small>
      <View style={{ gap: 8, marginTop: 16 }}>
        <Btn label="Abrir mi cuenta" onPress={onOpen} />
        <Btn label="Seguir viendo la demo" variant="l" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const st = StyleSheet.create({
  bar: {
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  barT: { flex: 1, color: colors.white, fontSize: 14, lineHeight: 18 },
  barBtn: { backgroundColor: colors.lime, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  barBtnT: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  sheetT: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: 6 },
});
