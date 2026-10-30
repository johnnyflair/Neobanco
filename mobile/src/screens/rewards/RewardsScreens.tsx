// Recompensas (según el prototipo): puntos, nivel, cómo ganar, canje con multiplicador por destino
// y regla de canje automático a fin de mes.
import { StackActions, useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { RedeemDestination, Rewards } from '../../api/types';
import { longDate, money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Btn, ErrorText, Loading, Opt, Row, Screen, Small, Tabs, Tag } from '../../ui/kit';
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

type RTab = 'earn' | 'levels' | 'history';

/** Opción B (aprobada): arriba solo puntos, nivel y Canjear; lo demás en pestañas
 *  Ganar / Niveles / Historial (mismo patrón que Invertir), para no saturar la pantalla. */
export function RewardsScreen() {
  const nav = useNavigation();
  const { data, error } = useLoad(loadRewards);
  const [tooFew, setTooFew] = useState(false);
  const [tab, setTab] = useState<RTab>('earn');
  if (!data) return error ? <Screen title="Mis puntos"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const missing = data.next_level_at ? data.next_level_at - data.points_lifetime : 0;
  const nextName = data.level === 'Bronce' ? 'Plata' : 'Oro';
  const prevAt = data.levels.find((l) => l.name === data.level)?.from_points ?? 0;
  const pct = data.next_level_at
    ? Math.max(0, Math.min(1, (data.points_lifetime - prevAt) / (data.next_level_at - prevAt))) * 100
    : 100;

  return (
    <Screen title="Mis puntos">
      <View style={st.hero}>
        <Text style={st.heroBig}>{n0(data.points)}</Text>
        <Text style={st.heroUp}>{`Valen ${money(data.value_crc)} · Nivel ${data.level}`}</Text>
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
        tag={data.rule ? 'Activado' : 'Apagado'}
        tagTone={data.rule ? 'ok' : 'neutral'}
        sub={data.rule ? `Al final de cada mes, ${destLabel(data.rule)}` : 'Al final de cada mes'}
        onPress={() => nav.navigate('AutoRule')}
      />

      <View style={{ marginTop: 18 }}>
        <Tabs
          options={[
            { value: 'earn', label: 'Ganar' },
            { value: 'levels', label: 'Niveles' },
            { value: 'history', label: 'Historial' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'earn' && (
        <>
          {EARN.map((e, i) => (
            <Row key={e.t} first={i === 0} icon="star" title={e.t} sub={e.s} />
          ))}
          <Row
            icon="gift"
            title="Invitá a un amigo"
            sub="500 puntos para cada uno"
            onPress={() => Share.share({ message: 'Abrí tu cuenta en Kooa y ganamos 500 puntos cada uno.' })}
          />
        </>
      )}

      {tab === 'levels' && (
        <>
          <View style={st.nextRow}>
            <Text style={st.histT}>{data.level}</Text>
            <Text style={st.nextT}>
              {data.next_level_at ? `${nextName} en ${n0(Math.max(0, missing))} puntos` : 'Nivel más alto'}
            </Text>
          </View>
          <View style={st.bar} accessibilityLabel={`Nivel ${data.level}`}>
            <View style={[st.barFill, { width: `${pct}%`, backgroundColor: LEVEL_COLOR[data.level] }]} />
          </View>
          {data.levels.map((lv, i) => (
            <View key={lv.name} style={[st.lvRow, i === 0 && { borderTopWidth: 0 }]}>
              <View style={st.lvIcon}>
                <Icon name={lv.name === 'Oro' ? 'crown' : 'medal'} size={20} color={LEVEL_COLOR[lv.name]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.histT}>
                  {lv.name}
                  {lv.name === data.level ? <Text style={st.mine}>{'  ·  Tu nivel'}</Text> : null}
                </Text>
                {lv.from_points ? <Small>{`Desde ${n0(lv.from_points)} puntos`}</Small> : null}
                <Small>{perksText(lv)}</Small>
              </View>
              <View style={st.lvIcon}>
                <Icon name={lv.reached ? 'check' : 'lock'} size={18} color={lv.reached ? colors.primary : colors.muted} />
              </View>
            </View>
          ))}
        </>
      )}

      {tab === 'history' && (
        <>
          {data.history.slice(0, 12).map((h, i) => (
            <View key={`${h.at}-${i}`} style={[st.hist, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.histT}>{h.reason}</Text>
                <Small>{longDate(h.at)}</Small>
              </View>
              <Text style={[st.amt, h.points > 0 && { color: colors.primary }]}>
                {h.points > 0 ? '+' : ''}
                {n0(h.points)}
              </Text>
            </View>
          ))}
          {!data.history.length && <Small>Todavía no tenés movimientos de puntos.</Small>}
        </>
      )}
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
  hero: { marginTop: 4, marginBottom: 14 },
  heroBig: { fontSize: 36, fontWeight: '700', color: colors.orangeInk, fontVariant: ['tabular-nums'] },
  heroUp: { fontSize: 14, color: colors.muted, marginTop: 2 },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  nextT: { fontSize: 14, color: colors.muted },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden', marginTop: 8, marginBottom: 6 },
  barFill: { height: 10, borderRadius: 5 },
  lvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
  lvIcon: { height: 22, justifyContent: 'center' },
  mine: { fontSize: 14, fontWeight: '600', color: colors.primary },
  hist: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderColor: colors.line },
  histT: { fontSize: 16, fontWeight: '600', color: colors.ink },
  amt: { fontSize: 16, fontWeight: '600', color: colors.amount },
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
