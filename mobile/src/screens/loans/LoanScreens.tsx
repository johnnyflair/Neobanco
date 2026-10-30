// Préstamos (según el prototipo aprobado):
// simulador → opciones de plazo → revisar y firmar (con la clave) → dinero en la cuenta.
// Si se necesita más que el preaprobado: solicitud y seguimiento.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { LoanSim } from '../../api/types';
import { dayMonth, money, parseAmount, shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { AmountInput, Btn, Check, Chips, ErrorText, Field, Opt, Row, Screen, Sect, Small, StepBar, Steps, Tag } from '../../ui/kit';
import { usePin } from '../../ui/PinSheet';
import { receiptDate } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

const TERMS = [12, 24, 36, 48, 60];
const MIN = 100_000;

// Pedí un préstamo en pasos (aprobado, igual que el ahorro a plazo): 1) cuánto, 2) en cuánto
// tiempo, con la cuota de cada plazo a la vista, 3) revisar y firmar.
const QUICK = [500_000, 1_000_000, 1_500_000, 3_000_000];

export function LoanSimScreen() {
  const nav = useNavigation();
  const offer = useLoad(api.loanOffer);
  const max = Number(offer.data?.max_amount ?? 5_000_000);
  const [step, setStep] = useState(1);
  const [amountText, setAmountText] = useState('1500000');
  const amount = Number(amountText || 0);
  const [term, setTerm] = useState(36);
  const [sims, setSims] = useState<Record<number, LoanSim>>({});
  const [error, setError] = useState<string | null>(null);

  // Cuota de cada plazo calculada por la API (fuente de verdad) cuando se llega al paso 2.
  useEffect(() => {
    if (step !== 2) return;
    let alive = true;
    Promise.all(TERMS.map((t) => api.loanSimulate(amount, t).then((r) => [t, r] as const)))
      .then((rs) => alive && setSims(Object.fromEntries(rs)))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [step, amount]);

  function next() {
    setError(null);
    if (step === 1) {
      if (!amount || amount < MIN) return setError(`El mínimo es ${money(MIN).replace(/\.00$/, '')}.`);
      if (amount > max) return setError(`Tenés preaprobado hasta ${money(max)}. Para más, pedí otro monto.`);
      setSims({});
      return setStep(2);
    }
    const s = sims[term];
    if (!s) return;
    nav.navigate('LoanReview', { amount, term, monthly: s.monthly_payment, total: (Number(s.monthly_payment) * term).toFixed(2) });
  }

  const short = (v: number) => money(v).replace(/\.00$/, '');

  return (
    <Screen
      title="Pedí un préstamo"
      onBack={step > 1 ? () => setStep(1) : undefined}
      footer={
        <>
          <Btn label="Continuar" onPress={next} disabled={step === 2 && !sims[term]} />
          {step === 1 && <Btn label="¿Necesitás más? Pedí otro monto" variant="l" onPress={() => nav.navigate('LoanApply')} />}
        </>
      }
    >
      <StepBar n={step} total={3} />
      <Small>{`Paso ${step} de 3`}</Small>
      {step === 1 && (
        <>
          <Text style={st.ask}>¿Cuánto necesitás?</Text>
          <AmountInput value={amountText} onChange={setAmountText} autoFocus={false} label="Monto del préstamo" boxed />
          <View style={st.quick}>
            {QUICK.filter((v) => v <= max).map((v) => (
              <Pressable
                key={v}
                style={[st.quickChip, amount === v && st.quickOn]}
                onPress={() => setAmountText(String(v))}
                accessibilityRole="button"
                accessibilityState={{ selected: amount === v }}
              >
                <Text style={[st.quickText, amount === v && { color: colors.primaryInk }]}>{short(v)}</Text>
              </Pressable>
            ))}
          </View>
          <Small>{offer.data ? `Tenés preaprobado hasta ${money(offer.data.max_amount)}.` : 'Simulación sin compromiso.'}</Small>
        </>
      )}
      {step === 2 && (
        <>
          <Text style={st.ask}>{`¿En cuánto tiempo querés pagar ${short(amount)}?`}</Text>
          {TERMS.map((t) => (
            <Opt
              key={t}
              selected={t === term}
              onPress={() => setTerm(t)}
              title={`${t} meses`}
              sub={sims[t] ? `Total a pagar ${money(Number(sims[t].monthly_payment) * t)}` : undefined}
              right={
                <Text style={[st.fee, t === term && { color: colors.primary }]}>
                  {sims[t] ? <Cents style={st.fee}>{money(sims[t].monthly_payment)}</Cents> : '…'}
                  <Text style={st.feeSub}> al mes</Text>
                </Text>
              }
            />
          ))}
          <Small style={{ marginTop: 10 }}>
            {`Tasa de ejemplo ${sims[term]?.annual_rate ?? '18'}% anual. Más plazo: cuota más baja, pero pagás más intereses.`}
          </Small>
        </>
      )}
      <ErrorText>{error ?? offer.error}</ErrorText>
    </Screen>
  );
}

export function LoanOptionsScreen({ route }: RootProps<'LoanOptions'>) {
  const nav = useNavigation();
  const { amount, term } = route.params;
  const sim = useLoad(() => api.loanSimulate(amount, term));
  const [pick, setPick] = useState<number | null>(null);
  const options = sim.data?.options ?? [];
  const chosen = options.find((o) => o.term_months === pick) ?? options.find((o) => o.recommended) ?? options[0];

  return (
    <Screen
      title="Elegí cómo pagarlo"
      footer={
        <Btn
          label="Continuar"
          disabled={!chosen}
          onPress={() =>
            chosen &&
            nav.navigate('LoanReview', {
              amount,
              term: chosen.term_months,
              monthly: chosen.monthly_payment,
              total: chosen.total_paid,
            })
          }
        />
      }
    >
      <Small>Préstamo de {money(amount)}</Small>
      {options.map((o) => (
        <Opt
          key={o.label}
          selected={chosen?.term_months === o.term_months}
          onPress={() => setPick(o.term_months)}
          title={o.label}
          right={o.recommended ? <Tag>Recomendada</Tag> : undefined}
          sub={`${money(o.monthly_payment)} al mes · ${o.term_months} meses · total ${money(o.total_paid)}`}
        />
      ))}
      <ErrorText>{sim.error}</ErrorText>
    </Screen>
  );
}

export function LoanReviewScreen({ route }: RootProps<'LoanReview'>) {
  const nav = useNavigation();
  const ask = usePin();
  const { amount, term, monthly, total } = route.params;
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  async function sign() {
    if (!ok) return setError('Marcá la casilla para firmar.');
    if (!crc) return;
    const pin = await ask({ title: 'Firmar el préstamo', sub: `Confirmá con tu clave el préstamo de ${money(amount)}.` });
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.loanDisburse(amount, term, crc.id, pin, key.current);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              hi: 'Tu préstamo ya está en tu cuenta',
              face: 'guau',
              amount: r.amount,
              rows: [
                ['Plazo', `${r.term_months} meses`],
                ['Cuota', money(r.monthly_payment)],
                ['Primera cuota', dayMonth(r.first_due)],
                ['Depósito en', 'Cuenta en colones'],
                ['Comprobante', r.reference],
                ['Fecha', receiptDate()],
              ],
              next: { label: 'Apartar una parte en un sobre', route: 'NewEnvelope' },
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
    <Screen title="Revisá y firmá" footer={<Btn label="Firmar con mi clave" icon="lock" onPress={sign} loading={busy} />}>
      <StepBar n={3} total={3} />
      <Small style={{ marginBottom: 8 }}>Paso 3 de 3</Small>
      <Row first title="Monto" right={<Cents style={st.amt}>{money(amount)}</Cents>} />
      <Row title="Cuota" right={<Cents style={st.amt}>{money(monthly)}</Cents>} />
      <Row title="Plazo" right={<Text style={st.amt}>{term} meses</Text>} />
      <Row title="Total a pagar" right={<Cents style={st.amt}>{money(total)}</Cents>} />
      <Row title="Depósito en" right={<Small>Cuenta colones</Small>} />
      <Row title="Pago automático" right={<Text style={[st.amt, { color: colors.emeraldDark }]}>Día 15</Text>} />
      <Check checked={ok} onChange={setOk} label="Leí el contrato y las condiciones" />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const INCOME = [
  { value: 'asalariado', label: 'Asalariado' },
  { value: 'independiente', label: 'Independiente' },
  { value: 'pensionado', label: 'Pensionado' },
] as const;

export function LoanApplyScreen() {
  const nav = useNavigation();
  const [incomeType, setIncomeType] = useState<(typeof INCOME)[number]['value']>('asalariado');
  const [income, setIncome] = useState('');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState(36);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const inc = parseAmount(income);
    const amt = parseAmount(amount);
    if (!inc) return setError('Escribí tu ingreso mensual.');
    if (!amt || Number(amt) < MIN) return setError(`El monto mínimo es ${money(MIN)}.`);
    setBusy(true);
    setError(null);
    try {
      await api.loanApply({ amount: Number(amt), term_months: term, income_type: incomeType, monthly_income: inc });
      nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'LoanTrack' }] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Solicitá tu préstamo" footer={<Btn label="Enviar solicitud" onPress={send} loading={busy} />}>
      <Small>Te respondemos el mismo día hábil</Small>
      <Sect plain>¿Cómo generás ingresos?</Sect>
      <Chips options={[...INCOME]} value={incomeType} onChange={setIncomeType} />
      <Field label="Ingreso mensual (₡)" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="850,000" />
      <Field label="Monto que necesitás (₡)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="2,000,000" />
      <Sect plain>Plazo en meses</Sect>
      <Chips options={TERMS.map((n) => ({ value: n, label: String(n) }))} value={term} onChange={setTerm} />
      <Small style={{ marginTop: 12 }}>
        Si hace falta, un asesor te pide la constancia de salario por WhatsApp. No tenés que ir a ninguna oficina.
      </Small>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const STEP_OF: Record<string, number> = { received: 2, analysis: 3, approved: 4, rejected: 4, disbursed: 4 };

export function LoanTrackScreen() {
  const nav = useNavigation();
  const apps = useLoad(api.loanApplications);
  const app = apps.data?.find((a) => a.status !== 'disbursed');
  const step = app ? (STEP_OF[app.status] ?? 2) + 1 : 0;
  const steps = [
    { t: 'Recibida', s: app ? shortDate(app.created_at) : '' },
    { t: 'Documentos verificados', s: 'Con los datos de tu perfil' },
    { t: 'En análisis', s: 'Respuesta estimada: hoy' },
    { t: 'Respuesta', s: 'Te avisamos por notificación y WhatsApp' },
  ];
  return (
    <Screen title="Tu solicitud va en camino">
      {app ? (
        <>
          <Small style={{ marginBottom: 16 }}>
            {money(app.amount)} a {app.term_months} meses · te avisamos por notificación y WhatsApp
          </Small>
          <Steps steps={steps} current={step} />
        </>
      ) : (
        <Small>{apps.data ? 'No tenés solicitudes en curso.' : 'Cargando…'}</Small>
      )}
      <Btn label="Ir al inicio" variant="o" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
      <ErrorText>{apps.error}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  ask: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 10, marginBottom: 8, lineHeight: 28 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickChip: { borderWidth: 1.5, borderColor: colors.fieldBorder, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  quickOn: { borderColor: colors.primary, backgroundColor: colors.optOn },
  quickText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  fee: { fontSize: 16, fontWeight: '700', color: colors.amount },
  feeSub: { fontSize: 13, fontWeight: '400', color: colors.muted },
  amount: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 12, marginBottom: 6 },
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount },
  mint: { backgroundColor: colors.mint, borderRadius: radius.md, padding: 12, marginTop: 18 },
});
