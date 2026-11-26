import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { AutoCam, autoCamSupported } from './AutoCam';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { shrink } from './Learn';

/**
 * Mehrere Seiten nacheinander fotografieren und gesammelt übergeben.
 * Ohne das schließt die Kamera nach jedem Foto und man muss wieder von vorn tippen.
 * Aufruf: const photos = await collectPhotos(20, 'Seiten fotografieren');
 */
type Req = { max: number; title: string; done: (p: string[]) => void };
let open: ((r: Req) => void) | null = null;

export function collectPhotos(max: number, title = 'Fotos sammeln'): Promise<string[]> {
  if (!open) return Promise.resolve([]);
  return new Promise(done => open!({ max, title, done }));
}

export function PhotoCollector() {
  const [req, setReq] = useState<Req | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [cam, setCam] = useState(false);
  useEffect(() => { open = r => { setPhotos([]); setMsg(''); setCam(false); setReq(r); }; return () => { open = null; }; }, []);
  if (!req) return null;
  const room = req.max - photos.length;

  const canAuto = Platform.OS === 'web' && autoCamSupported();
  async function add(camera: boolean) {
    setMsg('');
    if (camera && canAuto) { setCam(true); return; }
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => ({ granted: true }));
      if (!perm.granted) { setMsg('Kamera nicht erlaubt. Bitte in den Einstellungen freigeben.'); return; }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !camera, selectionLimit: room };
    const res = await (camera ? ImagePicker.launchCameraAsync(opts) : ImagePicker.launchImageLibraryAsync(opts)).catch(() => null);
    if (!res || res.canceled || !res.assets.length) return;
    setBusy(true);
    try {
      const small = await Promise.all(res.assets.slice(0, room).map(shrink));
      setPhotos(p => [...p, ...small].slice(0, req!.max));
    } catch { setMsg('Foto konnte nicht geladen werden. Bitte nochmal.'); }
    setBusy(false);
  }
  function finish(p: string[]) { req!.done(p); setReq(null); setPhotos([]); }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => finish([])}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,15,35,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 34, gap: 14, maxHeight: '92%' }}>
          <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap' }]}>
            <Text style={[s.h2, { flexShrink: 1 }]}>{req.title}</Text>
            <Text style={[s.muted, { fontWeight: '800' }]}>{photos.length} / {req.max}</Text>
          </View>
          <Text style={[s.muted, { fontSize: 13 }]}>{canAuto ? 'Die Kamera bleibt offen und nimmt jede neue Seite automatisch auf, sobald du sie ruhig hältst. Einfach umblättern.' : 'Eine Seite nach der anderen fotografieren. Erst wenn alle drin sind, auf „Fertig“ tippen.'}</Text>
          {photos.length > 0 && (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p, i) => (
                <View key={i} style={{ width: 76, height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface2 }}>
                  <Image source={{ uri: p }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <Text style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontWeight: '800', fontSize: 11, paddingHorizontal: 5, borderRadius: 6 }}>{i + 1}</Text>
                  <Pressable accessibilityLabel={`Foto ${i + 1} entfernen`} onPress={() => setPhotos(x => x.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', right: 3, top: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700' }}>Foto wird vorbereitet …</Text></View>}
          {!!msg && <Text style={{ color: C.danger, fontWeight: '700' }}>{msg}</Text>}
          {room > 0 && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={canAuto ? (photos.length ? '📸 Weiter scannen' : '📸 Scannen') : photos.length ? '📸 Nächste Seite' : '📸 Foto aufnehmen'} disabled={busy} style={{ flex: 1, paddingVertical: 16 }} onPress={() => add(true)} />
              <Button ghost title="🖼️ Galerie" disabled={busy} style={{ paddingVertical: 16 }} onPress={() => add(false)} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button ghost title="Abbrechen" style={{ flex: 1 }} onPress={() => finish([])} />
            <Button color={C.ok} title={photos.length ? `Fertig: ${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'} übernehmen` : 'Fertig'} disabled={!photos.length || busy} style={{ flex: 2 }} onPress={() => finish(photos)} />
          </View>
        </View>
      </View>
      {cam && <AutoCam count={photos.length} max={req.max} onShot={d => setPhotos(p => [...p, d].slice(0, req!.max))} onClose={() => setCam(false)} />}
    </Modal>
  );
}
