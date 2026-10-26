// Enviar a una cuenta IBAN: al completar los 22 caracteres se verifica el titular antes de pedir el monto.
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import { formatIban, money, parseAmount } from '../../format';
import { Btn, ErrorText, Field, FieldStatic, Screen, Small } from '../../ui/kit';

export function IbanScreen() {
  const nav = useNavigation();
  const accounts = useLoad(api.accounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef({ sig: '', key: newIdempotencyKey() });
  const clean = iban.replace(/\s/g, '');

  useEffect(() => {
    setHolder(null);
    if (clean.length !== 22) return;
    let alive = true;
    setChecking(true);
    api
      .ibanLookup(clean)
      .then((r) => alive && (setHolder(r.holder), setError(null)))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [clean]);

  async function send() {
    const amt = parseAmount(amount);
    if (!crc || !holder) return setError('Escribí un IBAN válido de 22 caracteres.');
    if (!amt) return setError('Escribí el monto.');
    if (Number(amt) > Number(crc.balance)) return setError('No te alcanza el saldo disponible.');
    const sig = `${clean}|${amt}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    try {
      const t = await api.iban(crc.id, clean, amt, key.current.key);
      nav.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'TransferDone',
            params: {
              title: `Enviaste ${money(t.amount, t.currency)}`,
              sub: `a ${t.counterparty_name ?? holder} · llega en segundos`,
              shareText: `Te transferí ${money(t.amount, t.currency)}. Comprobante ${t.reference}.`,
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
      title="Enviar a cuenta IBAN"
      footer={<Btn label="Enviar" onPress={send} loading={busy} disabled={!holder || !crc} />}
    >
      <Field
        label="Cuenta IBAN"
        value={iban}
        onChangeText={(v) => setIban(formatIban(v))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="CR00 0000 0000 0000 0000 00"
        maxLength={27}
        autoFocus
      />
      <FieldStatic
        label="Titular"
        value={checking ? 'Verificando…' : holder ? `Verificado: ${holder}` : 'Se verifica al completar el IBAN'}
      />
      <Field label="Monto (₡)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <FieldStatic label="Llega" value="Inmediato" />
      <Small style={{ marginTop: 8 }}>Sale de tu cuenta colones · disponible {crc ? money(crc.balance) : '…'}</Small>
      <ErrorText>{error ?? accounts.error}</ErrorText>
    </Screen>
  );
}
