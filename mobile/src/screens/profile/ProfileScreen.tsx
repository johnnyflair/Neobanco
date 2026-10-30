// Perfil (según el prototipo): datos del asociado, nivel y puntos, ajustes y cerrar sesión.
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { api } from '../../api/client';
import { errorMessage, useLoad } from '../../api/hooks';
import { formatPhone } from '../../format';
import { useSession } from '../../session';
import { colors } from '../../theme';
import { BottomSheet } from '../../ui/BottomSheet';
import { Icon } from '../../ui/Icon';
import { pickPhoto, PhotoUnavailable } from '../../ui/photo';
import { Btn, ErrorText, HelpButton, Loading, Row, Screen, Small } from '../../ui/kit';
import { Text } from '../../ui/typography';

async function loadProfile() {
  const [me, rewards] = await Promise.all([api.me(), api.rewards()]);
  return { me, rewards };
}

export function ProfileScreen() {
  const nav = useNavigation();
  const { signOut, demo, openAccount } = useSession();
  const { data, error } = useLoad(loadProfile);
  const [personal, setPersonal] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!data) return error ? <Screen title="Mi perfil"><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const { me, rewards } = data;
  const initials = me.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const since = new Date(me.member_since).getFullYear();
  const shown = photo === undefined ? me.photo : photo;

  async function choose(source: 'camera' | 'library') {
    setPhotoErr(null);
    try {
      const data = await pickPhoto(source);
      if (!data) return;
      setSaving(true);
      await api.setPhoto(data);
      setPhoto(data);
      setPhotoSheet(false);
    } catch (e) {
      setPhotoErr(e instanceof PhotoUnavailable ? e.message : errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    setPhotoErr(null);
    try {
      await api.deletePhoto();
      setPhoto(null);
      setPhotoSheet(false);
    } catch (e) {
      setPhotoErr(errorMessage(e));
    }
  }

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
        <Pressable
          onPress={() => {
            setPhotoErr(null);
            setPhotoSheet(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Cambiar tu foto de perfil' : 'Agregar una foto de perfil'}
          style={st.avatarWrap}
        >
          {shown ? (
            <Image source={{ uri: shown }} style={st.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <View style={st.avatar}>
              <Text style={st.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={st.camera}>
            <Icon name="camera" size={16} color={colors.primary} />
          </View>
        </Pressable>
        <Text style={st.name}>{me.full_name}</Text>
        <Small center>{`En Kooa desde ${since}`}</Small>
        <View style={[st.level, { backgroundColor: LEVEL_BG[rewards.level] ?? colors.card }]}>
          <Icon name={rewards.level === 'Oro' ? 'crown' : 'medal'} size={18} color={LEVEL_INK[rewards.level] ?? colors.ink} />
          <Text style={[st.levelText, { color: LEVEL_INK[rewards.level] ?? colors.ink }]}>{`Nivel ${rewards.level}`}</Text>
        </View>
      </View>

      <Row
        first
        icon="star"
        title="Mis puntos"
        sub={`${rewards.points.toLocaleString('en-US')} puntos`}
        onPress={() => nav.navigate('Rewards')}
      />
      <Row icon="user" title="Datos personales" sub="Cédula, celular, correo y dirección" onPress={() => setPersonal((v) => !v)} />
      {personal && (
        <View style={st.personal}>
          {[
            ['Cédula', me.cedula_masked],
            ['Celular', formatPhone(me.sinpe_phone)],
            ['Correo', me.email],
            ['Provincia y cantón', `${me.province}, ${me.canton}`],
          ].map(([k, v]) => (
            <View key={k} style={st.kv}>
              <Text style={st.kvK}>{k}</Text>
              <Text style={st.kvV}>{v}</Text>
            </View>
          ))}
          <Small style={{ marginTop: 8 }}>Para cambiarlos, escribinos por Ayuda: los validamos con tu cédula.</Small>
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
      {demo ? (
        <>
          <Btn label="Abrir mi cuenta" onPress={() => openAccount?.()} />
          <Btn label="Salir de la demo" variant="o" icon="logout" onPress={signOut} />
        </>
      ) : (
        <Btn label="Cerrar sesión" variant="do" icon="logout" onPress={confirmSignOut} />
      )}

      <BottomSheet visible={photoSheet} onClose={() => !saving && setPhotoSheet(false)}>
        <Text style={st.sheetT}>Tu foto de perfil</Text>
        <Row first icon="camera" title="Tomar una foto" onPress={() => choose('camera')} />
        <Row icon="image" title="Elegir de mis fotos" onPress={() => choose('library')} />
        {shown ? <Row icon="trash" title="Quitar foto" onPress={removePhoto} /> : null}
        <ErrorText>{saving ? null : photoErr}</ErrorText>
        {saving && <Small style={{ marginTop: 8 }}>Guardando tu foto…</Small>}
      </BottomSheet>
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
  avatarWrap: { marginBottom: 6 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetT: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  personal: { paddingLeft: 36, paddingBottom: 10 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  kvK: { fontSize: 14, color: colors.muted },
  kvV: { fontSize: 16, fontWeight: '600', color: colors.ink, flexShrink: 1, textAlign: 'right' },
});
