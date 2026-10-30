// Flujos de tarjeta: cuenta ligada (débito), límites diarios, pago de crédito y compras a cuotas.
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { CardLimits, LinkedMode } from '../../api/types';
import { dayMonth, money, parseAmount, shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Btn, Chips, ErrorText, Field, Loading, Opt, Row, Screen, Sect, Small, Tag, Hero } from '../../ui/kit';
import { usePin } from '../../ui/PinSheet';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

async function cardAndAccounts(cardId: string) {
  const [card, accounts] = await Promise.all([api.card(cardId), api.accounts()]);
  return {
    card,
    crc: accounts.find((a) => a.type === 'savings' && a.currency === 'CRC'),
    usd: accounts.find((a) => a.type === 'savings' && a.currency === 'USD'),
  };
}

// ---------- Cuenta ligada (débito) ----------

export function CardLinkedScreen({ route }: RootProps<'CardLinked'>) {
  const nav = useNavigation();
  const { data, error } = useLoad(() => cardAndAccounts(route.params.cardId));
  const [mode, setMode] = useState<LinkedMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return error ? <Screen title="¿De qué cuenta sale?"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const current = mode ?? data.card.linked_mode ?? 'crc';

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      await api.cardSettings(data!.card.id, { linked_mode: current });
      nav.goBack();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="¿De qué cuenta sale?" footer={<Btn label="Guardar" onPress={save} loading={busy} />}>
      <Small>Elegí qué cuenta paga las compras con tu tarjeta de débito.</Small>
      <Opt
        selected={current === 'crc'}
        onPress={() => setMode('crc')}
        title="₡ Cuenta colones"
        right={data.crc ? money(data.crc.balance) : undefined}
        sub="Todas las compras salen de colones"
      />
      <Opt
        selected={current === 'usd'}
        onPress={() => setMode('usd')}
        title="$ Cuenta dólares"
        right={data.usd ? money(data.usd.balance, 'USD') : undefined}
        sub="Todas las compras salen de dólares"
      />
      <Opt
        selected={current === 'auto'}
        onPress={() => setMode('auto')}
        title="Automática"
        right={<Tag>Recomendada</Tag>}
        sub="Compras en dólares salen de dólares y el resto de colones. Así no pagás tipo de cambio."
      />
      <Small style={{ marginTop: 12 }}>
        Si la cuenta elegida no tiene saldo suficiente, la compra se rechaza; no se toma de la otra cuenta.
      </Small>
      <ErrorText>{saveError}</ErrorText>
    </Screen>
  );
}

// ---------- Límites diarios ----------

const LIMITS: { key: keyof CardLimits; title: string; sub: string; max: number; step: number }[] = [
  { key: 'store', title: 'Compras en comercios', sub: 'Pagos con la tarjeta o el celular', max: 1_000_000, step: 10_000 },
  { key: 'online', title: 'Compras en línea', sub: 'Tiendas y apps por internet', max: 1_000_000, step: 10_000 },
  { key: 'atm', title: 'Retiros en cajero', sub: 'Efectivo en ATH y cajeros', max: 500_000, step: 5_000 },
];

