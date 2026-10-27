// Enviar a una cuenta IBAN, con el mismo flujo que SINPE Móvil: al completar los 22 caracteres
// aparece el titular verificado → monto y motivo → revisar y deslizar → ¡listo!
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { errorMessage } from '../../api/hooks';
import { formatIban } from '../../format';
import { Btn, Field, Screen, Small } from '../../ui/kit';
import { WhoCard } from './SinpeScreens';

export function IbanScreen() {
  const nav = useNavigation();
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = iban.replace(/\s/g, '');

  useEffect(() => {
    setHolder(null);
    setError(null);
    if (clean.length !== 22) return;
    let alive = true;
    setChecking(true);
    api
      .ibanLookup(clean)
      .then((r) => alive && setHolder(r.holder))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [clean]);

  const go = () => holder && nav.navigate('SendAmount', { kind: 'iban', to: clean, name: holder, isNew: true });

  return (
    <Screen
      title="Enviar a cuenta IBAN"
      footer={<Btn label={holder ? `Sí, es ${holder.split(' ')[0]}` : 'Continuar'} onPress={go} disabled={!holder} />}
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
      <WhoCard
        looking={checking}
        found={holder ? { name: holder, seed: clean.replace(/\D/g, '') } : null}
        okText="Es el titular de esta cuenta"
        error={error}
        hint="Al completar los 22 caracteres te mostramos de quién es la cuenta."
      />
      <Small center>Llega al instante por SINPE, a cualquier banco del país.</Small>
    </Screen>
  );
}
