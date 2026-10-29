// Tipografía de Kooa: Plus Jakarta Sans (aprobada). En React Native una fuente propia no
// responde a fontWeight, así que estos Text y TextInput traducen el peso al archivo de la fuente
// (400 → Regular, 500 → Medium, 600 → SemiBold, 700+ → Bold). Usalos en vez de los de react-native.
import type { ComponentProps } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from 'react-native';

export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

function family(weight: TextStyle['fontWeight']): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (w >= 700) return FONT.bold;
  if (w >= 600) return FONT.semibold;
  if (w >= 500) return FONT.medium;
  return FONT.regular;
}

function withFont(style: TextProps['style']): TextStyle {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return flat;
  const { fontWeight, ...rest } = flat;
  return { ...rest, fontFamily: family(fontWeight) };
}

// En React 19 `ref` llega como una prop más y se pasa tal cual.
export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  return <RNText {...props} style={withFont(style)} />;
}

export function TextInput({ style, ...props }: ComponentProps<typeof RNTextInput>) {
  return <RNTextInput {...props} style={withFont(style as TextProps['style'])} />;
}
