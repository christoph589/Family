import { Image, Platform, Text, View } from 'react-native';

/** Rundes Profilbild: Foto, sonst Anfangsbuchstabe auf der Personenfarbe. */
export function Avatar({ name, color, photo, size = 44 }: { name: string; color: string; photo?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: photo ? 2 : 0, borderColor: color }}>
      {photo
        ? <Image source={{ uri: photo }} style={{ width: size, height: size }} accessibilityLabel={name} />
        : <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{name[0]?.toUpperCase() ?? '?'}</Text>}
    </View>
  );
}

/**
 * Foto auswählen (Kamera oder Galerie), mittig quadratisch zuschneiden und auf 160 px verkleinern.
 * Ergebnis ist ein JPEG als data-URL, etwa 8 bis 15 KB, damit die Familiendaten klein bleiben.
 */
export function pickPhoto(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const S = 160, side = Math.min(img.width, img.height);
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    };
    input.click();
  });
}
