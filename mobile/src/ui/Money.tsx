// Montos con los céntimos más pequeños (estándar de toda la App): "₡115,582" grande y ".00" chiquito,
// para que el número se lea rápido. Si el texto no es un monto (por ejemplo, "••••••"), va tal cual.
import { StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { Text } from './typography';

const MONEY = /^([+\-−]?\s?[₡$][\d,]+)(\.\d{2})$/;

/** Céntimos al 62 % del tamaño del monto. */
const RATIO = 0.62;

export function Cents({ children, style, ...rest }: Omit<TextProps, 'children'> & { children: string; style?: StyleProp<TextStyle> }) {
  const m = MONEY.exec(children);
  if (!m) {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }
  const fs = (StyleSheet.flatten(style)?.fontSize as number | undefined) ?? 14;
  return (
    <Text style={style} {...rest}>
      {m[1]}
      <Text style={{ fontSize: Math.round(fs * RATIO * 10) / 10 }}>{m[2]}</Text>
    </Text>
  );
}
