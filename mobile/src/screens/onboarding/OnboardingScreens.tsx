// Registro (según el prototipo, 8 pasos): celular → código → cédula → selfie → datos →
// preguntas de la ley 8204 → clave → listo (o "en revisión" si la identidad no se confirma sola).
// La lectura de la cédula y la prueba de vida las hace Didit; mientras se integra su SDK, esos dos
// pasos explican qué va a pasar y el asociado escribe sus datos en el paso 5.
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ApiError, api } from '../../api/client';
import { errorMessage } from '../../api/hooks';
import type { Kyc } from '../../api/types';
import { formatPhone } from '../../format';
import { usePublic, usePublicNav, type PublicProps } from '../../publicNavigation';
import { colors, radius, type } from '../../theme';
import { Highlight, KooaEyes } from '../../ui/Brand';
import { Icon, type IconName } from '../../ui/Icon';
import { Btn, Check, Chips, ErrorText, Field, Row, Screen, Small } from '../../ui/kit';
import { Text } from '../../ui/typography';

const WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '50688000000';
const TOTAL = 7;

function StepBar({ n }: { n: number }) {
  return (
    <View style={st.stepBar} accessibilityLabel={`Paso ${n} de ${TOTAL}`}>
      {Array.from({ length: TOTAL }, (_, i) => (
        <View key={i} style={[st.stepSeg, i < n - 1 && { backgroundColor: colors.teal }, i === n - 1 && { backgroundColor: n === TOTAL ? colors.teal : colors.lime }]} />
      ))}
    </View>
  );
}

const Lead = ({ children }: { children: string }) => <Small style={{ marginBottom: 14 }}>{children}</Small>;

export function OnbPhoneScreen() {
  const nav = usePublicNav();
  const { draft } = usePublic();
  const [phone, setPhone] = useState(draft.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, '');

  async function send() {
    if (!/^[5-8]\d{7}$/.test(digits)) return setErr('Escribí un celular de 8 dígitos.');
    setBusy(true);
    setErr(null);
    try {
      const r = await api.otpStart(digits);
      draft.phone = digits;
      nav.navigate('OnbCode', { phone: digits, challengeId: r.challenge_id, debugCode: r.debug_code, resendIn: r.resend_in });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="¿Cuál es tu celular?" footer={<Btn label="Enviar código" onPress={send} loading={busy} />}>
      <StepBar n={1} />
      <Lead>Va a ser tu número de SINPE Móvil. Te mandamos un código para confirmarlo.</Lead>
      <Field
        label="Celular · +506"
        value={formatPhone(digits)}
        onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 8))}
        keyboardType="number-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="8811 2030"
        autoFocus
      />
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

export function OnbCodeScreen({ route }: PublicProps<'OnbCode'>) {
  const nav = usePublicNav();
  const { draft } = usePublic();
  const { phone } = route.params;
  const [challenge, setChallenge] = useState(route.params.challengeId);
  const [debug, setDebug] = useState(route.params.debugCode);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(route.params.resendIn);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function confirm() {
    if (!/^\d{6}$/.test(code)) return setErr('El código tiene 6 dígitos.');
    setBusy(true);
    setErr(null);
    try {
      draft.onboardingToken = (await api.otpVerify(challenge, code)).onboarding_token;
      nav.navigate('OnbScan');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErr(null);
    try {
      const r = await api.otpStart(phone);
      setChallenge(r.challenge_id);
      setDebug(r.debug_code);
      setWait(r.resend_in);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <Screen
      title="Escribí el código"
      footer={
        <>
          <Btn label="Confirmar" onPress={confirm} loading={busy} />
          <Btn
            label={wait > 0 ? `Reenviar en 0:${String(wait).padStart(2, '0')}` : 'Reenviar código'}
            variant="l"
            onPress={resend}
            disabled={wait > 0}
          />
        </>
      }
    >
      <StepBar n={2} />
      <Lead>{`Lo mandamos por SMS al ${formatPhone(phone)}.`}</Lead>
      <Field
        label="Código"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        placeholder="••••••"
        autoFocus
      />
      {debug && <Small>{`Ambiente de prueba: tu código es ${debug}`}</Small>}
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

function IdStep({ n, title, lead, icon, frame, cta, onNext }: {
  n: number;
  title: string;
  lead: string;
  icon: IconName;
  frame: string;
  cta: string;
  onNext: () => void;
}) {
  return (
    <Screen title={title} footer={<Btn label={cta} onPress={onNext} />}>
      <StepBar n={n} />
      <Lead>{lead}</Lead>
      {icon === 'user' && <KooaEyes size={56} expression="firme" browColor={colors.navy} style={{ alignSelf: 'center', marginBottom: 10 }} />}
      <View style={[st.frame, icon === 'user' && st.frameRound]}>
        <Icon name={icon} size={46} color={colors.teal} />
        <Text style={st.frameText}>{frame}</Text>
      </View>
      <Small center>Tus fotos se usan solo para verificar tu identidad (Didit) y se guardan cifradas.</Small>
    </Screen>
  );
}

export function OnbScanScreen() {
  const nav = usePublicNav();
  return (
    <IdStep
      n={3}
      title="Escaneá tu cédula"
      lead="Frente y reverso. Con eso confirmamos tus datos."
      icon="file"
      frame="Poné tu cédula dentro del recuadro"
      cta="Escanear cédula"
      onNext={() => nav.navigate('OnbSelfie')}
    />
  );
}

export function OnbSelfieScreen() {
  const nav = usePublicNav();
  const { draft } = usePublic();
  return (
    <IdStep
      n={3}
      title="Confirmemos que sos vos"
      lead="Buena luz, sin lentes de sol. Parpadeá cuando te digamos."
      icon="user"
      frame="Tu cara dentro del círculo"
      cta="Tomar selfie"
      onNext={() => {
        draft.selfieOk = true;
        nav.navigate('OnbData');
      }}
    />
  );
}

const PROVINCES = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'];
const cedulaFmt = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 9);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5)].filter(Boolean).join('-');
};

