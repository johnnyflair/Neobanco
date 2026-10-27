// Teclado numérico propio (como el de marcar del teléfono): números grandes, borrar y, si se
// pide, punto decimal. Mantener presionado "borrar" limpia todo.
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { Icon } from './Icon';
import { Text } from './typography';

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del' | 'clear';

export function Keypad({ onKey, decimal = false }: { onKey: (k: Key) => void; decimal?: boolean }) {
  const keys: (Key | '')[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : '', '0', 'del'];
  return (
    <View style={st.grid}>
      {keys.map((k, i) =>
        k === '' ? (
          <View key={i} style={st.key} />
        ) : (
          <Pressable
            key={i}
            onPress={() => onKey(k)}
            onLongPress={k === 'del' ? () => onKey('clear') : undefined}
            style={({ pressed }) => [st.key, pressed && st.pressed]}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Borrar' : k === '.' ? 'Punto decimal' : k}
          >
            {k === 'del' ? <Icon name="backspace" size={26} /> : <Text style={st.txt}>{k}</Text>}
          </Pressable>
        ),
      )}
    </View>
  );
}

/** Aplica una tecla a un monto escrito como texto ("15000.5"): máximo 2 decimales y 10 enteros. */
export function applyAmountKey(value: string, k: Key): string {
  if (k === 'clear') return '';
  if (k === 'del') return value.slice(0, -1);
  if (k === '.') return value.includes('.') ? value : `${value || '0'}.`;
  const [int, dec] = value.split('.');
  if (dec !== undefined) return dec.length >= 2 ? value : value + k;
  if (int.length >= 10) return value;
  return int === '0' ? k : value + k;
}

/** Aplica una tecla a un número de celular (solo dígitos, máximo 8). */
export function applyPhoneKey(digits: string, k: Key): string {
  if (k === 'clear') return '';
  if (k === 'del') return digits.slice(0, -1);
  if (k === '.') return digits;
  return digits.length >= 8 ? digits : digits + k;
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  key: { width: '33.33%', height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  pressed: { backgroundColor: colors.card },
  txt: { fontSize: 28, fontWeight: '600', color: colors.ink },
});
