// SINPE Móvil: a quién (recientes con historial) o marcar un número nuevo con el nombre del dueño
// en vivo → monto con teclado propio, montos rápidos y motivo → revisar y deslizar → ¡listo!
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { SinpeContact } from '../../api/types';
import { formatPhone, money } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { applyAmountKey, applyPhoneKey, Keypad } from '../../ui/Keypad';
import { Btn, ErrorText, Screen, SearchField, Small } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';
import { Text, TextInput } from '../../ui/typography';

const AV_COLORS = [
  ['#FAECE7', '#712B13'],
  ['#EEEDFE', '#3C3489'],
  [colors.amberBg, colors.amberFg],
  [colors.mint, colors.primaryInk],
  ['#E7F0FD', '#1D4E89'],
];
const QUICK = ['5000', '10000', '20000'];

export function initials(name: string) {
  return name
    .replace(/\./g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const firstName = (name: string) => name.split(' ')[0];

/** Círculo con iniciales; el color sale del número, así cada persona tiene siempre el mismo. */
export function Avatar({ name, phone, size = 56 }: { name: string; phone: string; size?: number }) {
  const h = phone.split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
  const [bg, fg] = AV_COLORS[h % AV_COLORS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: Math.round(size * 0.32) }}>{initials(name)}</Text>
    </View>
  );
}

/** "Le enviaste ₡15,000.00 · ayer" */
function lastSent(c: SinpeContact) {
  if (!c.last_amount || !c.last_at) return formatPhone(c.phone);
  const d = new Date(c.last_at);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  const when =
    days <= 0
      ? 'hoy'
      : days === 1
        ? 'ayer'
        : days < 7
          ? d.toLocaleDateString('es-CR', { weekday: 'short' }).replace('.', '')
          : d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '');
  return `Le enviaste ${money(c.last_amount).replace(/\.00$/, '')} · ${when}`;
}

