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

/** Elternbrief fotografieren: Die KI schlägt Termine vor, Eltern haken ab und übernehmen. */
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

  async function pick(camera: boolean) {
    setMsg('');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !camera, selectionLimit: 4 };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setMsg('Kamera nicht erlaubt.'); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const photos = await Promise.all(res.assets.slice(0, 4).map(shrink));
      const out = await extractLetter(photos, kids.map(k => ({ name: k.name, grade: currentGrade(k) })), today(), ctl.current.signal);
      setSummary(out.summary);
      setRows(out.events.map(e => {
        const k = e.child ? kids.find(x => x.name.toLowerCase() === e.child!.toLowerCase()) : undefined;
        return { ...e, key: uid(), on: e.date >= today(), who: k ? [k.id] : [] };
      }));
      if (!out.events.length) setMsg('Im Brief habe ich keine Termine mit Datum gefunden.');
    } catch (e: any) {
      if (e?.code !== 'cancelled') setMsg(AI_ERROR[e?.code] ?? 'Der Brief konnte nicht gelesen werden. Bitte nochmal versuchen.');
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
          <Text style={s.muted}>Brief, Einladung oder Aushang fotografieren. Die KI sucht alle Termine heraus, du entscheidest, was in den Kalender kommt.</Text>
          <View style={s.row}>
            {Platform.OS !== 'web' && <Button title="Foto machen" onPress={() => pick(true)} />}
            <Button title={Platform.OS === 'web' ? 'Foto hochladen' : 'Aus Fotos wählen'} onPress={() => pick(false)} />
          </View>
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
