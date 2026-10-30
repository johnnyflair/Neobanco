// Ahorro (sobres a la vista) e Invertir (ahorros a plazo), cada uno en su pestaña.
// - Ahorro: total en sobres y cada sobre con su meta. Invertir: total, plazos y tasas de hoy.
// - Crear: sobre (meta, meses, forma de ahorrar) o ahorro a plazo (monto, plazo, qué hacer al vencer).
// - Sobre: meter y sacar dinero.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { Account } from '../../api/types';
import { dayMonth, longDate, money, parseAmount } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { AmountInput, Btn, ErrorText, Field, FieldStacked, Hero, Loading, Opt, Row, Screen, Sect, Small, StepBar } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

const pct = (r: string | number) => `${Number(r).toLocaleString('en-US', { maximumFractionDigits: 2 })}% anual`;
const ON_MATURITY: Record<string, string> = { renew: 'se renueva', to_account: 'a tu cuenta', to_envelope: 'a un sobre' };

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

// Ahorro e Invertir separados en el menú (aprobado): "Ahorro" son los sobres (se saca cuando
// se quiere) e "Invertir" los ahorros a plazo (ganan más, con fecha). Cada uno con su total y su
// botón de crear arriba.
export function SaveScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(loadGrow);
  if (!data) return error ? <Screen title="Ahorro" back={false}><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const envelopes = data.accounts.filter((a) => a.type === 'envelope');
  const total = envelopes.reduce((acc, a) => acc + Number(a.balance), 0);

  return (
    <Screen title="Ahorro" back={false}>
      <Small>Sacás cuando querás</Small>
      <View style={{ marginTop: 14 }}>
        <Hero title="Tenés en sobres" big={money(total)} />
      </View>
      {/* Sin sobres, el botón va arriba; con sobres, debajo de la lista. */}
      {!envelopes.length && <Btn label="Crear un sobre" icon="plus" onPress={() => nav.navigate('NewEnvelope')} />}
      {envelopes.length > 0 && <Sect>Mis sobres</Sect>}
      {envelopes.map((a, i) => {
        const p = progress(a);
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
              {a.goal_amount ? (
                <View style={st.bar}>
                  <View style={[st.barFill, { width: `${p}%` }]} />
                </View>
              ) : null}
              <Small>{[a.goal_amount ? `${p}% de ${moneyShort(a.goal_amount)}` : 'Sin meta', shortMode(a.savings_mode)].filter(Boolean).join(' · ')}</Small>
            </View>
          </Pressable>
        );
      })}
      {!envelopes.length && <Small style={{ marginTop: 10 }}>Todavía no tenés sobres. Creá uno para tu próxima meta.</Small>}
      {envelopes.length > 0 && <Btn label="Crear otro sobre" icon="plus" variant="o" onPress={() => nav.navigate('NewEnvelope')} />}
    </Screen>
  );
}

