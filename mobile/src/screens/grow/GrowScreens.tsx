// Invertir (según el prototipo aprobado): sobres a la vista y ahorros a plazo.
// - Pestaña Invertir: total, sobres con su meta, plazos con vencimiento, tasas.
// - Crear: sobre (meta, meses, forma de ahorrar) o ahorro a plazo (monto, plazo, qué hacer al vencer).
// - Sobre: meter y sacar dinero.
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { Account } from '../../api/types';
import { dayMonth, money, parseAmount } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { AmountInput, Btn, Chips, ErrorText, Field, Hero, Loading, Opt, Row, Screen, Sect, Small } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text } from '../../ui/typography';

const pct = (r: string | number) => `${Number(r).toLocaleString('en-US', { maximumFractionDigits: 2 })}% anual`;
const ON_MATURITY: Record<string, string> = { renew: 'se renueva', to_account: 'pasa a tu cuenta', to_envelope: 'pasa a un sobre' };

async function loadGrow() {
  const [accounts, rates] = await Promise.all([api.accounts(), api.rates()]);
  return { accounts, rates };
}

function progress(a: Account) {
  const goal = Number(a.goal_amount ?? 0);
  return goal > 0 ? Math.min(100, Math.round((Number(a.balance) / goal) * 100)) : 0;
}

export function GrowScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(loadGrow);
  if (!data) return error ? <Screen title="Invertir" back={false}><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const envelopes = data.accounts.filter((a) => a.type === 'envelope');
  const terms = data.accounts.filter((a) => a.type === 'term');
  const sob = envelopes.reduce((s, a) => s + Number(a.balance), 0);
  const pl = terms.reduce((s, a) => s + Number(a.balance), 0);
  const vista = data.rates.find((r) => r.product === 'envelope');

  return (
    <Screen title="Invertir" back={false}>
      <Hero
        title="Sobres y ahorros a plazo"
        sub="Tu plata trabajando"
        big={money(sob + pl)}
        up={`${money(sob)} en ${envelopes.length} sobres · ${money(pl)} a plazo`}
      />
      <Btn label="Crear ahorro" icon="plus" onPress={() => nav.navigate('NewSaving')} />

      <Sect>Sobres a la vista · sacás cuando querés</Sect>
      {envelopes.map((a) => {
        const p = progress(a);
        return (
          <Pressable key={a.id} style={st.goal} onPress={() => nav.navigate('Envelope', { account: a })} accessibilityRole="button">
            <View style={st.goalHead}>
              <Text style={st.goalName}>{a.name}</Text>
              <Text style={st.amt}>{money(a.balance)}</Text>
            </View>
            <View style={st.bar}>
              <View style={[st.barFill, { width: `${p}%` }]} />
            </View>
            <Small>
              {a.goal_amount ? `${p}% de ${money(a.goal_amount)}` : 'Sin meta'}
              {a.savings_mode ? ` · ${a.savings_mode}` : ''}
            </Small>
          </Pressable>
        );
      })}
      {!envelopes.length && <Small>Todavía no tenés sobres.</Small>}

      <Sect>Ahorros a plazo</Sect>
      {terms.map((a, i) => (
        <Row
          key={a.id}
          first={i === 0}
          icon="lock"
          title={`Plazo ${a.term_months} meses · ${pct(a.rate ?? 0)}`}
          sub={`Vence ${a.maturity_date ? dayMonth(a.maturity_date) : ''} · ${ON_MATURITY[a.on_maturity ?? 'renew'] ?? ''}`}
          right={<Text style={st.amt}>{money(a.balance)}</Text>}
        />
      ))}
      {!terms.length && <Small>Todavía no tenés ahorros a plazo.</Small>}

      <Sect>Tasas de ejemplo</Sect>
      {vista && <Row first title="Sobre a la vista" right={<Text style={st.amt}>{pct(vista.annual_rate)}</Text>} />}
      {data.rates
        .filter((r) => r.product === 'term')
        .map((r) => (
          <Row
            key={r.term_months}
            title={`Plazo ${r.term_months} meses`}
            right={<Text style={st.amt}>{pct(r.annual_rate)}</Text>}
            onPress={() => nav.navigate('TermDeposit', { term: r.term_months ?? 6 })}
          />
        ))}
    </Screen>
  );
}

export function NewSavingScreen() {
  const nav = useNavigation();
  return (
    <Screen title="¿Qué querés crear?">
      <Pressable style={[st.choice]} onPress={() => nav.navigate('NewEnvelope')} accessibilityRole="button">
        <Icon name="pig" size={24} color={colors.emeraldDark} />
        <View style={{ flex: 1 }}>
          <Text style={st.choiceT}>Sobre a la vista</Text>
          <Small>Separá plata para algo. Metés y sacás cuando querás. Tasa de ejemplo 3% anual.</Small>
        </View>
      </Pressable>
      <Pressable style={[st.choice]} onPress={() => nav.navigate('TermDeposit', { term: 6 })} accessibilityRole="button">
        <Icon name="lock" size={24} color={colors.emeraldDark} />
        <View style={{ flex: 1 }}>
          <Text style={st.choiceT}>Ahorro a plazo</Text>
          <Small>De 3 a 36 meses. Más plazo, mejor tasa: hasta 7.5% anual de ejemplo.</Small>
        </View>
      </Pressable>
    </Screen>
  );
}

