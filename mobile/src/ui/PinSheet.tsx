// Hoja para confirmar con la clave de 6 dígitos (paso adicional antes de ver datos de la tarjeta,
// desbloquearla o subir un límite). La clave nunca se guarda: se manda una vez a la API y se olvida.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { Btn, s as kit } from './kit';
import { Text, TextInput } from './typography';

type Ask = (opts: { title: string; sub?: string }) => Promise<string | null>;

const PinContext = createContext<Ask>(async () => null);
export const usePin = () => useContext(PinContext);

export function PinProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<{ title: string; sub?: string } | null>(null);
  const [pin, setPin] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback<Ask>((opts) => {
    setPin('');
    setReq(opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function finish(value: string | null) {
    resolver.current?.(value);
    resolver.current = null;
    setReq(null);
    setPin('');
  }

  return (
    <PinContext.Provider value={ask}>
      {children}
      <Modal visible={req !== null} transparent animationType="slide" onRequestClose={() => finish(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => finish(null)} accessibilityLabel="Cancelar" />
          <View style={st.sheet}>
            <Text style={kit.h2}>{req?.title}</Text>
            {req?.sub ? <Text style={kit.sm}>{req.sub}</Text> : null}
            <TextInput
              value={pin}
              onChangeText={(v) => {
                const clean = v.replace(/\D/g, '').slice(0, 6);
                setPin(clean);
                if (clean.length === 6) finish(clean);
              }}
              autoFocus
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={colors.fieldBorder}
              accessibilityLabel="Clave de 6 dígitos"
              style={st.input}
            />
            <Btn label="Cancelar" variant="l" onPress={() => finish(null)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </PinContext.Provider>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,27,69,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 32 },
  input: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    borderRadius: 12,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.ink,
    outlineWidth: 0,
  },
});
