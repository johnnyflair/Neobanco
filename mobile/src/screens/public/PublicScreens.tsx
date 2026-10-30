// Sin sesión (según el prototipo): bienvenida, ingresar, recuperar clave y modo visitante.
// El visitante ve simuladores y tasas reales; lo que necesita cuenta abre la hoja de acceso.
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, api } from '../../api/client';
import { errorMessage } from '../../api/hooks';
import type { LoanSim, Rate } from '../../api/types';
import { money } from '../../format';
import { usePublic, usePublicNav } from '../../publicNavigation';
import { colors, radius, type } from '../../theme';
import { BottomSheet } from '../../ui/BottomSheet';
import { Highlight, KooaEyes, KooaLogo } from '../../ui/Brand';
import { Icon, type IconName } from '../../ui/Icon';
import { Btn, Chips, ErrorText, Field, Hero, Opt, Row, Screen, Sect, Small, useEdgeColumns } from '../../ui/kit';
import { Text } from '../../ui/typography';
import { Cents } from '../../ui/Money';

const WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '50688000000';

export function WelcomeScreen() {
  const nav = usePublicNav();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.welcome, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={st.wTop}>
        <KooaLogo height={34} />
        <Pressable onPress={() => nav.navigate('Explore')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Explorar sin cuenta">
          <Text style={st.wLinkText}>Explorar</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <KooaEyes size={210} greet style={{ alignSelf: 'center', marginBottom: 44 }} />
        <Text style={st.wTitle}>Dinero con</Text>
        <Highlight style={st.wTitle} align="flex-start">
          buena cara.
        </Highlight>
        <Text style={st.wSub}>Pagá, recibí y ahorrá al toque.</Text>
      </View>
      <Btn label="Abrí tu cuenta en 3 minutos" onPress={() => nav.navigate('OnbPhone')} />
      <Btn label="Ya tengo cuenta" variant="o" onPress={() => nav.navigate('SignIn')} />
    </View>
  );
}

