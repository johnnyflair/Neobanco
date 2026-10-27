// Tarjetas: débito y crédito en pestañas, como en el prototipo aprobado.
// Bloquear es inmediato y sin clave (emergencia); desbloquear y ver datos piden la clave.
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Image, ImageBackground, Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { Card, CardSecrets } from '../../api/types';
import { dayMonth, groupPan, money } from '../../format';
import { colors, radius } from '../../theme';
import { BottomSheet } from '../../ui/BottomSheet';
import { Icon } from '../../ui/Icon';
import { ActionButtons, Band, Btn, ErrorText, Loading, Row, Screen, Small, Tag, Toggle } from '../../ui/kit';
import { usePin } from '../../ui/PinSheet';
import { Text } from '../../ui/typography';

export const LINKED_LABEL = { crc: 'Colones', usd: 'Dólares', auto: 'Automática' } as const;
const REVEAL_SECONDS = 30;

export function CardsScreen() {
  const { data, setData, error, loading } = useLoad(api.cards);
  const [tab, setTab] = useState<'debit' | 'credit'>('debit');
  if (loading && !data) return <Loading />;
  const debit = data?.find((c) => c.kind === 'debit');
  const credit = data?.find((c) => c.kind === 'credit');
  const replace = (c: Card) => setData((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? null);

  return (
    <Screen title="Tus tarjetas" back={false}>
      {credit && <CardPicker value={tab} onChange={setTab} />}
      <ErrorText>{error}</ErrorText>
      {tab === 'debit' && debit && <DebitCard card={debit} onChange={replace} />}
      {tab === 'credit' && credit && <CreditCard card={credit} onChange={replace} />}
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
              <Image source={require('../../../assets/card-debit.jpg')} style={st.swatch} />
            ) : (
              <View style={[st.swatch, { backgroundColor: '#1A1E27' }]} />
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
        <Text style={st.stolenT}>Bloquear por robo o pérdida</Text>
        <Small>Es definitivo: te enviamos una tarjeta nueva</Small>
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
      <ImageBackground
        source={require('../../../assets/card-debit.jpg')}
        style={[st.card, locked && st.locked]}
        imageStyle={{ borderRadius: radius.lg }}
        accessibilityLabel={`Tarjeta de débito terminada en ${card.last4}${locked ? ', bloqueada' : ''}`}
      >
        <View style={st.cardTop}>
          <Text style={st.cardLabel}>Débito · {LINKED_LABEL[card.linked_mode ?? 'crc']}</Text>
          {locked && <Text style={st.cardLabel}>Congelada</Text>}
        </View>
        <View>
          <Text style={st.cardNum} selectable={!!secrets}>
            {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4}`}
          </Text>
          <Text style={st.cardMeta}>
            {card.holder_name} · {card.expiry}
            {secrets ? `   CVV ${secrets.cvv}` : ''}
          </Text>
        </View>
      </ImageBackground>
      <ActionButtons
        items={[
          { label: secrets ? 'Ocultar\ndatos' : 'Ver\ndatos', icon: 'eye', onPress: reveal, disabled: locked, on: !!secrets },
          { label: locked ? 'Descongelar\ntarjeta' : 'Congelar\ntarjeta', icon: 'snowflake', onPress: toggleLock, on: locked, danger: true },
          { label: 'Límites\ndiarios', icon: 'sliders', onPress: () => nav.navigate('CardLimits', { cardId: card.id }) },
          { label: 'Configu-\nración', icon: 'settings', onPress: () => setSettings(true) },
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
      <LinearGradient
        colors={['#15181F', '#262B36', '#1A1E27']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[st.card, locked && st.locked]}
      >
        <LinearGradient
          colors={['rgba(29,107,92,0.9)', 'rgba(29,107,92,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.35, y: 0.6 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={st.cardTop}>
          <Text style={st.cardLabel}>Crédito · {card.product_name}</Text>
          {locked && <Text style={st.cardLabel}>Congelada</Text>}
        </View>
        <View>
          <Text style={st.cardNum} selectable={!!secrets}>
            {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4}`}
          </Text>
          <Text style={st.cardMeta}>
            {card.holder_name} · {card.expiry}
            {secrets ? `   CVV ${secrets.cvv}` : ''}
          </Text>
        </View>
      </LinearGradient>

      <ActionButtons
        items={[
          { label: secrets ? 'Ocultar\ndatos' : 'Ver\ndatos', icon: 'eye', onPress: reveal, disabled: locked, on: !!secrets },
          { label: locked ? 'Descongelar\ntarjeta' : 'Congelar\ntarjeta', icon: 'snowflake', onPress: toggleLock, on: locked, danger: true },
          { label: 'Límites\ndiarios', icon: 'sliders', onPress: () => nav.navigate('CardLimits', { cardId: card.id }) },
          { label: 'Configu-\nración', icon: 'settings', onPress: () => setSettings(true) },
        ]}
      />

      <View style={{ marginTop: 14 }}>
        <Small>Saldo actual</Small>
        <Text style={st.ccBig}>{money(c.balance)}</Text>
        <View style={st.bar}>
          <View style={[st.barFill, { width: `${used}%` }]} />
        </View>
        <Small>
          Disponible {money(c.available)} de {money(c.limit)}
        </Small>
        <View style={st.kpi}>
          <View style={st.kpiBox}>
            <Small>Pago de contado</Small>
            <Text style={st.kpiVal}>{money(c.full_payment)}</Text>
          </View>
          <View style={st.kpiBox}>
            <Small>Pago mínimo</Small>
            <Text style={st.kpiVal}>{money(c.minimum_payment)}</Text>
          </View>
        </View>
        {c.due_date && (
          <Row
            title="Fecha de pago"
            sub={`Corte el ${c.statement_day} de cada mes`}
            right={<Text style={st.amt}>{dayMonth(c.due_date)}</Text>}
          />
        )}
      </View>
      <Btn label="Pagar tarjeta" onPress={() => nav.navigate('CardPay', { cardId: card.id })} disabled={Number(c.balance) <= 0} />
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
    backgroundColor: colors.navy,
  },
  locked: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
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
  ccBig: { fontSize: 26, fontWeight: '700', color: colors.amount, fontVariant: ['tabular-nums'], marginTop: 2, marginBottom: 6 },
  bar: { height: 7, backgroundColor: colors.card, borderRadius: 4, marginTop: 4, marginBottom: 4 },
  barFill: { height: 7, backgroundColor: colors.emerald, borderRadius: 4 },
  kpi: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  kpiBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  kpiVal: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount },
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
    padding: 14,
    marginTop: 16,
  },
  stolenT: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
