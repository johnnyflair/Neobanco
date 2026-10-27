// Pagar recibos (según el prototipo aprobado):
// - Mis recibos: total pendiente del mes, recibos guardados con vencimiento, pagar todo.
// - Otros servicios: buscador (entiende «luz», «agua»…) y categorías → empresa → consulta → pago.
// - Detalle de un recibo guardado: pagar y pago automático (suma puntos la primera vez).
import { useNavigation } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { BillProvider, BillQuote, SavedBill } from '../../api/types';
import { dayMonth, money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors } from '../../theme';
import { Icon, type IconName } from '../../ui/Icon';
import { Btn, ErrorText, Field, Hero, Loading, Row, Screen, SearchField, Sect, Small, Tabs, Toggle } from '../../ui/kit';
import { Text } from '../../ui/typography';

export function categoryIcon(category: string): IconName {
  const c = category.toLowerCase();
  if (c.includes('electric')) return 'bolt';
  if (c.includes('acued') || c.includes('agua')) return 'drop';
  if (c.includes('internet') || c.includes('telef')) return 'wifi';
  if (c.includes('cable') || c.includes('tv')) return 'tv';
  if (c.includes('recarga')) return 'phone';
  if (c.includes('marchamo')) return 'car';
  if (c.includes('educ') || c.includes('colegio')) return 'school';
  if (c.includes('seguro') || c.includes('seguridad')) return 'shield';
  if (c.includes('municip') || c.includes('condomin')) return 'building';
  if (c.includes('ccss') || c.includes('asociac')) return 'hands';
  return 'receipt';
}

function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const due = new Date(y, m - 1, d).getTime();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((due - start) / 86_400_000);
}

function dueText(b: SavedBill): { text: string; urgent: boolean } {
  if (!b.pending_amount) return { text: 'Al día', urgent: false };
  if (b.autopay) return { text: `Automático${b.due_date ? ` · ${dayMonth(b.due_date)}` : ''}`, urgent: false };
  if (!b.due_date) return { text: 'Pendiente', urgent: false };
  const n = daysUntil(b.due_date);
  if (n < 0) return { text: 'Vencido', urgent: true };
  if (n === 0) return { text: 'Vence hoy', urgent: true };
  if (n === 1) return { text: 'Vence mañana', urgent: true };
  return { text: `Vence ${dayMonth(b.due_date)}`, urgent: false };
}

async function loadBills() {
  const [bills, accounts] = await Promise.all([api.savedBills(), api.accounts()]);
  return { bills, crc: accounts.find((a) => a.type === 'savings' && a.currency === 'CRC') };
}

