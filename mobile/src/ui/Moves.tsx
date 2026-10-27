// Movimientos (cambio aprobado): ícono suelto según el tipo (flecha arriba si sale, abajo si entra,
// recibo para servicios…), dos renglones (tipo arriba; contraparte y fecha abajo, en gris) y monto.
// Al tocarlo sube una hoja con todo el detalle y opciones para compartir el comprobante.
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Transaction } from '../api/types';
import { formatPhone, money, shortDate } from '../format';
import { colors, radius, type } from '../theme';
import { BottomSheet } from './BottomSheet';
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
  onPress,
}: {
  t: Transaction;
  currency?: 'CRC' | 'USD';
  mask?: (s: string) => string;
  first?: boolean;
  onPress: () => void;
}) {
  const sub = [t.counterparty, shortDate(t.created_at)].filter(Boolean).join(' · ');
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
      <View ref={shotRef} collapsable={false} style={st.receipt}>
        <View style={st.head}>
          <Icon name={moveIcon(t)} size={30} color={incoming ? colors.emeraldDark : colors.amount} />
          <Text style={st.title}>{t.title || t.description}</Text>
          <Text style={[st.big, incoming && { color: colors.primary }]}>{signed(t, currency)}</Text>
          <Text style={st.tag}>Completado</Text>
        </View>
        {rows.map((r) => (
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
  receipt: { backgroundColor: colors.white, paddingBottom: 4 },
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
