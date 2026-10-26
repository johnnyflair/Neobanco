// SINPE Móvil en dos pasos: número (o frecuente) → monto con teclado → comprobante.
// Antes de pedir el monto se confirma el nombre del dueño del número con la API.
import { useNavigation } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { SinpeContact } from '../../api/types';
import { formatPhone, money, parseAmount } from '../../format';
import type { RootProps } from '../../navigation';
import { colors } from '../../theme';
import { AmountInput, Btn, ErrorText, Field, Screen, Sect, Small } from '../../ui/kit';

const AV_COLORS = [
  ['#FAECE7', '#712B13'],
  ['#EEEDFE', '#3C3489'],
  [colors.amberBg, colors.amberFg],
  [colors.mint, colors.primaryInk],
];

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

export function Frequents({ contacts, onPick }: { contacts: SinpeContact[]; onPick: (c: SinpeContact) => void }) {
  return (
    <View style={st.avs}>
      {contacts.slice(0, 4).map((c, i) => {
        const [bg, fg] = AV_COLORS[i % AV_COLORS.length];
        return (
          <Pressable
            key={c.phone}
            style={st.av}
            onPress={() => onPick(c)}
            accessibilityRole="button"
            accessibilityLabel={`Enviar a ${c.name}`}
          >
            <View style={[st.avCircle, { backgroundColor: bg }]}>
              <Text style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{initials(c.name)}</Text>
            </View>
            <Text style={st.avName} numberOfLines={1}>
              {c.name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SinpeNumberScreen() {
  const nav = useNavigation();
  const recent = useLoad(api.sinpeRecent);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function next() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('Escribí un número de 8 dígitos o elegí un contacto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await api.sinpeLookup(digits);
      nav.navigate('SinpeAmount', { phone: c.phone, name: c.name });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="SINPE Móvil" footer={<Btn label="Continuar" onPress={next} loading={busy} />}>
      <Field
        label="Número"
        value={phone}
        onChangeText={(v) => setPhone(formatPhone(v))}
        keyboardType="number-pad"
        placeholder="8812-4455"
        maxLength={9}
        autoFocus
        textContentType="telephoneNumber"
        onSubmitEditing={next}
      />
      <ErrorText>{error}</ErrorText>
      {recent.data && recent.data.length > 0 && (
        <>
          <Sect>Frecuentes</Sect>
          <Frequents contacts={recent.data} onPick={(c) => nav.navigate('SinpeAmount', { phone: c.phone, name: c.name })} />
        </>
      )}
    </Screen>
  );
}

export function SinpeAmountScreen({ route }: RootProps<'SinpeAmount'>) {
  const nav = useNavigation();
  const { phone, name } = route.params;
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [amt, setAmt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Misma llave mientras el monto no cambie: si se reintenta por mala señal, no se cobra dos veces.
  const key = useRef({ amt: '', key: newIdempotencyKey() });

  async function send() {
    if (!crc) return;
    const value = parseAmount(amt);
    if (!value) return setError('Escribí cuánto querés enviar.');
    if (Number(value) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
    if (key.current.amt !== amt) key.current = { amt, key: newIdempotencyKey() };
    setBusy(true);
    try {
      const t = await api.sinpe(crc.id, phone, value, key.current.key);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              title: `Enviaste ${money(t.amount)}`,
              sub: `a ${t.counterparty_name ?? name} · comprobante ${t.reference}`,
              points: t.points_earned,
              shareText: `Te envié ${money(t.amount)} por SINPE Móvil. Comprobante ${t.reference}.`,
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
    <Screen title="¿Cuánto?" footer={<Btn label="Enviar" onPress={send} loading={busy} disabled={!crc} />}>
      <Small center>
        Para {name} · {formatPhone(phone)}
      </Small>
      <AmountInput
        value={amt}
        onChange={(v) => {
          setError(null);
          setAmt(v);
        }}
        label="Monto a enviar"
      />
      <Small center>Disponible {crc ? money(crc.balance) : '…'}</Small>
      <ErrorText>{error ?? accounts.error}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  avs: { flexDirection: 'row', gap: 14, marginTop: 6, marginBottom: 4 },
  av: { alignItems: 'center', gap: 4, width: 56 },
  avCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avName: { fontSize: 11, color: colors.ink },
});
