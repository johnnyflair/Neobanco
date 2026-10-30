// Ayuda (opción A aprobada): ojos y saludo arriba, temas en lista, respuesta de Kooa debajo, acceso directo a "Fraude o robo",
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
import { KooaEyes } from '../../ui/Brand';
import { Icon, type IconName } from '../../ui/Icon';
import { Btn, ErrorText, Note, Opt, Row, Screen, Sect, Small, Steps, Tag } from '../../ui/kit';
import { Text } from '../../ui/typography';

// Canales de la cooperativa: se configuran por despliegue (los de ejemplo son del prototipo).
const WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '50688000000';
const PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '88000000';
const fmt8 = (n: string) => `${n.slice(-8, -4)}-${n.slice(-4)}`;

export const FRAUD_REASONS: { id: FraudReason; t: string }[] = [
  { id: 'stolen_phone', t: 'Perdí o me robaron el celular' },
  { id: 'lost_card', t: 'Perdí o me robaron la tarjeta' },
  { id: 'unknown_charge', t: 'No reconozco un movimiento' },
  { id: 'suspicious_contact', t: 'Me llamaron haciéndose pasar por Kooa' },
];
const reasonText = (r: FraudReason) => FRAUD_REASONS.find((x) => x.id === r)?.t ?? 'Reporte de fraude';

type Msg = { me: boolean; text: string; action?: 'fraud' | 'whatsapp' };
const CHIPS: { q: string; icon: IconName; a: Msg }[] = [
  {
    q: 'No reconozco un cobro',
    icon: 'card',
    a: { me: false, text: 'Lo primero es proteger tu dinero: bloqueemos tus tarjetas y abramos el reclamo.', action: 'fraud' },
  },
  {
    q: 'No me llegó un SINPE',
    icon: 'phone',
    a: {
      me: false,
      text: 'Los SINPE Móvil llegan en segundos. Si pasaron más de 15 minutos, pedile al remitente el comprobante y escribinos con ese número para rastrearlo.',
      action: 'whatsapp',
    },
  },
  { q: 'Hablar con alguien', icon: 'user', a: { me: false, text: 'Te atiende un asesor por WhatsApp. Espera aproximada: 3 minutos.', action: 'whatsapp' } },
];

const openWhatsApp = () => Linking.openURL(`https://wa.me/${WHATSAPP}`);

export function HelpScreen() {
  const nav = useNavigation();
  const cases = useLoad(api.supportCases);
  // La respuesta de Kooa al tema elegido aparece debajo de la lista (una a la vez).
  const [picked, setPicked] = useState<(typeof CHIPS)[number] | null>(null);
  const open = cases.data?.filter((c) => c.status === 'open') ?? [];
  const m = picked?.a;

  return (
    <Screen title="Ayuda">
      <View style={st.hello}>
        <KooaEyes size={56} />
        <View style={{ flex: 1 }}>
          <Text style={st.helloT}>¿En qué te ayudo?</Text>
          <Text style={st.helloS}>Soy Kooa. Elegí un tema.</Text>
        </View>
      </View>

      {CHIPS.map((c, i) => (
        <Pressable
          key={c.q}
          style={({ pressed }) => [st.topic, i === 0 && { borderTopWidth: 0 }, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: picked?.q === c.q }}
          onPress={() => setPicked(c)}
        >
          <View style={st.topicIcon}>
            <Icon name={c.icon} size={22} color={colors.primary} />
          </View>
          <Text style={[st.topicT, picked?.q === c.q && { color: colors.primary }]}>{c.q}</Text>
          <Icon name="chev" size={16} color={colors.muted} />
        </Pressable>
      ))}

      {m && (
        <View style={st.answer} accessibilityLiveRegion="polite">
          <View style={st.answerHead}>
            <KooaEyes size={34} expression={m.action === 'fraud' ? 'firme' : 'contenta'} browColor={m.action === 'fraud' ? colors.navy : colors.primary} />
            <Text style={st.answerT}>{m.text}</Text>
          </View>
          {m.action === 'fraud' && <Btn label="Bloquear y reportar" variant="do" icon="lock" onPress={() => nav.navigate('Fraud', { reason: 'unknown_charge' })} />}
          {m.action === 'whatsapp' && <Btn label="Escribir por WhatsApp" variant="o" onPress={openWhatsApp} />}
        </View>
      )}

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
              tag="Abierto"
              sub={`${reasonText(c.reason)}\n${shortDate(c.created_at)}`}
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
      title="Protejamos tu dinero"
      footer={<Btn label="Bloquear todo ahora" variant="do" icon="lock" onPress={go} loading={busy} />}
    >
      <KooaEyes size={84} expression="firme" browColor={colors.navy} style={{ alignSelf: 'center', marginBottom: 14 }} />
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
  hello: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  helloT: { fontSize: 22, fontWeight: '700', color: colors.ink },
  helloS: { fontSize: 14, color: colors.muted, marginTop: 2 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderTopWidth: 1, borderTopColor: colors.line },
  topicIcon: { width: 24, alignItems: 'center' },
  topicT: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  answer: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 12, marginTop: 8 },
  answerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  answerT: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 14,
  },
  alertT: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
