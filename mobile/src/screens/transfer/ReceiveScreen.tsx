// Recibir dinero: número de SINPE Móvil e IBAN, con vista previa del mensaje y botones para
// compartir por WhatsApp, por el menú del sistema o copiar.
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { useLoad } from '../../api/hooks';
import { formatIban, formatPhone } from '../../format';
import { colors, radius } from '../../theme';
import { Btn, ErrorText, FieldStatic, Loading, Screen, Sect } from '../../ui/kit';
import { Text } from '../../ui/typography';

async function loadReceive() {
  const [me, accounts] = await Promise.all([api.me(), api.accounts()]);
  const crc = accounts.find((a) => a.type === 'savings' && a.currency === 'CRC');
  const detail = crc ? await api.account(crc.id) : null;
  return { me, iban: detail?.iban ?? null };
}

export function ReceiveScreen() {
  const { data, error } = useLoad(loadReceive);
  const [copied, setCopied] = useState(false);
  if (!data) return error ? <Screen title="Recibir dinero"><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const phone = formatPhone(data.me.sinpe_phone);
  const iban = data.iban ? formatIban(data.iban) : null;
  const text = [
    'Hola, estos son mis datos para transferirme:',
    data.me.full_name,
    `SINPE Móvil: ${phone}`,
    ...(iban ? [`IBAN: ${iban}`] : []),
  ].join('\n');

  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Screen title="Recibir dinero">
      <View style={st.hero}>
        <Text style={st.ht}>SINPE Móvil</Text>
        <Text style={st.hd}>Tu número para recibir</Text>
        <Text style={st.big}>{phone}</Text>
        <Text style={st.up}>{data.me.full_name.split(' ').slice(0, 2).join(' ')}</Text>
      </View>
      {iban && <FieldStatic label="IBAN" value={iban} />}
      <Sect>Así le va a llegar</Sect>
      <Text style={st.msg}>{text}</Text>
      <Btn
        label="Compartir por WhatsApp"
        icon="chat"
        onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`)}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Más opciones" icon="share" variant="o" onPress={() => Share.share({ message: text })} style={{ flex: 1 }} />
        <Btn label={copied ? 'Copiado' : 'Copiar'} icon={copied ? 'check' : 'copy'} variant="o" onPress={copy} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  ht: { fontSize: 16, fontWeight: '700', color: colors.white },
  hd: { fontSize: 12, color: colors.heroSub, marginTop: 2, marginBottom: 8 },
  big: { fontSize: 23, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
  up: { fontSize: 12, color: colors.lime, marginTop: 2 },
  msg: {
    backgroundColor: colors.whatsapp,
    color: colors.navy,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    overflow: 'hidden',
  },
});