export function CardLimitsScreen({ route }: RootProps<'CardLimits'>) {
  const nav = useNavigation();
  const ask = usePin();
  const { data, error } = useLoad(() => api.card(route.params.cardId));
  const [values, setValues] = useState<Record<keyof CardLimits, number> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return error ? <Screen title="Límites diarios"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const v = values ?? {
    store: Number(data.limits.store),
    online: Number(data.limits.online),
    atm: Number(data.limits.atm),
  };
  const raising = LIMITS.some((l) => v[l.key] > Number(data.limits[l.key]));

  async function save() {
    setSaveError(null);
    let pin: string | undefined;
    if (raising) {
      const p = await ask({ title: 'Subir límites', sub: 'Para subir un límite confirmá con tu clave.' });
      if (!p) return;
      pin = p;
    }
    setBusy(true);
    try {
      const body = { store: v.store.toFixed(2), online: v.online.toFixed(2), atm: v.atm.toFixed(2) };
      await api.cardLimits(data!.id, body, pin);
      nav.goBack();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Límites diarios" footer={<Btn label="Guardar" onPress={save} loading={busy} />}>
      <Small>Elegí hasta cuánto se puede usar tu tarjeta por día. Bajar un límite aplica al instante; subirlo se confirma con tu clave.</Small>
      {LIMITS.map((l) => (
        <View key={l.key} style={st.lim}>
          <View style={st.limHead}>
            <View style={{ flex: 1 }}>
              <Text style={st.limTitle}>{l.title}</Text>
              <Small>{l.sub}</Small>
            </View>
            <Text style={st.amt}>{v[l.key] === 0 ? 'Apagado' : money(v[l.key])}</Text>
          </View>
          <Slider
            value={v[l.key]}
            minimumValue={0}
            maximumValue={l.max}
            step={l.step}
            onValueChange={(n) => setValues({ ...v, [l.key]: n })}
            minimumTrackTintColor={colors.emerald}
            maximumTrackTintColor={colors.line}
            thumbTintColor={colors.primary}
            accessibilityLabel={`Límite de ${l.title.toLowerCase()}`}
          />
        </View>
      ))}
      <Small style={{ marginTop: 6 }}>En ₡0.00 el canal queda apagado.</Small>
      <ErrorText>{saveError}</ErrorText>
    </Screen>
  );
}

// ---------- Pagar tarjeta de crédito ----------

const MODE_LABEL = { full: 'Pago de contado', minimum: 'Pago mínimo', other: 'Otro monto' } as const;

export function CardPayScreen({ route }: RootProps<'CardPay'>) {
  const nav = useNavigation();
  const { data, error } = useLoad(() => cardAndAccounts(route.params.cardId));
  const [mode, setMode] = useState<'full' | 'minimum' | 'other'>('full');
  const [other, setOther] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const key = useRef({ sig: '', key: newIdempotencyKey() });
  if (!data) return error ? <Screen title="Pagar tarjeta"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const c = data.card.credit;
  const crc = data.crc;
  if (!c || !crc) return <Screen title="Pagar tarjeta"><ErrorText>No encontramos la tarjeta.</ErrorText></Screen>;

  const amount = mode === 'full' ? c.full_payment : mode === 'minimum' ? c.minimum_payment : parseAmount(other);

  function check() {
    setPayError(null);
    if (!amount) return setPayError('Escribí el monto.');
    if (Number(amount) < Number(c!.minimum_payment) || Number(amount) > Number(c!.full_payment))
      return setPayError(`Elegí un monto entre ${money(c!.minimum_payment)} y ${money(c!.full_payment)}.`);
    if (Number(amount) > Number(crc!.balance)) return setPayError('No te alcanza el saldo de tu cuenta colones.');
    setReview(true);
  }

  async function pay() {
    if (!amount) return;
    setPayError(null);
    const sig = `${mode}|${amount}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    try {
      const r = await api.payCard(data!.card.id, mode, crc!.id, key.current.key, mode === 'other' ? amount : undefined);
      setReview(false);
      nav.reset({
        index: 2,
        routes: [
          { name: 'Tabs', params: { screen: 'Home' } },
          { name: 'Cards' },
          {
            name: 'TransferDone',
            params: {
              hi: 'Pagaste tu tarjeta',
              amount: r.amount,
              back: 'Cards',
              rows: [
                ['Tarjeta', `Crédito •••• ${data!.card.last4}`],
                ['Tipo de pago', MODE_LABEL[mode]],
                ['Saldo pendiente', money(r.new_balance)],
                ['Comprobante', r.reference],
                ['Fecha', receiptDate()],
              ],
              shareText: `✅ Pagué ${money(r.amount)} a mi tarjeta •••• ${data!.card.last4}.\nComprobante ${r.reference} · ${receiptDate()}`,
            },
          },
        ],
      });
    } catch (e) {
      setPayError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Pagar tarjeta" footer={<Btn label={amount ? `Pagar ${money(amount)}` : 'Pagar'} onPress={check} />}>
      <Small>
        Crédito •••• {data.card.last4}
        {c.due_date ? ` · fecha de pago ${dayMonth(c.due_date)}` : ''}
      </Small>
      <Opt selected={mode === 'full'} onPress={() => setMode('full')} title="Pago de contado" right={money(c.full_payment)} sub="No pagás intereses" />
      <Opt selected={mode === 'minimum'} onPress={() => setMode('minimum')} title="Pago mínimo" right={money(c.minimum_payment)} sub="El resto genera intereses" />
      <Opt selected={mode === 'other'} onPress={() => setMode('other')} title="Otro monto" sub="Entre el mínimo y el contado" />
      {mode === 'other' && (
        <Field label="Monto (₡)" value={other} onChangeText={setOther} keyboardType="decimal-pad" placeholder="Ej: 25,000" autoFocus />
      )}
      <View style={{ marginTop: 8 }}>
        <Row title="Pagar desde" right={<Text style={st.amt}>Colones · {money(crc.balance)}</Text>} />
      </View>
      <ErrorText>{payError}</ErrorText>
      <ReviewSheet
        visible={review}
        onClose={() => setReview(false)}
        title="Revisá antes de pagar"
        rows={[
          ['Tarjeta', `Crédito •••• ${data.card.last4}`],
          ['Tipo de pago', MODE_LABEL[mode]],
          ['Monto', amount ? money(amount) : '—'],
          ['Desde', 'Cuenta en colones'],
          ['Comisión', 'Gratis'],
        ]}
        slideLabel="Deslizá para pagar"
        onConfirm={pay}
        busy={busy}
        error={payError}
      />
    </Screen>
  );
}

// ---------- Compras a cuotas ----------

const MONTHLY_RATE = 0.015; // de ejemplo; la cuota definitiva la confirma la API

function estimate(amount: number, months: number) {
  const q = (amount * MONTHLY_RATE) / (1 - (1 + MONTHLY_RATE) ** -months);
  return Math.round(q * 100) / 100;
}

export function CardInstallmentsScreen({ route }: RootProps<'CardInstallments'>) {
  const nav = useNavigation();
  const { cardId } = route.params;
  const purchases = useLoad(() => api.purchases(cardId));
  const [pick, setPick] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  if (!purchases.data) return purchases.error ? <Screen title="Pasar a cuotas"><ErrorText>{purchases.error}</ErrorText></Screen> : <Loading />;

  const open = purchases.data.filter((p) => !p.installments);
  const selected = open.find((p) => p.id === pick) ?? open[0];
  const q = selected ? estimate(Number(selected.amount), months) : 0;

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.installments(cardId, selected.id, months);
      setReview(false);
      nav.reset({
        index: 2,
        routes: [
          { name: 'Tabs', params: { screen: 'Home' } },
          { name: 'Cards' },
          {
            name: 'TransferDone',
            params: {
              hi: `${selected.merchant} quedó en ${months} cuotas`,
              amountLabel: 'Cuota mensual',
              amount: r.monthly_payment,
              back: 'Cards',
              rows: [
                ['Compra', `${selected.merchant} · ${money(selected.amount)}`],
                ['Plazo', `${months} meses`],
                ['Total a pagar', money(r.total)],
                ['Tasa mensual', `${(Number(r.monthly_rate) * 100).toFixed(2)}%`],
                ['Fecha', receiptDate()],
              ],
            },
          },
        ],
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Pasar a cuotas" footer={<Btn label="Pasar a cuotas" onPress={() => setReview(true)} disabled={!selected} />}>
      <Small>Elegí una compra de los últimos 30 días.</Small>
      {purchases.data.map((p) => (
        <Opt
          key={p.id}
          selected={!p.installments && selected?.id === p.id}
          onPress={() => !p.installments && setPick(p.id)}
          title={p.merchant}
          right={p.installments ? <Tag>{`En ${p.installments} cuotas`}</Tag> : money(p.amount)}
          sub={shortDate(p.created_at)}
        />
      ))}
      {open.length === 0 && <Small style={{ marginTop: 8 }}>No tenés compras recientes para pasar a cuotas.</Small>}
      <Sect plain>¿En cuántos meses?</Sect>
      <Chips
        options={[3, 6, 12, 18].map((n) => ({ value: n, label: String(n) }))}
        value={months}
        onChange={setMonths}
      />
      {selected && (
        <View style={{ marginTop: 14 }}>
          <Hero title="Cuota mensual" big={money(q)} sub="Tasa de ejemplo 1.5% mensual" up={`Total ${money(q * months)}`} />
        </View>
      )}
      <ErrorText>{error}</ErrorText>
      {selected ? (
        <ReviewSheet
          visible={review}
          onClose={() => setReview(false)}
          title="Revisá antes de confirmar"
          rows={[
            ['Compra', `${selected.merchant} · ${money(selected.amount)}`],
            ['Plazo', `${months} meses`],
            ['Cuota aproximada', money(q)],
            ['Total aproximado', money(q * months)],
          ]}
          slideLabel="Deslizá para confirmar"
          onConfirm={confirm}
          busy={busy}
          error={error}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  lim: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 12 },
  limHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  limTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount, fontVariant: ['tabular-nums'] },
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 16, marginTop: 14 },
  ht: { fontSize: 16, fontWeight: '700', color: colors.white },
  hd: { fontSize: 12, color: colors.heroSub, marginTop: 2, marginBottom: 8 },
  big: { fontSize: 23, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
  up: { fontSize: 12, color: colors.lime, marginTop: 2 },
});