/** Fila de recientes (también se usa en Transferir). */
export function Frequents({ contacts, onPick }: { contacts: SinpeContact[]; onPick: (c: SinpeContact) => void }) {
  return (
    <View style={st.avs}>
      {contacts.slice(0, 4).map((c) => (
        <Pressable key={c.phone} style={st.av} onPress={() => onPick(c)} accessibilityRole="button" accessibilityLabel={`Enviar a ${c.name}`}>
          <Avatar name={c.name} phone={c.phone} size={58} />
          <Text style={st.avName} numberOfLines={1}>
            {firstName(c.name)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- 1. ¿A quién? ----------
export function SinpeNumberScreen() {
  const nav = useNavigation();
  const recent = useLoad(api.sinpeRecent);
  const [q, setQ] = useState('');
  const contacts = recent.data ?? [];
  const digits = q.replace(/\D/g, '');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(t) || (digits && c.phone.includes(digits)));
  }, [contacts, q, digits]);
  const pick = (c: SinpeContact) => nav.navigate('SendAmount', { kind: 'sinpe', to: c.phone, name: c.name, isNew: false });
  const typedNew = digits.length === 8 && !contacts.some((c) => c.phone === digits);

  return (
    <Screen
      title="SINPE Móvil"
      footer={
        <Pressable style={st.newBtn} onPress={() => nav.navigate('SinpeDial', {})} accessibilityRole="button">
          <Icon name="plus" size={20} color={colors.primary} />
          <Text style={st.newTxt}>Enviar a un número nuevo</Text>
        </Pressable>
      }
    >
      <SearchField value={q} onChangeText={setQ} placeholder="Nombre o número" />
      {typedNew && (
        <Pressable style={st.row} onPress={() => nav.navigate('SinpeDial', { phone: digits })} accessibilityRole="button">
          <View style={st.dialIcon}>
            <Icon name="phone" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.rowName}>Enviar a {formatPhone(digits)}</Text>
            <Text style={st.rowSub}>Número nuevo</Text>
          </View>
          <Icon name="chev" size={18} color={colors.muted} />
        </Pressable>
      )}
      {recent.loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      {!q && contacts.length > 0 && (
        <>
          <Text style={st.lbl}>Recientes</Text>
          <Frequents contacts={contacts} onPick={pick} />
        </>
      )}
      {shown.length > 0 && (
        <>
          <Text style={st.lbl}>{q ? 'Resultados' : 'Enviados recientemente'}</Text>
          {shown.map((c) => (
            <Pressable key={c.phone} style={st.row} onPress={() => pick(c)} accessibilityRole="button" accessibilityLabel={`Enviar a ${c.name}`}>
              <Avatar name={c.name} phone={c.phone} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={st.rowName}>{c.name}</Text>
                <Text style={st.rowSub}>{lastSent(c)}</Text>
              </View>
              <Icon name="chev" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </>
      )}
      {!recent.loading && contacts.length === 0 && (
        <View style={st.empty}>
          <View style={st.emptyIcon}>
            <Icon name="send" size={28} color={colors.primary} />
          </View>
          <Text style={st.emptyTitle}>Tu primer SINPE Móvil</Text>
          <Small center>Tocá “Enviar a un número nuevo”. Las personas a las que les envíes van a aparecer aquí.</Small>
        </View>
      )}
      {q !== '' && shown.length === 0 && !typedNew && <Small center>No hay nadie con ese nombre en tus envíos. Probá con el número.</Small>}
      <ErrorText>{recent.error}</ErrorText>
    </Screen>
  );
}

// ---------- 1b. Número nuevo: se marca y aparece el nombre del dueño ----------
export function SinpeDialScreen({ route }: RootProps<'SinpeDial'>) {
  const nav = useNavigation();
  const recent = useLoad(api.sinpeRecent);
  const [digits, setDigits] = useState((route.params?.phone ?? '').replace(/\D/g, '').slice(0, 8));
  const [found, setFound] = useState<SinpeContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  // Al completar los 8 dígitos se busca el nombre del dueño, sin tocar nada más.
  useEffect(() => {
    setFound(null);
    setError(null);
    if (digits.length !== 8) return;
    let live = true;
    setLooking(true);
    api
      .sinpeLookup(digits)
      .then((c) => live && setFound(c))
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [digits]);

  function go() {
    if (!found) return;
    const isNew = !(recent.data ?? []).some((c) => c.phone === found.phone);
    nav.navigate('SendAmount', { kind: 'sinpe', to: found.phone, name: found.name, isNew });
  }

  return (
    <Screen
      title="Número nuevo"
      footer={<Btn label={found ? `Sí, es ${firstName(found.name)}` : 'Continuar'} onPress={go} disabled={!found} />}
    >
      <Text style={[st.dial, !digits && { color: colors.fieldBorder }]} accessibilityLabel={`Número ${digits || 'vacío'}`}>
        {digits ? formatPhone(digits) : '0000-0000'}
      </Text>
      <WhoCard
        looking={looking}
        found={found ? { name: found.name, seed: found.phone } : null}
        okText="Es quien tiene este número"
        error={error}
        hint="Al completar los 8 dígitos te mostramos de quién es."
      />
      <Keypad onKey={(k) => setDigits((d) => applyPhoneKey(d, k))} />
    </Screen>
  );
}

/** Tarjeta que aparece sola al completar el número o el IBAN: buscando, dueño verificado o error. */
export function WhoCard({
  looking,
  found,
  okText,
  error,
  hint,
}: {
  looking: boolean;
  found: { name: string; seed: string } | null;
  okText: string;
  error: string | null;
  hint: string;
}) {
  return (
    <View style={st.lookup}>
      {looking && (
        <View style={[st.who, st.whoLoading]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={st.rowSub}>Buscando al titular…</Text>
        </View>
      )}
      {found && (
        <View style={st.who} accessibilityLiveRegion="polite">
          <Avatar name={found.name} phone={found.seed} size={52} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={st.whoName}>{found.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="check" size={14} color={colors.primary} />
              <Text style={st.whoOk}>{okText}</Text>
            </View>
          </View>
        </View>
      )}
      {error && (
        <View style={[st.who, st.whoErr]} accessibilityLiveRegion="polite">
          <Icon name="alert" size={22} color={colors.danger} />
          <Text style={[st.rowSub, { color: colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      )}
      {!looking && !found && !error && <Small center>{hint}</Small>}
    </View>
  );
}

// ---------- 2. Monto y motivo · 3. Revisar y deslizar (SINPE Móvil e IBAN) ----------
const maskIban = (iban: string) => `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;

export function SendAmountScreen({ route }: RootProps<'SendAmount'>) {
  const nav = useNavigation();
  const { kind, to, name, isNew } = route.params;
  const sinpe = kind === 'sinpe';
  const toLabel = sinpe ? formatPhone(to) : maskIban(to);
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Misma llave mientras no cambien monto ni motivo: si se reintenta por mala señal, no se cobra dos veces.
  const key = useRef({ sig: '', key: newIdempotencyKey() });

  const [int, dec] = amt.split('.');
  const shown = `₡${Number(int || '0').toLocaleString('en-US')}${dec !== undefined ? `.${dec}` : ''}`;
  const value = Number(amt || '0');
  const reason = note.trim();

  function next() {
    if (!crc) return;
    if (!value) return setError('Escribí cuánto querés enviar.');
    if (value > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
    setSendError(null);
    setReview(true);
  }

  async function send() {
    if (!crc) return;
    const amount = value.toFixed(2);
    const description = reason || undefined;
    const sig = `${amount}|${description ?? ''}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setSendError(null);
    try {
      const t = sinpe
        ? await api.sinpe(crc.id, to, amount, key.current.key, description)
        : await api.iban(crc.id, to, amount, key.current.key, description);
      const who = t.counterparty_name ?? name;
      const motive = t.description ?? description;
      setReview(false);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              hi: `¡Listo! Le enviaste a ${firstName(who)}`,
              amount: t.amount,
              currency: t.currency,
              points: t.points_earned,
              rows: [
                ['Para', `${who} · ${toLabel}`],
                ['Por', sinpe ? 'SINPE Móvil' : 'Transferencia IBAN'],
                ['Comprobante', t.reference],
                ['Fecha', receiptDate(t.created_at)],
                ...(motive ? ([['Motivo', motive]] as [string, string][]) : []),
              ],
              shareText: `✅ Te envié ${money(t.amount, t.currency)} por ${sinpe ? 'SINPE Móvil' : 'transferencia IBAN'}${motive ? ` (${motive})` : ''}.\nComprobante ${t.reference} · ${receiptDate(t.created_at)}`,
            },
          },
        ],
      });
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="" footer={<Btn label="Continuar" onPress={next} disabled={!crc || !value} />}>
      <View style={st.to}>
        <Avatar name={name} phone={to.replace(/\D/g, '')} size={68} />
        <Text style={st.toName}>{name}</Text>
        <Text style={st.rowSub}>{sinpe ? toLabel : `IBAN ${toLabel}`}</Text>
        <View style={st.verified}>
          <Icon name="check" size={13} color={colors.primary} />
          <Text style={st.verifiedTxt}>{sinpe ? 'Número verificado' : 'Titular verificado'}</Text>
        </View>
      </View>
      <Text style={[st.amount, !amt && { color: colors.fieldBorder }]} accessibilityLabel={`Monto ${shown}`} adjustsFontSizeToFit numberOfLines={1}>
        {shown}
      </Text>
      <Small center>De Colones · disponible {crc ? money(crc.balance) : '…'}</Small>
      <View style={st.quick}>
        {QUICK.map((q) => (
          <Pressable
            key={q}
            style={({ pressed }) => [st.chip, amt === q && st.chipOn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setError(null);
              setAmt(q);
            }}
            accessibilityRole="button"
          >
            <Text style={[st.chipTxt, amt === q && { color: colors.white }]}>₡{Number(q).toLocaleString('en-US')}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.note}>
        <Icon name="file" size={18} color={colors.muted} />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Motivo (opcional): almuerzo, alquiler…"
          placeholderTextColor={colors.muted}
          maxLength={60}
          style={st.noteInput}
          returnKeyType="done"
        />
      </View>
      <ErrorText>{error ?? accounts.error}</ErrorText>
      <Keypad
        decimal
        onKey={(k) => {
          setError(null);
          setAmt((v) => applyAmountKey(v, k));
        }}
      />

      <ReviewSheet
        visible={review}
        onClose={() => setReview(false)}
        title="Revisá antes de enviar"
        warn={
          isNew
            ? sinpe
              ? `Es la primera vez que le enviás a este número. Verificá que ${firstName(name)} sea la persona correcta.`
              : `Verificá que ${name} sea el titular correcto de la cuenta. Una transferencia enviada no se puede reversar desde la App.`
            : null
        }
        rows={[
          ['Para', `${name} · ${toLabel}`],
          ['Monto', money(value)],
          ['Desde', 'Cuenta en colones'],
          ...(reason ? ([['Motivo', reason]] as [string, string][]) : []),
          ['Comisión', 'Gratis'],
        ]}
        slideLabel="Deslizá para enviar"
        onConfirm={send}
        busy={busy}
        error={sendError}
      />
    </Screen>
  );
}

const st = StyleSheet.create({

  avs: { flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 4 },
  av: { alignItems: 'center', gap: 6, width: 62 },
  avName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  dialIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  newBtn: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newTxt: { fontSize: 16, fontWeight: '700', color: colors.primary },
  empty: { alignItems: 'center', gap: 10, marginTop: 40, paddingHorizontal: 20 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  dial: { fontSize: 42, fontWeight: '700', letterSpacing: 2, textAlign: 'center', color: colors.ink, marginTop: 18, fontVariant: ['tabular-nums'] },
  lookup: { minHeight: 96, justifyContent: 'center', marginVertical: 14 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.xl, backgroundColor: colors.mint, borderWidth: 1.5, borderColor: colors.primary },
  whoLoading: { backgroundColor: colors.card, borderColor: colors.line, justifyContent: 'center' },
  whoErr: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  whoName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  whoOk: { fontSize: 13, fontWeight: '600', color: colors.primaryInk },
  to: { alignItems: 'center', gap: 4, marginTop: -6 },
  toName: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 6 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.mint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 6 },
  verifiedTxt: { fontSize: 12, fontWeight: '700', color: colors.primaryInk },
  amount: { fontSize: 50, fontWeight: '700', color: colors.ink, textAlign: 'center', marginTop: 18, fontVariant: ['tabular-nums'] },
  quick: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 30, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary },
  chipTxt: { fontSize: 14, fontWeight: '600', color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, marginTop: 14, height: 48 },
  noteInput: { flex: 1, fontSize: 15, color: colors.ink, height: 48, outlineWidth: 0 },
});
