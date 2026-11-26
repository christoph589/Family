import * as ImagePicker from 'expo-image-picker';
import { PhotoImg } from '../ui/PhotoImg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { printHtml } from '../ui/Print';
import { Grades } from './Grades';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, setSheet, today, topicUnderstanding, uid, SELF_BONUS, SELF_BONUS_PER_DAY } from '../data/logic';
import { askTopic, QA, AI_ERROR, generateQuiz, getSample } from '../ai/generate';
import { PRACTICE_POINTS, Question, Topic } from '../data/types';
import { sanitizeSvg } from '../ui/Math';
import { Button, Segmented } from '../ui/Button';
import { KidSheets, ReviewSheets, SheetEditor, UnderstandingChip } from './Sheets';
import { C, s } from '../ui/theme';
import { VocabReset, Vocab } from './Vocab';
import { ExamPrepScreen } from './Exam';
import { dueCount } from '../data/vocab';

const MAX_TOPICS = 30; // Fotos liegen vorerst lokal, deshalb begrenzt.
const MAX_PHOTOS = 8;
const photosOf = (t: Topic) => t.photos ?? (t.photo ? [t.photo] : []);

/** Verkleinert ein Foto auf max. 1400 px Breite, damit es lesbar bleibt, aber wenig Speicher braucht. */
export async function shrink(a: ImagePicker.ImagePickerAsset): Promise<string> {
  const ctx = ImageManipulator.manipulate(a.uri);
  if (a.width > 1400) ctx.resize({ width: 1400 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.55, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}

export function Learn({ childIds, parent, meId, admin }: { childIds: string[]; parent: boolean; meId?: string; admin?: boolean }) {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(childIds[0] ?? '');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Topic | null>(null);
  const [solveId, setSolveId] = useState<string | null>(null);
  const [part, setPart] = useState<'themen' | 'klassenarbeit' | 'vokabeln'>('themen');
  const [focus, setFocus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  if (!data) return null;
  const allIds = childIds;
  if (parent && focus && allIds.includes(focus)) childIds = [focus];
  const kids = data.children.filter(c => childIds.includes(c.id));
  const topics = (data.topics ?? []).filter(t => childIds.includes(t.childId));

  async function pick(camera: boolean) {
    setMsg('');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !camera, selectionLimit: MAX_PHOTOS - photos.length };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setMsg('Kamera nicht erlaubt. Bitte in den Einstellungen freigeben.'); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    try {
      const small = await Promise.all(res.assets.slice(0, MAX_PHOTOS - photos.length).map(shrink));
      setPhotos(p => [...p, ...small]);
    } catch { setMsg('Foto konnte nicht geladen werden. Bitte nochmal versuchen.'); }
    setBusy(false);
  }

  function save() {
    const t: Topic = { id: uid(), childId, subject: subject.trim() || 'Schule', text: text.trim() || `${photos.length} ${photos.length === 1 ? 'Seite' : 'Seiten'}`, photos, date: today(), by: meId };
    update(d => ({ ...d, topics: [t, ...(d.topics ?? [])].slice(0, MAX_TOPICS) }));
    setSubject(''); setText(''); setPhotos([]); setMsg('Thema gespeichert.');
  }

  const vocabDue = childIds.reduce((n, id) => n + dueCount(data, id), 0);
  const tabs = <>
    {parent && allIds.length > 1 && <ParentOverview ids={allIds} focus={focus} setFocus={setFocus} onGo={setPart} />}
    <Segmented value={part} onChange={setPart} options={[{ value: 'themen', label: 'Täglich' }, { value: 'klassenarbeit', label: 'Klassenarbeit' }, { value: 'vokabeln', label: `Vokabeln${vocabDue ? ` (${vocabDue})` : ''}` }]} />
  </>;
  if (part === 'klassenarbeit') return (
    <View style={{ gap: 16 }}>
      {tabs}
      {parent ? <ReviewSheets childIds={childIds} /> : <KidSheets childId={childIds[0]} openId={solveId} setOpenId={setSolveId} />}
      <ExamPrepScreen childIds={childIds} parent={parent} meId={meId} onSolve={parent ? undefined : setSolveId} />
      {admin && <Grades />}
    </View>
  );
  if (part === 'vokabeln') return <View style={{ gap: 16 }}>{tabs}<Vocab childIds={childIds} parent={parent} meId={meId} />{admin && <VocabReset childIds={childIds} />}</View>;

  return (
    <View style={{ gap: 16 }}>
    {tabs}
    {parent ? <ReviewSheets childIds={childIds} /> : <KidSheets childId={childIds[0]} openId={solveId} setOpenId={setSolveId} />}
    {editing && <SheetEditor topic={editing} onDone={() => setEditing(null)} />}
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      {parent && !showForm ? (
        <Pressable onPress={() => setShowForm(true)} style={[s.card, { flexGrow: 1, flexBasis: 320, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Text style={{ fontSize: 26 }}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontWeight: '800' }]}>Neues Thema anlegen</Text>
            <Text style={[s.muted, { fontSize: 13 }]}>Foto vom Heft oder der Tafel, die KI macht einen kurzen Test.</Text>
          </View>
          <Text style={{ color: C.accent, fontWeight: '800', fontSize: 22 }}>+</Text>
        </Pressable>
      ) : (
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.h2}>Was kam heute dran?</Text>
          {parent && <Button ghost title="Schließen" onPress={() => setShowForm(false)} style={{ paddingVertical: 6 }} />}
        </View>
        <Text style={s.muted}>Thema eintragen und ein Foto vom Heft oder der Tafel machen. Die KI macht daraus einen kurzen Test, mit dem ihr seht, ob das Thema verstanden wurde.</Text>
        {!parent && (
          <View style={{ backgroundColor: C.warnSoft, borderRadius: 14, padding: 12, gap: 2 }}>
            <Text style={[s.text, { fontWeight: '800' }]}>⭐ Bonus, wenn du selbst hochlädst</Text>
            <Text style={[s.text, { fontSize: 14 }]}>+{SELF_BONUS.upload} fürs Hochladen, +{PRACTICE_POINTS} fürs Lernen, +{SELF_BONUS.verstanden} wenn du alles verstanden hast. Bis zu {SELF_BONUS_PER_DAY} Themen am Tag.</Text>
          </View>
        )}
        {kids.length > 1 && <Segmented value={childId} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name }))} />}
        <Text style={s.label}>Fach (optional)</Text>
        <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="z. B. Mathe" />
        <Text style={s.label}>Thema (optional, wenn Fotos dabei sind)</Text>
        <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={text} onChangeText={setText} placeholder="z. B. Brüche mit gleichem Nenner addieren" />
        <Text style={s.label}>Fotos ({photos.length} von {MAX_PHOTOS})</Text>
        {photos.length > 0 && (
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {photos.map((ph, i) => (
              <View key={i} style={{ width: 110 }}>
                <PhotoImg uri={ph} style={{ width: 110, height: 150, borderRadius: 8, backgroundColor: C.surface2 }} resizeMode="cover" />
                <Pressable accessibilityLabel={`Seite ${i + 1} entfernen`} onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>✕</Text>
                </Pressable>
                <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>Seite {i + 1}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        {photos.length < MAX_PHOTOS && (
          <View style={s.row}>
            {Platform.OS !== 'web' && <Button ghost title="Foto machen" onPress={() => pick(true)} />}
            <Button ghost title={busy ? 'Lädt …' : photos.length ? 'Weitere Seiten hinzufügen' : Platform.OS === 'web' ? 'Fotos oder Screenshots hochladen' : 'Aus Fotos wählen'} disabled={busy} onPress={() => pick(false)} />
          </View>
        )}
        <Button title="Thema speichern" disabled={busy || !childId || (!photos.length && !text.trim())} onPress={save} />
        {!photos.length && !text.trim() ? <Text style={[s.muted, { fontSize: 13 }]}>Ein Foto oder ein paar Worte zum Thema reichen.</Text> : null}
        {msg ? <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text> : null}
      </View>
      )}
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.label}>Themen{topics.length ? ` (${topics.length})` : ''}</Text>
        {parent && msg && !showForm ? <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text> : null}
        {topics.length === 0 && <Text style={s.muted}>Noch keine Themen.</Text>}
        {(allTopics ? topics : topics.slice(0, 5)).map(t => <TopicRow key={t.id} topic={t} childName={data.children.find(c => c.id === t.childId)?.name ?? ''} onMsg={setMsg} onCreate={parent ? () => setEditing(t) : undefined} onSolve={parent ? undefined : id => setSolveId(id)} />)}
        {topics.length > 5 && <Button ghost title={allTopics ? 'Weniger zeigen' : `Alle ${topics.length} Themen zeigen`} onPress={() => setAllTopics(x => !x)} />}
      </View>
    </View>
    </View>
  );
}

/** Eltern: auf einen Blick, wo bei welchem Kind etwas ansteht. Antippen filtert alles darunter auf dieses Kind. */
function ParentOverview({ ids, focus, setFocus, onGo }: { ids: string[]; focus: string; setFocus: (id: string) => void; onGo: (p: 'themen' | 'klassenarbeit' | 'vokabeln') => void }) {
  const { data } = useFamily();
  if (!data) return null;
  const t0 = today();
  const kids = data.children.filter(c => ids.includes(c.id));
  const rows = kids.map(k => {
    const ws = (data.worksheets ?? []).filter(w => w.childId === k.id);
    const check = ws.filter(w => w.status === 'abgegeben').length;
    const open = ws.filter(w => w.status === 'offen').length;
    const next = (data.exams ?? []).filter(e => e.childId === k.id && e.date && e.date >= t0).sort((a, b) => a.date!.localeCompare(b.date!))[0];
    const days = next ? Math.round((new Date(next.date + 'T12:00:00').getTime() - new Date(t0 + 'T12:00:00').getTime()) / 864e5) : null;
    const fixme = (data.exams ?? []).filter(e => e.childId === k.id && !e.grade && (!e.date || (e.spell?.fix && !e.spell.done))).length;
    return { k, check, open, next, days, fixme, vocab: dueCount(data, k.id) };
  });
  const Pill = ({ text, color, bg, onPress }: { text: string; color: string; bg: string; onPress?: () => void }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={[s.card, { gap: 4, padding: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 4 }]}>
        <Text style={[s.text, { fontWeight: '800' }]}>Überblick</Text>
        {focus ? <Pressable onPress={() => setFocus('')}><Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>Alle Kinder zeigen</Text></Pressable> : <Text style={[s.muted, { fontSize: 12 }]}>Kind antippen zum Filtern</Text>}
      </View>
      {rows.map(({ k, check, open, next, days, fixme, vocab }) => {
        const on = focus === k.id, dim = !!focus && !on;
        return (
          <Pressable key={k.id} onPress={() => setFocus(on ? '' : k.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, backgroundColor: on ? C.accentSoft : 'transparent', opacity: dim ? 0.45 : 1 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: k.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{k.name[0]}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[s.text, { fontWeight: '800', fontSize: 15 }]}>{k.name}</Text>
              <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                {check > 0 && <Pill text={`✍️ ${check} prüfen`} color={C.warn} bg={C.warnSoft} />}
                {open > 0 && <Pill text={`📝 ${open} offen`} color={C.accent} bg={C.accentSoft} />}
                {next && <Pill text={`📅 ${next.subject} ${days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} T.`}`} color={days !== null && days <= 3 ? C.danger : C.fg} bg={days !== null && days <= 3 ? '#fde3e6' : C.surface2} onPress={() => { setFocus(k.id); onGo('klassenarbeit'); }} />}
                {fixme > 0 && <Pill text={`⚠️ ${fixme} unvollständig`} color={C.warn} bg={C.warnSoft} onPress={() => { setFocus(k.id); onGo('klassenarbeit'); }} />}
                {vocab > 0 && <Pill text={`🔤 ${vocab} Vokabeln`} color={C.fg} bg={C.surface2} />}
                {!check && !open && !next && !vocab && !fixme && <Text style={[s.muted, { fontSize: 12 }]}>Nichts offen ✓</Text>}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function TopicRow({ topic, childName, onMsg, onCreate, onSolve }: { topic: Topic; childName: string; onMsg: (m: string) => void; onCreate?: () => void; onSolve?: (sheetId: string) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const u = data ? topicUnderstanding(data, topic.id) : undefined;
  const sheets = (data?.worksheets ?? []).filter(w => w.topicId === topic.id);
  const open = sheets.find(w => w.status === 'offen');
  const waiting = sheets.some(w => w.status === 'abgegeben');
  const latest = sheets[0];
  const parent = !!onCreate;
  const date = new Date(topic.date + 'T12:00:00').toLocaleDateString('de-DE');
  const byP = topic.by ? [...(data?.parents ?? []), ...(data?.children ?? [])].find(p => p.id === topic.by) : undefined;
  const by = byP ? { id: byP.id, name: (byP as any).title ? `${byP.name} (${(byP as any).title})` : byP.name } : undefined;

  async function print() {
    try { await printHtml(worksheetHtml(topic, childName, date, latest?.questions ?? [])); }
    catch { onMsg('Drucken geht in dieser Vorschau nicht. In der App oder im normalen Browser klappt es.'); }
  }

  async function makeTest() {
    if (!data) return;
    const child = data.children.find(c => c.id === topic.childId);
    ctl.current = new AbortController();
    setBusy(true); onMsg('');
    try {
      const quiz = await generateQuiz(topic, photosOf(topic), child?.name ?? childName, child ? currentGrade(child) : undefined, ctl.current.signal);
      const id = uid();
      const generic = topic.subject === 'Schule' || /^\d+ Seiten?$/.test(topic.text);
      update(d => setSheet(
        generic ? { ...d, topics: (d.topics ?? []).map(t => (t.id === topic.id ? { ...t, text: quiz.title } : t)) } : d,
        { id, childId: topic.childId, topicId: topic.id, title: `${topic.subject === 'Schule' ? '' : topic.subject + ': '}${quiz.title}`, date: today(), questions: quiz.questions, status: 'offen' },
      ));
      if (onSolve) onSolve(id); else onMsg(`Test mit ${quiz.questions.length} Fragen ist bei ${childName}.`);
    } catch (e: any) {
      if (e?.code !== 'cancelled') onMsg(AI_ERROR[e?.code] ?? 'Die KI ist gerade nicht erreichbar. Bitte nochmal versuchen.');
    }
    setBusy(false);
  }

  return (
    <View style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12, flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
      {photosOf(topic).length ? (
        <View>
          <PhotoImg uri={photosOf(topic)[0]} style={{ width: 56, height: 56, borderRadius: 8 }} />
          {photosOf(topic).length > 1 && <Text style={[s.muted, { fontSize: 11, textAlign: 'center' }]}>{photosOf(topic).length} Seiten</Text>}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.text, { fontWeight: '700' }]}>{topic.subject}: {topic.text}</Text>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.muted, { fontSize: 12 }]}>{by && by.id !== topic.childId ? `Für ${childName} · von ${by.name}` : by ? `Von ${childName} selbst` : `Für ${childName}`} · {date}</Text>
          {u && <UnderstandingChip u={u} />}
        </View>
        {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>KI liest die Fotos und erstellt den Test. Das dauert meist 20 bis 60 Sekunden.</Text></View>}
        {!busy && !sheets.length && !ai && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>{parent ? 'Noch kein Test. Die KI braucht die Verbindung mit dem Familienserver. Bis dahin „Selbst Fragen schreiben“.' : 'Wartet auf einen Test'}</Text>}
        {open && !parent && !busy && <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Test ist bereit</Text>}
        {open && parent && <Text style={[s.muted, { fontSize: 13 }]}>Test liegt bei {childName}, noch nicht gelöst</Text>}
        {waiting && <Text style={[s.muted, { fontSize: 13 }]}>{parent ? 'Abgegeben, oben prüfen' : 'Abgegeben, Eltern schauen drüber'}</Text>}
        <View style={[s.row, { marginTop: 6 }]}>
          {open && onSolve && !busy && <Button title="Test lösen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => onSolve(open.id)} />}
          {ai && !open && !waiting && !busy && <Button title={sheets.length ? 'Neuen Test erstellen' : 'Test erstellen'} style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={makeTest} />}
          {busy && <Button ghost title="Abbrechen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => ctl.current?.abort()} />}
          {ai && !busy && !asking && <Button ghost title="❓ Frage stellen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => setAsking(true)} />}
          {parent && !busy && <Button ghost title="Selbst Fragen schreiben" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={onCreate} />}
          {latest && <Button ghost title="Drucken" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={print} />}
          {parent && <Button ghost title="Löschen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => update(d => ({ ...d, topics: (d.topics ?? []).filter(x => x.id !== topic.id) }))} />}
        </View>
        {asking && <AskBox topic={topic} childName={childName} onClose={() => setAsking(false)} />}
      </View>
    </View>
  );
}

/** Rückfragen zum Stoff. Das Gespräch bleibt nur auf diesem Gerät und nur, solange die Box offen ist. Höchstens 6 Fragen. */
function AskBox({ topic, childName, onClose }: { topic: Topic; childName: string; onClose: () => void }) {
  const { data } = useFamily();
  const [q, setQ] = useState('');
  const [log, setLog] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const MAX = 6;
  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setErr('');
    ctl.current = new AbortController();
    try {
      const child = data?.children.find(c => c.id === topic.childId);
      const a = await askTopic(topic, photosOf(topic), child?.name ?? childName, child ? currentGrade(child) : undefined, log, question, ctl.current.signal);
      setLog(l => [...l, { q: question, a: a || 'Dazu habe ich gerade keine Antwort. Frag am besten Mama oder Papa.' }]); setQ('');
    } catch (e: any) { if (e?.code !== 'cancelled') setErr(AI_ERROR[e?.code] ?? 'Die KI ist gerade nicht erreichbar.'); }
    setBusy(false);
  }
  return (
    <View style={{ marginTop: 8, gap: 8, backgroundColor: C.accentSoft, borderRadius: 14, padding: 10 }}>
      <Text style={[s.label, { color: C.accent }]}>❓ Frag nach, was du nicht verstanden hast</Text>
      {log.map((x, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Text style={[s.text, { fontWeight: '700', fontSize: 15 }]}>🙋 {x.q}</Text>
          <Text style={[s.text, { fontSize: 15, backgroundColor: C.surface, borderRadius: 10, padding: 10 }]}>{x.a}</Text>
        </View>
      ))}
      {log.length < MAX ? (
        <>
          <TextInput style={[s.input, { backgroundColor: C.surface }]} value={q} onChangeText={setQ} placeholder="z. B. Warum muss der Nenner gleich bleiben?" accessibilityLabel="Deine Frage" multiline onSubmitEditing={send} />
          <View style={s.row}>
            <Button title={busy ? 'Denkt nach …' : 'Fragen'} disabled={busy || q.trim().length < 3} onPress={send} />
            {busy ? <Button ghost title="Abbrechen" onPress={() => ctl.current?.abort()} /> : <Button ghost title="Schließen" onPress={onClose} />}
          </View>
        </>
      ) : (
        <View style={s.row}><Text style={[s.muted, { flex: 1 }]}>Genug gefragt für jetzt. Mach jetzt den Test, dann siehst du, ob es sitzt.</Text><Button ghost title="Schließen" onPress={onClose} /></View>
      )}
      {!!err && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{err}</Text>}
    </View>
  );
}

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const frac = (v: string) => esc(v).replace(/(\d+)\s*\/\s*(\d+)/g, '<span class="fr"><span>$1</span><span class="dn">$2</span></span>');

function questionHtml(q: Question): string {
  const fig = sanitizeSvg(q.figure);
  let body = '';
  if (q.type === 'choice' && q.options) body = `<ul class="opts">${q.options.map(o => `<li>☐ ${frac(o)}</li>`).join('')}</ul>`;
  else if (q.type === 'table' && q.table) body = `<table><tr>${q.table.header.map(h => `<th>${frac(h)}</th>`).join('')}</tr>${q.table.rows.map(r => `<tr>${r.map(c => `<td>${c === '?' ? '' : frac(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  else body = '<div class="line"></div><div class="line"></div>';
  return `<li><div class="q">${frac(q.q)}</div>${fig ? `<div class="fig">${fig}</div>` : ''}${body}</li>`;
}

/** Arbeitsblatt als HTML mit den Aufgaben des letzten Tests. */
export function worksheetHtml(t: Topic, name: string, date: string, questions: Question[] = []) {
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;margin:32px;color:#111}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}
    h1{font-size:22px;margin:16px 0 4px} .sub{color:#555}
    ol{font-size:16px;line-height:1.5;padding-left:22px} li{margin:0 0 22px;page-break-inside:avoid}
    .q{font-weight:bold;margin-bottom:6px} .line{border-bottom:1px solid #999;height:32px}
    .fig svg{max-width:360px;height:auto} table{border-collapse:collapse;margin-top:6px} th,td{border:1px solid #555;padding:6px 12px;min-width:48px;height:28px;text-align:center}
    .opts{list-style:none;padding:0} .fr{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;font-size:.85em;line-height:1.05;margin:0 2px} .dn{border-top:1.5px solid #111}
  </style></head><body>
    <div class="head"><b>Name: ${esc(name)}</b><span>Datum: ${date}</span></div>
    <h1>${frac(t.subject)}: ${frac(t.text)}</h1>
    <div class="sub">Tages-Übung</div>
    ${questions.length ? `<ol>${questions.map(questionHtml).join('')}</ol>` : '<p>Schreibe auf, was du heute zu diesem Thema gelernt hast, und rechne oder schreibe ein eigenes Beispiel.</p>' + Array.from({ length: 12 }, () => '<div class="line"></div>').join('')}
  </body></html>`;
}
