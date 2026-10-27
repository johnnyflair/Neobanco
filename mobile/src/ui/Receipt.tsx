// Piezas comunes a todo movimiento de dinero, con el patrón aprobado en SINPE Móvil:
// hoja "Revisá antes de…" con deslizar para confirmar, filas de comprobante y confeti del ¡Listo!.
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { ErrorText } from './kit';
import { SlideToConfirm } from './SlideToConfirm';
import { Text } from './typography';

export type ReceiptRow = [label: string, value: string];

export function Kv({ k, v, green, last }: { k: string; v: string; green?: boolean; last?: boolean }) {
  return (
    <View style={[st.kv, last && { borderBottomWidth: 0 }]}>
      <Text style={st.kvK}>{k}</Text>
      <Text style={[st.kvV, green && { color: colors.primary }]} numberOfLines={2}>
        {v}
      </Text>
    </View>
  );
}

/** Filas del comprobante; "Gratis" se pinta en verde. */
export function Rows({ rows }: { rows: ReceiptRow[] }) {
  return (
    <>
      {rows.map(([k, v], i) => (
        <Kv key={k + i} k={k} v={v} green={v === 'Gratis'} last={i === rows.length - 1} />
      ))}
    </>
  );
}

/** Hoja de revisión: resumen, aviso opcional y deslizar para confirmar. */
export function ReviewSheet({
  visible,
  onClose,
  title = 'Revisá antes de confirmar',
  warn,
  rows,
  slideLabel,
  onConfirm,
  busy,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  warn?: string | null;
  rows: ReceiptRow[];
  slideLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()}>
      <Text style={st.sheetTitle}>{title}</Text>
      {warn ? (
        <View style={st.warn}>
          <Icon name="alert" size={18} color={colors.amberFg} />
          <Text style={st.warnTxt}>{warn}</Text>
        </View>
      ) : null}
      <Rows rows={rows} />
      <ErrorText>{error ?? null}</ErrorText>
      <View style={{ marginTop: 14 }}>
        <SlideToConfirm label={slideLabel} onConfirm={onConfirm} busy={busy} />
      </View>
    </BottomSheet>
  );
}

const W = Dimensions.get('window').width;
const CONFETTI = [colors.lime, colors.orange, colors.primary, colors.navy, '#FAEEDA'];

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: (i * 97) % W,
        drift: ((i * 53) % 60) - 30,
        fall: 260 + ((i * 37) % 220),
        rot: (i * 47) % 360,
        tall: i % 3 === 0,
        color: CONFETTI[i % CONFETTI.length],
      })),
    [],
  );
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: 8,
            height: p.tall ? 16 : 9,
            borderRadius: 3,
            backgroundColor: p.color,
            opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.fall] }) },
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 300}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** "27 oct · 3:20 p. m." */
export function receiptDate(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '')} · ${d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}`;
}

const st = StyleSheet.create({
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  warn: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.amberBg, borderRadius: radius.md, padding: 12, marginBottom: 6 },
  warnTxt: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.amberFg },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  kvK: { fontSize: 15, color: colors.muted },
  kvV: { fontSize: 15, fontWeight: '600', color: colors.ink, flexShrink: 1, textAlign: 'right' },
});
