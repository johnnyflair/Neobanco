// Enviar a una cuenta IBAN, con el mismo flujo que SINPE Móvil: al completar los 22 caracteres
// aparece el titular verificado → monto y motivo → revisar y deslizar → ¡listo!
// Opción A (accesible): el "CR" ya está puesto, se escriben solo los 20 números agrupados de a 4,
// con cuántos faltan, una barrita de avance y un botón para pegar.
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage } from '../../api/hooks';
import { colors } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Btn, Screen, Small } from '../../ui/kit';
import { Text, TextInput } from '../../ui/typography';
import { WhoCard } from './SinpeScreens';

export function IbanScreen() {
  const nav = useNavigation();
  const [digits, setDigits] = useState('');
  const [holder, setHolder] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = `CR${digits}`;
  const missing = 20 - digits.length;
  // "05015202001026284066" → "05 0152 0200 1026 2840 66" (como viene impreso en los comprobantes).
  const grouped = [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6, 10), digits.slice(10, 14), digits.slice(14, 18), digits.slice(18, 20)]
    .filter(Boolean)
    .join(' ');
  const onType = (v: string) => setDigits(v.toUpperCase().replace(/^CR/, '').replace(/\D/g, '').slice(0, 20));
  async function paste() {
    onType((await Clipboard.getStringAsync()).replace(/\s/g, ''));
  }

  useEffect(() => {
    setHolder(null);
    setError(null);
    if (digits.length !== 20) return;
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
      title="Enviar a otros bancos"
      footer={<Btn label={holder ? `Sí, es ${holder.split(' ')[0]}` : 'Continuar'} onPress={go} disabled={!holder} />}
    >
      <Text style={st.ask}>Escribí la cuenta IBAN</Text>
      <Small>Son 20 números después de CR. Los encontrás en el comprobante o en la app del otro banco.</Small>
      <View style={[st.field, holder && { borderColor: colors.primary }]}>
        <Text style={st.cr}>CR</Text>
        <TextInput
          value={grouped}
          onChangeText={onType}
          keyboardType="number-pad"
          autoCorrect={false}
          placeholder="Ej: 05 0152 0200 1026 2840 66"
          placeholderTextColor="#98A2B3"
          maxLength={25}
          autoFocus
          accessibilityLabel="Cuenta IBAN, los 20 números después de CR"
          style={st.input}
        />
      </View>
      <View style={st.metaRow}>
        <Text style={st.meta}>{missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'número' : 'números'}` : 'Cuenta completa'}</Text>
        <Pressable onPress={paste} hitSlop={10} style={st.paste} accessibilityRole="button" accessibilityLabel="Pegar la cuenta copiada">
          <Icon name="copy" size={17} color={colors.primary} />
          <Text style={st.pasteText}>Pegar</Text>
        </Pressable>
      </View>
      <View style={st.bar}>
        <View style={[st.barFill, { width: `${(digits.length / 20) * 100}%` }]} />
      </View>
      <WhoCard
        looking={checking}
        found={holder ? { name: holder, seed: clean.replace(/\D/g, '') } : null}
        okText="Es el titular de esta cuenta"
        error={error}
        hint="Cuando esté completa te mostramos de quién es la cuenta, antes de enviar."
      />
      <Small center>Llega al instante por SINPE, a cualquier banco del país.</Small>
    </Screen>
  );
}

const st = StyleSheet.create({
  ask: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4, marginBottom: 2 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 60, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 12, marginTop: 12 },
  cr: { fontSize: 18, fontWeight: '700', color: colors.primaryInk, backgroundColor: colors.mint, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  input: { flex: 1, fontSize: 19, fontWeight: '600', color: colors.ink, letterSpacing: 0.5, fontVariant: ['tabular-nums'], outlineWidth: 0, outlineStyle: 'none' } as object,
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  meta: { fontSize: 14, color: colors.muted },
  paste: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pasteText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.card, marginTop: 8, marginBottom: 6 },
  barFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
});
