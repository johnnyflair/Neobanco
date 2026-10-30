// Pagar recibos (según el prototipo aprobado):
// - Mis recibos: total pendiente del mes, recibos guardados con vencimiento, pagar todo.
// - Otros servicios: buscador (entiende «luz», «agua»…) y categorías → empresa → consulta → pago.
// - Detalle de un recibo guardado: pagar y pago automático (suma puntos la primera vez).
import { useNavigation } from '@react-navigation/native';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { BillPayment, BillProvider, BillQuote, SavedBill } from '../../api/types';
import { dayMonth, longDate, money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors } from '../../theme';
import { Icon, type IconName } from '../../ui/Icon';
import { Btn, ErrorText, Field, Hero, Loading, Row, Screen, SearchField, Sect, Small, Tabs, Toggle } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

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
  if (b.autopay) return { text: b.due_date ? `Se paga solo el ${longDate(b.due_date)}` : 'Se paga solo cada mes', urgent: false };
  if (!b.due_date) return { text: 'Pendiente', urgent: false };
  const n = daysUntil(b.due_date);
  // Fechas escritas completas (pensado en personas mayores): "Vence mañana, 31 de octubre".
  if (n < 0) return { text: `Venció el ${longDate(b.due_date)}`, urgent: true };
  if (n === 0) return { text: `Vence hoy, ${longDate(b.due_date)}`, urgent: true };
  if (n === 1) return { text: `Vence mañana, ${longDate(b.due_date)}`, urgent: true };
  return { text: `Vence el ${longDate(b.due_date)}`, urgent: false };
}

async function loadBills() {
  const [bills, accounts] = await Promise.all([api.savedBills(), api.accounts()]);
  return { bills, crc: accounts.find((a) => a.type === 'savings' && a.currency === 'CRC') };
}

/** ¡Listo! de un recibo pagado, igual que el de SINPE Móvil. */
function billDone(r: BillPayment, refLabel: string, ref: string) {
  return {
    name: 'TransferDone' as const,
    params: {
      hi: `Pagaste ${r.provider}`,
      amount: r.amount,
      points: r.points_earned,
      rows: [
        ['Servicio', r.provider],
        [refLabel, ref],
        ['Comprobante', r.receipt],
        ['Fecha', receiptDate()],
      ] as [string, string][],
      shareText: `✅ Pagué ${money(r.amount)} de ${r.provider} (${refLabel} ${ref}).\nComprobante ${r.receipt} · ${receiptDate()}`,
    },
  };
}

