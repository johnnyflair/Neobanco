// Foto de perfil: cámara o galería, recortada cuadrada y achicada a 256 px antes de subirla.
// Los módulos se cargan al usarlos: si la App instalada todavía no los trae (versión vieja de
// TestFlight), avisamos que hay que actualizar en vez de cerrarse.
export class PhotoUnavailable extends Error {}

export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  let Picker: typeof import('expo-image-picker');
  let Manip: typeof import('expo-image-manipulator');
  try {
    Picker = await import('expo-image-picker');
    Manip = await import('expo-image-manipulator');
  } catch {
    throw new PhotoUnavailable('Para cambiar tu foto, actualizá Kooa a la última versión.');
  }
  const perm =
    source === 'camera' ? await Picker.requestCameraPermissionsAsync() : await Picker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PhotoUnavailable(
      source === 'camera'
        ? 'Kooa no tiene permiso para usar la cámara. Activalo en Ajustes del teléfono.'
        : 'Kooa no tiene permiso para ver tus fotos. Activalo en Ajustes del teléfono.',
    );
  }
  const opts = { mediaTypes: ['images' as const], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 1 };
  const r = source === 'camera' ? await Picker.launchCameraAsync(opts) : await Picker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.length) return null;
  const out = await Manip.manipulateAsync(r.assets[0].uri, [{ resize: { width: 256 } }], {
    compress: 0.7,
    format: Manip.SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
