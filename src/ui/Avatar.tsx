import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Button } from './Button';
import { PhotoImg } from './PhotoImg';
import { C, grad, s } from './theme';

/** Rundes Profilbild: Foto, sonst Anfangsbuchstabe auf der Personenfarbe. */
export function Avatar({ name, color, photo, size = 44 }: { name: string; color: string; photo?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: photo ? 2 : 0, borderColor: color }}>
      {photo
        ? <PhotoImg uri={photo} style={{ width: size, height: size }} accessibilityLabel={name} />
        : <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{name[0]?.toUpperCase() ?? '?'}</Text>}
    </View>
  );
}

/**
 * Bilddatei auswählen. Das Eingabefeld hängt dabei kurz im Dokument,
 * sonst feuert Safari kein change-Ereignis. Ergebnis ist eine data-URL oder ein Fehlertext.
 */
export function pickImageFile(): Promise<{ src?: string; error?: string } | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve({ error: 'Fotos gehen bisher nur im Browser.' });
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.position = 'fixed'; input.style.left = '-9999px'; input.style.opacity = '0';
    document.body.appendChild(input);
    const done = (v: { src?: string; error?: string } | null) => { input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      const r = new FileReader();
      r.onload = () => {
        const src = String(r.result);
        const img = new window.Image();
        img.onload = () => done({ src });
        img.onerror = () => done({ error: /heic|heif/i.test(file.type + file.name)
          ? 'Dieses Foto ist im iPhone-Format HEIC, das der Browser nicht öffnen kann. Bitte als JPG exportieren oder ein Bildschirmfoto davon nehmen.'
          : 'Dieses Bild konnte nicht geöffnet werden.' });
        img.src = src;
      };
      r.onerror = () => done({ error: 'Datei konnte nicht gelesen werden.' });
      r.readAsDataURL(file);
    });
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

const V = 240; // Größe des Ausschnitt-Fensters
/** Ausschnitt wählen: Bild verschieben und zoomen, der Kreis zeigt das spätere Profilbild. */
export function PhotoCropper({ src, onDone, onCancel }: { src: string; onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => { Image.getSize(src, (w, h) => { setNat({ w, h }); const b = V / Math.min(w, h); setPos({ x: (V - w * b) / 2, y: (V - h * b) / 2 }); }); }, [src]);
  if (!nat) return <Text style={s.muted}>Bild wird geladen …</Text>;
  const scale = (V / Math.min(nat.w, nat.h)) * zoom;
  const W = nat.w * scale, H = nat.h * scale;
  const clamp = (p: { x: number; y: number }, w = W, h = H) => ({ x: Math.min(0, Math.max(V - w, p.x)), y: Math.min(0, Math.max(V - h, p.y)) });
  const setZ = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    const ns = (V / Math.min(nat.w, nat.h)) * nz;
    // um die Mitte zoomen
    const cx = (V / 2 - pos.x) / scale, cy = (V / 2 - pos.y) / scale;
    setZoom(nz); setPos(clamp({ x: V / 2 - cx * ns, y: V / 2 - cy * ns }, nat.w * ns, nat.h * ns));
  };
  const point = (e: any) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  function save() {
    const img = new window.Image();
    img.onload = () => {
      const S = 200, c = document.createElement('canvas'); c.width = S; c.height = S;
      c.getContext('2d')!.drawImage(img, -pos.x / scale, -pos.y / scale, V / scale, V / scale, 0, 0, S, S);
      onDone(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = src;
  }
  const wheel = Platform.OS === 'web' ? { onWheel: (e: any) => { e.preventDefault?.(); setZ(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); } } : {};
  return (
    <View style={{ gap: 10, alignItems: 'flex-start' }}>
      <Text style={s.muted}>Bild mit dem Finger oder der Maus verschieben, mit + und − zoomen.</Text>
      <View
        {...(wheel as any)}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={e => { const p = point(e); drag.current = { ...p, px: pos.x, py: pos.y }; }}
        onResponderMove={e => { const d = drag.current; if (!d) return; const p = point(e); setPos(clamp({ x: d.px + p.x - d.x, y: d.py + p.y - d.y })); }}
        onResponderRelease={() => { drag.current = null; }}
        style={{ width: V, height: V, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000', cursor: 'grab' } as any}>
        <Image source={{ uri: src }} style={{ position: 'absolute', left: pos.x, top: pos.y, width: W, height: H, pointerEvents: 'none' } as any} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: V, height: V, borderRadius: V / 2, borderWidth: 2, borderColor: '#fff', boxShadow: '0 0 0 999px rgba(0,0,0,0.45)' } as any} />
      </View>
      <View style={s.row}>
        <Button ghost title="−" accessibilityLabel="Verkleinern" onPress={() => setZ(zoom / 1.25)} />
        <Button ghost title="+" accessibilityLabel="Vergrößern" onPress={() => setZ(zoom * 1.25)} />
        <Button title="Übernehmen" onPress={save} />
        <Button ghost title="Abbrechen" onPress={onCancel} />
      </View>
    </View>
  );
}

/** Kopfzeile einer Personen-Karte: farbiges Band mit Foto, Name und einer Zahl rechts. */
export function PersonHead({ name, color, photo, sub, value }: { name: string; color: string; photo?: string; sub?: string; value?: string }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, margin: -20, marginBottom: 2, padding: 16, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, gradBand(color)]}>
      <View style={{ borderRadius: 28, borderWidth: 3, borderColor: '#ffffffaa' }}>
        <Avatar name={name} color={color} photo={photo} size={44} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={{ color: '#ffffffd0', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {value ? (
        <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color }}>{value}</Text>
        </View>
      ) : null}
    </View>
  );
}
const gradBand = (c: string) => grad(c, c + 'c0');
