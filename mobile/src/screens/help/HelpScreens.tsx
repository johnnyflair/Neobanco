// Ayuda (según el prototipo): chat con respuestas rápidas, acceso directo a "Fraude o robo",
// otros canales y seguimiento de casos. Reportar fraude bloquea todas las tarjetas al instante.
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import type { FraudReason } from '../../api/types';
import { shortDate } from '../../format';
import type { RootProps } from '../../navigation';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Btn, ErrorText, Note, Opt, Row, Screen, Sect, Small, Steps } from '../../ui/kit';
import { Text } from '../../ui/typography';

// Canales de la cooperativa: se configuran por despliegue (los de ejemplo son del prototipo).
const WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '50688000000';
const PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '88000000';
const fmt8 = (n: string) => `${n.slice(-8, -4)}-${n.slice(-4)}`;

export const FRAUD_REASONS: { id: FraudReason; t: string }[] = [
  { id: 'stolen_phone', t: 'Perdí o me robaron el celular' },
  { id: 'lost_card', t: 'Perdí o me robaron la tarjeta' },
  { id: 'unknown_charge', t: 'No reconozco un movimiento' },
  { id: 'suspicious_contact', t: 'Me llamaron haciéndose pasar por la cooperativa' },
];
const reasonText = (r: FraudReason) => FRAUD_REASONS.find((x) => x.id === r)?.t ?? 'Reporte de fraude';

type Msg = { me: boolean; text: string; action?: 'fraud' | 'whatsapp' };
const CHIPS: { q: string; a: Msg }[] = [
  {
    q: 'No reconozco un cobro',
    a: { me: false, text: 'Lo primero es proteger tu plata: bloqueemos tus tarjetas y abramos el reclamo.', action: 'fraud' },
  },
  {
    q: 'No me llegó un SINPE',
    a: {
      me: false,
      text: 'Los SINPE Móvil llegan en segundos. Si pasaron más de 15 minutos, pedile al remitente el comprobante y escribinos con ese número para rastrearlo.',
      action: 'whatsapp',
    },
  },
  { q: 'Hablar con alguien', a: { me: false, text: 'Te atiende un asesor por WhatsApp. Espera aproximada: 3 minutos.', action: 'whatsapp' } },
];

const openWhatsApp = () => Linking.openURL(`https://wa.me/${WHATSAPP}`);

export function HelpScreen() {
  const nav = useNavigation();
  const cases = useLoad(api.supportCases);
  const [chat, setChat] = useState<Msg[]>([
    { me: false, text: 'Hola. Puedo ayudarte a pagar, transferir, bloquear tu tarjeta o conectarte con una persona.' },
  ]);
  const open = cases.data?.filter((c) => c.status === 'open') ?? [];

  return (
    <Screen title="¿En qué te ayudo?" back={false}>
      {chat.map((m, i) => (
        <View key={i}>
          <View style={[st.bubble, m.me ? st.me : st.bot]}>
            <Text style={[st.bubbleText, m.me && { color: colors.white }]}>{m.text}</Text>
          </View>
          {m.action === 'fraud' && <Btn label="Bloquear y reportar" variant="do" icon="lock" onPress={() => nav.navigate('Fraud', { reason: 'unknown_charge' })} />}
          {m.action === 'whatsapp' && <Btn label="Escribir por WhatsApp" variant="o" onPress={openWhatsApp} />}
        </View>
      ))}
      <View style={st.chips}>
        {CHIPS.map((c) => (
          <Pressable
            key={c.q}
            style={st.chip}
            accessibilityRole="button"
            onPress={() => setChat((h) => [...h, { me: true, text: c.q }, c.a])}
          >
            <Text style={st.chipText}>{c.q}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={st.alert} onPress={() => nav.navigate('Fraud', {})} accessibilityRole="button">
        <Icon name="alert" size={22} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={st.alertT}>¿Fraude o robo?</Text>
          <Small>Bloqueamos tus tarjetas al instante</Small>
        </View>
        <Icon name="chev" size={16} color={colors.danger} />
      </Pressable>

      {open.length > 0 && (
        <>
          <Sect>Mis casos</Sect>
          {open.map((c, i) => (
            <Row
              key={c.number}
              first={i === 0}
              icon="file"
              title={`Caso ${c.number}`}
              sub={`${reasonText(c.reason)} · ${shortDate(c.created_at)}`}
              onPress={() => nav.navigate('Case', { supportCase: c })}
            />
          ))}
        </>
      )}

      <Sect>Otros canales</Sect>
      <Row first icon="chat" title="WhatsApp" sub={fmt8(WHATSAPP)} onPress={openWhatsApp} />
      <Row icon="phone" title="Llamar a un asesor" sub="Espera aprox. 3 min" onPress={() => Linking.openURL(`tel:${PHONE}`)} />
      <Row icon="building" title="Sucursal más cercana" sub="Aserrí centro" />
    </Screen>
  );
}

export function FraudScreen({ route }: RootProps<'Fraud'>) {
  const nav = useNavigation();
  const [sel, setSel] = useState<FraudReason>(route.params?.reason ?? 'stolen_phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const c = await api.reportFraud(sel);
      nav.navigate('Case', { supportCase: c, fresh: true });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Protejamos tu plata"
      footer={<Btn label="Bloquear todo ahora" variant="do" icon="lock" onPress={go} loading={busy} />}
    >
      <Small style={{ marginBottom: 10 }}>Elegí lo que pasó</Small>
      {FRAUD_REASONS.map((r) => (
        <Opt key={r.id} selected={r.id === sel} onPress={() => setSel(r.id)} title={r.t} />
      ))}
      <Small style={{ marginTop: 10 }}>
        Bloqueamos todas tus tarjetas al instante y abrimos un caso. La cooperativa nunca te pide tu clave por teléfono.
      </Small>
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

export function CaseScreen({ route }: RootProps<'Case'>) {
  const nav = useNavigation();
  const c = route.params.supportCase;
  const when = route.params.fresh ? 'Ahora' : shortDate(c.created_at);
  const steps = [
    { t: c.cards_locked === 1 ? 'Tarjeta bloqueada' : 'Tarjetas bloqueadas', s: when },
    { t: 'Reclamo abierto', s: when },
    { t: 'En investigación', s: 'Respuesta en hasta 10 días hábiles' },
    { t: 'Resolución', s: 'Te avisamos por notificación y WhatsApp' },
  ];
  return (
    <Screen title={`Caso ${c.number}`}>
      <Small style={{ marginBottom: 16 }}>{reasonText(c.reason)}</Small>
      <Steps steps={steps} current={c.status === 'open' ? 3 : 4} />
      <Note>
        {c.cards_locked
          ? `Bloqueamos ${c.cards_locked === 1 ? 'tu tarjeta' : `tus ${c.cards_locked} tarjetas`}. Si fue un error, podés desbloquearlas desde Tarjetas con tu clave.`
          : 'Tus tarjetas ya estaban bloqueadas. Un asesor revisa tu caso.'}
      </Note>
      <Btn label="Ver mis tarjetas" variant="o" onPress={() => nav.navigate('Tabs', { screen: 'Cards' })} />
      <Btn label="Ir al inicio" variant="l" onPress={() => nav.navigate('Tabs', { screen: 'Home' })} />
    </Screen>
  );
}

const st = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  bot: { backgroundColor: colors.card, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  me: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 14 },
  chip: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 4,
  },
  alertT: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
