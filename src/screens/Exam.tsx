import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, examScore, regionOf, setSheet, today, uid, EXAM_PREP_POINTS } from '../data/logic';
import { STATES } from '../data/holidays';
import { AI_ERROR, generateExam, getSample } from '../ai/generate';
import { CalEvent, ExamPrep, SCHOOL_TYPES, Worksheet } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { C, s } from '../ui/theme';
import { shrink } from './Learn';

const MAX = 20;
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const daysTo = (d: string) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 864e5);

const Chip = ({ on, label, onPress, color = C.accent }: { on: boolean; label: string; onPress: () => void; color?: string }) => (
  <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: color, backgroundColor: on ? color : C.surface }}>
    <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{label}</Text>
  </Pressable>
);

export async function pickPhotos(room: number): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: room });
  if (res.canceled || !res.assets.length) return [];
  return Promise.all(res.assets.slice(0, room).map(shrink));
}
async function takePhoto(): Promise<string[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return res.canceled ? [] : Promise.all(res.assets.slice(0, 1).map(shrink));
}

/** Klassenarbeit üben: Unterlagen sammeln, KI macht eine Probe-Arbeit auf Niveau von Klasse, Schulform und Bundesland. */
export function ExamPrepScreen({ childIds, parent, meId, onSolve }: { childIds: string[]; parent: boolean; meId?: string; onSolve?: (sheetId: string) => void }) {
  const { data } = useFamily();
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const list = (data.exams ?? []).filter(e => childIds.includes(e.childId)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return (
    <View style={{ gap: 16 }}>
      <View style={[s.card, { gap: 8 }]}>
        <Text style={s.h2}>📝 Klassenarbeit üben</Text>
        <Text style={s.muted}>Alles hochladen, was drankommt: Heft, Arbeitsblätter, Buchseiten. Auch über mehrere Tage, bis zu {MAX} Fotos. Die KI macht daraus eine Probe-Klassenarbeit auf dem Niveau der Klasse, Schulform und des Bundeslands, mit Punkten und Zeit. Danach seht ihr, wo es noch hakt.</Text>
        {!adding && <Button title="+ Klassenarbeit anlegen" onPress={() => setAdding(true)} />}
      </View>
      {adding && <PrepForm childIds={childIds} meId={meId} onDone={() => setAdding(false)} />}
      {list.map(e => <PrepCard key={e.id} prep={e} parent={parent} onSolve={onSolve} />)}
      {!list.length && !adding && <Text style={[s.muted, { textAlign: 'center' }]}>Noch keine Klassenarbeit angelegt.</Text>}
    </View>
  );
}

function PrepForm({ childIds, meId, onDone }: { childIds: string[]; meId?: string; onDone: () => void }) {
  const { data, update } = useFamily();
  const kids = data!.children.filter(c => childIds.includes(c.id));
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const child = kids.find(k => k.id === childId);
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [schoolType, setSchoolType] = useState(child?.schoolType ?? '');
  const [region, setRegion] = useState(regionOf(data!) ?? '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSchoolType(child?.schoolType ?? ''); }, [childId]);
  const add = async (cam: boolean) => { setBusy(true); try { const p = cam ? await takePhoto() : await pickPhotos(MAX - photos.length); setPhotos(x => [...x, ...p].slice(0, MAX)); } catch { /* egal */ } setBusy(false); };
  function save() {
    const id = uid();
    const ev: CalEvent | null = date ? { id: uid(), title: `Klassenarbeit ${subject.trim()}`, icon: '📝', date, who: [childId], remind: -1, note: title.trim() } : null;
    const prep: ExamPrep = { id, childId, subject: subject.trim(), title: title.trim(), date: date || undefined, photos, createdAt: today(), by: meId, eventId: ev?.id };
    update(d => ({
      ...d,
      exams: [prep, ...(d.exams ?? [])],
      events: ev ? [...(d.events ?? []), ev] : d.events,
      children: d.children.map(c => (c.id === childId && schoolType ? { ...c, schoolType } : c)),
      settings: region && !d.settings?.autoHoliday?.state ? { ...d.settings, region } : d.settings,
    }));
    onDone();
  }
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>Neue Klassenarbeit</Text>
      {kids.length > 1 && <Segmented value={childId} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name }))} />}
      <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="Fach, z. B. Mathe" accessibilityLabel="Fach" />
      <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline value={title} onChangeText={setTitle} placeholder="Was kommt dran? z. B. Brüche: erweitern, kürzen, addieren" accessibilityLabel="Thema der Klassenarbeit" />
      <Text style={s.label}>Termin der Klassenarbeit (optional, kommt in den Kalender)</Text>
      <View style={s.row}><DateField value={date} onChange={setDate} label="Datum der Klassenarbeit" min={today()} clearable /></View>
      <Text style={s.label}>Schulform{child ? ` von ${child.name}` : ''}</Text>
      <View style={[s.row, { gap: 6 }]}>{SCHOOL_TYPES.map(t => <Chip key={t} on={schoolType === t} label={t} onPress={() => setSchoolType(t)} />)}</View>
      {!data!.settings?.autoHoliday?.state && (
        <>
          <Text style={s.label}>Bundesland (Lehrplan)</Text>
          <View style={[s.row, { gap: 6 }]}>{STATES.map(x => <Chip key={x.code} on={region === x.code} label={x.name} onPress={() => setRegion(x.code)} />)}</View>
        </>
      )}
      <Text style={s.label}>Unterlagen ({photos.length} von {MAX})</Text>
      {photos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>
          {photos.map((p, i) => (
            <Pressable key={i} onPress={() => setPhotos(x => x.filter((_, j) => j !== i))} accessibilityLabel={`Foto ${i + 1} entfernen`}>
              <Image source={{ uri: p }} style={{ width: 64, height: 86, borderRadius: 8 }} />
              <Text style={{ position: 'absolute', top: 2, right: 4, color: '#fff', fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 }}>✕</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={s.row}>
        {Platform.OS !== 'web' && <Button ghost title="📷 Foto" onPress={() => add(true)} />}
        {photos.length < MAX && <Button ghost title={busy ? 'Lädt …' : '🖼️ Fotos hinzufügen'} disabled={busy} onPress={() => add(false)} />}
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>Du kannst später weitere Fotos nachreichen.</Text>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onDone} />
        <Button title="Speichern" disabled={!childId || !subject.trim() || !title.trim()} onPress={save} />
      </View>
    </View>
  );
}

function PrepCard({ prep, parent, onSolve }: { prep: ExamPrep; parent: boolean; onSolve?: (id: string) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const d = data!;
  const child = d.children.find(c => c.id === prep.childId);
  const sheets = (d.worksheets ?? []).filter(w => w.exam?.prepId === prep.id);
  const open = sheets.find(w => w.status === 'offen');
  const waiting = sheets.find(w => w.status === 'abgegeben');
  const n = prep.date ? daysTo(prep.date) : null;
  const region = regionOf(d);

  async function addPhotos() {
    const p = await pickPhotos(MAX - prep.photos.length).catch(() => []);
    if (p.length) update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? { ...e, photos: [...e.photos, ...p].slice(0, MAX) } : e)) }));
  }
  async function make() {
    setBusy(true); setMsg('');
    ctl.current = new AbortController();
    try {
      const ex = await generateExam(prep, prep.photos, { name: child?.name ?? '', grade: child ? currentGrade(child) : undefined, schoolType: child?.schoolType, state: STATES.find(x => x.code === region)?.name }, ctl.current.signal);
      const id = uid();
      update(x => setSheet(x, { id, childId: prep.childId, title: `${prep.subject}: ${ex.title}`, date: today(), questions: ex.questions, status: 'offen', exam: { prepId: prep.id, minutes: ex.minutes, points: ex.points, skills: ex.skills } }));
      if (onSolve) onSolve(id); else setMsg(`Probe-Arbeit mit ${ex.questions.length} Aufgaben liegt bei ${child?.name}.`);
    } catch (e: any) { if (e?.code !== 'cancelled') setMsg(AI_ERROR[e?.code] ?? 'Die KI ist gerade nicht erreichbar. Bitte nochmal versuchen.'); }
    setBusy(false);
  }
  const remove = () => update(x => ({ ...x, exams: (x.exams ?? []).filter(e => e.id !== prep.id), events: (x.events ?? []).filter(e => e.id !== prep.eventId) }));
  const last = sheets.find(w => w.status === 'geprueft');

  return (
    <View style={[s.card, { gap: 10, borderLeftWidth: 6, borderLeftColor: child?.color ?? C.accent }]}>
      <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800', fontSize: 17 }]}>📝 {prep.subject}: {prep.title}</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>{child?.name}{child?.schoolType ? ` · ${child.schoolType}` : ''}{child && currentGrade(child) ? ` · Klasse ${currentGrade(child)}` : ''} · {prep.photos.length} Fotos</Text>
        </View>
        {n !== null && (
          <View style={{ alignItems: 'center', backgroundColor: n <= 3 ? '#fde3e6' : C.accentSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 18, color: n <= 3 ? C.danger : C.accent }}>{n < 0 ? '✓' : n === 0 ? 'Heute' : n}</Text>
            <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>{n < 0 ? 'vorbei' : n === 0 ? fmt(prep.date!) : n === 1 ? 'Tag' : 'Tage'}</Text>
          </View>
        )}
      </View>
      {last?.exam && last.results && <ResultLine sheet={last} />}
      {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI liest alle Unterlagen und schreibt die Probe-Arbeit. Das dauert 1 bis 2 Minuten.</Text></View>}
      {open && !busy && <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{parent ? `Probe-Arbeit liegt bei ${child?.name}, noch nicht gelöst` : `Probe-Arbeit bereit · ${open.exam?.minutes} Minuten`}</Text>}
      {waiting && <Text style={[s.muted, { fontSize: 13 }]}>{parent ? 'Abgegeben, oben unter „Zum Prüfen“' : 'Abgegeben, Mama oder Papa schauen drüber'}</Text>}
      {!ai && !sheets.length && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Die Probe-Arbeit erstellt die KI. Dafür muss das Gerät mit dem Familienserver verbunden sein.</Text>}
      <View style={s.row}>
        {open && onSolve && !busy && <Button title="Probe-Arbeit schreiben" onPress={() => onSolve(open.id)} />}
        {ai && !open && !waiting && !busy && <Button title={sheets.length ? 'Neue Probe-Arbeit' : 'Probe-Arbeit erstellen'} disabled={!prep.photos.length && prep.title.length < 10} onPress={make} />}
        {busy && <Button ghost title="Abbrechen" onPress={() => ctl.current?.abort()} />}
        {prep.photos.length < MAX && !busy && <Button ghost title="+ Fotos" onPress={addPhotos} />}
        {!busy && (ask ? <Button title="Ja, löschen" color={C.danger} onPress={remove} /> : <Button ghost title="Löschen" onPress={() => setAsk(true)} />)}
      </View>
      {!!msg && <Text style={{ color: msg.startsWith('Probe') ? C.ok : C.danger, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
      {!sheets.length && <Text style={[s.muted, { fontSize: 12 }]}>Gibt nach dem Prüfen {EXAM_PREP_POINTS} Punkte. Am besten 3 bis 5 Tage vorher schreiben, dann bleibt Zeit für die Schwachstellen.</Text>}
    </View>
  );
}

export function ResultLine({ sheet }: { sheet: Worksheet }) {
  const r = examScore(sheet, sheet.results ?? []);
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 10, gap: 4 }}>
      <Text style={[s.text, { fontWeight: '800' }]}>Letzte Probe: {r.got} von {r.total} Punkten · ungefähr Note {r.note}</Text>
      {r.weak.length ? <Text style={[s.text, { fontSize: 14 }]}>Noch üben: <Text style={{ fontWeight: '700', color: C.danger }}>{r.weak.join(', ')}</Text></Text> : <Text style={{ color: C.ok, fontWeight: '700' }}>Keine Schwachstellen, super vorbereitet!</Text>}
    </View>
  );
}