export function GrowScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(loadGrow);
  if (!data) return error ? <Screen title="Invertir" back={false}><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const terms = data.accounts.filter((a) => a.type === 'term');
  const total = terms.reduce((acc, a) => acc + Number(a.balance), 0);
  const rates = data.rates.filter((r) => r.product === 'term' && r.term_months);
  const months = rates.map((r) => r.term_months as number);
  const firstTerm = months.includes(6) ? 6 : (months[0] ?? 6);

  return (
    <Screen title="Invertir" back={false}>
      <Small>Ganan más, con fecha de vencimiento</Small>
      <View style={{ marginTop: 14 }}>
        <Hero title="Tenés invertido" big={money(total)} />
      </View>
      {!terms.length && <Btn label="Nuevo ahorro a plazo" icon="plus" onPress={() => nav.navigate('TermDeposit', { term: firstTerm })} />}
      {terms.length > 0 && <Sect>Mis ahorros a plazo</Sect>}
      {terms.map((a, i) => (
        <Row
          key={a.id}
          first={i === 0}
          icon="lock"
          title={`${a.term_months} meses · ${Number(a.rate ?? 0)}%`}
          sub={`Vence el ${a.maturity_date ? longDate(a.maturity_date) : ''} · ${ON_MATURITY[a.on_maturity ?? 'renew'] ?? ''}`}
          right={<Cents style={st.amt}>{money(a.balance)}</Cents>}
        />
      ))}
      {!terms.length && <Small style={{ marginTop: 10 }}>Todavía no tenés ahorros a plazo. Abrí uno desde ₡50,000.</Small>}
      {terms.length > 0 && <Btn label="Abrir otro ahorro a plazo" icon="plus" variant="o" onPress={() => nav.navigate('TermDeposit', { term: firstTerm })} />}
      {rates.length > 0 && (
        <>
          <Sect sub="Tasa fija por todo el plazo">Tasas de hoy</Sect>
          {rates.map((r, i) => (
            <Row
              key={r.term_months}
              first={i === 0}
              title={`${r.term_months} meses`}
              right={<Text style={st.amt}>{pctShort(Number(r.annual_rate))}</Text>}
              onPress={() => nav.navigate('TermDeposit', { term: r.term_months as number })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

/** Tasa corta para la píldora: "3%" / "7.5%". */
const pctShort = (r: number) => `${r.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** Bullet con check esmeralda (opción 1A). */
const Bullet = ({ children }: { children: string }) => (
  <View style={st.bullet}>
    <Icon name="check" size={16} color={colors.primary} />
    <Text style={st.bulletT}>{children}</Text>
  </View>
);

// Opción 1A (aprobada): tasa en píldora junto al título, bullets con check y el ahorro a plazo
// destacado con borde esmeralda. Tasas y plazos salen del panel (api.rates), no del código.
/** Las dos opciones para crear (opción 1A aprobada). Se usan en la pestaña «Crear nuevo» de
 *  Invertir y en la pantalla «¿Qué querés crear?». */
function CreateChoices() {
  const nav = useNavigation();
  const { data: rates } = useLoad(api.rates);
  const vista = rates?.find((r) => r.product === 'envelope');
  const terms = (rates ?? []).filter((r) => r.product === 'term' && r.term_months);
  const months = terms.map((r) => r.term_months as number);
  const minM = months.length ? Math.min(...months) : 3;
  const maxM = months.length ? Math.max(...months) : 36;
  const best = terms.length ? Math.max(...terms.map((r) => Number(r.annual_rate))) : null;
  const firstTerm = months.includes(6) ? 6 : (months[0] ?? 6);

  return (
    <>
      <Small>Elegí cómo querés guardar tu dinero</Small>

      <Pressable
        style={({ pressed }) => [st.choice, pressed && { opacity: 0.7 }]}
        onPress={() => nav.navigate('NewEnvelope')}
        accessibilityRole="button"
        accessibilityLabel={`Sobre a la vista${vista ? `, ${pct(vista.annual_rate)}` : ''}`}
      >
        <View style={st.choiceHead}>
          <View style={[st.choiceIcon, { backgroundColor: colors.mint }]}>
            <Icon name="mail" size={22} color={colors.emeraldDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.choiceT}>Sobre a la vista</Text>
            <Text style={st.choiceSub}>Para metas del día a día</Text>
          </View>
          {vista && (
            <View style={[st.pill, { backgroundColor: colors.mint }]}>
              <Text style={[st.pillT, { color: colors.primaryInk }]}>{pct(vista.annual_rate)}</Text>
            </View>
          )}
        </View>
        <View style={st.bullets}>
          <Bullet>Agregás y retirás cuando querás</Bullet>
          <Bullet>Ahorro automático o por redondeo</Bullet>
          <Bullet>Ideal para marchamo, aguinaldo, viajes</Bullet>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [st.choice, st.choiceOn, pressed && { opacity: 0.7 }]}
        onPress={() => nav.navigate('TermDeposit', { term: firstTerm })}
        accessibilityRole="button"
        accessibilityLabel={`Ahorro a plazo${best != null ? `, hasta ${pctShort(best)} anual` : ''}`}
      >
        <View style={st.choiceHead}>
          <View style={[st.choiceIcon, { backgroundColor: colors.limeSoft }]}>
            <Icon name="lock" size={22} color={colors.limeInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.choiceT}>Ahorro a plazo</Text>
            <Text style={st.choiceSub}>Para hacer crecer tu dinero</Text>
          </View>
          {best != null && (
            <View style={[st.pill, { backgroundColor: colors.lime }]}>
              <Text style={[st.pillT, { color: colors.limeInk }]}>hasta {pctShort(best)}</Text>
            </View>
          )}
        </View>
        <View style={st.bullets}>
          <Bullet>{`Plazos de ${minM} a ${maxM} meses`}</Bullet>
          <Bullet>Más plazo, mejor tasa</Bullet>
          <Bullet>Tasa fija garantizada</Bullet>
        </View>
      </Pressable>

      <Small style={{ marginTop: 10, fontSize: 13 }}>Tasas de ejemplo. Sujetas a cambio.</Small>
    </>
  );
}

export function NewSavingScreen() {
  return (
    <Screen title="¿Qué querés crear?">
      <CreateChoices />
    </Screen>
  );
}


const ENVELOPE_IDEAS = ['Marchamo', 'Aguinaldo', 'Vacaciones', 'Emergencias'];

const MODES = [
  { value: 'fixed', title: 'Monto fijo', sub: 'Cada pago de salario' },
  { value: 'roundup', title: 'Redondeo', sub: 'Cada compra se redondea y la diferencia se ahorra' },
  { value: 'percent', title: 'Porcentaje', sub: 'Un % de todo lo que entra' },
] as const;

/** Nuevo sobre: solo el nombre (aprobado). La meta y el ahorro automático se configuran después,
 *  dentro del sobre. */
export function NewEnvelopeScreen() {
  const nav = useNavigation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) return setError('Ponele un nombre al sobre.');
    setBusy(true);
    setError(null);
    try {
      const a = await api.createEnvelope({ name: name.trim() });
      // Directo al sobre recién creado, para meterle plata o configurarlo.
      nav.reset({ index: 1, routes: [{ name: 'Tabs', params: { screen: 'Save' } }, { name: 'Envelope', params: { account: a, created: true } }] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Nuevo sobre" footer={<Btn label="Crear sobre" onPress={create} loading={busy} />}>
      <Small>Dinero separado que podés usar cuando querás. Después le podés poner una meta.</Small>
      <FieldStacked label="¿Para qué es este sobre?" value={name} onChangeText={setName} placeholder="Ej: Marchamo 2027" autoFocus onSubmitEditing={create} />
      <View style={st.ideas}>
        {ENVELOPE_IDEAS.map((idea) => {
          const on = name.trim() === idea;
          return (
            <Pressable
              key={idea}
              style={({ pressed }) => [st.idea, on && st.ideaOn, pressed && { opacity: 0.7 }]}
              onPress={() => setName(idea)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[st.ideaT, on && { color: colors.primaryInk }]}>{idea}</Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

type ModeValue = (typeof MODES)[number]['value'];
const modeFrom = (text?: string | null): ModeValue | 'none' =>
  !text ? 'none' : text.startsWith('Monto fijo') ? 'fixed' : text.startsWith('Redondeo') ? 'roundup' : 'percent';

/** Configurar sobre: nombre, meta (opcional) y forma de ahorrar (o ninguna). */
export function EnvelopeSettingsScreen({ route }: RootProps<'EnvelopeSettings'>) {
  const nav = useNavigation();
  const env = route.params.account;
  const [name, setName] = useState(env.name);
  const [goal, setGoal] = useState(env.goal_amount ? String(Math.round(Number(env.goal_amount))) : '');
  const [months, setMonths] = useState('');
  const [mode, setMode] = useState<ModeValue | 'none'>(modeFrom(env.savings_mode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = Number(parseAmount(goal) ?? 0);
  const m = Math.max(1, Math.min(60, Number(months) || 1));

  async function save() {
    if (name.trim().length < 2) return setError('Ponele un nombre al sobre.');
    if (mode === 'fixed' && (!g || !Number(months))) return setError('Para ahorrar un monto fijo, poné la meta y en cuántos meses.');
    setBusy(true);
    setError(null);
    try {
      const a = await api.configureEnvelope(env.id, {
        name: name.trim(),
        ...(g ? { goal_amount: g.toFixed(2) } : {}),
        ...(Number(months) ? { months: m } : {}),
        ...(mode !== 'none' ? { mode } : {}),
      });
      nav.navigate('Envelope', { account: a });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Configurar sobre" footer={<Btn label="Guardar" onPress={save} loading={busy} />}>
      <FieldStacked label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Marchamo 2027" />
      <FieldStacked label="Meta (₡), opcional" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="Ej: 250,000" />
      <FieldStacked
        label="¿En cuántos meses?, opcional"
        value={months}
        onChangeText={(v) => setMonths(v.replace(/\D/g, '').slice(0, 2))}
        keyboardType="number-pad"
        placeholder="Ej: 12"
      />
      {g > 0 && Number(months) > 0 && mode === 'fixed' && (
        <View style={st.mint}>
          <Text style={{ color: colors.primaryInk, fontSize: 14 }}>Son {money(g / (m * 2))} por quincena</Text>
        </View>
      )}
      <Sect plain>¿Cómo querés ahorrar?</Sect>
      <Opt selected={mode === 'none'} onPress={() => setMode('none')} title="Yo lo agrego cuando quiera" sub="Sin ahorro automático" />
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
  // Al volver de "Configurar sobre", el sobre llega actualizado en los parámetros.
  useEffect(() => setEnv(route.params.account), [route.params.account]);
  // Eliminar sobre (opción A): link rojo al final; confirma con hoja y deslizador rojo.
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const closeKey = useRef(newIdempotencyKey());
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [amount, setAmount] = useState('10000');
  const [busy, setBusy] = useState<'deposit' | 'withdraw' | null>(null);
  const [msg, setMsg] = useState<string | null>(route.params.created ? 'Listo, creaste tu sobre. Ganaste 50 puntos.' : null);
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
          { name: 'Tabs', params: { screen: 'Save' } },
          {
            name: 'TransferDone',
            params: {
              hi: `Eliminaste el sobre «${env.name}»`,
              amountLabel: Number(r.returned) > 0 ? 'Volvió a tu cuenta' : undefined,
              amount: Number(r.returned) > 0 ? r.returned : undefined,
              back: 'Save',
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
        <Row
          first
          icon="settings"
          title="Meta y ahorro automático"
          sub={[env.goal_amount ? `Meta ${moneyShort(env.goal_amount)}` : 'Sin meta', env.savings_mode ?? 'Sin ahorro automático'].join(' · ')}
          onPress={() => nav.navigate('EnvelopeSettings', { account: env })}
        />
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
  sectAmt: { fontSize: 18, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
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
  choice: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: 16, marginTop: 14 },
  choiceOn: { borderWidth: 2, borderColor: colors.emerald },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choiceT: { fontSize: 17, fontWeight: '700', color: colors.ink },
  choiceSub: { fontSize: 14, color: colors.muted, marginTop: 1 },
  pill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  pillT: { fontSize: 13, fontWeight: '700' },
  bullets: { marginTop: 12, gap: 6 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletT: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 20 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  idea: { borderWidth: 1.5, borderColor: colors.fieldBorder, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13 },
  ideaOn: { borderColor: colors.primary, backgroundColor: colors.mint },
  ideaT: { fontSize: 14, fontWeight: '600', color: colors.ink },
  mint: { backgroundColor: colors.mint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 10 },
  heroBox: { marginBottom: 14 },
  heroBar: { height: 6, borderRadius: 3, backgroundColor: colors.card, marginTop: 8 },
  heroBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  big: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 12, marginBottom: 6 },
});
