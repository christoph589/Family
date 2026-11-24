import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, today, uid } from '../data/logic';
import { CalEvent } from '../data/types';
import { AI_ERROR, extractLetter, getSample, LetterEvent } from '../ai/generate';
import { Button } from '../ui/Button';
import { niceDate } from '../ui/DateField';
import { C, s } from '../ui/theme';
import { shrink } from './Learn';

type Row = LetterEvent & { key: string; on: boolean; who: string[] };

/** Elternbrief als Foto, PDF oder Text: Die KI schlägt Termine vor, Eltern haken ab und übernehmen. */
export function LetterImport({ onDone }: { onDone: (added: number) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [summary, setSummary] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  if (!data) return null;
  const kids = data.children;

  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);

  async function pick(camera: boolean) {
    setMsg('');
    if (Platform.OS === 'web' && !camera) return pickWeb();
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !camera, selectionLimit: 4 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setMsg('Kamera nicht erlaubt.'); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets.length) return;
    run(() => Promise.all(res.assets.slice(0, 4).map(shrink)), '');
  }

  /** Im Browser: Fotos und PDFs gemischt, bis zu 4 Dateien. */
  function pickWeb() {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.accept = 'image/*,application/pdf,.pdf';
    input.onchange = () => {
      const list = Array.from(input.files ?? []).slice(0, 4);
      if (!list.length) return;
      const big = list.find(f => f.type === 'application/pdf' && f.size > 4_000_000);
      if (big) { setMsg(`${big.name} ist zu groß (max. 4 MB). Bitte nur die Seiten mit Terminen oder den Text einfügen.`); return; }
      run(() => Promise.all(list.map(readWebFile)), '');
    };
    input.click();
  }

  async function run(load: () => Promise<string[]>, txt: string) {
    setMsg(''); setBusy(true);
    ctl.current = new AbortController();
    try {
      const files = await load();
      const out = await extractLetter(files, kids.map(k => ({ name: k.name, grade: currentGrade(k) })), today(), ctl.current.signal, txt);
      setSummary(out.summary);
      setRows(out.events.map(e => {
        const k = e.child ? kids.find(x => x.name.toLowerCase() === e.child!.toLowerCase()) : undefined;
        return { ...e, key: uid(), on: e.date >= today(), who: k ? [k.id] : [] };
      }));
      if (!out.events.length) setMsg('Im Brief habe ich keine Termine mit Datum gefunden.');
    } catch (e: any) {
      if (e?.code === 'image_rejected' && Platform.OS === 'web') setMsg('Die Datei konnte nicht gelesen werden. Bei PDFs muss die Server-Funktion einmal neu eingespielt werden, bis dahin den Text einfügen.');
      else if (e?.code !== 'cancelled') setMsg(AI_ERROR[e?.code] ?? 'Der Brief konnte nicht gelesen werden. Bitte nochmal versuchen.');
    }
    setBusy(false);
  }

  const chosen = (rows ?? []).filter(r => r.on);
  function save() {
    const evs: CalEvent[] = chosen.map(r => ({ id: uid(), title: r.title, icon: r.icon, date: r.date, time: r.time, end: r.time ? r.end : undefined, who: r.who, note: r.note }));
    update(d => ({ ...d, events: [...(d.events ?? []), ...evs] }));
    onDone(evs.length);
  }
  const set = (key: string, p: Partial<Row>) => setRows(rs => (rs ?? []).map(r => (r.key === key ? { ...r, ...p } : r)));

  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>📄 Elternbrief einlesen</Text>
      {ai === false && <Text style={s.muted}>Das Lesen macht die KI. Dafür muss dieses Gerät mit dem Familienserver verbunden sein.</Text>}
      {ai && !rows && !busy && (
        <>
          <Text style={s.muted}>Foto, PDF oder Text vom Brief, der Einladung oder dem Aushang. Die KI sucht alle Termine heraus, du entscheidest, was in den Kalender kommt.</Text>
          <View style={s.row}>
            {Platform.OS !== 'web' && <Button title="📷 Foto machen" onPress={() => pick(true)} />}
            <Button title={Platform.OS === 'web' ? '📎 Foto oder PDF hochladen' : '🖼️ Aus Fotos wählen'} onPress={() => pick(false)} />
            <Button ghost title="📝 Text einfügen" onPress={() => setTyping(v => !v)} />
          </View>
          {typing && (
            <>
              <TextInput multiline value={text} onChangeText={setText} accessibilityLabel="Text des Elternbriefs" placeholder="Text aus E-Mail, Schul-App oder PDF hier einfügen"
                style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]} />
              <Button title="Termine suchen" disabled={text.trim().length < 15} onPress={() => run(async () => [], text)} />
            </>
          )}
        </>
      )}
      {busy && (
        <View style={[s.row, { alignItems: 'center' }]}>
          <ActivityIndicator color={C.accent} />
          <Text style={{ color: C.accent, fontWeight: '700' }}>Lese den Brief …</Text>
          <Button ghost title="Abbrechen" onPress={() => ctl.current?.abort()} />
        </View>
      )}
      {summary ? <Text style={[s.text, { fontStyle: 'italic' }]}>{summary}</Text> : null}
      {rows && rows.map(r => (
        <View key={r.key} style={{ backgroundColor: r.on ? C.accentSoft : C.bg, borderRadius: 16, padding: 12, gap: 8, opacity: r.on ? 1 : 0.6 }}>
          <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'center' }]}>
            <Pressable onPress={() => set(r.key, { on: !r.on })} accessibilityRole="checkbox" accessibilityState={{ checked: r.on }}
              style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.accent, backgroundColor: r.on ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
              {r.on && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
            </Pressable>
            <TextInput style={[s.input, { flex: 1, paddingVertical: 8 }]} value={`${r.title}`} onChangeText={t => set(r.key, { title: t })} accessibilityLabel="Titel" />
          </View>
          <Text style={[s.text, { fontWeight: '700' }]}>{r.icon ? r.icon + ' ' : ''}{niceDate(r.date, true)}{r.time ? `, ${r.time}${r.end ? `–${r.end}` : ''}` : ', ganztägig'}{r.date < today() ? '  (liegt in der Vergangenheit)' : ''}</Text>
          {r.note ? <Text style={s.text}>📝 {r.note}</Text> : null}
          <View style={[s.row, { gap: 6 }]}>
            {[{ id: '', name: 'Alle', color: C.accent }, ...kids].map(k => {
              const on = k.id ? r.who.includes(k.id) : r.who.length === 0;
              return (
                <Pressable key={k.id || 'all'} onPress={() => set(r.key, { who: !k.id ? [] : r.who.includes(k.id) ? r.who.filter(x => x !== k.id) : [...r.who, k.id] })}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 2, borderColor: k.color, backgroundColor: on ? k.color : C.surface }}>
                  <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{k.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {msg ? <Text style={{ color: C.danger, fontWeight: '700' }}>{msg}</Text> : null}
      <View style={s.row}>
        {rows && rows.length > 0 && <Button title={`${chosen.length} ${chosen.length === 1 ? 'Termin' : 'Termine'} übernehmen`} disabled={!chosen.length} onPress={save} />}
        {rows && <Button ghost title="Anderen Brief" onPress={() => { setRows(null); setSummary(''); setMsg(''); }} />}
        <Button ghost title="Schließen" onPress={() => onDone(0)} />
      </View>
      {rows && rows.length > 0 && <Text style={[s.muted, { fontSize: 13 }]}>Bitte kurz gegenprüfen, die KI kann sich bei Daten verlesen. Fahrer kannst du danach am Termin eintragen.</Text>}
    </View>
  );
}

function readWebFile(f: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onerror = () => fail({ code: 'image_rejected' });
    r.onload = () => {
      const url = String(r.result);
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) return ok(url.replace(/^data:[^;]*;/, 'data:application/pdf;'));
      // Fotos verkleinern: max. 1600 px, JPEG
      const img = new Image();
      img.onerror = () => fail({ code: 'image_rejected' });
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = url;
    };
    r.readAsDataURL(f);
  });
}
