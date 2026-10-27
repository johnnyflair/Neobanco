// Recompensas (según el prototipo): puntos, nivel, cómo ganar, canje con multiplicador por destino
// y regla de canje automático a fin de mes.
import { StackActions, useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { RedeemDestination } from '../../api/types';
import { money, shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Btn, Done, ErrorText, Hero, Loading, Opt, Row, Screen, Sect, Small, Tag } from '../../ui/kit';
import { Text } from '../../ui/typography';

export const MIN_REDEEM = 500;
const n0 = (n: number) => n.toLocaleString('en-US');

type Dest = { id: RedeemDestination; title: string; sub: string; mult: number; targetId?: string };

async function loadDests(): Promise<Dest[]> {
  const accounts = await api.accounts();
  const envelope = accounts.find((a) => a.type === 'envelope' && a.currency === 'CRC');
  const list: Dest[] = [
    { id: 'account', title: 'A mi cuenta', sub: 'Plata disponible al instante', mult: 1 },
    { id: 'loan', title: 'Abonar a mi préstamo', sub: 'Valen 10% más y pagás menos intereses', mult: 1.1 },
  ];
  if (envelope) {
    list.push({ id: 'envelope', title: `Al sobre ${envelope.name}`, sub: 'Valen 5% más', mult: 1.05, targetId: envelope.id });
  }
  list.push({ id: 'cause', title: 'Donar al fondo solidario', sub: 'La cooperativa duplica cada punto', mult: 2 });
  return list;
}

export const destLabel = (d: RedeemDestination | null | undefined) =>
  ({ account: 'a tu cuenta', loan: 'a tu préstamo', envelope: 'a tu sobre', cause: 'al fondo solidario' })[d ?? 'account'];

const EARN = [
  { t: 'Comprá con tu tarjeta', s: '1 punto por cada ₡1,000 (2 con crédito)' },
  { t: 'Enviá por SINPE desde la App', s: '5 puntos por envío, hasta 20 al mes' },
  { t: 'Pagá recibos en la App', s: '10 puntos, 20 si es automático' },
  { t: 'Creá sobres y cumplí tus metas', s: '50 puntos por sobre' },
];

async function loadRewards() {
  const [r, rule] = await Promise.all([api.rewards(), api.autoRule()]);
  return { ...r, rule: rule.destination };
}

export function RewardsScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(loadRewards);
  const [tooFew, setTooFew] = useState(false);
  if (!data) return error ? <Screen title="Mis recompensas"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const missing = data.next_level_at ? data.next_level_at - data.points_lifetime : 0;
  const nextName = data.level === 'Bronce' ? 'Plata' : 'Oro';
  const pct = data.next_level_at ? Math.min(100, Math.round((data.points_lifetime / data.next_level_at) * 100)) : 100;

  return (
    <Screen title="Mis recompensas">
      <Hero
        title="Mis puntos"
        sub={`Disponibles para canjear · nivel ${data.level}`}
        big={n0(data.points)}
        up={`Equivalen a ${money(data.value_crc)} · 1 punto = ₡1.00`}
      />
      {data.next_level_at ? (
        <View style={st.level}>
          <View style={st.bar}>
            <View style={[st.barFill, { width: `${pct}%` }]} />
          </View>
          <Small>{`Te faltan ${n0(Math.max(0, missing))} puntos para nivel ${nextName}`}</Small>
        </View>
      ) : (
        <Small>Estás en el nivel más alto.</Small>
      )}
      <Btn
        label="Canjear puntos"
        onPress={() => (data.points < MIN_REDEEM ? setTooFew(true) : nav.navigate('Redeem'))}
      />
      {tooFew && <ErrorText>{`Necesitás al menos ${MIN_REDEEM} puntos para canjear.`}</ErrorText>}
      <Row
        first
        icon="clock"
        title="Canje automático"
        sub={data.rule ? `Activado · fin de mes, ${destLabel(data.rule)}` : 'Desactivado · movemos tus puntos cada fin de mes'}
        onPress={() => nav.navigate('AutoRule')}
      />

      <Sect>Cómo ganar puntos</Sect>
      {EARN.map((e, i) => (
        <Row key={e.t} first={i === 0} icon="star" title={e.t} sub={e.s} />
      ))}
      <Row
        icon="gift"
        title="Invitá a un amigo"
        sub="500 puntos para cada uno"
        onPress={() => Share.share({ message: 'Abrí tu cuenta en la App de la cooperativa y ganamos 500 puntos cada uno.' })}
      />

      <Sect>Últimos puntos</Sect>
      {data.history.slice(0, 8).map((h, i) => (
        <View key={`${h.at}-${i}`} style={st.hist}>
          <View style={{ flex: 1 }}>
            <Text style={st.histT}>{h.reason}</Text>
            <Small>{shortDate(h.at)}</Small>
          </View>
          <Text style={[st.amt, h.points > 0 && { color: colors.primary }]}>
            {h.points > 0 ? '+' : ''}
            {n0(h.points)}
          </Text>
        </View>
      ))}
      {!data.history.length && <Small>Todavía no tenés movimientos de puntos.</Small>}
    </Screen>
  );
}