export function BillsScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState<'mine' | 'other'>('mine');
  const data = useLoad(loadBills);
  const [paying, setPaying] = useState(false);
  const [review, setReview] = useState(false);
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
    const done: [string, string][] = [];
    try {
      for (const b of toPay) {
        keys.current[b.id] ??= newIdempotencyKey();
        const r = await api.payBill(b.provider_id, b.reference, crc.id, keys.current[b.id], true, false, b.pending_amount ?? undefined);
        paid += Number(r.amount);
        points += r.points_earned;
        done.push([b.nickname, `${money(r.amount)} · ${r.receipt}`]);
      }
      setReview(false);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              hi: `Pagaste ${toPay.length} recibos`,
              amount: paid.toFixed(2),
              points,
              rows: [...done, ['Fecha', receiptDate()]],
              shareText: `✅ Pagué ${toPay.length} recibos por ${money(paid)}:\n${done.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
            },
          },
        ],
      });
    } catch (e) {
      setError(errorMessage(e));
      setReview(false);
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
              up={`${bills.filter((b) => b.autopay).length} de ${bills.length} se paga solo cada mes`}
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
                        <Cents style={{ fontSize: 14, fontWeight: '600', color: colors.amount }}>{money(b.pending_amount)}</Cents>
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
            {total > 0 && (
              <Btn
                label={`Pagar todo · ${money(total)}`}
                onPress={() => {
                  if (data.data?.crc && total > Number(data.data.crc.balance))
                    return setError('No te alcanza el saldo para pagar todos. Pagalos uno por uno.');
                  setError(null);
                  setReview(true);
                }}
              />
            )}
            <ReviewSheet
              visible={review}
              onClose={() => setReview(false)}
              title="Revisá antes de pagar"
              rows={[
                ...toPay.map((b) => [b.nickname, money(b.pending_amount!)] as [string, string]),
                ['Total', money(total)],
                ['Desde', 'Cuenta en colones'],
                ['Comisión', 'Gratis'],
              ]}
              slideLabel="Deslizá para pagar"
              onConfirm={payAll}
              busy={paying}
              error={error}
            />
            <Btn label="Agregar otro servicio" icon="plus" variant="o" onPress={() => setTab('other')} />
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
  const [review, setReview] = useState(false);
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
      const r = await api.payBill(provider.id, quote.reference, crc.id, key.current, save, false, quote.amount);
      setReview(false);
      nav.reset({ index: 1, routes: [{ name: 'Tabs' }, billDone(r, provider.reference_label, quote.reference)] });
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
          <Btn
            label={`Pagar ${money(quote.amount)}`}
            onPress={() => {
              if (crc && Number(quote.amount) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
              setError(null);
              setReview(true);
            }}
          />
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
          <ReviewSheet
            visible={review}
            onClose={() => setReview(false)}
            title="Revisá antes de pagar"
            rows={[
              ['Servicio', provider.name],
              ['A nombre de', quote.holder],
              [provider.reference_label, quote.reference],
              ['Monto', money(quote.amount)],
              ['Desde', 'Cuenta en colones'],
              ['Comisión', 'Gratis'],
            ]}
            slideLabel="Deslizá para pagar"
            onConfirm={pay}
            busy={busy}
            error={error}
          />
        </View>
      )}
    </Screen>
  );
}

export function BillDetailScreen({ route }: RootProps<'BillDetail'>) {
  const nav = useNavigation();
  const [bill, setBill] = useState<SavedBill>(route.params.bill);
  const [review, setReview] = useState(false);
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
      const r = await api.payBill(bill.provider_id, bill.reference, crc.id, key.current, true, false, bill.pending_amount ?? undefined);
      setReview(false);
      nav.reset({ index: 1, routes: [{ name: 'Tabs' }, billDone(r, bill.reference_label, bill.reference)] });
    } catch (e) {
      setError(errorMessage(e));
      // Si el recibo cambió de monto, se trae el monto real para revisarlo y pagarlo de nuevo.
      api
        .savedBills()
        .then((all) => {
          const fresh = all.find((x) => x.id === bill.id);
          if (fresh) setBill(fresh);
        })
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={bill.nickname}
      footer={
        bill.pending_amount ? (
          <Btn
            label={`Pagar ${money(bill.pending_amount)}`}
            onPress={() => {
              if (crc && Number(bill.pending_amount) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
              setError(null);
              setReview(true);
            }}
          />
        ) : undefined
      }
    >
      <Small center>
        {bill.reference_label} {bill.reference}
      </Small>
      <Cents style={{ fontSize: 34, fontWeight: '700', textAlign: 'center', color: colors.ink, marginTop: 14 }}>
        {bill.pending_amount ? money(bill.pending_amount) : 'Al día'}
      </Cents>
      <View style={[st.dueTag, due.urgent && st.dueUrgent]}>
        <Icon name="calendar" size={16} color={due.urgent ? colors.danger : colors.muted} />
        <Text style={[st.dueText, due.urgent && { color: colors.danger }]}>{due.text}</Text>
      </View>
      <View style={{ marginTop: 14 }}>
        <Row title="Pagar desde" right={<Small>Cuenta colones · {crc ? money(crc.balance) : '…'}</Small>} />
        <Row
          title="Pagarlo solo cada mes"
          sub="Lo pagamos el día que vence. Ganás 20 puntos."
          right={<Toggle value={bill.autopay} onChange={toggleAuto} label="Pagarlo solo cada mes" />}
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
      {bill.pending_amount ? (
        <ReviewSheet
          visible={review}
          onClose={() => setReview(false)}
          title="Revisá antes de pagar"
          rows={[
            ['Recibo', bill.nickname],
            [bill.reference_label, bill.reference],
            ['Monto', money(bill.pending_amount)],
            ['Desde', 'Cuenta en colones'],
            ['Comisión', 'Gratis'],
          ]}
          slideLabel="Deslizá para pagar"
          onConfirm={pay}
          busy={busy}
          error={error}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  dueTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: colors.card, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 6 },
  dueUrgent: { backgroundColor: colors.dangerSoft },
  dueText: { fontSize: 14, fontWeight: '600', color: colors.muted },
});
