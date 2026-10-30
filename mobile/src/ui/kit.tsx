// Piezas de interfaz estandarizadas del prototipo: encabezado con volver, botones, filas,
// opciones seleccionables, campos, interruptores y pantalla de éxito.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import { Icon, type IconName } from './Icon';
import { Highlight } from './Brand';
import { Text, TextInput } from './typography';
import { Cents } from './Money';

export function Screen({
  title,
  back = true,
  children,
  footer,
  right,
}: {
  title?: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Acción a la derecha del título (por ejemplo, Ayuda). */
  right?: ReactNode;
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
            <Text style={[s.h2, right ? { flex: 1 } : null]} accessibilityRole="header">
              {title}
            </Text>
            {right}
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

type BtnVariant = 'p' | 'o' | 'do' | 'l' | 'lime';

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
  const fg = variant === 'p' ? colors.white : variant === 'do' ? colors.danger : variant === 'lime' ? colors.navy : colors.primary;
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
  subColor,
  tag,
  tagTone = 'neutral',
}: {
  icon?: IconName;
  title: string;
  /** Una idea por renglón: separá con "\n". */
  sub?: string;
  /** Estado corto al lado del título ("Desactivado", "Tu nivel"). */
  tag?: string;
  tagTone?: 'neutral' | 'ok';
  subColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  first?: boolean;
}) {
  const body = (
    <>
      {/* Regla de la App: el ícono va alineado con la primera línea del texto. */}
      {icon && (
        <View style={s.rowIcon}>
          <Icon name={icon} size={22} color={colors.emeraldDark} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={s.rowTitle}>{title}</Text>
          {tag ? <Tag tone={tagTone}>{tag}</Tag> : null}
        </View>
        {sub ? <Text style={[s.sm, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
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
        {typeof right === 'string' ? <Cents style={s.amt}>{right}</Cents> : right}
      </View>
      {sub ? <Text style={s.sm}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Una sola fila que se desliza de lado (filtros), de borde a borde. */
  scroll?: boolean;
}) {
  const items = options.map((o) => {
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
  });
  return scroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.chipsScroll}
      contentContainerStyle={s.chipsScrollIn}
      accessibilityRole="radiogroup"
    >
      {items}
    </ScrollView>
  ) : (
    <View style={s.chips}>{items}</View>
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

/** Sección (regla del inicio, para toda la App): franja gris de borde a borde y título.
 *  `plain` es para etiquetas de una pregunta dentro de un formulario (sin franja). */
/** `sub`: subtítulo en gris debajo del título (sin resaltador). */
export const Sect = ({ children, plain, first, sub }: { children: string; plain?: boolean; first?: boolean; sub?: string }) =>
  plain ? (
    <Text style={s.sect}>{children}</Text>
  ) : (
    <>
      {!first && <Band />}
      <View style={[s.sectWrap, first && { marginTop: 4 }]}>
        <Highlight soft header align="flex-start" style={s.sectTitle}>
          {children}
        </Highlight>
        {sub ? <Text style={s.sectSub}>{sub}</Text> : null}
      </View>
    </>
  );
/** Separación entre secciones (opción 1A sin destellos): solo aire; el resaltador lima del título
 *  marca dónde empieza cada sección. */
export const Band = ({ style }: { style?: ViewStyle; thin?: boolean }) => <View style={[s.bandWrap, style]} />;
export const Small = ({ children, center, style }: { children: ReactNode; center?: boolean; style?: object }) => (
  <Text style={[s.sm, center && { textAlign: 'center' }, style]}>{children}</Text>
);
export const ErrorText = ({ children }: { children: string | null }) =>
  children ? (
    <Text style={[s.sm, { color: colors.danger, marginTop: 8 }]} accessibilityRole="alert">
      {children}
    </Text>
  ) : null;
/** Etiqueta de estado. "neutral" en gris (Desactivado), "ok" en verde (Tu nivel, Activado). */
export const Tag = ({ children, center, tone }: { children: string; center?: boolean; tone?: 'neutral' | 'ok' }) => (
  <Text
    style={[
      s.tag,
      center && { alignSelf: 'center' },
      tone === 'neutral' && { backgroundColor: colors.card, color: colors.muted },
    ]}
  >
    {children}
  </Text>
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

/** Tarjeta azul marino del prototipo: título, bajada, número grande y línea en lima. */
export function Hero({
  title,
  sub,
  big,
  up,
  lines,
  center,
}: {
  title: string;
  sub?: string;
  big?: string;
  up?: string;
  /** Desglose del total: un renglón por dato (etiqueta a la izquierda, monto a la derecha). */
  lines?: [string, string][];
  center?: boolean;
}) {
  const a = center ? ({ textAlign: 'center' } as const) : undefined;
  return (
    <View style={s.hero}>
      <Text style={[s.heroT, a]}>{title}</Text>
      {big ? <Cents style={[s.heroBig, a]}>{big}</Cents> : null}
      {sub ? <Text style={[s.heroD, a]}>{sub}</Text> : null}
      {up ? <Text style={[s.heroUp, a]}>{up}</Text> : null}
      {lines?.map(([k, v], i) => (
        <View key={k} style={[s.heroLine, i === 0 && { marginTop: 8 }]}>
          <Text style={s.heroLineK}>{k}</Text>
          <Cents style={s.heroLineV}>{v}</Cents>
        </View>
      ))}
    </View>
  );
}

/** Pestañas de texto con subrayado verde (Mis recibos / Otros servicios). */
export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={s.tab}>
            <Text style={[s.tabText, on && { color: colors.navy }]}>{o.label}</Text>
            {on && <View style={s.tabLine} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Buscador redondo con lupa. */
export function SearchField(props: TextInputProps) {
  return (
    <View style={s.search}>
      <TextInput
        {...props}
        placeholderTextColor={colors.muted}
        style={s.searchInput}
        autoCorrect={false}
        returnKeyType="search"
      />
      <Icon name="search" size={20} color={colors.muted} />
    </View>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={s.check}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[s.checkBox, checked && { backgroundColor: colors.emerald, borderColor: colors.emerald }]}>
        {checked && <Icon name="check" size={14} color={colors.white} />}
      </View>
      <Text style={s.checkText}>{label}</Text>
    </Pressable>
  );
}

/** Pasos de seguimiento (préstamo, caso de fraude): hechos en lima, el actual en verde, los demás en gris. */
export function Steps({ steps, current }: { steps: { t: string; s?: string }[]; current: number }) {
  return (
    <View style={{ marginBottom: 6 }}>
      {steps.map((x, i) => {
        const n = i + 1;
        const done = n < current;
        const now = n === current;
        return (
          <View key={x.t} style={s.step}>
            <View style={[s.dot, done && s.dotDone, now && s.dotNow]}>
              <Text style={[s.dotText, (done || now) && { color: done ? colors.navy : colors.white }]}>{done ? '✓' : n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.stepT, n > current && { color: '#98A2B3' }, now && { fontWeight: '700' }]}>{x.t}</Text>
              {n <= current && x.s ? <Text style={s.sm}>{x.s}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Fila de botones de acción con el mismo formato del inicio: cuadro menta, ícono verde oscuro y
 *  texto en dos renglones. Se usa debajo de las tarjetas. */
export function ActionButtons({
  items,
}: {
  items: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; on?: boolean; danger?: boolean }[];
}) {
  return (
    <View style={s.actions}>
      {items.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          disabled={a.disabled}
          style={({ pressed }) => [s.action, (pressed || a.disabled) && { opacity: a.disabled ? 0.4 : 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={a.label.replace('\n', ' ')}
          accessibilityState={{ disabled: !!a.disabled, selected: !!a.on }}
        >
          <View
            style={[
              s.actionIcon,
              a.danger && { backgroundColor: colors.dangerSoft },
              a.on && { backgroundColor: a.danger ? colors.danger : colors.emeraldDark },
            ]}
          >
            <Icon name={a.icon} size={25} color={a.on ? colors.white : a.danger ? colors.danger : colors.emeraldDark} />
          </View>
          <Text style={s.actionText}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Aviso en verde menta (buenas noticias, confirmaciones). */
export const Note = ({ children }: { children: ReactNode }) => (
  <View style={s.note}>
    <Text style={s.noteText}>{children}</Text>
  </View>
);

/** Ayuda arriba a la derecha (inicio y Cuenta): abre el chat de Kooa. */
export function HelpButton() {
  const nav = useNavigation();
  return (
    <Pressable onPress={() => nav.navigate('Help')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ayuda">
      <Icon name="headset" size={25} color={colors.ink} />
    </Pressable>
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
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
  action: { width: '24%', alignItems: 'center', gap: 7 },
  actionIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12.5, lineHeight: 16, fontWeight: '600', textAlign: 'center', color: colors.ink },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 18 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.lime, borderColor: colors.lime },
  dotNow: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotText: { fontSize: 12, fontWeight: '700', color: '#98A2B3' },
  stepT: { fontSize: 15, color: colors.ink },
  note: { backgroundColor: colors.mint, borderRadius: radius.md, padding: 12, marginTop: 6 },
  noteText: { fontSize: 14, color: colors.primaryInk, lineHeight: 20 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontSize: 13.5, color: colors.ink, flex: 1 },
  // Saldo abierto (opción A): sin caja de color, número grande protagonista como en el inicio.
  hero: { paddingTop: 4, paddingBottom: 4 },
  heroT: { fontSize: 13.5, fontWeight: '500', color: colors.muted },
  heroD: { fontSize: 13, color: colors.primary, marginTop: 2 },
  heroBig: { fontSize: 32, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  heroUp: { fontSize: 13, color: colors.muted, marginTop: 2 },
  heroLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line },
  heroLineK: { fontSize: 14, color: colors.ink },
  heroLineV: { fontSize: 14, fontWeight: '600', color: colors.amount, fontVariant: ['tabular-nums'] },
  tabs: { flexDirection: 'row', gap: 28, marginTop: 4, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { paddingTop: 6, paddingBottom: 10, alignItems: 'center' },
  tabText: { fontSize: 17, fontWeight: '700', color: '#98A2B3' },
  tabLine: { position: 'absolute', bottom: -1, width: 36, height: 3, borderRadius: 2, backgroundColor: colors.emerald },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, outlineWidth: 0 },
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
  bandWrap: { marginTop: 14 },
  sectWrap: { marginTop: 16, marginBottom: 4 },
  sectTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectSub: { fontSize: 13, color: colors.muted, marginTop: 4 },
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
  // Lima con texto azul marino (nunca blanco sobre lima): acción principal sobre fondos oscuros.
  btn_lime: { backgroundColor: colors.lime },
  btnText: { fontSize: 15, fontWeight: '600' },
  rowIcon: { alignSelf: 'flex-start', height: 21, justifyContent: 'center' },
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
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chipsScroll: { marginHorizontal: -18, marginTop: 6, flexGrow: 0 },
  chipsScrollIn: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
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
    color: colors.amount,
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
