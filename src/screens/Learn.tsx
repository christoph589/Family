import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, setSheet, today, topicUnderstanding, uid } from '../data/logic';
import { AI_ERROR, generateQuiz, getSample } from '../ai/generate';
import { Question, Topic } from '../data/types';
import { sanitizeSvg } from '../ui/Math';
import { Button, Segmented } from '../ui/Button';
import { KidSheets, ReviewSheets, SheetEditor, UnderstandingChip } from './Sheets';
import { C, s } from '../ui/theme';

const MAX_TOPICS = 30; // Fotos liegen vorerst lokal, deshalb begrenzt.
const MAX_PHOTOS = 8;
const photosOf = (t: Topic) => t.photos ?? (t.photo ? [t.photo] : []);

/** Verkleinert ein Foto auf max. 1400 px Breite, damit es lesbar bleibt, aber wenig Speicher braucht. */
async function shrink(a: ImagePicker.ImagePickerAsset): Promise<string> {
  const ctx = ImageManipulator.manipulate(a.uri);
  if (a.width > 1400) ctx.resize({ width: 1400 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.55, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}

export function Learn({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(childIds[0] ?? '');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Topic | null>(null);
  const [solveId, setSolveId] = useState<string | null>(null);
  if (!data) return null;
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
    const t: Topic = { id: uid(), childId, subject: subject.trim() || 'Schule', text: text.trim() || `${photos.length} ${photos.length === 1 ? 'Seite' : 'Seiten'}`, photos, date: today() };
    update(d => ({ ...d, topics: [t, ...(d.topics ?? [])].slice(0, MAX_TOPICS) }));
    setSubject(''); setText(''); setPhotos([]); setMsg('Thema gespeichert.');
  }

  return (
    <View style={{ gap: 16 }}>
    {parent ? <ReviewSheets childIds={childIds} /> : <KidSheets childId={childIds[0]} openId={solveId} setOpenId={setSolveId} />}
    {editing && <SheetEditor topic={editing} onDone={() => setEditing(null)} />}
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.h2}>Was kam heute dran?</Text>
        <Text style={s.muted}>Thema eintragen und ein Foto vom Heft oder der Tafel machen. Die KI macht daraus einen kurzen Test, mit dem ihr seht, ob das Thema verstanden wurde.</Text>
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
                <Image source={{ uri: ph }} style={{ width: 110, height: 150, borderRadius: 8, backgroundColor: C.surface2 }} resizeMode="cover" />
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
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.label}>Gespeicherte Themen</Text>
        {topics.length === 0 && <Text style={s.muted}>Noch keine Themen.</Text>}
        {topics.map(t => <TopicRow key={t.id} topic={t} childName={data.children.find(c => c.id === t.childId)?.name ?? ''} onMsg={setMsg} onCreate={parent ? () => setEditing(t) : undefined} onSolve={parent ? undefined : id => setSolveId(id)} />)}
        <Text style={[s.muted, { fontSize: 13 }]}>„Drucken“ druckt den letzten Test zum Thema mit Platz für die Antworten.</Text>
      </View>
    </View>
    </View>
  );
}

function TopicRow({ topic, childName, onMsg, onCreate, onSolve }: { topic: Topic; childName: string; onMsg: (m: string) => void; onCreate?: () => void; onSolve?: (sheetId: string) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const u = data ? topicUnderstanding(data, topic.id) : undefined;
  const sheets = (data?.worksheets ?? []).filter(w => w.topicId === topic.id);
  const open = sheets.find(w => w.status === 'offen');
  const waiting = sheets.some(w => w.status === 'abgegeben');
  const latest = sheets[0];
  const parent = !!onCreate;
  const date = new Date(topic.date + 'T12:00:00').toLocaleDateString('de-DE');

  async function print() {
    try { await Print.printAsync({ html: worksheetHtml(topic, childName, date, latest?.questions ?? []) }); }
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
          <Image source={{ uri: photosOf(topic)[0] }} style={{ width: 56, height: 56, borderRadius: 8 }} />
          {photosOf(topic).length > 1 && <Text style={[s.muted, { fontSize: 11, textAlign: 'center' }]}>{photosOf(topic).length} Seiten</Text>}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.text, { fontWeight: '700' }]}>{topic.subject}: {topic.text}</Text>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.muted, { fontSize: 12 }]}>{childName} · {date}</Text>
          {u && <UnderstandingChip u={u} />}
        </View>
        {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>KI liest die Fotos und erstellt den Test. Das dauert meist 20 bis 60 Sekunden.</Text></View>}
        {!busy && !sheets.length && !ai && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>{parent ? 'Noch kein Test. Die KI gibt es im Test nur im Web-Link.' : 'Wartet auf einen Test'}</Text>}
        {open && !parent && !busy && <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Test ist bereit</Text>}
        {open && parent && <Text style={[s.muted, { fontSize: 13 }]}>Test liegt bei {childName}, noch nicht gelöst</Text>}
        {waiting && <Text style={[s.muted, { fontSize: 13 }]}>{parent ? 'Abgegeben, oben prüfen' : 'Abgegeben, Eltern schauen drüber'}</Text>}
        <View style={[s.row, { marginTop: 6 }]}>
          {open && onSolve && !busy && <Button title="Test lösen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => onSolve(open.id)} />}
          {ai && !open && !waiting && !busy && <Button title={sheets.length ? 'Neuen Test erstellen' : 'Test erstellen'} style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={makeTest} />}
          {busy && <Button ghost title="Abbrechen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => ctl.current?.abort()} />}
          {parent && !busy && <Button ghost title="Selbst Fragen schreiben" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={onCreate} />}
          <Button ghost title="Drucken" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={print} />
          {parent && <Button ghost title="Löschen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => update(d => ({ ...d, topics: (d.topics ?? []).filter(x => x.id !== topic.id) }))} />}
        </View>
      </View>
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