export function OnbDataScreen() {
  const nav = usePublicNav();
  const { draft } = usePublic();
  const [name, setName] = useState(draft.fullName ?? '');
  const [cedula, setCedula] = useState(draft.cedula ?? '');
  const [email, setEmail] = useState(draft.email ?? '');
  const [province, setProvince] = useState(draft.province ?? 'San José');
  const [canton, setCanton] = useState(draft.canton ?? '');
  const [err, setErr] = useState<string | null>(null);

  function next() {
    if (name.trim().split(/\s+/).length < 2) return setErr('Escribí tu nombre y apellidos como en la cédula.');
    if (cedula.replace(/\D/g, '').length !== 9) return setErr('La cédula tiene 9 dígitos.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Revisá tu correo.');
    if (canton.trim().length < 3) return setErr('Escribí tu cantón.');
    Object.assign(draft, { fullName: name.trim(), cedula, email: email.trim(), province, canton: canton.trim() });
    nav.navigate('OnbKyc');
  }

  return (
    <Screen title="¿Todo bien?" footer={<Btn label="Continuar" onPress={next} />}>
      <StepBar n={4} />
      <Lead>Revisá tus datos tal como aparecen en tu cédula.</Lead>
      <Field label="Nombre completo" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <Field label="Cédula" value={cedula} onChangeText={(t) => setCedula(cedulaFmt(t))} keyboardType="number-pad" placeholder="1-2345-6789" />
      <Field
        label="Correo"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
      />
      <Small style={{ marginTop: 10, marginBottom: 6 }}>Provincia</Small>
      <Chips options={PROVINCES.map((p) => ({ value: p, label: p }))} value={province} onChange={setProvince} />
      <Field label="Cantón" value={canton} onChangeText={setCanton} autoCapitalize="words" />
      <ErrorText>{err}</ErrorText>
    </Screen>
  );
}

export function OnbKycScreen() {
  const nav = usePublicNav();
  const { draft } = usePublic();
  const [occ, setOcc] = useState<Kyc['occupation']>(draft.kyc?.occupation ?? 'asalariado');
  const [vol, setVol] = useState<Kyc['monthly_volume']>(draft.kyc?.monthly_volume ?? 'lt_500k');
  const [src, setSrc] = useState<Kyc['source_of_funds']>(draft.kyc?.source_of_funds ?? 'salario');

  return (
    <Screen
      title="Tres preguntas rápidas"
      footer={
        <Btn
          label="Continuar"
          onPress={() => {
            draft.kyc = { occupation: occ, monthly_volume: vol, source_of_funds: src };
            nav.navigate('OnbPin');
          }}
        />
      }
    >
      <StepBar n={5} />
      <Lead>Las pide la ley 8204 para proteger tu cuenta.</Lead>
      <Text style={st.q}>¿A qué te dedicás?</Text>
      <Chips
        options={[
          { value: 'asalariado', label: 'Asalariado' },
          { value: 'negocio_propio', label: 'Negocio propio' },
          { value: 'pensionado', label: 'Pensionado' },
          { value: 'estudiante', label: 'Estudiante' },
        ]}
        value={occ}
        onChange={setOcc}
      />
      <Text style={st.q}>¿Cuánto vas a mover al mes?</Text>
      <Chips
        options={[
          { value: 'lt_500k', label: 'Menos de ₡500 mil' },
          { value: '500k_1500k', label: '₡500 mil a ₡1.5 M' },
          { value: 'gt_1500k', label: 'Más de ₡1.5 M' },
        ]}
        value={vol}
        onChange={setVol}
      />
      <Text style={st.q}>¿De dónde viene tu dinero?</Text>
      <Chips
        options={[
          { value: 'salario', label: 'Salario' },
          { value: 'ventas', label: 'Ventas' },
          { value: 'pension', label: 'Pensión' },
          { value: 'otro', label: 'Otro' },
        ]}
        value={src}
        onChange={setSrc}
      />
    </Screen>
  );
}

