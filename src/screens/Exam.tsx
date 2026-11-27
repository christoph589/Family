import { logLearn, sheetSubject } from '../data/learnstats';
import * as ImagePicker from 'expo-image-picker';
import { PhotoImg } from '../ui/PhotoImg';
import { DeleteButton } from '../ui/DeleteButton';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { useFamily } from '../data/FamilyContext';
import { addPoints, currentGrade, examScore, finishCheck, regionOf, setSheet, today, uid, EXAM_PREP_POINTS } from '../data/logic';
import { learnedShare, LEARN_GOAL } from '../data/vocab';
import { DeckEditor, Practice } from './Vocab';
import { STATES } from '../data/holidays';
import { AI_ERROR, generateExam, getSample, gradePaper, spellCheckExam } from '../ai/generate';
import { printHtml, sheetHtml } from '../ui/Print';
import { CalEvent, EXAM_POINTS, ExamPrep, SCHOOL_TYPES, Worksheet } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { C, s } from '../ui/theme';
import { collectPhotos } from './PhotoCollector';
import { packRunning, startPack, StudySection } from './StudyPack';
import { VocabDeck } from '../data/types';

const MAX = 20;
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const daysTo = (d: string) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 864e5);

const Chip = ({ on, label, onPress, color = C.accent }: { on: boolean; label: string; onPress: () => void; color?: string }) => (
  <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }}
    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: color, backgroundColor: on ? color : C.surface }}>
    <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{label}</Text>
  </Pressable>
);

/** Fotos sammeln: nacheinander aufnehmen oder aus der Galerie, dann gesammelt übernehmen. */
export function pickPhotos(room: number, title = 'Fotos sammeln'): Promise<string[]> {
  return collectPhotos(room, title);
}

/** Fotos der fertig geschriebenen Arbeit speichern und die KI vorkorrigieren lassen. */
export async function scanAndGrade(sheet: Worksheet, photos: string[], who: { name: string; grade?: string }, update: (f: (d: any) => any) => void, by?: string) {
  const at = new Date().toISOString();
  const base: Worksheet = { ...sheet, status: 'abgegeben', doneAt: at.slice(0, 10), scan: { photos, at, by } };
  // Auf Papier geschrieben: als Lernzeit zählt die vorgesehene Bearbeitungszeit, nur beim ersten Abfotografieren
  const first = !sheet.scan && sheet.status === 'offen';
  update(d => first ? logLearn(setSheet(d, base), sheet.childId, { t: 1, s: (sheet.exam?.minutes ?? 0) * 60, subject: sheetSubject(d, sheet) }) : setSheet(d, base));
  try {
    const ai = await gradePaper(sheet, photos, who);
    update(d => { const cur = (d.worksheets ?? []).find((w: Worksheet) => w.id === sheet.id); return cur?.scan?.at === at ? setSheet(d, { ...cur, scan: { ...cur.scan, ai, error: undefined } }) : d; });
  } catch (e: any) {
    const error = AI_ERROR[e?.code] ?? 'Die KI konnte die Fotos nicht auswerten.';
    update(d => { const cur = (d.worksheets ?? []).find((w: Worksheet) => w.id === sheet.id); return cur?.scan?.at === at ? setSheet(d, { ...cur, scan: { ...cur.scan, error } }) : d; });
  }
}