export function BillsScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState<'mine' | 'other'>('mine');
  const data = useLoad(loadBills);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});

  const bills = data.data?.bills ?? [];
  const toPay = bills.filter((b) => b.pending_amount && !b.autopay);
  const total = toPay.reduce((sum, b) => sum + Number(b.pending_amount), 0);

  async function payAll() {
    const crc = data.data?.crc;
    if (!crc) return;
    if (total > Number(crc.balance)) return setError('No te alcanza el saldo para pagar todos. Pagalos uno por uno.');
    setPaying(true);
    setError(null);
    let paid = 0;
    let points = 0;
    try {
      for (const b of toPay) {
        keys.current[b.id] ??= newIdempotencyKey();
        const r = await api.payBill(b.provider_id, b.reference, crc.id, keys.current[b.id]);
        paid += Number(r.amount);
        points += r.points_earned;
      }
      nav.navigate('TransferDone', {
        title: `Pagaste ${money(paid)}`,
        sub: `${toPay.length} recibos al día`,
        points,
      });
    } catch (e) {
      setError(errorMessage(e));
      data.reload();
    } finally {
      setPaying(false);
    }
  }

  return (
    <Screen title="Pagar recibos">
      <Tabs
        options={[
          { value: 'mine', label: 'Mis recibos' },
          { value: 'other', label: 'Otros servicios' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'mine' ? (
        !data.data ? (
          data.error ? <ErrorText>{data.error}</ErrorText> : <Loading />
        ) : (
          <View>
            <Hero
              title="Recibos del mes"
              sub="Pendientes de pago"
              big={money(total)}
              up={`${bills.filter((b) => b.autopay).length} de ${bills.length} en pago automático`}
            />
            <View style={{ marginTop: 8 }}>
              {bills.map((b) => {
                const due = dueText(b);
                return (
                  <Row
                    key={b.id}
                    icon={categoryIcon(b.category)}
                    title={b.nickname}
                    sub={due.text}
                    subColor={due.urgent ? colors.danger : undefined}
                    right={
                      b.pending_amount ? (
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.amount }}>{money(b.pending_amount)}</Text>
                      ) : (
                        <Icon name="check" size={18} color={colors.emeraldDark} />
                      )
                    }
                    onPress={() => nav.navigate('BillDetail', { bill: b })}
                  />
                );
              })}
            </View>
            <ErrorText>{error}</ErrorText>
            {total > 0 && <Btn label={`Pagar todo · ${money(total)}`} onPress={payAll} loading={paying} />}
            <Btn label="+ Agregar otro servicio" variant="l" onPress={() => setTab('other')} />
          </View>
        )
      ) : (
        <OtherServices />
      )}
    </Screen>
  );
}

function OtherServices() {
  const nav = useNavigation();
  const [q, setQ] = useState('');
  const cats = useLoad(api.billCategories);
  const [results, setResults] = useState<BillProvider[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) return setResults(null);
    timer.current = setTimeout(() => api.billProviders(text.trim()).then(setResults, () => setResults([])), 250);
  }

  return (
    <View>
      <SearchField value={q} onChangeText={search} placeholder="Buscá una empresa o servicio" accessibilityLabel="Buscar servicio" />
      {results ? (
        <>
          <Sect>{results.length ? 'Resultados' : 'Sin resultados'}</Sect>
          {results.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              icon={categoryIcon(p.category)}
              title={p.name}
              sub={p.category}
              onPress={() => nav.navigate('BillService', { provider: p })}
            />
          ))}
          {!results.length && <Small>Probá con el nombre de la empresa o palabras como «luz», «agua» o «marchamo».</Small>}
        </>
      ) : (
        <>
          <Sect>Categorías</Sect>
          {cats.data?.map((c, i) => (
            <Row
              key={c.name}
              first={i === 0}
              icon={categoryIcon(c.name)}
              title={c.name}
              onPress={() => nav.navigate('BillCategory', { category: c.name })}
            />
          ))}
          <ErrorText>{cats.error}</ErrorText>
        </>
      )}
    </View>
  );
}

export function BillCategoryScreen({ route }: RootProps<'BillCategory'>) {
  const nav = useNavigation();
  const { category } = route.params;
  const list = useLoad(() => api.billProviders(undefined, category));
  return (
    <Screen title={category}>
      <Small>Elegí la empresa</Small>
      <View style={{ marginTop: 6 }}>
        {list.data?.map((p, i) => (
          <Row key={p.id} first={i === 0} icon={categoryIcon(category)} title={p.name} onPress={() => nav.navigate('BillService', { provider: p })} />
        ))}
      </View>
      {!list.data && !list.error && <Loading />}
      <ErrorText>{list.error}</ErrorText>
    </Screen>
  );
}