export function OnbPinScreen() {
  const nav = usePublicNav();
  const { draft } = usePublic();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  async function open() {
    if (!/^\d{6}$/.test(pin)) return setErr('La clave tiene 6 dígitos.');
    if (pin !== pin2) return setErr('Las claves no coinciden.');
    if (!terms) return setErr('Aceptá los Términos y la Política de privacidad para continuar.');
    if (!draft.onboardingToken || !draft.kyc || !draft.cedula) return setErr('Tu verificación venció. Empezá de nuevo.');
    setBusy(true);
    setErr(null);
    setExists(false);
    try {
      const r = await api.register({
        onboarding_token: draft.onboardingToken,
        cedula: draft.cedula,
        full_name: draft.fullName ?? '',
        email: draft.email ?? '',
        province: draft.province ?? '',
        canton: draft.canton ?? '',
        selfie_ok: draft.selfieOk ?? false,
        kyc: draft.kyc,
        pin,
        accept_terms: true,
      });
      const phone = draft.phone ?? '';
      if (r.kyc_status === 'verified') nav.reset({ index: 0, routes: [{ name: 'OnbDone', params: { firstName: (draft.fullName ?? '').split(' ')[0], phone } }] });
      else nav.reset({ index: 0, routes: [{ name: 'OnbReview', params: { phone } }] });
    } catch (e) {
      setErr(errorMessage(e));
      setExists(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Creá tu clave" footer={<Btn label="Abrir mi cuenta" onPress={open} loading={busy} />}>
      <StepBar n={6} />
      <Lead>6 dígitos. No uses tu fecha de nacimiento ni números seguidos.</Lead>
      <Field
        label="Clave"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        textContentType="newPassword"
        placeholder="••••••"
      />
      <Field
        label="Repetila"
        value={pin2}
        onChangeText={(t) => setPin2(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        textContentType="newPassword"
        placeholder="••••••"
      />
      <Small style={{ marginTop: 8 }}>Después vas a poder entrar con tu huella o Face ID.</Small>
      <Check checked={terms} onChange={setTerms} label="Acepto los Términos y la Política de privacidad" />
      <ErrorText>{err}</ErrorText>
      {exists && <Btn label="Ir a ingresar" variant="o" onPress={() => nav.navigate('SignIn')} />}
    </Screen>
  );
}

export function OnbDoneScreen({ route }: PublicProps<'OnbDone'>) {
  const { onSignedIn } = usePublic();
  const { firstName, phone } = route.params;
  return (
    <Screen footer={<Btn label="Ir a mi cuenta" onPress={onSignedIn} />}>
      <StepBar n={7} />
      <KooaEyes size={120} expression="guau" style={{ alignSelf: 'center', marginTop: 10, marginBottom: 16 }} />
      <Text style={[type.title, { textAlign: 'center' }]}>Ya sos parte,</Text>
      <Highlight style={[type.title, { textAlign: 'center' }]}>{firstName}</Highlight>
      <Small center>{`Tu cuenta y tu SINPE Móvil ${formatPhone(phone)} ya están activos.`}</Small>
      <View style={{ marginTop: 18 }}>
        <Row first icon="star" title="500 puntos de bienvenida" sub="Ya están en tus recompensas" />
        <Row icon="card" title="Tarjeta de débito digital" sub="Lista para comprar en línea" right={<Text style={st.active}>Activa</Text>} />
      </View>
    </Screen>
  );
}

export function OnbReviewScreen({ route }: PublicProps<'OnbReview'>) {
  const nav = usePublicNav();
  return (
    <Screen
      footer={
        <>
          <Btn label="Escribinos por WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${WHATSAPP}`)} />
          <Btn label="Explorar Kooa" variant="o" onPress={() => nav.reset({ index: 0, routes: [{ name: 'Explore' }] })} />
        </>
      }
    >
      <KooaEyes size={110} expression="firme" browColor={colors.navy} style={{ alignSelf: 'center', marginTop: 10, marginBottom: 16 }} />
      <Text style={[type.title, { textAlign: 'center' }]}>Estamos revisando tu identidad</Text>
      <Small center>
        No pudimos confirmarla automáticamente. Pasa con cédulas gastadas o fotos con poca luz. Una persona del equipo la revisa.
      </Small>
      <View style={{ marginTop: 18 }}>
        <Row first icon="chat" title="Te avisamos por WhatsApp" sub={`Al ${formatPhone(route.params.phone)} cuando tu cuenta esté lista`} />
        <Row icon="grow" title="Mientras tanto podés explorar" sub="Simuladores, tasas y servicios de Kooa" />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  stepBar: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  stepSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  frame: {
    height: 210,
    borderRadius: radius.lg,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: colors.lime,
    borderStyle: 'dashed',
  },
  frameRound: { width: 210, alignSelf: 'center', borderRadius: 105 },
  frameText: { color: colors.heroSub, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  q: { fontSize: 15, fontWeight: '600', color: colors.ink, marginTop: 16, marginBottom: 8 },
  ok: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 14,
  },
  active: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
