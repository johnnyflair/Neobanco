// Movimientos (cambio aprobado): ícono suelto según el tipo (flecha arriba si sale, abajo si entra,
// recibo para servicios…), dos renglones (tipo arriba; contraparte y fecha abajo, en gris) y monto.
// Al tocarlo sube una hoja con todo el detalle y opciones para compartir el comprobante.
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Transaction } from '../api/types';
import { formatPhone, money, shortDate } from '../format';
import { colors, radius, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { KooaEyes, KooaLogo } from './Brand';
import { Icon, type IconName } from './Icon';
import { Btn } from './kit';
import { Text } from './typography';

const isIn = (t: Transaction) => Number(t.amount) > 0;

function moveIcon(t: Transaction): IconName {
  switch (t.category) {
    case 'bill':
      return 'receipt';
    case 'card':
    case 'card_payment':
      return 'card';
    case 'loan':
      return 'cash';
    case 'envelope':
    case 'term':
      return 'pig';
    case 'rewards':
      return 'star';
    case 'capital':
      return 'hands';
    case 'opening':
      return 'file';
    default:
      return isIn(t) ? 'arrowDown' : 'arrowUp';
  }
}

const signed = (t: Transaction, currency: 'CRC' | 'USD') => `${isIn(t) ? '+' : '−'}${money(Math.abs(Number(t.amount)), currency)}`;

function fullDate(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${day} · ${d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}`;
}

const DETAIL_LABEL: Record<string, string> = { sinpe: 'Celular', iban: 'Cuenta', pull: 'Cuenta', bill: 'Servicio', card: 'Tarjeta', salary: 'Concepto' };

export function MoveRow({
  t,
  currency = 'CRC',
  mask = (s) => s,
  first,
  grouped,
  showAccount,
  onPress,
}: {
  t: Transaction;
  showAccount?: boolean;
  currency?: 'CRC' | 'USD';
  mask?: (s: string) => string;
  first?: boolean;
  grouped?: boolean;
  onPress: () => void;
}) {
  // Agrupado por día, la fecha ya está en el separador: abajo va quién y la hora.
  const when = grouped ? timeOf(t.created_at) : shortDate(t.created_at);
  // En la vista combinada (Todas) cada movimiento dice de qué cuenta es.
  const sub = [showAccount ? t.account_name : null, t.counterparty, when].filter(Boolean).join(' · ');
  currency = (t.currency as 'CRC' | 'USD' | null) ?? currency;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.row, first && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={`${t.title || t.description}, ${signed(t, currency)}`}
    >
      <Icon name={moveIcon(t)} size={22} color={isIn(t) ? colors.emeraldDark : colors.amount} />
      <View style={{ flex: 1 }}>
        <Text style={type.itemTitle} numberOfLines={1}>
          {t.title || t.description}
        </Text>
        <Text style={type.itemSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={[type.amount, isIn(t) && { color: colors.primary }]}>{mask(signed(t, currency))}</Text>
      <Icon name="chev" size={14} color={colors.muted} />
    </Pressable>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const date = d.toLocaleDateString('es-CR', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
  });
  if (d.toDateString() === today.toDateString()) return `Hoy · ${date}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ayer · ${date}`;
  return date;
}

/** Lista de movimientos agrupada por día: separador con la fecha y una línea debajo. */
export function MoveList({
  items,
  currency = 'CRC',
  mask,
  showAccount,
  onPress,
}: {
  items: Transaction[];
  showAccount?: boolean;
  currency?: 'CRC' | 'USD';
  mask?: (s: string) => string;
  onPress: (t: Transaction) => void;
}) {
  const out: ReactNode[] = [];
  let last = '';
  for (const t of items) {
    const day = new Date(t.created_at).toDateString();
    const newDay = day !== last;
    if (newDay) {
      out.push(
        <Text key={`d-${day}`} style={st.day} accessibilityRole="header">
          {dayLabel(t.created_at)}
        </Text>,
      );
      last = day;
    }
    out.push(<MoveRow key={t.id} t={t} currency={currency} mask={mask} first={newDay} grouped showAccount={showAccount} onPress={() => onPress(t)} />);
  }
  return <View>{out}</View>;
}

export function MoveSheet({
  t,
  accountName,
  currency = 'CRC',
  onClose,
}: {
  t: Transaction | null;
  accountName: string;
  currency?: 'CRC' | 'USD';
  onClose: () => void;
}) {
  const shotRef = useRef<ComponentRef<typeof View>>(null);
  const [copied, setCopied] = useState(false);
  if (!t) return <BottomSheet visible={false} onClose={onClose}>{null}</BottomSheet>;

  const incoming = isIn(t);
  currency = (t.currency as 'CRC' | 'USD' | null) ?? currency;
  accountName = t.account_name ? (t.account_name === 'Colones' || t.account_name === 'Dólares' ? `Cuenta ${t.account_name.toLowerCase()}` : t.account_name) : accountName;
  const detail = t.detail && t.category === 'sinpe' && /^\d{8}$/.test(t.detail) ? formatPhone(t.detail) : t.detail;
  const rows: { k: string; v: string; copy?: boolean }[] = [
    ...(t.counterparty ? [{ k: incoming ? 'De' : 'Para', v: t.counterparty }] : []),
    ...(detail ? [{ k: DETAIL_LABEL[t.category] ?? 'Detalle', v: detail }] : []),
    { k: incoming ? 'Entró en' : 'Salió de', v: accountName },
    { k: 'Fecha', v: fullDate(t.created_at) },
    ...(t.reference ? [{ k: 'Comprobante', v: t.reference, copy: true }] : []),
    { k: 'Saldo después', v: money(t.balance_after, currency) },
  ];
  const text = [
    `${t.title || t.description}: ${signed(t, currency)}`,
    ...rows.filter((r) => r.k !== 'Saldo después').map((r) => `${r.k}: ${r.v}`),
  ].join('\n');

  async function copyRef() {
    await Clipboard.setStringAsync(t!.reference ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Comprobante como imagen (en el teléfono); si no se puede, se comparte como texto.
  async function shareImage() {
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) throw new Error('no-image');
      const uri = await captureRef(shotRef as never, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir comprobante' });
    } catch {
      await Share.share({ message: text });
    }
  }

  return (
    <BottomSheet visible onClose={onClose}>
      {/* Lo que va en la imagen: marca arriba, el comprobante y el eslogan al pie. El saldo queda fuera
          de la imagen (se ve abajo, solo en la App), para no mostrárselo a quien recibe el comprobante. */}
      <View ref={shotRef} collapsable={false} style={st.receipt}>
        <View style={st.brand}>
          <KooaLogo height={26} />
          <Text style={st.brandTag}>Comprobante</Text>
        </View>
        <View style={st.head}>
          <Icon name={moveIcon(t)} size={30} color={incoming ? colors.emeraldDark : colors.amount} />
          <Text style={st.title}>{t.title || t.description}</Text>
          <Text style={[st.big, incoming && { color: colors.primary }]}>{signed(t, currency)}</Text>
          <Text style={st.tag}>Completado</Text>
        </View>
        {rows.filter((r) => r.k !== 'Saldo después').map((r) => (
          <View key={r.k} style={st.kv}>
            <Text style={st.k}>{r.k}</Text>
            <Text style={st.v} selectable numberOfLines={1}>
              {r.v}
            </Text>
            {r.copy && (
              <Pressable onPress={copyRef} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copiar comprobante">
                <Icon name={copied ? 'check' : 'copy'} size={17} color={colors.primary} />
              </Pressable>
            )}
          </View>
        ))}
        <View style={st.foot}>
          <KooaEyes size={30} />
          <Text style={st.footT}>Dinero con buena cara</Text>
        </View>
      </View>
      <View style={[st.kv, { marginBottom: 4 }]}>
        <Text style={st.k}>Saldo después</Text>
        <Text style={st.v}>{money(t.balance_after, currency)}</Text>
      </View>
      <Btn label="Compartir por WhatsApp" icon="chat" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`)} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Otros" icon="share" variant="o" onPress={() => Share.share({ message: text })} style={{ flex: 1 }} />
        <Btn label="Imagen" icon="file" variant="o" onPress={shareImage} style={{ flex: 1 }} />
      </View>
    </BottomSheet>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
  day: { fontSize: 12.5, fontWeight: '600', color: colors.muted, paddingTop: 16, paddingBottom: 6, borderBottomWidth: 1, borderColor: '#D0D5DD' },
  receipt: { backgroundColor: colors.white, paddingBottom: 4 },
  brand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderColor: colors.line },
  brandTag: { fontSize: 12, color: colors.muted },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12, marginTop: 2, borderTopWidth: 1, borderColor: colors.line },
  footT: { fontSize: 13, fontWeight: '600', color: colors.teal },
  head: { alignItems: 'center', gap: 4, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 4 },
  big: { fontSize: 28, fontWeight: '700', color: colors.amount, fontVariant: ['tabular-nums'] },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line },
  k: { fontSize: 13, color: colors.muted, width: 104 },
  v: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