const MODES = [
  { value: 'fixed', title: 'Monto fijo', sub: 'Cada pago de salario' },
  { value: 'roundup', title: 'Redondeo', sub: 'Cada compra se redondea y la diferencia se ahorra' },
  { value: 'percent', title: 'Porcentaje', sub: 'Un % de todo lo que entra' },
] as const;

export function NewEnvelopeScreen() {
  const nav = useNavigation();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [months, setMonths] = useState('12');
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('fixed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = Number(parseAmount(goal) ?? 0);
  const m = Math.max(1, Math.min(60, Number(months) || 1));

  async function create() {
    if (name.trim().length < 2) return setError('Ponele un nombre al sobre.');
    if (!g) return setError('Poné una meta para el sobre.');
    setBusy(true);
    setError(null);
    try {
      const a = await api.createEnvelope({ name: name.trim(), goal_amount: g.toFixed(2), months: m, mode });
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs', params: { screen: 'Grow' } },
          {
            name: 'TransferDone',
            params: {
              hi: `¡Listo! Creaste tu sobre «${a.name}»`,
              amountLabel: 'Meta',
              amount: g.toFixed(2),
              points: 50,
              back: 'Grow',
              rows: [
                ['Sobre', a.name],
                ['Plazo de la meta', `${m} meses`],
                ['Forma de ahorrar', MODES.find((x) => x.value === mode)?.title ?? ''],
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
    <Screen title="Nuevo sobre" footer={<Btn label="Crear sobre" onPress={create} loading={busy} />}>
      <Small>Plata separada que podés usar cuando querás</Small>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Marchamo 2027" autoFocus />
      <Field label="Meta (₡)" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="250,000" />
      <Field label="¿En cuántos meses?" value={months} onChangeText={(v) => setMonths(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
      {g > 0 && mode === 'fixed' && (
        <View style={st.mint}>
          <Text style={{ color: colors.primaryInk, fontSize: 14 }}>Son {money(g / (m * 2))} por quincena</Text>
        </View>
      )}
      <Sect plain>¿Cómo querés ahorrar?</Sect>
      {MODES.map((x) => (
        <Opt key={x.value} selected={mode === x.value} onPress={() => setMode(x.value)} title={x.title} sub={x.sub} />
      ))}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

export function EnvelopeScreen({ route }: RootProps<'Envelope'>) {
  const [env, setEnv] = useState<Account>(route.params.account);
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [amount, setAmount] = useState('10000');
  const [busy, setBusy] = useState<'deposit' | 'withdraw' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = useRef({ sig: '', key: newIdempotencyKey() });
  const p = progress(env);

  async function move(direction: 'deposit' | 'withdraw') {
    const amt = parseAmount(amount);
    if (!crc || !amt) return setError('Escribí el monto.');
    if (direction === 'deposit' && Number(amt) > Number(crc.balance)) return setError('No te alcanza el saldo de tu cuenta colones.');
    if (direction === 'withdraw' && Number(amt) > Number(env.balance)) return setError('El sobre no tiene suficiente.');
    const sig = `${direction}|${amt}|${env.balance}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(direction);
    setError(null);
    setMsg(null);
    try {
      const r = await api.envelopeMove(env.id, direction, amt, crc.id, key.current.key);
      setEnv({ ...env, balance: r.envelope_balance });
      setMsg(direction === 'deposit' ? `Metiste ${money(amt)} en ${env.name}` : `Sacaste ${money(amt)} de ${env.name}`);
      accounts.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={env.name}>
      <View style={st.heroBox}>
        <Hero
          title="Sobre a la vista"
          sub="Sacás cuando querés"
          big={money(env.balance)}
          up={env.goal_amount ? `Meta ${money(env.goal_amount)} · ${p}%` : 'Sin meta'}
        />
        <View style={st.heroBar}>
          <View style={[st.heroBarFill, { width: `${p}%` }]} />
        </View>
      </View>
      <AmountInput value={amount} onChange={setAmount} autoFocus={false} label="Monto a mover" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Meter" icon="plus" onPress={() => move('deposit')} loading={busy === 'deposit'} style={{ flex: 1 }} />
        <Btn label="Sacar" icon="minus" variant="o" onPress={() => move('withdraw')} loading={busy === 'withdraw'} style={{ flex: 1 }} />
      </View>
      {msg && <Small center style={{ marginTop: 8, color: colors.emeraldDark }}>{msg}</Small>}
      <ErrorText>{error}</ErrorText>
      <View style={{ marginTop: 12 }}>
        <Row title="Ahorro automático" right={<Small>{env.savings_mode ?? '—'}</Small>} />
        <Row title="Tasa a la vista" right={<Text style={st.amt}>{pct(env.rate ?? 3)}</Text>} />
        <Row title="Retiros" right={<Text style={[st.amt, { color: colors.emeraldDark }]}>Cuando querás, sin costo</Text>} />
        <Row title="Se mueve con" right={<Small>Cuenta colones · {crc ? money(crc.balance) : '…'}</Small>} />
      </View>
    </Screen>
  );
}

const END = [
  { value: 'renew', label: 'Renovar automático' },
  { value: 'to_account', label: 'Pasar a mi cuenta' },
  { value: 'to_envelope', label: 'Pasar a un sobre' },
] as const;

export function TermDepositScreen({ route }: RootProps<'TermDeposit'>) {
  const nav = useNavigation();
  const data = useLoad(loadGrow);
  const crc = data.data?.accounts.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const termRates = data.data?.rates.filter((r) => r.product === 'term') ?? [];
  const [amount, setAmount] = useState(500_000);
  const [term, setTerm] = useState(route.params.term);
  const [end, setEnd] = useState<(typeof END)[number]['value']>('renew');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef({ sig: '', key: newIdempotencyKey() });
  const rate = Number(termRates.find((r) => r.term_months === term)?.annual_rate ?? 0);
  const gain = (amount * rate) / 100 * (term / 12);
  const max = Math.max(50_000, Math.min(5_000_000, Math.floor(Number(crc?.balance ?? 5_000_000) / 50_000) * 50_000));

  async function open() {
    if (!crc) return;
    if (amount > Number(crc.balance)) return setError('No te alcanza el saldo de tu cuenta colones.');
    const sig = `${amount}|${term}|${end}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const r = await api.openTermDeposit({ from_account_id: crc.id, amount: amount.toFixed(2), term_months: term, on_maturity: end }, key.current.key);
      setReview(false);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs', params: { screen: 'Grow' } },
          {
            name: 'TransferDone',
            params: {
              hi: '¡Listo! Abriste tu ahorro a plazo',
              amount: amount.toFixed(2),
              back: 'Grow',
              rows: [
                ['Plazo', `${term} meses · ${pct(Number(r.annual_rate))}`],
                ['Vence', dayMonth(r.maturity_date)],
                ['Ganancia estimada', money(r.estimated_interest)],
                ['Al vencer', END.find((x) => x.value === end)?.label ?? ''],
                ['Comprobante', r.reference],
                ['Fecha', receiptDate()],
              ],
              shareText: `✅ Abrí un ahorro a plazo de ${money(amount)} a ${term} meses. Comprobante ${r.reference}.`,
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
    <Screen
      title="Ahorro a plazo"
      footer={
        <Btn
          label="Abrir ahorro a plazo"
          onPress={() => {
            if (crc && amount > Number(crc.balance)) return setError('No te alcanza el saldo de tu cuenta colones.');
            setError(null);
            setReview(true);
          }}
          disabled={!crc}
        />
      }
    >
      <Small>¿Cuánto querés invertir?</Small>
      <Text style={st.big}>{money(amount)}</Text>
      <Slider
        value={Math.min(amount, max)}
        minimumValue={50_000}
        maximumValue={max}
        step={50_000}
        onValueChange={setAmount}
        minimumTrackTintColor={colors.emerald}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.primary}
        accessibilityLabel="Monto a invertir"
      />
      <Small style={{ marginBottom: 6, marginTop: 4 }}>¿Por cuánto tiempo?</Small>
      <Chips
        options={termRates.map((r) => ({ value: r.term_months ?? 0, label: `${r.term_months} meses · ${Number(r.annual_rate)}%` }))}
        value={term}
        onChange={setTerm}
      />
      <View style={{ marginTop: 14 }}>
        <Hero title="Ganarías" sub="Intereses al vencer" big={money(gain)} up={`Tasa de ejemplo ${pct(rate)} · ${term} meses`} />
      </View>
      <Sect plain>Al vencer</Sect>
      <Chips options={[...END]} value={end} onChange={setEnd} />
      <ErrorText>{error ?? data.error}</ErrorText>
      <ReviewSheet
        visible={review}
        onClose={() => setReview(false)}
        title="Revisá antes de invertir"
        rows={[
          ['Monto', money(amount)],
          ['Plazo', `${term} meses · ${pct(rate)}`],
          ['Ganarías', money(gain)],
          ['Al vencer', END.find((x) => x.value === end)?.label ?? ''],
          ['Desde', 'Cuenta en colones'],
        ]}
        slideLabel="Deslizá para invertir"
        onConfirm={open}
        busy={busy}
        error={error}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount },
  goal: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginTop: 8 },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between' },
  goalName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  bar: { height: 7, backgroundColor: colors.card, borderRadius: 4, marginTop: 8, marginBottom: 4 },
  barFill: { height: 7, backgroundColor: colors.emerald, borderRadius: 4 },
  choice: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 8,
  },
  choiceT: { fontSize: 15, fontWeight: '700', color: colors.ink },
  mint: { backgroundColor: colors.mint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  heroBox: { position: 'relative' },
  heroBar: { position: 'absolute', left: 16, right: 16, bottom: 10, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.lime },
  big: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 12, marginBottom: 6 },
});
