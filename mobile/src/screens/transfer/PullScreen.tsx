// Traer dinero de una cuenta propia en otro banco (débito en tiempo real por SINPE).
// Una cuenta nueva queda pendiente hasta que la persona la autorice en la App de su otro banco.
import { useNavigation } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { api, newIdempotencyKey } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import { formatIban, money, parseAmount } from '../../format';
import { Btn, ErrorText, Field, Opt, Screen, Sect, Small, Tag } from '../../ui/kit';
import { receiptDate, ReviewSheet } from '../../ui/Receipt';

const NEW = 'new';

export function PullScreen() {
  const nav = useNavigation();
  const accounts = useLoad(api.accounts);
  const linked = useLoad(api.linkedAccounts);
  const crc = accounts.data?.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const [pick, setPick] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [amount, setAmount] = useState('100000');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const key = useRef({ sig: '', key: newIdempotencyKey() });

  const selected = pick ?? linked.data?.find((l) => l.authorized)?.id ?? NEW;
  const source = linked.data?.find((l) => l.id === selected);
  const amt = parseAmount(amount);

  async function go() {
    if (!crc) return;
    if (!amt) return setError('Escribí el monto.');
    const clean = iban.replace(/\s/g, '');
    if (selected === NEW && clean.length !== 22) return setError('Escribí el IBAN de 22 caracteres de tu otra cuenta.');
    const src = selected === NEW ? { new_iban: clean } : { linked_account_id: selected };
    const sig = `${selected}|${clean}|${amt}`;
    if (key.current.sig !== sig) key.current = { sig, key: newIdempotencyKey() };
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.pull(crc.id, amt, src, key.current.key);
      if ('linked_account_id' in r) {
        setNotice(r.message);
        setIban('');
        setPick(r.linked_account_id);
        await linked.reload();
        return;
      }
      if ('reference' in r) {
        setReview(false);
        nav.reset({
          index: 1,
          routes: [
            { name: 'Tabs' },
            {
              name: 'TransferDone',
              params: {
                hi: '¡Listo! Trajiste dinero a tu cuenta',
                amount: r.amount,
                rows: [
                  ['Desde', source ? `${source.bank_name} · ${source.iban_masked}` : (r.counterparty_name ?? 'Tu otro banco')],
                  ['Hacia', 'Cuenta en colones'],
                  ['Comprobante', r.reference],
                  ['Fecha', receiptDate(r.created_at)],
                ],
              },
            },
          ],
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Traer de otro banco"
      footer={
        <Btn
          label={selected === NEW ? 'Agregar y autorizar' : 'Traer dinero'}
          onPress={() => {
            if (selected === NEW) return go();
            if (!amt) return setError('Escribí el monto.');
            setError(null);
            setReview(true);
          }}
          loading={busy && !review}
          disabled={!crc || (source !== undefined && !source.authorized)}
        />
      }
    >
      <Small>Solo de cuentas a tu nombre. Viaja por SINPE y llega en segundos.</Small>
      <Sect plain>¿De cuál cuenta?</Sect>
      {linked.data?.map((l) => (
        <Opt
          key={l.id}
          selected={selected === l.id}
          onPress={() => setPick(l.id)}
          title={l.bank_name}
          right={<Tag>{l.authorized ? 'Autorizada' : 'Pendiente'}</Tag>}
          sub={`${l.label} · ${l.iban_masked}`}
        />
      ))}
      <Opt
        selected={selected === NEW}
        onPress={() => setPick(NEW)}
        title="+ Agregar otra cuenta mía"
        sub="Ingresás el IBAN y la autorizás una sola vez"
      />
      {selected === NEW && (
        <View>
          <Field
            label="IBAN"
            value={iban}
            onChangeText={(v) => setIban(formatIban(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="CR00 0000 0000 0000 0000 00"
            maxLength={27}
          />
          <Small style={{ marginTop: 6 }}>
            Verificamos que la cuenta esté a tu nombre. La primera vez, tu otro banco te pide aprobar el débito.
          </Small>
        </View>
      )}
      <View style={{ marginTop: 14 }}>
        <Field label="Monto (₡)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      </View>
      {amt && crc && selected !== NEW && (
        <Small style={{ marginTop: 6 }}>
          Tu cuenta colones queda en {money(Number(crc.balance) + Number(amt))}
        </Small>
      )}
      {notice && <Small style={{ marginTop: 8, color: '#633806' }}>{notice}</Small>}
      <ErrorText>{error ?? accounts.error ?? linked.error}</ErrorText>
      {source && amt ? (
        <ReviewSheet
          visible={review}
          onClose={() => setReview(false)}
          title="Revisá antes de traer"
          rows={[
            ['Desde', `${source.bank_name} · ${source.iban_masked}`],
            ['Hacia', 'Cuenta en colones'],
            ['Monto', money(amt)],
            ['Llega', 'Al instante'],
            ['Comisión', 'Gratis'],
          ]}
          slideLabel="Deslizá para traer"
          onConfirm={go}
          busy={busy}
          error={error}
        />
      ) : null}
    </Screen>
  );
}