/** Klassenarbeit üben: Unterlagen sammeln, KI macht eine Probe-Arbeit auf Niveau von Klasse, Schulform und Bundesland. */
export function ExamPrepScreen({ childIds, parent, meId, onSolve }: { childIds: string[]; parent: boolean; meId?: string; onSolve?: (sheetId: string) => void }) {
  const { data } = useFamily();
  const [adding, setAdding] = useState(false);
  const [howto, setHowto] = useState(false);
  const [showDone, setShowDone] = useState(false);
  if (!data) return null;
  const list = (data.exams ?? []).filter(e => childIds.includes(e.childId)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  // Erledigt: Note eingetragen oder mehr als 3 Tage vorbei
  const isDone = (e: ExamPrep) => !!e.grade || (!!e.date && daysTo(e.date) < -3);
  const active = list.filter(e => !isDone(e));
  const done = list.filter(isDone).reverse();
  return (
    <View style={{ gap: 16 }}>
      <View style={[s.card, { gap: 8 }]}>
        <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
          <Text style={[s.h2, { flex: 1 }]}>Klassenarbeiten{active.length ? ` (${active.length})` : ''}</Text>
          <Pressable onPress={() => setHowto(x => !x)} style={{ padding: 6 }}><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{howto ? 'Schließen' : 'So geht\'s'}</Text></Pressable>
        </View>
        {howto && <Text style={s.muted}>Alles hochladen, was drankommt: Heft, Arbeitsblätter, Buchseiten, auch über mehrere Tage, bis zu {MAX} Fotos. 1. Die KI macht daraus sofort einen Merkzettel in kleinen Portionen, Lernkarten und einen Lernplan bis zum Termin. Jeden Tag steht auf Heute, was dran ist. 2. Wenn die meisten Karten sitzen, gibt es eine Probe-Klassenarbeit auf dem Niveau von Klasse, Schulform und Bundesland. 3. Nach der echten Arbeit die Note eintragen.</Text>}
        {!adding && <Button title="+ Klassenarbeit anlegen" onPress={() => setAdding(true)} />}
      </View>
      {adding && <PrepForm childIds={childIds} meId={meId} onDone={() => setAdding(false)} />}
      {active.map(e => <PrepCard key={e.id} prep={e} parent={parent} onSolve={onSolve} />)}
      {!list.length && !adding && <Text style={[s.muted, { textAlign: 'center' }]}>Noch keine Klassenarbeit angelegt.</Text>}
      {done.length > 0 && (
        <View style={[s.card, { gap: 8 }]}>
          <Pressable onPress={() => setShowDone(x => !x)} style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.text, { fontWeight: '800' }]}>✓ Erledigt ({done.length})</Text>
            <Text style={{ color: C.accent, fontWeight: '800' }}>{showDone ? '▲' : '▼'}</Text>
          </Pressable>
          {!showDone && done.slice(0, 3).map(e => {
            const kid = data.children.find(c => c.id === e.childId);
            return <Text key={e.id} style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{kid?.name} · {e.subject}: {e.title}{e.grade ? ` · Note ${e.grade}` : ''}</Text>;
          })}
        </View>
      )}
      {showDone && done.map(e => <PrepCard key={e.id} prep={e} parent={parent} onSolve={onSolve} />)}
    </View>
  );
}

const spellRunning = new Set<string>();
/** Fragt einmal pro Klassenarbeit die KI nach Schreibfehlern in Fach und Thema. */
function useSpellCheck(prep: ExamPrep) {
  const { update } = useFamily();
  useEffect(() => {
    if (prep.spell || prep.grade || spellRunning.has(prep.id)) return;
    spellRunning.add(prep.id);
    spellCheckExam(prep.subject, prep.title)
      .then(fix => update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? { ...e, spell: fix ? { fix } : { done: true } } : e)) })))
      .catch(() => { /* ohne KI kein Hinweis, später nochmal */ setTimeout(() => spellRunning.delete(prep.id), 60000); });
  }, [prep.id, prep.spell]);
}