export function BillServiceScreen({ route }: RootProps<'BillService'>) {
  const nav = useNavigation();
  const { provider } = route.params;
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [reference, setReference] = useState('');
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  async function lookup() {
    if (reference.trim().length < 3) return setError('Escribí el número para consultar.');
    setBusy(true);
    setError(null);
    try {
      setQuote(await api.billLookup(provider.id, reference.trim()));
      key.current = newIdempotencyKey();
    } catch (e) {
      setQuote(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!quote || !crc) return;
    if (Number(quote.amount) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
    setBusy(true);
    setError(null);
    try {
      const r = await api.payBill(provider.id, quote.reference, crc.id, key.current, save);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              title: `Pagaste ${money(r.amount)}`,
              sub: `${r.provider} · comprobante ${r.receipt}`,
              points: r.points_earned,
              shareText: `Pagué ${money(r.amount)} de ${r.provider}. Comprobante ${r.receipt}.`,
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
      title={provider.name}
      footer={
        quote ? (
          <Btn label={`Pagar ${money(quote.amount)}`} onPress={pay} loading={busy} />
        ) : (
          <Btn label="Consultar" onPress={lookup} loading={busy} />
        )
      }
    >
      <Small>{provider.category}</Small>
      <Field
        label={provider.reference_label}
        value={reference}
        onChangeText={(v) => {
          setReference(v);
          setQuote(null);
        }}
        autoCapitalize="characters"
        autoFocus
        onSubmitEditing={lookup}
      />
      <ErrorText>{error}</ErrorText>
      {quote && (
        <View style={{ marginTop: 14 }}>
          <Hero
            title={`A nombre de ${quote.holder}`}
            sub={`Recibo ${quote.period} · vence ${dayMonth(quote.due)}`}
            big={money(quote.amount)}
          />
          <Row
            title="Guardar en mis recibos"
            sub="Te avisamos cuando venza el próximo"
            right={<Toggle value={save} onChange={setSave} label="Guardar en mis recibos" />}
          />
          <Row title="Pagar desde" right={<Small>Cuenta colones · {crc ? money(crc.balance) : '…'}</Small>} />
        </View>
      )}
    </Screen>
  );
}

export function BillDetailScreen({ route }: RootProps<'BillDetail'>) {
  const nav = useNavigation();
  const [bill, setBill] = useState<SavedBill>(route.params.bill);
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const due = useMemo(() => dueText(bill), [bill]);

  async function toggleAuto(v: boolean) {
    setError(null);
    setBill({ ...bill, autopay: v });
    try {
      setBill(await api.setAutopay(bill.id, v));
    } catch (e) {
      setBill(bill);
      setError(errorMessage(e));
    }
  }

  async function pay() {
    if (!crc || !bill.pending_amount) return;
    if (Number(bill.pending_amount) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
    setBusy(true);
    setError(null);
    try {
      const r = await api.payBill(bill.provider_id, bill.reference, crc.id, key.current);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: { title: `Pagaste ${money(r.amount)}`, sub: `${r.provider} · comprobante ${r.receipt}`, points: r.points_earned },
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
      title={bill.nickname}
      footer={bill.pending_amount ? <Btn label={`Pagar ${money(bill.pending_amount)}`} onPress={pay} loading={busy} /> : undefined}
    >
      <Small center>
        {bill.reference_label} {bill.reference}
      </Small>
      <Text style={{ fontSize: 34, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 14 }}>
        {bill.pending_amount ? money(bill.pending_amount) : 'Al día'}
      </Text>
      <Small center style={due.urgent ? { color: colors.danger } : undefined}>
        {due.text}
      </Small>
      <View style={{ marginTop: 14 }}>
        <Row title="Pagar desde" right={<Small>Cuenta colones · {crc ? money(crc.balance) : '…'}</Small>} />
        <Row
          title="Pago automático"
          sub="Pagamos cada mes el día que vence · 20 puntos"
          right={<Toggle value={bill.autopay} onChange={toggleAuto} label="Pago automático" />}
        />
        {bill.autopay && (
          <Row
            title="Tope automático"
            sub="Te consultamos si el recibo pasa de este monto"
            right={<Small>{bill.autopay_cap ? money(bill.autopay_cap) : 'Sin tope'}</Small>}
          />
        )}
      </View>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
