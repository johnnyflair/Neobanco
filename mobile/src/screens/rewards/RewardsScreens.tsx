// Recompensas (según el prototipo): puntos, nivel, cómo ganar, canje con multiplicador por destino
// y regla de canje automático a fin de mes.
import { StackActions, useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { RedeemDestination, Rewards } from '../../api/types';
import { money, shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { KooaEyes } from '../../ui/Brand';
import { Btn, ErrorText, Loading, Opt, Row, Screen, Sect, Small, Tag } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { receiptDate } from '../../ui/Receipt';
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
  { t: 'Enviá por SINPE desde Kooa', s: '5 puntos por envío, hasta 20 al mes' },
  { t: 'Pagá recibos en Kooa', s: '10 puntos, 20 si es automático' },
  { t: 'Creá sobres y cumplí tus metas', s: '50 puntos por sobre' },
];

const LEVEL_COLOR: Record<string, string> = { Bronce: '#C07A3E', Plata: '#A8B0BA', Oro: '#D4A72C' };

function perksText(lv: Rewards['levels'][number]) {
  const mult = Math.round((Number(lv.points_multiplier) - 1) * 100);
  const bonus = Number(lv.rate_bonus);
  return mult
    ? `${mult}% más puntos\n+${bonus}% de interés en sobres y plazos`
    : 'Puntos en compras, SINPE y recibos\nCanjeás desde 500 puntos';
}

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
  // Camino Bronce → Plata → Oro: cada tramo ocupa la mitad del recorrido.
  const [plata, oro] = [data.levels[1]?.from_points ?? 2000, data.levels[2]?.from_points ?? 5000];
  const life = data.points_lifetime;
  const pathPct = life < plata ? (life / plata) * 50 : 50 + Math.min(1, (life - plata) / (oro - plata)) * 50;

  return (
    <Screen title="Mis recompensas">
      <View style={st.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={st.heroK}>Tus puntos</Text>
            <Text style={st.heroBig}>{n0(data.points)}</Text>
            <Text style={st.heroUp}>{`Valen ${money(data.value_crc)}`}</Text>
          </View>
          <KooaEyes size={78} expression="guau" browColor={colors.orange} />
        </View>
        <View style={st.path} accessibilityLabel={`Nivel ${data.level}`}>
          <View style={st.track} />
          <View style={[st.trackFill, { width: `${pathPct * 0.84}%` }]} />
          {data.levels.map((lv) => {
            const current = lv.name === data.level;
            return (
              <View key={lv.name} style={st.medalBox}>
                <View
                  style={[
                    st.medal,
                    { backgroundColor: lv.reached ? LEVEL_COLOR[lv.name] : colors.card },
                    current && st.medalOn,
                  ]}
                >
                  <Icon name={lv.name === 'Oro' ? 'crown' : 'medal'} size={20} color={lv.reached ? colors.white : LEVEL_COLOR[lv.name]} />
                </View>
                <Text style={[st.medalT, { color: lv.reached ? colors.ink : colors.muted }]}>{lv.name}</Text>
              </View>
            );
          })}
        </View>
        <Text style={st.heroNext}>
          {data.next_level_at ? (
            <>
              Te faltan <Text style={{ color: colors.orangeInk, fontWeight: '700' }}>{`${n0(Math.max(0, missing))} puntos`}</Text>
              {` para ${nextName}`}
            </>
          ) : (
            'Llegaste al nivel más alto'
          )}
        </Text>
      </View>
      <Btn
        label="Canjear puntos"
        onPress={() => (data.points < MIN_REDEEM ? setTooFew(true) : nav.navigate('Redeem'))}
      />
      {tooFew && <ErrorText>{`Necesitás al menos ${MIN_REDEEM} puntos para canjear.`}</ErrorText>}
      <Row
        first
        icon="clock"
        title="Canje automático"
        tag={data.rule ? 'Activado' : 'Desactivado'}
        tagTone={data.rule ? 'ok' : 'neutral'}
        sub={data.rule ? `Al final de cada mes, ${destLabel(data.rule)}` : 'Movemos tus puntos al final de cada mes'}
        onPress={() => nav.navigate('AutoRule')}
      />

      <Sect>Lo que ganás en cada nivel</Sect>
      {data.levels.map((lv, i) => (
        <View key={lv.name} style={[st.lvRow, i === 0 && { borderTopWidth: 0 }]}>
          <View style={[st.dot, { backgroundColor: LEVEL_COLOR[lv.name] }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={st.histT}>{lv.name}</Text>
              {lv.name === data.level ? <Tag tone="ok">Tu nivel</Tag> : lv.from_points ? <Small>{`desde ${n0(lv.from_points)} puntos`}</Small> : null}
            </View>
            <Small>{perksText(lv)}</Small>
          </View>
          <Icon name={lv.reached ? 'check' : 'lock'} size={18} color={lv.reached ? colors.primary : colors.muted} />
        </View>
      ))}

      <Sect>Cómo ganar puntos</Sect>
      {EARN.map((e, i) => (
        <Row key={e.t} first={i === 0} icon="star" title={e.t} sub={e.s} />
      ))}
      <Row
        icon="gift"
        title="Invitá a un amigo"
        sub="500 puntos para cada uno"
        onPress={() => Share.share({ message: 'Abrí tu cuenta en Kooa y ganamos 500 puntos cada uno.' })}
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
      const where =
        dest.id === 'account'
          ? 'Cuenta en colones'
          : dest.id === 'envelope'
            ? dest.title.replace('Al sobre ', 'Sobre ')
            : dest.id === 'loan'
              ? 'Abono a tu préstamo'
              : 'Donación a una causa';
      nav.dispatch(
        StackActions.replace('TransferDone', {
          hi: dest.id === 'cause' ? 'Gracias, donaste tus puntos' : 'Canjeaste tus puntos',
          face: 'guau',
          amount: r.value,
          rows: [
            ['Puntos usados', n0(r.points_used)],
            ['Valor por punto', `×${Number(r.multiplier)}`],
            ['Destino', where],
            ['Fecha', receiptDate()],
          ],
          next: { label: 'Automatizar cada mes', route: 'AutoRule' },
        }),
      );
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
  hero: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: 18, marginBottom: 12 },
  heroK: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  heroBig: { fontSize: 34, fontWeight: '700', color: colors.orangeInk, fontVariant: ['tabular-nums'] },
  heroUp: { fontSize: 13, color: colors.muted },
  path: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginHorizontal: 4 },
  track: { position: 'absolute', top: 20, left: '8%', right: '8%', height: 5, borderRadius: 3, backgroundColor: colors.orangeSoft },
  trackFill: { position: 'absolute', top: 20, left: '8%', height: 5, borderRadius: 3, backgroundColor: colors.orange },
  medalBox: { alignItems: 'center', width: 64 },
  medal: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  medalOn: { borderWidth: 3, borderColor: colors.orange },
  medalT: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  heroNext: { fontSize: 13.5, color: colors.ink, textAlign: 'center', marginTop: 14 },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderColor: colors.line },
  dot: { width: 12, height: 12, borderRadius: 6 },
  level: { marginTop: 4, marginBottom: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginBottom: 6 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.lime },
  hist: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderColor: colors.line },
  histT: { fontSize: 15, fontWeight: '600', color: colors.ink },
  amt: { fontSize: 14, fontWeight: '600', color: colors.amount },
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
