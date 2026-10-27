import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ApiError, api } from '../api/client';
import { colors, radius, type } from '../theme';
import { Text, TextInput } from '../ui/typography';

export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (identifier.replace(/\D/g, '').length < 8 || !/^\d{6}$/.test(pin)) {
      setError('Revisá tu celular o cédula y tu clave de 6 dígitos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.login(identifier.replace(/\s|-/g, ''), pin);
      onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos conectar. Revisá tu internet.');
    } finally {
      setBusy(false);
      setPin('');
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>Hola de nuevo</Text>
      <View style={s.field}>
        <Text style={s.label}>Celular o cédula</Text>
        <TextInput
          style={s.input}
          value={identifier}
          onChangeText={setIdentifier}
          keyboardType="number-pad"
          autoComplete="tel"
          textContentType="username"
          placeholder="8811 2030"
          placeholderTextColor={colors.muted}
        />
      </View>
      <View style={s.field}>
        <Text style={s.label}>Clave</Text>
        <TextInput
          style={s.input}
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          textContentType="password"
          placeholder="••••••"
          placeholderTextColor={colors.muted}
        />
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable style={({ pressed }) => [s.button, pressed && { backgroundColor: colors.primaryPress }]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={s.buttonText}>Ingresar</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.white, gap: 12 },
  title: { ...type.title, marginBottom: 8 },
  field: { borderWidth: 1.5, borderColor: '#CBD2DC', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  label: { ...type.itemSub },
  input: { fontSize: 17, color: colors.ink, paddingVertical: 4 },
  error: { color: colors.danger, fontSize: 13 },
  button: { backgroundColor: colors.primary, minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
