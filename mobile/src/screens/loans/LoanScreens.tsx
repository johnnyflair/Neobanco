// Préstamos (según el prototipo aprobado):
// simulador → opciones de plazo → revisar y firmar (con la clave) → dinero en la cuenta.
// Si se necesita más que el preaprobado: solicitud y seguimiento.
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { LoanSim } from '../../api/types';
import { dayMonth, money, parseAmount, shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Btn, Check, Chips, Done, ErrorText, Field, Hero, Opt, Row, Screen, Sect, Small, Steps, Tag } from '../../ui/kit';
import { usePin } from '../../ui/PinSheet';
import { Text } from '../../ui/typography';

const TERMS = [12, 24, 36, 48, 60];
const MIN = 100_000;

export function LoanSimScreen() {
  const nav = useNavigation();
  const offer = useLoad(api.loanOffer);
  const max = Number(offer.data?.max_amount ?? 5_000_000);
  const [amount, setAmount] = useState(1_500_000);
  const [term, setTerm] = useState(36);
  const [sim, setSim] = useState<LoanSim | null>(null);

  // Cuota calculada por la API (fuente de verdad), con una pequeña espera mientras se arrastra.
  useEffect(() => {
    const t = setTimeout(() => api.loanSimulate(amount, term).then(setSim, () => setSim(null)), 200);
    return () => clearTimeout(t);
  }, [amount, term]);

  return (
    <Screen
      title="¿Cuánto necesitás?"
      footer={
        <>
          <Btn label="Ver mis opciones" onPress={() => nav.navigate('LoanOptions', { amount, term })} disabled={!sim} />
          <Btn label="¿Necesitás más? Pedí otro monto" variant="l" onPress={() => nav.navigate('LoanApply')} />
        </>
      }
    >
      <Small>{offer.data ? `Preaprobado hasta ${money(offer.data.max_amount)}` : 'Simulación sin compromiso'}</Small>
      <Text style={st.amount}>{money(amount)}</Text>
      <Slider
        value={amount}
        minimumValue={MIN}
        maximumValue={max}
        step={50_000}
        onValueChange={setAmount}
        minimumTrackTintColor={colors.emerald}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.primary}
        accessibilityLabel="Monto del préstamo"
      />
      <Small style={{ marginBottom: 6, marginTop: 4 }}>Plazo en meses</Small>
      <Chips options={TERMS.map((n) => ({ value: n, label: String(n) }))} value={term} onChange={setTerm} />
      <View style={{ marginTop: 14 }}>
        <Hero
          title="Cuota mensual"
          sub="Estimada según monto y plazo"
          big={sim ? money(sim.monthly_payment) : '…'}
          up={`Tasa de ejemplo ${sim?.annual_rate ?? '18'}% anual`}
        />
      </View>
      <ErrorText>{offer.error}</ErrorText>
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
      nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'LoanDone', params: { amount: r.amount, firstDue: r.first_due } }] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Revisá y firmá" footer={<Btn label="Firmar con mi clave" icon="lock" onPress={sign} loading={busy} />}>
      <Row first title="Monto" right={<Text style={st.amt}>{money(amount)}</Text>} />
      <Row title="Cuota" right={<Text style={st.amt}>{money(monthly)}</Text>} />
      <Row title="Plazo" right={<Text style={st.amt}>{term} meses</Text>} />
      <Row title="Total a pagar" right={<Text style={st.amt}>{money(total)}</Text>} />
      <Row title="Depósito en" right={<Small>Cuenta colones</Small>} />
      <Row title="Pago automático" right={<Text style={[st.amt, { color: colors.emeraldDark }]}>Día 15</Text>} />
      <Check checked={ok} onChange={setOk} label="Leí el contrato y las condiciones" />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

export function LoanDoneScreen({ route }: RootProps<'LoanDone'>) {
  const nav = useNavigation();
  const { amount, firstDue } = route.params;
  return (
    <Done title={`${money(amount)} en tu cuenta`} sub={`Primera cuota: ${dayMonth(firstDue)}`}>
      <View style={st.mint}>
        <Text style={{ color: colors.primaryInk, fontSize: 14 }}>¿Querés apartar una parte? Creá un sobre y ganá 50 puntos.</Text>
      </View>
      <Btn label="Crear sobre" variant="o" onPress={() => nav.navigate('NewEnvelope')} />
      <Btn label="Ir al inicio" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
    </Done>
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
      <Sect>¿Cómo generás ingresos?</Sect>
      <Chips options={[...INCOME]} value={incomeType} onChange={setIncomeType} />
      <Field label="Ingreso mensual (₡)" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="850,000" />
      <Field label="Monto que necesitás (₡)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="2,000,000" />
      <Sect>Plazo en meses</Sect>
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
  amount: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.ink, marginTop: 12, marginBottom: 6 },
  amt: { fontSize: 14, fontWeight: '600', color: colors.ink },
  mint: { backgroundColor: colors.mint, borderRadius: radius.md, padding: 12, marginTop: 18 },
});