export function SignInScreen() {
  const nav = usePublicNav();
  const { onSignedIn } = usePublic();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (identifier.replace(/\D/g, '').length < 8) return setError('Escribí tu celular (8 dígitos) o tu cédula.');
    if (!/^\d{6}$/.test(pin)) return setError('La clave tiene 6 dígitos.');
    setBusy(true);
    setError(null);
    try {
      await api.login(identifier.replace(/\s|-/g, ''), pin);
      onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos conectar. Revisá tu internet.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title=""
      footer={
        <>
          <Btn label="Ingresar" onPress={submit} loading={busy} />
          <Btn label="¿Olvidaste tu clave?" variant="l" onPress={() => nav.navigate('Recover')} />
        </>
      }
    >
      <View style={{ marginBottom: 18, gap: 14 }}>
        <KooaLogo height={30} />
        <Text style={type.title} accessibilityRole="header">
          Hola de nuevo
        </Text>
      </View>
      <Field
        label="Celular o cédula"
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType="number-pad"
        autoComplete="tel"
        textContentType="username"
        placeholder="Ej: 8811 2030"
      />
      <Field
        label="Clave de 6 números"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        textContentType="password"
        placeholder="••••••"
        onSubmitEditing={submit}
      />
      <Small>La próxima vez entrás con tu huella o Face ID.</Small>
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

export function RecoverScreen() {
  const [via, setVia] = useState<'sms' | 'whatsapp'>('whatsapp');
  return (
    <Screen
      title="Recuperá tu clave"
      footer={
        <Btn
          label="Continuar"
          onPress={() =>
            Linking.openURL(
              via === 'whatsapp'
                ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, necesito recuperar mi clave de Kooa.')}`
                : `tel:${WHATSAPP.slice(-8)}`,
            )
          }
        />
      }
    >
      <Small style={{ marginBottom: 10 }}>Elegí cómo te atendemos.</Small>
      <Opt selected={via === 'whatsapp'} onPress={() => setVia('whatsapp')} title="Por WhatsApp" sub="Un asesor te ayuda en minutos" />
      <Opt selected={via === 'sms'} onPress={() => setVia('sms')} title="Por teléfono" sub="Llamada al centro de servicio" />
      <View style={st.notice}>
        <Icon name="shield" size={22} color={colors.emeraldDark} />
        <View style={{ flex: 1 }}>
          <Text style={type.itemTitle}>Te vamos a pedir una selfie</Text>
          <Small>Así nadie más puede cambiar tu clave, aunque tenga tu chip.</Small>
        </View>
      </View>
    </Screen>
  );
}

/** Hoja "Para esto necesitás tu cuenta" (modo visitante). */
export function AccessSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const nav = usePublicNav();
  const go = (to: 'OnbPhone' | 'SignIn') => {
    onClose();
    nav.navigate(to);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={st.sheetIc}>
        <Icon name="lock" size={24} color={colors.emeraldDark} />
      </View>
      <Text style={[type.title, { textAlign: 'center', fontSize: 20 }]}>Para esto necesitás tu cuenta</Text>
      <Small center>Abrila en 3 minutos con tu cédula, o entrá si ya sos parte.</Small>
      <Btn label="Abrir cuenta" onPress={() => go('OnbPhone')} />
      <Btn label="Ya tengo cuenta, entrar" variant="o" onPress={() => go('SignIn')} />
      <Btn label="Ahora no" variant="l" onPress={onClose} />
    </BottomSheet>
  );
}

const GUEST_QUICK: { label: string; icon: IconName; accent?: boolean }[] = [
  { label: 'SINPE\nMóvil', icon: 'phone' },
  { label: 'Transferir\ndinero', icon: 'swap' },
  { label: 'Pagar\nrecibos', icon: 'receipt' },
  { label: 'Pedí un\npréstamo', icon: 'cash', accent: true },
];

export function ExploreScreen() {
  const nav = usePublicNav();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const edge = useEdgeColumns(GUEST_QUICK.length, 56);
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <Screen back={false}>
        <View style={[st.exHead, { marginTop: insets.top > 0 ? 0 : 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={st.hello}>Bienvenido</Text>
            <Text style={st.helloSub}>Tu dinero, más cerca</Text>
          </View>
          <Pressable onPress={() => nav.navigate('Welcome')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Salir del modo visitante">
            <Icon name="x" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <View style={st.guest}>
          <Text style={st.guestT}>Abrí tu cuenta en 3 minutos</Text>
          <Text style={st.guestS}>Solo con tu cédula. Sin filas, sin papeles.</Text>
          <Btn label="Abrir cuenta" onPress={() => nav.navigate('OnbPhone')} variant="lime" />
          <Pressable onPress={() => nav.navigate('SignIn')} style={st.guestLink} accessibilityRole="button">
            <Text style={st.guestLinkText}>Ya tengo cuenta, entrar</Text>
          </Pressable>
        </View>

        <View style={[st.quick, { marginHorizontal: edge.bleed }]}>
          {GUEST_QUICK.map((q) => (
            <Pressable
              key={q.label}
              style={({ pressed }) => [st.quickItem, { width: edge.col }, pressed && { opacity: 0.7 }]}
              onPress={() => (q.accent ? nav.navigate('GuestLoan') : setSheet(true))}
              accessibilityRole="button"
              accessibilityLabel={q.label.replace('\n', ' ')}
            >
              <View style={[st.quickIcon, q.accent && { backgroundColor: colors.orangeSoft }]}>
                <Icon name={q.icon} size={26} color={q.accent ? colors.orangeInk : colors.emeraldDark} />
              </View>
              <Text style={st.quickText}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <Sect>Simulá sin compromiso</Sect>
        <Row first icon="cash" title="¿Cuánto me prestan?" sub="Calculá tu cuota en segundos" onPress={() => nav.navigate('GuestLoan')} />
        <Row icon="pig" title="¿Cuánto gano ahorrando?" sub="Ahorro a plazo desde ₡50,000" onPress={() => nav.navigate('GuestSave')} />
        <Sect>Ayuda</Sect>
        <Row first icon="chat" title="Escribinos por WhatsApp" sub="Te atiende una persona" onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)} />
      </Screen>
      <AccessSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const LOAN_TERMS = [12, 24, 36, 48, 60];

export function GuestLoanScreen() {
  const [amount, setAmount] = useState(1_500_000);
  const [term, setTerm] = useState(36);
  const [sim, setSim] = useState<LoanSim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const t = setTimeout(
      () =>
        api.publicLoanSimulate(amount, term).then(
          (r) => {
            setSim(r);
            setError(null);
          },
          (e) => setError(errorMessage(e)),
        ),
      200,
    );
    return () => clearTimeout(t);
  }, [amount, term]);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="¿Cuánto me prestan?" footer={<Btn label="Pedir este préstamo" onPress={() => setSheet(true)} />}>
        <Small>Simulación sin compromiso</Small>
        <Cents style={st.amount}>{money(amount)}</Cents>
        <Slider
          value={amount}
          minimumValue={100_000}
          maximumValue={10_000_000}
          step={50_000}
          onValueChange={setAmount}
          minimumTrackTintColor={colors.emerald}
          maximumTrackTintColor={colors.line}
          thumbTintColor={colors.primary}
          accessibilityLabel="Monto del préstamo"
        />
        <Small style={{ marginBottom: 6, marginTop: 4 }}>Plazo en meses</Small>
        <Chips options={LOAN_TERMS.map((n) => ({ value: n, label: String(n) }))} value={term} onChange={setTerm} />
        <View style={{ marginTop: 14 }}>
          <Hero
            title="Cuota mensual"
            sub="Estimada según monto y plazo"
            big={sim ? money(sim.monthly_payment) : '…'}
            up={`Tasa de ejemplo ${sim?.annual_rate ?? '18'}% anual`}
          />
        </View>
        <ErrorText>{error}</ErrorText>
      </Screen>
      <AccessSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

export function GuestSaveScreen() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [amount, setAmount] = useState(500_000);
  const [term, setTerm] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    api.publicRates().then(
      (r) => setRates(r.filter((x) => x.product === 'term')),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  const rate = Number(rates.find((r) => r.term_months === term)?.annual_rate ?? 0);
  // Interés simple al vencimiento, como lo calcula el ahorro a plazo.
  const gain = Math.round(amount * (rate / 100) * (term / 12));

  return (
    <View style={{ flex: 1 }}>
      <Screen title="¿Cuánto gano ahorrando?" footer={<Btn label="Abrir este ahorro" onPress={() => setSheet(true)} />}>
        <Small>Ahorro a plazo desde ₡50,000</Small>
        <Cents style={st.amount}>{money(amount)}</Cents>
        <Slider
          value={amount}
          minimumValue={50_000}
          maximumValue={10_000_000}
          step={50_000}
          onValueChange={setAmount}
          minimumTrackTintColor={colors.emerald}
          maximumTrackTintColor={colors.line}
          thumbTintColor={colors.primary}
          accessibilityLabel="Monto a ahorrar"
        />
        <Small style={{ marginBottom: 6, marginTop: 4 }}>¿Por cuánto tiempo? (meses)</Small>
        <Chips
          options={(rates.length ? rates : [{ term_months: 12 } as Rate]).map((r) => ({
            value: r.term_months ?? 12,
            label: r.annual_rate ? `${r.term_months} · ${Number(r.annual_rate)}%` : String(r.term_months),
          }))}
          value={term}
          onChange={setTerm}
        />
        <View style={{ marginTop: 14 }}>
          <Hero title="Ganarías" sub="Intereses al vencer" big={rates.length ? money(gain) : '…'} up={`Tasa ${rate}% anual`} />
        </View>
        <ErrorText>{error}</ErrorText>
      </Screen>
      <AccessSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  welcome: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 22 },
  wTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wTitle: { fontSize: 36, lineHeight: 42, fontWeight: '700', color: colors.ink },
  wSub: { fontSize: 16, lineHeight: 23, color: colors.muted, marginTop: 12 },
  wLinkText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginTop: 14 },
  sheetIc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  exHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  hello: { ...type.title, fontSize: 21 },
  helloSub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  guest: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 18 },
  guestT: { fontSize: 19, fontWeight: '700', color: colors.white },
  guestS: { fontSize: 14, color: colors.heroSub, marginTop: 4, marginBottom: 4 },
  guestLink: { alignItems: 'center', paddingTop: 12 },
  guestLinkText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  quick: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  quickItem: { alignItems: 'center', gap: 7 },
  quickIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13.5, lineHeight: 17, fontWeight: '600', textAlign: 'center', color: colors.ink },
  amount: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: colors.amount, marginTop: 12, marginBottom: 6 },
});
