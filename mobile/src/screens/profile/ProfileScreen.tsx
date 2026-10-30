// Perfil (según el prototipo): datos del asociado, nivel y puntos, ajustes y cerrar sesión.
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { useLoad } from '../../api/hooks';
import { formatPhone } from '../../format';
import { useSession } from '../../session';
import { colors, radius } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Btn, ErrorText, FieldStatic, HelpButton, Loading, Row, Screen, Small } from '../../ui/kit';
import { Text } from '../../ui/typography';

async function loadProfile() {
  const [me, rewards] = await Promise.all([api.me(), api.rewards()]);
  return { me, rewards };
}

export function ProfileScreen() {
  const nav = useNavigation();
  const { signOut } = useSession();
  const { data, error } = useLoad(loadProfile);
  const [personal, setPersonal] = useState(false);
  if (!data) return error ? <Screen title="Mi perfil"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const { me, rewards } = data;
  const initials = me.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const since = new Date(me.member_since).getFullYear();

  function confirmSignOut() {
    // En web no hay Alert con botones: se cierra directo.
    if (Platform.OS === 'web') return signOut();
    Alert.alert('¿Cerrar sesión?', 'Vas a necesitar tu clave para volver a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen title="Cuenta" back={false} right={<HelpButton />}>
      <View style={st.head}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{initials}</Text>
        </View>
        <Text style={st.name}>{me.full_name}</Text>
        <Small center>{`Cédula ${me.cedula_masked} · Asociado desde ${since}`}</Small>
        <View style={[st.level, { backgroundColor: LEVEL_BG[rewards.level] ?? colors.card }]}>
          <Icon name={rewards.level === 'Oro' ? 'crown' : 'medal'} size={18} color={LEVEL_INK[rewards.level] ?? colors.ink} />
          <Text style={[st.levelText, { color: LEVEL_INK[rewards.level] ?? colors.ink }]}>{`Nivel ${rewards.level}`}</Text>
        </View>
      </View>

      <Row
        first
        icon="star"
        title="Mis recompensas"
        sub={`${rewards.points.toLocaleString('en-US')} puntos`}
        onPress={() => nav.navigate('Rewards')}
      />
      <Row icon="user" title="Datos personales" sub="Celular, correo y dirección" onPress={() => setPersonal((v) => !v)} />
      {personal && (
        <View style={st.personal}>
          <FieldStatic label="Celular" value={formatPhone(me.sinpe_phone)} />
          <FieldStatic label="Correo" value={me.email} />
          <FieldStatic label="Provincia y cantón" value={`${me.province}, ${me.canton}`} />
          <Small>Para cambiarlos, escribinos por Ayuda: los validamos con tu cédula.</Small>
        </View>
      )}
      <Row icon="shield" title="Seguridad" sub="Clave de 6 dígitos · huella o Face ID al entrar" />
      <Row icon="file" title="Estados de cuenta" sub="Pedilos por Ayuda mientras los sumamos aquí" onPress={() => nav.navigate('Help')} />
      <Row
        icon="gift"
        title="Invitá a alguien"
        sub="Ganan 500 puntos cada uno"
        onPress={() => Share.share({ message: 'Abrí tu cuenta en Kooa y ganamos 500 puntos cada uno.' })}
      />
      <Btn label="Cerrar sesión" variant="do" icon="logout" onPress={confirmSignOut} />
    </Screen>
  );
}

// Nivel con medalla, más visible (tono oscuro de cada metal para que se lea bien).
const LEVEL_INK: Record<string, string> = { Bronce: '#8A4F1F', Plata: '#475467', Oro: '#7A5A00' };
const LEVEL_BG: Record<string, string> = { Bronce: '#F6E7D8', Plata: '#EEF0F3', Oro: '#FBF0CC' };

const st = StyleSheet.create({
  level: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F6E7D8', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginTop: 6 },
  levelText: { fontSize: 15, fontWeight: '700' },
  head: { alignItems: 'center', gap: 4, marginBottom: 16 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  personal: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 6 },
});
