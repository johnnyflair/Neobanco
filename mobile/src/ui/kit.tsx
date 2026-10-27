// Piezas de interfaz estandarizadas del prototipo: encabezado con volver, botones, filas,
// opciones seleccionables, campos, interruptores y pantalla de éxito.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text, TextInput } from './typography';

export function Screen({
  title,
  back = true,
  children,
  footer,
}: {
  title?: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  // Con el teclado abierto, el botón principal (Enviar, Continuar…) sube y queda justo encima.
  return (
    <KeyboardAvoidingView
      style={[s.screen, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {title !== undefined && (
          <View style={s.top}>
            {back && nav.canGoBack() && (
              <Pressable style={s.back} onPress={() => nav.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
                <Icon name="back" size={18} />
              </Pressable>
            )}
            <Text style={s.h2} accessibilityRole="header">
              {title}
            </Text>
          </View>
        )}
        {children}
      </ScrollView>
      {footer && (
        <View style={[s.footer, { paddingBottom: keyboardOpen ? 10 : Math.max(insets.bottom, 12) }]}>{footer}</View>
      )}
    </KeyboardAvoidingView>
  );
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/** "005000.507" → "5000.50": solo dígitos y un punto, máximo 2 decimales y 10 enteros. */
export function cleanAmount(text: string): string {
  const [int = '', ...rest] = text.replace(/[^0-9.]/g, '').split('.');
  const i = int.replace(/^0+(?=\d)/, '').slice(0, 10);
  return rest.length ? `${i || '0'}.${rest.join('').slice(0, 2)}` : i;
}

/** Monto grande escrito con el teclado numérico del sistema, con separador de miles al escribir. */
export function AmountInput({
  value,
  onChange,
  currency = 'CRC',
  autoFocus = true,
  label = 'Monto',
}: {
  value: string;
  onChange: (v: string) => void;
  currency?: 'CRC' | 'USD';
  autoFocus?: boolean;
  label?: string;
}) {
  const symbol = currency === 'USD' ? '$' : '₡';
  const [int, dec] = value.split('.');
  const shown = value === '' ? '' : `${symbol}${Number(int || '0').toLocaleString('en-US')}${dec !== undefined ? `.${dec}` : ''}`;
  return (
    <TextInput
      value={shown}
      onChangeText={(t) => onChange(cleanAmount(t))}
      placeholder={`${symbol}0`}
      placeholderTextColor={colors.fieldBorder}
      keyboardType="decimal-pad"
      autoFocus={autoFocus}
      accessibilityLabel={label}
      style={s.amountInput}
    />
  );
}

type BtnVariant = 'p' | 'o' | 'do' | 'l';

export function Btn({
  label,
  onPress,
  variant = 'p',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const fg = variant === 'p' ? colors.white : variant === 'do' ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        s.btn,
        s[`btn_${variant}`],
        pressed && variant === 'p' && { backgroundColor: colors.primaryPress },
        (disabled || loading) && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={[s.btnText, { color: fg }, variant === 'l' && { fontSize: 14 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Fila de lista: ícono suelto (sin burbuja, para no confundirse con un botón), título y bajada. */
export function Row({
  icon,
  title,
  sub,
  right,
  onPress,
  chevron = !!onPress,
  first,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  first?: boolean;
}) {
  const body = (
    <>
      {icon && <Icon name={icon} size={22} color={colors.emeraldDark} />}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={s.sm}>{sub}</Text> : null}
      </View>
      {right}
      {chevron && <Icon name="chev" size={16} color={colors.muted} />}
    </>
  );
  const style = [s.row, first && { borderTopWidth: 0 }];
  return onPress ? (
    <Pressable style={({ pressed }) => [...style, pressed && { opacity: 0.6 }]} onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: colors.fieldBorder, true: colors.emerald }}
      thumbColor={colors.white}
      ios_backgroundColor={colors.fieldBorder}
    />
  );
}

export function Opt({
  selected,
  onPress,
  title,
  right,
  sub,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  right?: ReactNode;
  sub?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.opt, selected && s.optOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={s.optHead}>
        <Text style={s.optTitle}>{title}</Text>
        {typeof right === 'string' ? <Text style={s.amt}>{right}</Text> : right}
      </View>
      {sub ? <Text style={s.sm}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[s.chip, on && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.chipText, on && { color: colors.primaryInk }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.segBtn, on && s.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.segText, on && { color: colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, right, ...input }: TextInputProps & { label: string; right?: ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.sm}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={input.accessibilityLabel ?? label}
        placeholderTextColor={colors.muted}
        style={s.fieldInput}
      />
      {right}
    </View>
  );
}

export function FieldStatic({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.sm}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

export const Sect = ({ children }: { children: string }) => <Text style={s.sect}>{children}</Text>;
export const Small = ({ children, center, style }: { children: ReactNode; center?: boolean; style?: object }) => (
  <Text style={[s.sm, center && { textAlign: 'center' }, style]}>{children}</Text>
);
export const ErrorText = ({ children }: { children: string | null }) =>
  children ? (
    <Text style={[s.sm, { color: colors.danger, marginTop: 8 }]} accessibilityRole="alert">
      {children}
    </Text>
  ) : null;
export const Tag = ({ children, center }: { children: string; center?: boolean }) => (
  <Text style={[s.tag, center && { alignSelf: 'center' }]}>{children}</Text>
);

/** Pantalla de confirmación: círculo lima con check, título y detalle. */
export function Done({ title, sub, extra, children }: { title: string; sub?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Screen>
      <View style={s.ok}>
        <Icon name="check" size={30} color={colors.navy} />
      </View>
      <Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text>
      {sub ? <Small center>{sub}</Small> : null}
      {extra}
      {children}
    </Screen>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.white }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingHorizontal: 18, paddingBottom: 32 },
  footer: { paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 12 },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h2: { fontSize: 20, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  sm: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
  sect: { fontSize: 12, color: colors.muted, marginTop: 16, marginBottom: 4, fontWeight: '600', letterSpacing: 0.2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  btn_p: { backgroundColor: colors.primary },
  btn_o: { backgroundColor: colors.white, borderColor: colors.primary },
  btn_do: { backgroundColor: colors.white, borderColor: colors.danger },
  btn_l: { minHeight: 40, marginTop: 4 },
  btnText: { fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  rowTitle: { fontSize: 15, color: colors.ink },
  opt: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginTop: 8 },
  optOn: { borderColor: colors.emerald, borderWidth: 2, backgroundColor: colors.optOn },
  optHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  optTitle: { fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  amt: { fontSize: 14, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.ink },
  seg: { flexDirection: 'row', gap: 6, backgroundColor: colors.card, padding: 4, borderRadius: 12, marginBottom: 12 },
  segBtn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  segOn: { backgroundColor: colors.white, shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  field: {
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  // outlineWidth: en la vista previa web, el borde del campo ya marca el foco.
  fieldInput: { flex: 1, fontSize: 15, color: colors.ink, textAlign: 'right', paddingVertical: 12, outlineWidth: 0 },
  fieldValue: { flex: 1, fontSize: 14, color: colors.ink, textAlign: 'right' },
  amountInput: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.ink,
    marginTop: 14,
    marginBottom: 2,
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
    outlineWidth: 0,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    color: colors.primaryInk,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '600',
    overflow: 'hidden',
  },
  ok: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 30,
    marginBottom: 14,
  },
});