function FixHints({ prep, parent }: { prep: ExamPrep; parent: boolean }) {
  const { update } = useFamily();
  const [date, setDate] = useState('');
  const fix = prep.spell && !prep.spell.done ? prep.spell.fix : undefined;
  const noDate = !prep.date && !prep.grade;
  if (!fix && !noDate) return null;
  const set = (f: (e: ExamPrep) => ExamPrep) => update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? f(e) : e)) }));
  function take() {
    set(e => ({ ...e, subject: fix!.subject, title: fix!.title, spell: { done: true } }));
    if (prep.eventId) update(x => ({ ...x, events: (x.events ?? []).map(v => (v.id === prep.eventId ? { ...v, title: `Klassenarbeit ${fix!.subject}`, note: fix!.title } : v)) }));
  }
  function saveDate() {
    if (!date) return;
    const ev: CalEvent = { id: uid(), title: `Klassenarbeit ${prep.subject}`, icon: '📝', date, who: [prep.childId], remind: -1, note: prep.title };
    set(e => ({ ...e, date, eventId: ev.id }));
    update(x => ({ ...x, events: [...(x.events ?? []), ev] }));
  }
  return (
    <View style={{ marginHorizontal: 16, gap: 10 }}>
      {fix && (
        <View style={{ backgroundColor: '#fff7e0', borderRadius: 14, padding: 12, gap: 8 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>✏️ {parent ? 'Schreibweise prüfen' : 'Kleiner Tipp zur Schreibweise'}</Text>
          <Text style={[s.text, { fontSize: 14 }]}>So schreibt man es richtig:</Text>
          <Text style={[s.text, { fontWeight: '800', fontSize: 16 }]}>{fix.subject !== prep.subject ? `${fix.subject}: ` : ''}{fix.title}</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>Vorher: {fix.subject !== prep.subject ? `${prep.subject}: ` : ''}{prep.title}</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
            <Button title="Übernehmen" onPress={take} />
            <Button title="Passt so" ghost onPress={() => set(e => ({ ...e, spell: { done: true } }))} />
          </View>
        </View>
      )}
      {noDate && (
        <View style={{ backgroundColor: C.accentSoft, borderRadius: 14, padding: 12, gap: 8 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>Wann wird die Arbeit geschrieben?</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>Mit Datum gibt es den Countdown und einen Eintrag im Kalender.</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
            <DateField value={date} onChange={setDate} label="Datum der Klassenarbeit" min={today()} />
            <Button title="Speichern" onPress={saveDate} disabled={!date} />
          </View>
        </View>
      )}
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
  const add = async () => { setBusy(true); try { const p = await pickPhotos(MAX - photos.length, 'Unterlagen fotografieren'); setPhotos(x => [...x, ...p].slice(0, MAX)); } catch { /* egal */ } setBusy(false); };
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
    // Erst lernen: Lernpaket gleich im Hintergrund erstellen
    if (photos.length || prep.title.length >= 10) startPack(prep, child ? { ...child, schoolType: schoolType || child.schoolType } : undefined, update as any);
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
      {!child?.schoolType && (
        <>
          <Text style={s.label}>Schulform{child ? ` von ${child.name}` : ''} (einmalig, steht danach im Profil)</Text>
          <View style={[s.row, { gap: 6 }]}>{SCHOOL_TYPES.map(t => <Chip key={t} on={schoolType === t} label={t} onPress={() => setSchoolType(t)} />)}</View>
        </>
      )}
      {!regionOf(data!) && (
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
              <PhotoImg uri={p} style={{ width: 64, height: 86, borderRadius: 8 }} />
              <Text style={{ position: 'absolute', top: 2, right: 4, color: '#fff', fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 }}>✕</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={s.row}>
        {photos.length < MAX && <Button ghost title={busy ? 'Lädt …' : 'Fotos aufnehmen'} disabled={busy} onPress={add} />}
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
  useSpellCheck(prep);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [playing, setPlaying] = useState<VocabDeck | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const d = data!;
  const child = d.children.find(c => c.id === prep.childId);
  const sheets = (d.worksheets ?? []).filter(w => w.exam?.prepId === prep.id);
  const open = sheets.find(w => w.status === 'offen');
  const waiting = sheets.find(w => w.status === 'abgegeben');
  const n = prep.date ? daysTo(prep.date) : null;
  const region = (child?.state) || regionOf(d);
  const [editCards, setEditCards] = useState(false);
  const deck = (d.vocab ?? []).find(v => v.id === prep.deckId);
  const share = deck ? learnedShare(deck) : 0;
  const learned = deck ? deck.cards.filter(c => c.box >= 1).length : 0;
  // Neues Lernpaket (Merkzettel + Plan) oder ältere Klassenarbeit nur mit Karten
  const usePack = !!prep.pack || !!prep.packJob || !deck;
  // Erst lernen, dann Probe-Arbeit. Ältere Vorbereitungen mit Probe-Arbeit bleiben offen.
  const locked = !prep.unlocked && !sheets.length && share < LEARN_GOAL;
  const setPrep = (f: (e: ExamPrep) => ExamPrep) => update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? f(e) : e)) }));
  function setGrade(g: number) {
    update(x => addPoints({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? { ...e, grade: g } : e)) }, prep.childId, EXAM_POINTS[g], `${prep.subject}: Note ${g}`));
  }

  async function addPhotos() {
    const p = await pickPhotos(MAX - prep.photos.length, 'Unterlagen fotografieren').catch(() => []);
    if (!p.length) return;
    const photos = [...prep.photos, ...p].slice(0, MAX);
    update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? { ...e, photos: [...e.photos, ...p].slice(0, MAX) } : e)) }));
    // Noch kein Lernpaket: jetzt erstellen. Mit Lernpaket zeigt der Lernen-Schritt einen Hinweis auf die neuen Fotos.
    if (!prep.pack && !packRunning(prep) && !sheets.length) startPack({ ...prep, photos }, child, update as any, deck);
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
  // Auf Papier: Druckversion und Rückweg per Foto
  const paperSheet = open ?? waiting ?? sheets[sheets.length - 1];
  function print(solutions: boolean) {
    if (!paperSheet) return;
    const html = sheetHtml(paperSheet, { name: child?.name ?? '', grade: child ? currentGrade(child) : undefined, subject: prep.subject, solutions });
    setMsg('');
    printHtml(html).catch(() => setMsg('Drucken geht hier gerade nicht. Bitte im normalen Browser versuchen.'));
  }
  const remove = () => update(x => ({ ...x, exams: (x.exams ?? []).filter(e => e.id !== prep.id), events: (x.events ?? []).filter(e => e.id !== prep.eventId), vocab: (x.vocab ?? []).filter(v => v.prepId !== prep.id) }));
  const last = sheets.find(w => w.status === 'geprueft');
  const learnDone = share >= LEARN_GOAL || !!sheets.length || !!prep.unlocked;
  const practiceDone = !!last;
  const past = n !== null && n <= 0;
  const stepNow = prep.grade ? 4 : past ? 3 : !learnDone ? 1 : !practiceDone ? 2 : 3;
  const who = { name: child?.name ?? '', grade: child ? currentGrade(child) : undefined };
  async function upload() {
    if (!open) return;
    const p = await pickPhotos(10, 'Fertige Arbeit fotografieren').catch(() => [] as string[]);
    if (!p.length) return;
    setMsg('');
    scanAndGrade(open, p, who, update as any, parent ? undefined : prep.childId);
  }
  const scanning = waiting?.scan && !waiting.scan.ai && !waiting.scan.error;

  return (
    <View style={[s.card, { gap: 14, padding: 0, overflow: 'hidden' }]}>
      {/* Kopf: Fach, Thema, Countdown */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 0 }}>
        <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: child?.color ?? C.accent }} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>{prep.subject}</Text>
          <Text style={[s.text, { fontWeight: '800', fontSize: 18, lineHeight: 23 }]}>{prep.title}</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>{[child?.name, child && currentGrade(child) ? `Klasse ${currentGrade(child)}` : '', prep.date ? fmt(prep.date) : 'ohne Datum'].filter(Boolean).join(' · ')}</Text>
        </View>
        {n !== null && (
          <View style={{ alignItems: 'center', minWidth: 58, backgroundColor: n < 0 ? C.surface2 : n <= 3 ? '#fde3e6' : C.accentSoft, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ fontWeight: '800', fontSize: 20, color: n < 0 ? C.muted : n <= 3 ? C.danger : C.accent }}>{n < 0 ? '✓' : n === 0 ? '!' : n}</Text>
            <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>{n < 0 ? 'vorbei' : n === 0 ? 'heute' : n === 1 ? 'Tag' : 'Tage'}</Text>
          </View>
        )}
      </View>

      <FixHints prep={prep} parent={parent} />

      {/* Fortschritt in drei Schritten */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 6 }}>
        {['Lernen', 'Probe-Arbeit', 'Echte Arbeit'].map((t, i) => {
          const done = stepNow > i + 1, now = stepNow === i + 1;
          return (
            <View key={t} style={{ flex: 1, gap: 4 }}>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: done ? C.ok : now ? C.accent : C.line }} />
              <Text style={{ fontSize: 12, fontWeight: now ? '800' : '600', color: done ? C.ok : now ? C.fg : C.muted }} numberOfLines={1}>{done ? '✓ ' : `${i + 1}. `}{t}</Text>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 12, paddingHorizontal: 16 }}>
        {/* Schritt 1: Lernen (Merkzettel, Lernplan, Karten) */}
        {!past && (
          <Step n={1} title={usePack ? 'Lernen' : 'Lernkarten üben'} on={stepNow === 1}
            note={deck ? `${learned} von ${deck.cards.length} Karten sitzen${share >= LEARN_GOAL ? ' · Probe-Arbeit ist frei' : ` · ab ${Math.ceil(deck.cards.length * LEARN_GOAL)} gibt es die Probe-Arbeit`}` : undefined}>
            {usePack ? (
              <StudySection prep={prep} child={child} deck={deck} parent={parent} ai={ai} hasSheet={sheets.length > 0} checked={!!last} onPractice={setPlaying} />
            ) : deck ? (<>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: C.line, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.round(share * 100)}%`, backgroundColor: share >= LEARN_GOAL ? C.ok : C.accent }} />
              </View>
              <View style={s.row}>
                <Button title="Üben" onPress={() => setPlaying(deck)} style={btnS} />
              </View>
              {ai && (
                <View style={{ backgroundColor: C.accentSoft, borderRadius: 12, padding: 10, gap: 6 }}>
                  <Text style={[s.text, { fontSize: 14 }]}>Neu: Merkzettel und Lernplan bis zum Termin. Die Karten und was schon sitzt bleiben erhalten.</Text>
                  <View style={s.row}><Button title="Lernpaket erstellen" onPress={() => startPack(prep, child, update as any, deck)} style={btnS} /></View>
                </View>
              )}
            </>) : null}
            {deck && (<>
              {parent && <View style={s.row}><Button ghost title="Karten prüfen" onPress={() => setEditCards(x => !x)} style={btnS} />{usePack && <Button ghost title="Alle Karten üben" onPress={() => setPlaying(deck)} style={btnS} />}</View>}
              {!parent && usePack && <Pressable onPress={() => setPlaying(deck)}><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Alle Karten auf einmal üben</Text></Pressable>}
              <Text style={[s.muted, { fontSize: 12 }]}>Die KI kann sich irren. {parent ? 'Bitte Merkzettel und Karten kurz durchsehen.' : 'Wenn dir etwas komisch vorkommt, frag Mama oder Papa.'}</Text>
              {editCards && <DeckEditor deck={deck} childId={prep.childId} parent onDone={() => setEditCards(false)} />}
            </>)}
            {locked && parent && <Pressable onPress={() => setPrep(e => ({ ...e, unlocked: true }))}><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Probe-Arbeit jetzt schon freigeben</Text></Pressable>}
          </Step>
        )}
        {playing && <Practice deck={playing} givePoints={!parent} onClose={() => setPlaying(null)} />}

        {/* Schritt 2: Probe-Arbeit */}
        {(!locked || sheets.length > 0) && (
          <Step n={2} title="Probe-Arbeit schreiben" on={stepNow === 2} note={open?.exam ? `${open.questions.length} Aufgaben · ${open.exam.minutes} Min · ${open.exam.points.reduce((a, b) => a + b, 0)} Punkte` : undefined}>
            {last?.exam && last.results && <ResultLine sheet={last} />}
            {busy && <Busy text="Die KI liest alle Unterlagen und schreibt die Probe-Arbeit. Das dauert 1 bis 2 Minuten." onCancel={() => ctl.current?.abort()} />}
            {!ai && !sheets.length && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Die Probe-Arbeit erstellt die KI. Dafür muss das Gerät mit dem Familienserver verbunden sein.</Text>}
            {open && !busy && !scoring && (<>
              <Text style={[s.text, { fontSize: 14 }]}>{parent ? `Liegt bei ${child?.name}. Am Gerät lösen oder ausdrucken.` : 'Du kannst sie hier lösen oder ausdrucken und auf Papier schreiben.'}</Text>
              <View style={s.row}>
                {onSolve && <Button title="✍️ Am Gerät lösen" onPress={() => onSolve(open.id)} style={btnS} />}
                <Button ghost title="Drucken" onPress={() => print(false)} style={btnS} />
                {parent && <Button ghost title="Lösungsblatt" onPress={() => print(true)} style={btnS} />}
              </View>
              <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                <Text style={[s.text, { fontWeight: '700', fontSize: 14 }]}>Auf Papier fertig?</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>{parent ? 'Alle Seiten fotografieren. Die KI korrigiert vor, du bestätigst die Punkte. Oder du korrigierst selbst mit dem Lösungsblatt.' : 'Fotografiere alle Seiten. Die KI schaut drüber, dann prüfen Mama oder Papa.'}</Text>
                <View style={s.row}>
                  {ai && <Button title="Fotos hochladen" onPress={upload} style={btnS} />}
                  {parent && <Button ghost title="Punkte selbst eintragen" onPress={() => setScoring(true)} style={btnS} />}
                </View>
              </View>
            </>)}
            {scoring && open && <PaperScore sheet={open} onDone={() => setScoring(false)} />}
            {waiting && (scanning
              ? <Busy text={`Die KI korrigiert die Fotos vor. Das dauert etwa eine Minute.${parent ? '' : ' Du kannst die App schließen.'}`} />
              : <Text style={[s.text, { fontSize: 14 }]}>{parent ? 'Abgegeben. Oben unter „Zum Prüfen“ bestätigen.' : 'Abgegeben. Mama oder Papa schauen drüber.'}</Text>)}
            {!open && !waiting && !busy && !packRunning(prep) && ai && !locked && (
              <Button title={sheets.length ? 'Neue Probe-Arbeit' : 'Probe-Arbeit erstellen'} disabled={!prep.photos.length && prep.title.length < 10} onPress={make} style={btnS} />
            )}
            {!sheets.length && <Text style={[s.muted, { fontSize: 12 }]}>Gibt nach dem Prüfen {EXAM_PREP_POINTS} Punkte. Am besten 3 bis 5 Tage vorher, dann bleibt Zeit für die Schwachstellen.</Text>}
          </Step>
        )}

        {/* Schritt 3: echte Note */}
        {past && (
          <Step n={3} title="Echte Arbeit" on={stepNow === 3}>
            {prep.grade ? (
              <Text style={[s.text, { fontWeight: '800' }]}>Note {prep.grade}{last?.exam && last.results ? ` · Probe war ungefähr ${examScore(last, last.results).note}` : ''}</Text>
            ) : parent ? (<>
              <Text style={[s.text, { fontSize: 14 }]}>Welche Note gab es?</Text>
              <View style={[s.row, { gap: 6 }]}>{[1, 2, 3, 4, 5, 6].map(g => <Chip key={g} on={false} label={`${g}${EXAM_POINTS[g] ? ` · +${EXAM_POINTS[g]} P` : ''}`} onPress={() => setGrade(g)} />)}</View>
            </>) : <Text style={[s.muted, { fontSize: 13 }]}>Wenn die Arbeit zurück ist, tragen Mama oder Papa die Note ein.</Text>}
          </Step>
        )}
        {!!msg && <Text style={{ color: /^(Probe|Eingetragen)/.test(msg) ? C.ok : C.danger, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
      </View>

      {/* Fuß: Unterlagen und Löschen */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line }}>
        <Text style={[s.muted, { flex: 1, fontSize: 13 }]}>{prep.photos.length} {prep.photos.length === 1 ? 'Foto' : 'Fotos'} Unterlagen</Text>
        {prep.photos.length < MAX && !busy && <Button ghost title="+ Fotos" onPress={addPhotos} style={btnS} />}
        {!busy && <DeleteButton parent={parent} onDelete={remove} />}
      </View>
    </View>
  );
}

const btnS = { paddingVertical: 8, minHeight: 40 };
function Step({ n, title, on, note, children }: { n: number; title: string; on: boolean; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10, borderRadius: 16, padding: 12, backgroundColor: on ? C.surface : C.bg, borderWidth: on ? 2 : 1, borderColor: on ? C.accent : C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : C.surface2 }}>
          <Text style={{ color: on ? '#fff' : C.muted, fontWeight: '800', fontSize: 13 }}>{n}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800', fontSize: 15 }]}>{title}</Text>
          {!!note && <Text style={[s.muted, { fontSize: 12 }]}>{note}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}
function Busy({ text, onCancel }: { text: string; onCancel?: () => void }) {
  return (
    <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>{text}</Text>
      {onCancel && <Button ghost title="Abbrechen" onPress={onCancel} />}
    </View>
  );
}

export function ResultLine({ sheet }: { sheet: Worksheet }) {
  const r = examScore(sheet, sheet.results ?? []);
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 10, gap: 4 }}>
      <Text style={[s.text, { fontWeight: '800' }]}>Letzte Probe: {String(r.got).replace('.', ',')} von {r.total} Punkten · ungefähr Note {r.note}</Text>
      {r.weak.length ? <Text style={[s.text, { fontSize: 14 }]}>Noch üben: <Text style={{ fontWeight: '700', color: C.danger }}>{r.weak.join(', ')}</Text></Text> : <Text style={{ color: C.ok, fontWeight: '700' }}>Keine Schwachstellen, super vorbereitet!</Text>}
    </View>
  );
}

const fmtP = (n: number) => String(n).replace('.', ',');

/** Eltern haben das Papier selbst korrigiert und tragen die Punkte je Aufgabe ein. */
export function PaperScore({ sheet, onDone }: { sheet: Worksheet; onDone?: () => void }) {
  const { update } = useFamily();
  const pts = sheet.exam?.points ?? sheet.questions.map(() => 1);
  const ai = sheet.scan?.ai ?? (sheet.aiCheck?.pts ? { pts: sheet.aiCheck.pts, notes: [] as string[], unsure: [] as boolean[] } : undefined);
  const [got, setGot] = useState<(number | null)[]>(sheet.questions.map((_, i) => ai?.pts[i] ?? null));
  const set = (i: number, v: number) => setGot(g => g.map((x, j) => (j === i ? Math.min(pts[i], Math.max(0, v)) : x)));
  const all = got.every(x => x !== null);
  const vals = got.map(x => x ?? 0);
  const results = vals.map((v, i) => v >= pts[i] / 2);
  const score = examScore({ ...sheet, paperScore: vals }, results);
  const save = (retry: boolean) => {
    update(d => finishCheck(d, { ...sheet, paperScore: vals, answers: sheet.answers ?? sheet.questions.map(() => 'auf Papier') }, results, retry));
    onDone?.();
  };
  return (
    <View style={{ gap: 8, borderWidth: ai ? 0 : 2, borderColor: C.accent, borderRadius: 16, padding: ai ? 0 : 12 }}>
      {!ai && <Text style={s.h2}>Punkte eintragen</Text>}
      <Text style={[s.muted, { fontSize: 13 }]}>{ai ? `Vorschlag der KI. Bitte mit ${sheet.scan ? 'dem Foto' : 'den Antworten oben'} und dem Lösungsblatt abgleichen und bei Bedarf ändern. Erst „Fertig“ zählt.` : 'Pro Aufgabe die erreichten Punkte, halbe gehen auch. „Voll“ setzt die Höchstpunktzahl.'}</Text>
      {sheet.questions.map((q, i) => (
        <View key={i} style={{ gap: 4, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Clip style={[s.text, { flex: 1, minWidth: 0, fontSize: 14 }]} lines={2}><Text style={{ fontWeight: '800' }}>{i + 1}. </Text>{sheet.exam?.skills[i] ?? q.q}</Clip>
          <Pressable accessibilityLabel={`Aufgabe ${i + 1} weniger`} onPress={() => set(i, (got[i] ?? pts[i]) - 0.5)} style={stepBtn}><Text style={stepTxt}>−</Text></Pressable>
          <Text style={{ width: 58, textAlign: 'center', fontWeight: '800', fontSize: 15, color: got[i] === null ? C.muted : C.fg }}>{got[i] === null ? '–' : fmtP(got[i]!)} / {pts[i]}</Text>
          <Pressable accessibilityLabel={`Aufgabe ${i + 1} mehr`} onPress={() => set(i, (got[i] ?? -0.5) + 0.5)} style={stepBtn}><Text style={stepTxt}>+</Text></Pressable>
          <Pressable accessibilityLabel={`Aufgabe ${i + 1} volle Punkte`} onPress={() => set(i, pts[i])} style={[stepBtn, { width: 50, backgroundColor: got[i] === pts[i] ? C.okSoft : C.surface2 }]}><Text style={{ fontWeight: '700', color: C.ok }}>Voll</Text></Pressable>
        </View>
        {ai && (!!ai.notes[i] || ai.unsure[i]) && (
          <Text style={{ fontSize: 12, color: ai.unsure[i] ? C.warn : C.muted }}>{ai.unsure[i] ? '⚠️ Unsicher: ' : ''}{ai.notes[i] || 'Bitte selbst prüfen.'}</Text>
        )}
        </View>
      ))}
      <View style={{ backgroundColor: C.accentSoft, borderRadius: 12, padding: 10, gap: 2 }}>
        <Text style={[s.text, { fontWeight: '800' }]}>{fmtP(score.got)} von {score.total} Punkten{all ? ` · ungefähr Note ${score.note}` : ''}</Text>
        {all && score.weak.length > 0 && <Text style={[s.text, { fontSize: 14 }]}>Schwachstellen: <Text style={{ fontWeight: '700', color: C.danger }}>{score.weak.join(', ')}</Text></Text>}
        {!all && <Text style={[s.muted, { fontSize: 12 }]}>Noch {got.filter(x => x === null).length} Aufgaben offen.</Text>}
        {all && <Text style={[s.muted, { fontSize: 12 }]}>Schwachstelle heißt: weniger als die Hälfte der Punkte. Die Note ist ein Richtwert.</Text>}
      </View>
      <View style={s.row}>
        {all && results.some(r => !r) && <Button title="Schwachstellen üben lassen" onPress={() => save(true)} />}
        <Button title="Fertig" color={C.ok} disabled={!all} onPress={() => save(false)} />
        {onDone && <Button ghost title="Abbrechen" onPress={onDone} />}
      </View>
      <Text style={[s.muted, { fontSize: 12 }]}>Gibt {EXAM_PREP_POINTS} Punkte fürs Üben.</Text>
    </View>
  );
}
const stepBtn = { width: 36, height: 40, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const };
const stepTxt = { fontSize: 20, fontWeight: '800' as const, color: C.fg };
