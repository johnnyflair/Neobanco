// Tarjetas: débito y crédito en pestañas, como en el prototipo aprobado.
// Bloquear es inmediato y sin clave (emergencia); desbloquear y ver datos piden la clave.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { Card, CardSecrets } from '../../api/types';
import { groupPan, money } from '../../format';
import { colors, MAX_FONT_SCALE_TIGHT, radius } from '../../theme';
import { BottomSheet } from '../../ui/BottomSheet';
import { CardChip, CardLogo, KooaCardFace } from '../../ui/Brand';
import { Icon } from '../../ui/Icon';
import { ActionButtons, Band, Btn, ErrorText, Loading, Row, Screen, Small, Tag, Toggle } from '../../ui/kit';
import { usePin } from '../../ui/PinSheet';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

/** "2026-11-10" → "10 de noviembre" (escrito completo, más fácil de leer). */
function longDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' });
}

export const LINKED_LABEL = { crc: 'Colones', usd: 'Dólares', auto: 'Automática' } as const;
const REVEAL_SECONDS = 30;

export function CardsScreen() {
  const { data, setData, error, loading } = useLoad(api.cards);
  const [tab, setTab] = useState<'debit' | 'credit'>('debit');
  const { width } = useWindowDimensions();
  // Deslizar entre tarjetas (además de los botones): hacia la izquierda va a Crédito, hacia la derecha a Débito.
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const hasCredit = !!data?.some((c) => c.kind === 'credit');
  const go = (to: 'debit' | 'credit') => {
    if (to === tabRef.current) return;
    setTab(to);
    slide.setValue((to === 'credit' ? 1 : -1) * width * 0.25);
    fade.setValue(0.2);
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  };
  const goRef = useRef(go);
  goRef.current = go;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -50) goRef.current('credit');
        else if (g.dx > 50) goRef.current('debit');
      },
    }),
  ).current;

  if (loading && !data) return <Loading />;
  const debit = data?.find((c) => c.kind === 'debit');
  const credit = data?.find((c) => c.kind === 'credit');
  const replace = (c: Card) => setData((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? null);

  return (
    <Screen title="Tus tarjetas" back={false}>
      {credit && <CardPicker value={tab} onChange={go} />}
      <ErrorText>{error}</ErrorText>
      <Animated.View {...(hasCredit ? pan.panHandlers : {})} style={{ opacity: fade, transform: [{ translateX: slide }] }}>
        {tab === 'debit' && debit && <DebitCard card={debit} onChange={replace} />}
        {tab === 'credit' && credit && <CreditCard card={credit} onChange={replace} />}
      </Animated.View>
    </Screen>
  );
}

