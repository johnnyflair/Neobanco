// Invertir (según el prototipo aprobado): sobres a la vista y ahorros a plazo.
// - Pestaña Invertir: total, sobres con su meta, plazos con vencimiento, tasas.
// - Crear: sobre (meta, meses, forma de ahorrar) o ahorro a plazo (monto, plazo, qué hacer al vencer).
// - Sobre: meter y sacar dinero.
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
import { AmountInput, Btn, ErrorText, Field, Hero, Loading, Opt, Row, Screen, Sect, Small, StepBar } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

const pct = (r: string | number) => `${Number(r).toLocaleString('en-US', { maximumFractionDigits: 2 })}% anual`;
const ON_MATURITY: Record<string, string> = { renew: 'se renueva', to_account: 'pasa a tu cuenta', to_envelope: 'pasa a un sobre' };

async function loadGrow() {
  const [accounts, rates] = await Promise.all([api.accounts(), api.rates()]);
  return { accounts, rates };
}

/** "₡300,000.00" → "₡300,000" para la meta (la meta es un número redondo). */
const moneyShort = (v: string) => money(v).replace(/\.00$/, '');
/** "Monto fijo · ₡5,000.00 por quincena" → "Monto fijo": el detalle se ve dentro del sobre. */
const shortMode = (m?: string | null) => (m ? m.split(' · ')[0] : null);

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
        sub="Tu dinero trabajando"
        big={money(sob + pl)}
        lines={[
          [`En ${envelopes.length} ${envelopes.length === 1 ? 'sobre' : 'sobres'}`, money(sob)],
          ['A plazo', money(pl)],
        ]}
      />
      <Btn label="Crear ahorro" icon="plus" onPress={() => nav.navigate('NewSaving')} />

      <Sect sub="Sacás cuando querés">Sobres a la vista</Sect>
      {envelopes.map((a, i) => {
        const p = progress(a);
        // Sobres sin recuadro (aprobado): ícono de sobre junto al nombre, línea fina entre uno y otro.
        return (
          <Pressable
            key={a.id}
            style={({ pressed }) => [st.goal, i === 0 && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
            onPress={() => nav.navigate('Envelope', { account: a })}
            accessibilityRole="button"
          >
            <View style={st.goalHead}>
              <Icon name="mail" size={20} color={colors.primary} />
              <Text style={st.goalName} numberOfLines={1}>
                {a.name}
              </Text>
              <Cents style={st.amt}>{money(a.balance)}</Cents>
              <Icon name="chev" size={15} color={colors.muted} />
            </View>
            <View style={st.goalBody}>
              <View style={st.bar}>
                <View style={[st.barFill, { width: `${p}%` }]} />
              </View>
              <Small>{[a.goal_amount ? `${p}% de ${moneyShort(a.goal_amount)}` : 'Sin meta', shortMode(a.savings_mode)].filter(Boolean).join(' · ')}</Small>
            </View>
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
          title={`Plazo ${a.term_months} meses · ${Number(a.rate ?? 0)}%`}
          sub={`Vence ${a.maturity_date ? dayMonth(a.maturity_date) : ''} · ${ON_MATURITY[a.on_maturity ?? 'renew'] ?? ''}`}
          right={<Cents style={st.amt}>{money(a.balance)}</Cents>}
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
        <Icon name="mail" size={24} color={colors.emeraldDark} />
        <View style={{ flex: 1 }}>
          <Text style={st.choiceT}>Sobre a la vista</Text>
          <Small>Separá dinero para algo. Agregás y retirás cuando querás. Tasa de ejemplo 3% anual.</Small>
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
              hi: `Creaste tu sobre «${a.name}»`,
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
  const nav = useNavigation();
  const [env, setEnv] = useState<Account>(route.params.account);
  // Eliminar sobre (opción A): link rojo al final; confirma con hoja y deslizador rojo.
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const closeKey = useRef(newIdempotencyKey());
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
      setMsg(direction === 'deposit' ? `Agregaste ${money(amt)} a ${env.name}` : `Retiraste ${money(amt)} de ${env.name}`);
      accounts.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function closeEnvelope() {
    if (!crc) return;
    setCloseBusy(true);
    setCloseError(null);
    try {
      const r = await api.envelopeClose(env.id, crc.id, closeKey.current);
      setClosing(false);
      // Al terminar, "Listo" vuelve a Invertir (el sobre ya no aparece ahí).
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs', params: { screen: 'Grow' } },
          {
            name: 'TransferDone',
            params: {
              hi: `Eliminaste el sobre «${env.name}»`,
              amountLabel: Number(r.returned) > 0 ? 'Volvió a tu cuenta' : undefined,
              amount: Number(r.returned) > 0 ? r.returned : undefined,
              back: 'Grow',
              rows: [
                ['Sobre', env.name],
                ['Volvió a', 'Cuenta colones'],
                ...(r.reference ? ([['Comprobante', r.reference]] as [string, string][]) : []),
                ['Ahorro automático', 'Apagado'],
                ['Fecha', receiptDate()],
              ],
            },
          },
        ],
      });
    } catch (e) {
      setCloseError(errorMessage(e));
    } finally {
      setCloseBusy(false);
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
      <Text style={st.moveLabel}>¿Cuánto querés mover?</Text>
      <AmountInput value={amount} onChange={setAmount} autoFocus={false} label="Monto a mover" boxed />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Agregar al sobre" icon="plus" onPress={() => move('deposit')} loading={busy === 'deposit'} style={{ flex: 1 }} />
        <Btn label="Retirar" icon="minus" variant="o" onPress={() => move('withdraw')} loading={busy === 'withdraw'} style={{ flex: 1 }} />
      </View>
      <Small center>{`Se mueve desde y hacia tu cuenta colones (${crc ? money(crc.balance) : '…'})`}</Small>
      {msg && <Small center style={{ marginTop: 8, color: colors.emeraldDark }}>{msg}</Small>}
      <ErrorText>{error}</ErrorText>
      <View style={{ marginTop: 12 }}>
        <Row title="Ahorro automático" sub={env.savings_mode ?? 'Sin ahorro automático'} />
        <Row title="Tasa a la vista" right={<Text style={st.amt}>{pct(env.rate ?? 3)}</Text>} />
        <Row title="Retiros" right={<Text style={[st.amt, { color: colors.emeraldDark }]}>Cuando querás, sin costo</Text>} />
      </View>
      <Pressable
        style={({ pressed }) => [st.delete, pressed && { opacity: 0.6 }]}
        onPress={() => {
          setCloseError(null);
          setClosing(true);
        }}
        accessibilityRole="button"
      >
        <Icon name="trash" size={18} color={colors.danger} />
        <Text style={st.deleteText}>Eliminar sobre</Text>
      </Pressable>
      <ReviewSheet
        visible={closing}
        onClose={() => setClosing(false)}
        danger
        title={`¿Eliminar "${env.name}"?`}
        note="El saldo vuelve a tu cuenta y se apaga el ahorro automático. No se puede deshacer."
        rows={[
          ['Vuelve a', 'Cuenta colones'],
          ['Monto', money(env.balance)],
          ['Ahorro automático', 'Se apaga'],
        ]}
        slideLabel="Deslizá para eliminar"
        onConfirm={closeEnvelope}
        busy={closeBusy}
        error={closeError}
      />
    </Screen>
  );
}

const END = [
  { value: 'renew', label: 'Volver a ahorrar' },
  { value: 'to_account', label: 'Pasarlo a mi cuenta' },
  { value: 'to_envelope', label: 'Pasarlo a un sobre' },
] as const;

// Ahorro a plazo (opción B aprobada): una pregunta por pantalla, como la apertura de cuenta.
// 1) cuánto, 2) por cuánto tiempo (cada plazo muestra cuánto ganás), 3) qué hacer al terminar.
const QUICK_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000];
const END_SUB: Record<(typeof END)[number]['value'], string> = {
  renew: 'Se vuelve a ahorrar solo, por el mismo plazo',
  to_account: 'El dinero y los intereses vuelven a tu cuenta colones',
  to_envelope: 'Todo pasa a uno de tus sobres',
};

export function TermDepositScreen({ route }: RootProps<'TermDeposit'>) {
  const nav = useNavigation();
  const data = useLoad(loadGrow);
  const crc = data.data?.accounts.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const termRates = data.data?.rates.filter((r) => r.product === 'term') ?? [];
  const [step, setStep] = useState(1);
  const [amountText, setAmountText] = useState('100000');
  const amount = Number(amountText || 0);
  const [term, setTerm] = useState(route.params.term);
  const [end, setEnd] = useState<(typeof END)[number]['value']>('renew');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef({ sig: '', key: newIdempotencyKey() });
  const rateOf = (m: number) => Number(termRates.find((r) => r.term_months === m)?.annual_rate ?? 0);
  const gainOf = (m: number) => ((amount * rateOf(m)) / 100) * (m / 12);
  const rate = rateOf(term);
  const gain = gainOf(term);

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
              hi: 'Abriste tu ahorro a plazo',
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

  function next() {
    setError(null);
    if (step === 1) {
      if (!amount || amount < 50_000) return setError('El mínimo es ₡50,000.');
      if (crc && amount > Number(crc.balance)) return setError('No te alcanza el saldo de tu cuenta colones.');
    }
    if (step < 3) return setStep(step + 1);
    setReview(true);
  }

  const shortMoney = (v: number) => money(v).replace(/\.00$/, '');

  return (
    <Screen
      title="Ahorro a plazo"
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
      footer={<Btn label={step < 3 ? 'Continuar' : 'Revisar y abrir'} onPress={next} disabled={!crc} />}
    >
      <StepBar n={step} total={3} />
      <Small>{`Paso ${step} de 3`}</Small>

      {step === 1 && (
        <>
          <Text style={st.ask}>¿Cuánto querés ahorrar?</Text>
          <AmountInput value={amountText} onChange={setAmountText} autoFocus={false} label="Monto a ahorrar" boxed />
          <View style={st.quick}>
            {QUICK_AMOUNTS.filter((v) => !crc || v <= Number(crc.balance)).map((v) => (
              <Pressable
                key={v}
                style={[st.quickChip, amount === v && st.quickOn]}
                onPress={() => setAmountText(String(v))}
                accessibilityRole="button"
                accessibilityState={{ selected: amount === v }}
              >
                <Text style={[st.quickText, amount === v && { color: colors.primaryInk }]}>{shortMoney(v)}</Text>
              </Pressable>
            ))}
          </View>
          {crc && <Small>{`Tenés ${money(crc.balance)} en tu cuenta colones.`}</Small>}
        </>
      )}

      {step === 2 && (
        <>
          <Text style={st.ask}>{`¿Por cuánto tiempo querés ahorrar ${shortMoney(amount)}?`}</Text>
          {termRates.map((r) => {
            const m = r.term_months ?? 0;
            return (
              <Opt
                key={m}
                selected={m === term}
                onPress={() => setTerm(m)}
                title={`${m} meses`}
                sub={`${Number(r.annual_rate)}% anual`}
                right={
                  <Text style={[st.gain, m === term && { color: colors.primary }]}>
                    ganás <Cents style={st.gain}>{money(gainOf(m))}</Cents>
                  </Text>
                }
              />
            );
          })}
          <Small style={{ marginTop: 10 }}>Tasas de ejemplo. Más plazo, mejor tasa.</Small>
        </>
      )}

      {step === 3 && (
        <>
          <Text style={st.ask}>Cuando termine el plazo, ¿qué hacemos con tu dinero?</Text>
          {END.map((e) => (
            <Opt key={e.value} selected={e.value === end} onPress={() => setEnd(e.value)} title={e.label} sub={END_SUB[e.value]} />
          ))}
          <View style={{ marginTop: 16 }}>
            <Row first title="Ahorrás" right={<Cents style={st.amt}>{money(amount)}</Cents>} />
            <Row title={`Por ${term} meses · ${pct(rate)}`} right={<Cents style={[st.amt, { color: colors.primary }]}>{`+${money(gain)}`}</Cents>} />
          </View>
        </>
      )}
      <ErrorText>{error ?? data.error}</ErrorText>
      <ReviewSheet
        visible={review}
        onClose={() => setReview(false)}
        title="Revisá antes de abrir"
        rows={[
          ['Monto', money(amount)],
          ['Plazo', `${term} meses · ${pct(rate)}`],
          ['Ganarías', money(gain)],
          ['Al terminar', END.find((x) => x.value === end)?.label ?? ''],
          ['Desde', 'Cuenta en colones'],
        ]}
        slideLabel="Deslizá para abrir"
        onConfirm={open}
        busy={busy}
        error={error}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  ask: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 10, marginBottom: 8, lineHeight: 28 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickChip: { borderWidth: 1.5, borderColor: colors.fieldBorder, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  quickOn: { borderColor: colors.primary, backgroundColor: colors.optOn },
  quickText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  gain: { fontSize: 15, fontWeight: '600', color: colors.amount },
  moveLabel: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 18 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28, paddingVertical: 10 },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount },
  goal: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  goalBody: { paddingLeft: 28, paddingRight: 23 },
  bar: { height: 5, backgroundColor: colors.card, borderRadius: 3, marginTop: 8, marginBottom: 5 },
  barFill: { height: 5, backgroundColor: colors.primary, borderRadius: 3 },
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
  heroBox: { marginBottom: 14 },
  heroBar: { height: 6, borderRadius: 3, backgroundColor: colors.card, marginTop: 8 },
  heroBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  big: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 12, marginBottom: 6 },
});