export function RedeemScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(async () => ({ rewards: await api.rewards(), dests: await loadDests() }));
  const [sel, setSel] = useState<RedeemDestination>('loan');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return error ? <Screen title="¿A dónde mandás tus puntos?"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const pts = data.rewards.points;
  const dest = data.dests.find((d) => d.id === sel) ?? data.dests[0];

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.redeem(dest.id, dest.targetId);
      nav.navigate('RedeemDone', {
        title: dest.id === 'cause' ? `Donaste ${money(r.value)}` : `Recibiste ${money(r.value)}`,
        sub:
          dest.id === 'account'
            ? 'Ya está en tu cuenta colones.'
            : dest.id === 'envelope'
              ? `Ya está en ${dest.title.replace('Al sobre ', '')}.`
              : dest.id === 'loan'
                ? 'Lo aplicamos a tu préstamo hoy mismo.'
                : 'Gracias. La cooperativa duplicó tus puntos.',
      });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="¿A dónde mandás tus puntos?"
      footer={<Btn label={`Canjear ${n0(pts)} puntos`} onPress={go} loading={busy} disabled={pts < MIN_REDEEM} />}
    >
      <Small style={{ marginBottom: 10 }}>{`${n0(pts)} puntos disponibles. Según el destino, valen más.`}</Small>
      {data.dests.map((d) => (
        <Opt
          key={d.id}
          selected={d.id === sel}
          onPress={() => setSel(d.id)}
          title={d.title}
          sub={d.sub}
          right={money(Math.round(pts * d.mult))}
        />
      ))}
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

export function RedeemDoneScreen({ route }: RootProps<'RedeemDone'>) {
  const nav = useNavigation();
  return (
    <Done title={route.params.title} sub={route.params.sub}>
      <Btn label="Automatizar cada mes" variant="o" onPress={() => nav.navigate('AutoRule')} />
      <Btn label="Listo" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
    </Done>
  );
}

export function AutoRuleScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(async () => ({ rule: (await api.autoRule()).destination, dests: await loadDests() }));
  const [sel, setSel] = useState<RedeemDestination | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return error ? <Screen title="Canje automático"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const current = sel ?? data.rule ?? 'loan';

  async function save(dest: RedeemDestination | null) {
    setBusy(true);
    setErr(null);
    try {
      await api.setAutoRule(dest);
      // Vuelve a Mis recompensas aunque se haya llegado desde la pantalla de canje listo.
      nav.dispatch(StackActions.popTo('Rewards'));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Canje automático"
      footer={
        <>
          <Btn label={data.rule ? 'Guardar cambio' : 'Activar regla'} onPress={() => save(current)} loading={busy} />
          {data.rule && <Btn label="Desactivar canje automático" variant="do" onPress={() => save(null)} disabled={busy} />}
        </>
      }
    >
      <Small style={{ marginBottom: 10 }}>
        {`Cada fin de mes movemos tus puntos al destino que elijás, si tenés al menos ${MIN_REDEEM}.`}
      </Small>
      {data.rule && <Tag>{`Activo: ${destLabel(data.rule)}`}</Tag>}
      {data.dests.map((d) => (
        <Opt
          key={d.id}
          selected={d.id === current}
          onPress={() => setSel(d.id)}
          title={d.title}
          sub={d.sub}
          right={d.mult > 1 ? <Text style={st.mult}>{`×${d.mult}`}</Text> : undefined}
        />
      ))}
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  level: { marginTop: 4, marginBottom: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.lime },
  hist: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderColor: colors.line },
  histT: { fontSize: 15, fontWeight: '600', color: colors.ink },
  amt: { fontSize: 14, fontWeight: '600', color: colors.ink },
  mult: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