/** Selector de tarjeta (opción C aprobada): mini tarjeta con su color y el nombre; la elegida con borde verde. */
function CardPicker({ value, onChange }: { value: 'debit' | 'credit'; onChange: (v: 'debit' | 'credit') => void }) {
  const opts = [
    { v: 'debit' as const, label: 'Débito' },
    { v: 'credit' as const, label: 'Crédito' },
  ];
  return (
    <View style={st.picker} accessibilityRole="tablist">
      {opts.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[st.pick, on && st.pickOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Tarjeta de ${o.label.toLowerCase()}`}
          >
            {o.v === 'debit' ? (
              <View style={[st.swatch, { backgroundColor: colors.teal }]} />
            ) : (
              <View style={[st.swatch, { backgroundColor: colors.navy }]} />
            )}
            <Text style={[st.pickText, on && { color: colors.navy }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Configuración de la tarjeta en una hoja: compras en línea y en el exterior. */
function SettingsSheet({ card, visible, onClose, onChange }: { card: Card; visible: boolean; onClose: () => void; onChange: (c: Card) => void }) {
  const [error, setError] = useState<string | null>(null);
  async function setting(body: { online_enabled?: boolean; international_enabled?: boolean }) {
    setError(null);
    onChange({ ...card, ...body });
    try {
      onChange(await api.cardSettings(card.id, body));
    } catch (e) {
      onChange(card);
      setError(errorMessage(e));
    }
  }
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={st.sheetTitle}>Configuración</Text>
      <Small>{`Tarjeta •••• ${card.last4}`}</Small>
      <View style={{ marginTop: 8 }}>
        <Row
          first
          icon="phone"
          title="Compras en línea"
          right={<Toggle value={card.online_enabled} onChange={(v) => setting({ online_enabled: v })} label="Compras en línea" />}
        />
        <Row
          icon="send"
          title="Compras en el exterior"
          sub="Activalas antes de viajar"
          right={<Toggle value={card.international_enabled} onChange={(v) => setting({ international_enabled: v })} label="Compras en el exterior" />}
        />
      </View>
      <ErrorText>{error}</ErrorText>
    </BottomSheet>
  );
}

/** Bloqueo definitivo (robo o pérdida): rojo y separado de Congelar, que sí se revierte. */
function StolenBar() {
  const nav = useNavigation();
  return (
    <Pressable style={st.stolen} onPress={() => nav.navigate('Fraud', { reason: 'lost_card' })} accessibilityRole="button">
      <Icon name="alert" size={20} color={colors.danger} />
      <View style={{ flex: 1 }}>
        <Text style={st.stolenT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
          Bloquear por robo o pérdida
        </Text>
        <Text style={st.stolenS} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}>
          Acción irreversible
        </Text>
      </View>
      <Icon name="chev" size={16} color={colors.danger} />
    </Pressable>
  );
}

function useLockToggle(card: Card, onChange: (c: Card) => void, setError: (e: string | null) => void) {
  const ask = usePin();
  return async function toggleLock() {
    setError(null);
    try {
      if (card.status === 'active') {
        onChange(await api.lockCard(card.id));
      } else {
        const pin = await ask({ title: 'Descongelar tarjeta', sub: `Confirmá con tu clave para volver a usar la •••• ${card.last4}.` });
        if (pin) onChange(await api.unlockCard(card.id, pin));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
}

/** Tamaño exacto de la tarjeta (ancho de pantalla menos márgenes, proporción de tarjeta real).
 *  En pixeles fijos para que el arte llene la tarjeta igual en iPhone, Android y web. */
function useCardSize() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 520) - 36;
  return { width: w, height: Math.round(w / 1.586) };
}

/** Ver datos completos con la clave; se ocultan solos después de 30 segundos. */
function useReveal(card: Card, setError: (e: string | null) => void) {
  const ask = usePin();
  const [secrets, setSecrets] = useState<CardSecrets | null>(null);
  useEffect(() => {
    if (!secrets) return;
    const t = setTimeout(() => setSecrets(null), REVEAL_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [secrets]);
  async function reveal() {
    if (secrets) return setSecrets(null);
    setError(null);
    const pin = await ask({ title: 'Ver datos de la tarjeta', sub: 'Confirmá con tu clave. Se ocultan solos en 30 segundos.' });
    if (!pin) return;
    try {
      setSecrets(await api.revealCard(card.id, pin));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return { secrets, reveal };
}

function DebitCard({ card, onChange }: { card: Card; onChange: (c: Card) => void }) {
  const nav = useNavigation();
  const [error, setError] = useState<string | null>(null);
  const toggleLock = useLockToggle(card, onChange, setError);
  const locked = card.status === 'locked';
  const [settings, setSettings] = useState(false);
  const { secrets, reveal } = useReveal(card, setError);

  return (
    <View>
      <KooaCardFace
        kind="debit"
        style={[st.card, useCardSize(), locked && st.locked]}
        accessibilityLabel={`Tarjeta de débito terminada en ${card.last4}${locked ? ', bloqueada' : ''}`}
      >
        <View style={st.cardTop}>
          <CardLogo kind="debit" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={st.cardKind}>Débito · {LINKED_LABEL[card.linked_mode ?? 'crc']}</Text>
            {locked && <Text style={st.cardLabel}>Congelada</Text>}
          </View>
        </View>
        <CardChip kind="debit" />
        <View>
          <Text style={st.cardNum} selectable={!!secrets}>
            {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4}`}
          </Text>
          <Text style={st.cardMeta}>
            {card.holder_name} · {card.expiry}
            {secrets ? `   CVV ${secrets.cvv}` : ''}
          </Text>
        </View>
      </KooaCardFace>
      <ActionButtons
        items={[
          { label: secrets ? 'Ocultar' : 'Ver datos', icon: 'eye', onPress: reveal, disabled: locked, on: !!secrets },
          { label: locked ? 'Descongelar' : 'Congelar', icon: 'snowflake', onPress: toggleLock, on: locked, danger: true },
          { label: 'Límites', icon: 'sliders', onPress: () => nav.navigate('CardLimits', { cardId: card.id }) },
          { label: 'Ajustes', icon: 'settings', onPress: () => setSettings(true) },
        ]}
      />
      <ErrorText>{error}</ErrorText>
      <Band />
      <View style={{ marginTop: 8 }}>
        <Row
          first
          icon="swap"
          title="Cuenta ligada"
          sub={LINKED_LABEL[card.linked_mode ?? 'crc']}
          onPress={() => nav.navigate('CardLinked', { cardId: card.id })}
        />
        <Row
          icon="phone"
          title="Agregar a Apple o Google Pay"
          onPress={() => Alert.alert('Billeteras', 'Se habilita cuando la cooperativa conecte su procesador de tarjetas.')}
        />
      </View>
      <StolenBar />
      <SettingsSheet card={card} visible={settings} onClose={() => setSettings(false)} onChange={onChange} />
    </View>
  );
}

function CreditCard({ card, onChange }: { card: Card; onChange: (c: Card) => void }) {
  const nav = useNavigation();
  const [error, setError] = useState<string | null>(null);
  const toggleLock = useLockToggle(card, onChange, setError);
  const [settings, setSettings] = useState(false);
  const { secrets, reveal } = useReveal(card, setError);
  const c = card.credit;
  if (!c) return null;
  const used = Number(c.limit) > 0 ? Math.min(100, (Number(c.balance) / Number(c.limit)) * 100) : 0;
  const locked = card.status === 'locked';

  return (
    <View>
      {/* Tarjeta Kooa de crédito: navy con los ojos de marca de agua. */}
      <KooaCardFace
        kind="credit"
        style={[st.card, useCardSize(), locked && st.locked]}
        accessibilityLabel={`Tarjeta de crédito terminada en ${card.last4}${locked ? ', congelada' : ''}`}
      >
        <View style={st.cardTop}>
          <CardLogo kind="credit" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={st.cardKind}>Crédito · {card.product_name}</Text>
            {locked && <Text style={st.cardLabel}>Congelada</Text>}
          </View>
        </View>
        <CardChip kind="credit" />
        <View>
          <Text style={st.cardNum} selectable={!!secrets}>
            {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4}`}
          </Text>
          <Text style={st.cardMeta}>
            {card.holder_name} · {card.expiry}
            {secrets ? `   CVV ${secrets.cvv}` : ''}
          </Text>
        </View>
      </KooaCardFace>

      <ActionButtons
        items={[
          { label: secrets ? 'Ocultar' : 'Ver datos', icon: 'eye', onPress: reveal, disabled: locked, on: !!secrets },
          { label: locked ? 'Descongelar' : 'Congelar', icon: 'snowflake', onPress: toggleLock, on: locked, danger: true },
          { label: 'Límites', icon: 'sliders', onPress: () => nav.navigate('CardLimits', { cardId: card.id }) },
          { label: 'Ajustes', icon: 'settings', onPress: () => setSettings(true) },
        ]}
      />

      {/* Crédito A (aprobado): lo que debés y para cuándo, grande; el detalle en renglones, sin recuadros. */}
      <View style={{ marginTop: 16 }}>
        <Text style={st.oweK}>{Number(c.balance) > 0 ? 'Debés' : 'No debés nada'}</Text>
        {Number(c.balance) > 0 && <Cents style={st.ccBig}>{money(c.balance)}</Cents>}
        {c.due_date && Number(c.balance) > 0 && (
          <View style={st.due}>
            <Icon name="calendar" size={16} color={colors.amberFg} />
            <Text style={st.dueText}>Pagá antes del {longDate(c.due_date)}</Text>
          </View>
        )}
      </View>
      <Btn label="Pagar tarjeta" onPress={() => nav.navigate('CardPay', { cardId: card.id })} disabled={Number(c.balance) <= 0} />
      <View style={{ marginTop: 4 }}>
        <Row first title="Pago de contado" sub="Sin intereses" right={<Cents style={st.amt}>{money(c.full_payment)}</Cents>} />
        <Row title="Pago mínimo" right={<Cents style={st.amt}>{money(c.minimum_payment)}</Cents>} />
        <Row title="Disponible para compras" sub={`De un límite de ${money(c.limit)}`} right={<Cents style={st.amt}>{money(c.available)}</Cents>} />
        <Row title="Fecha de corte" right={<Text style={st.amt}>{`El ${c.statement_day} de cada mes`}</Text>} />
      </View>
      <ErrorText>{error}</ErrorText>
      <Band />
      <View style={{ marginTop: 8 }}>
        <Row
          icon="receipt"
          title="Pasar compras a cuotas"
          sub="Dividí una compra grande en meses"
          right={<Tag>Nuevo</Tag>}
          onPress={() => nav.navigate('CardInstallments', { cardId: card.id })}
        />
        <Row
          icon="file"
          title="Estados de cuenta"
          sub={`Corte del ${c.statement_day} de cada mes`}
          onPress={() => Alert.alert('Estados de cuenta', 'Los PDF llegan del procesador de la cooperativa.')}
        />
        <Row
          icon="star"
          title="Puntos de la tarjeta"
          sub={`${c.points_per_1000} puntos por cada ₡1,000.00 · suman a tus recompensas`}
        />
      </View>
      <StolenBar />
      <SettingsSheet card={card} visible={settings} onClose={() => setSettings(false)} onChange={onChange} />
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    aspectRatio: 1.586,
    borderRadius: radius.lg,
    padding: 18,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  locked: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardKind: { color: colors.lime, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardLabel: { color: colors.white, fontSize: 12, textShadowColor: 'rgba(0,0,0,.45)', textShadowRadius: 3 },
  cardNum: {
    color: colors.white,
    fontSize: 17,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,.45)',
    textShadowRadius: 3,
  },
  cardMeta: { color: colors.white, fontSize: 12, marginTop: 4, textShadowColor: 'rgba(0,0,0,.45)', textShadowRadius: 3 },
  oweK: { fontSize: 15, color: colors.muted },
  ccBig: { fontSize: 32, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.amberBg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8, marginBottom: 4 },
  dueText: { fontSize: 14, fontWeight: '600', color: colors.amberFg },
  bar: { height: 7, backgroundColor: colors.card, borderRadius: 4, marginTop: 4, marginBottom: 4 },
  barFill: { height: 7, backgroundColor: colors.emerald, borderRadius: 4 },
  kpi: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  kpiBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  kpiVal: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  amt: { fontSize: 16, fontWeight: '600', color: colors.amount },
  picker: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  pick: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.white,
  },
  pickOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.optOn },
  swatch: { width: 36, height: 24, borderRadius: 5 },
  pickText: { fontSize: 15, fontWeight: '700', color: '#344054' },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink },
  stolen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  stolenT: { fontSize: 15, fontWeight: '700', color: colors.danger },
  stolenS: { fontSize: 13, color: colors.muted },
});
