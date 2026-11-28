import { isOn, useFlags } from '../data/flags';
import * as ImagePicker from 'expo-image-picker';
import { PhotoImg } from '../ui/PhotoImg';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { printHtml } from '../ui/Print';
import { Grades } from './Grades';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, setSheet, today, topicUnderstanding, uid, SELF_BONUS, SELF_BONUS_PER_DAY } from '../data/logic';
import { askTopic, QA, AI_ERROR, generateQuiz, getSample } from '../ai/generate';
import { PRACTICE_POINTS, Question, Topic } from '../data/types';
import { sanitizeSvg } from '../ui/Math';
import { Button, Segmented } from '../ui/Button';
import { DoneSheets, KidSheets, ReviewSheets, SheetEditor, SolveModal, UnderstandingChip } from './Sheets';
import { Icon } from '../ui/Icon';
import { LearnToday, LearnPart } from './LearnToday';
import { studyToday } from '../data/studyplan';
import { C, s, SHADOW } from '../ui/theme';
import { VocabReset, Vocab } from './Vocab';
import { collectPhotos } from './PhotoCollector';
import { ExamPrepScreen } from './Exam';
import { dueCount } from '../data/vocab';
import { LearnStats } from './LearnStats';

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
  const [part, setPart] = useState<LearnPart>('heute');
  const flags = useFlags();
  const { width } = useWindowDimensions();
  useEffect(() => { if (part === 'vokabeln' && !isOn('vokabeln', flags)) setPart('heute'); }, [flags, part]);
  const [focus, setFocus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  if (!data) return null;
  const allIds = childIds;
  if (parent && focus && allIds.includes(focus)) childIds = [focus];
  const kids = data.children.filter(c => childIds.includes(c.id));
  const topics = (data.topics ?? []).filter(t => childIds.includes(t.childId));

  async function pick() {
    setMsg('');
    setBusy(true);
    const p = await collectPhotos(MAX_PHOTOS - photos.length, 'Seiten fotografieren').catch(() => [] as string[]);
    setPhotos(x => [...x, ...p].slice(0, MAX_PHOTOS));
    setBusy(false);
  }

  function save() {
    const t: Topic = { id: uid(), childId, subject: subject.trim() || 'Schule', text: text.trim() || `${photos.length} ${photos.length === 1 ? 'Seite' : 'Seiten'}`, photos, date: today(), by: meId };
    update(d => ({ ...d, topics: [t, ...(d.topics ?? [])].slice(0, MAX_TOPICS) }));
    setSubject(''); setText(''); setPhotos([]); setMsg('Thema gespeichert.'); setShowForm(false);
  }

  const narrow = width < 560;
  // Eltern: offene Einsprüche (nur das können sie erledigen); Kind: fällige Vokabeln
  const vocabDue = parent ? (data.vocabClaims ?? []).filter(c => allIds.includes(c.childId)).length : childIds.reduce((n, id) => n + dueCount(data, id), 0);
  // Zahl am Reiter „Heute“: Kind = was wartet, Eltern = was zu prüfen ist
  const sheetsOf = (data.worksheets ?? []).filter(w => allIds.includes(w.childId));
  const todayN = parent ? sheetsOf.filter(w => w.status === 'abgegeben').length
    : sheetsOf.filter(w => w.status === 'offen').length + studyToday(data, allIds[0] ?? '').filter(p => !p.day.done).length;
  const tabs = <>
    <View style={{ position: (Platform.OS === 'web' ? 'sticky' : 'relative') as any, top: 0, zIndex: 10, marginHorizontal: -4, paddingHorizontal: 4, paddingVertical: 4, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.surface2, padding: 4, borderRadius: 14, gap: 4 }}>
        {([['heute', 'Heute', todayN], ['themen', 'Themen', 0], ['klassenarbeit', 'Arbeiten', 0], ['vokabeln', 'Vokabeln', vocabDue], ['statistik', 'Statistik', 0]] as const).filter(([v]) => (v !== 'vokabeln' || isOn('vokabeln', flags)) && (v !== 'statistik' || parent)).map(([v, label, n]) => {
          const on = part === v;
          // Statistik am Handy nur als Symbol, damit die anderen Reiter lesbar bleiben
          const icon = v === 'statistik' && narrow;
          return (
            <Pressable key={v} onPress={() => setPart(v)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
              style={{ flex: icon ? 0 : 1, paddingHorizontal: icon ? 8 : 0, minWidth: icon ? 38 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 11, backgroundColor: on ? C.surface : 'transparent', ...(on ? SHADOW.sm : {}) }}>
              <Text style={{ fontWeight: '800', fontSize: narrow ? 13 : 14, color: on ? C.fg : C.muted }} numberOfLines={1}>{icon ? <Icon name="chart" size={20} color={on ? C.fg : C.muted} /> : label}</Text>
              {n > 0 && <View style={{ position: 'absolute', top: -2, right: narrow ? -3 : 2, minWidth: 16, paddingHorizontal: 4, height: 16, borderRadius: 8, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text></View>}
            </Pressable>
          );
        })}
      </View>
    </View>
    {/* Eltern mit mehreren Kindern: ein Filter für alle Reiter außer „Heute“ (dort steht der Überblick) */}
    {parent && allIds.length > 1 && part !== 'heute' && part !== 'statistik' && part !== 'vokabeln' && (
      <Segmented value={focus} onChange={setFocus} options={[{ value: '', label: 'Alle Kinder' }, ...data.children.filter(c => allIds.includes(c.id)).map(c => ({ value: c.id, label: c.name }))]} />
    )}
  </>;
  const goTo = (p: LearnPart) => setPart(p);
  const newTopic = () => { setShowForm(true); setPart('themen'); };
  const body = (() => {
    if (part === 'heute') return parent ? (
      <>
        <ReviewSheets childIds={allIds} />
        <ParentOverview ids={allIds} focus={focus} setFocus={setFocus} onGo={goTo} />
        <View style={[s.row, { gap: 8 }]}>
          <Button ghost title="+ Thema" style={{ flex: 1 }} onPress={newTopic} />
          <Button ghost title="+ Klassenarbeit" style={{ flex: 1 }} onPress={() => setPart('klassenarbeit')} />
        </View>
      </>
    ) : <LearnToday childId={childIds[0]} onGo={goTo} onSolve={setSolveId} onNewTopic={newTopic} />;
    if (part === 'klassenarbeit') return (
      <>
        {parent && <ReviewSheets childIds={childIds} exam />}
        <ExamPrepScreen childIds={childIds} parent={parent} meId={meId} onSolve={parent ? undefined : setSolveId} />
        {!parent && <KidSheets childId={childIds[0]} kind="exam" setOpenId={setSolveId} />}
        {parent && <DoneSheets childIds={childIds} exam />}
        {admin && <Grades />}
      </>
    );
    if (part === 'statistik' && parent) return <LearnStats ids={allIds} onGo={(id, p) => { if (allIds.length > 1) setFocus(id); setPart(p); }} />;
    if (part === 'vokabeln') return <><Vocab childIds={childIds} parent={parent} meId={meId} />{admin && <VocabReset childIds={childIds} />}</>;
    return (
      <>
        {parent ? <ReviewSheets childIds={childIds} exam={false} /> : <KidSheets childId={childIds[0]} kind="test" setOpenId={setSolveId} />}
        {editing && <SheetEditor topic={editing} onDone={() => setEditing(null)} />}
        <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
          {!showForm ? (
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
              <Button ghost title="Schließen" onPress={() => setShowForm(false)} style={{ paddingVertical: 6 }} />
            </View>
            <Text style={s.muted}>Thema eintragen und ein Foto vom Heft oder der Tafel machen. Die KI macht daraus einen kurzen Test, mit dem ihr seht, ob das Thema verstanden wurde.</Text>
            {!parent && (
              <View style={{ backgroundColor: C.warnSoft, borderRadius: 14, padding: 12, gap: 2 }}>
                <Text style={[s.text, { fontWeight: '800' }]}>★ Bonus, wenn du selbst hochlädst</Text>
                <Text style={[s.text, { fontSize: 14 }]}>+{SELF_BONUS.upload} fürs Hochladen, +{PRACTICE_POINTS} fürs Lernen, +{SELF_BONUS.verstanden} wenn du alles verstanden hast. Bis zu {SELF_BONUS_PER_DAY} Themen am Tag.</Text>
              </View>
            )}
            {kids.length > 1 && <><Text style={s.label}>Für wen?</Text><Segmented value={childId} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name }))} /></>}
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
                <Button ghost title={busy ? 'Lädt …' : photos.length ? 'Weitere Seiten' : 'Seiten fotografieren'} disabled={busy} onPress={pick} />
              </View>
            )}
            <Button title="Thema speichern" disabled={busy || !childId || (!photos.length && !text.trim())} onPress={save} />
            {!photos.length && !text.trim() ? <Text style={[s.muted, { fontSize: 13 }]}>Ein Foto oder ein paar Worte zum Thema reichen.</Text> : null}
          </View>
          )}
          <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
            <Text style={s.label}>Themen{topics.length ? ` (${topics.length})` : ''}</Text>
            {msg && !showForm ? <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text> : null}
            {topics.length === 0 && <Text style={s.muted}>Noch keine Themen.</Text>}
            {(allTopics ? topics : topics.slice(0, 6)).map(t => <TopicRow key={t.id} topic={t} childName={data.children.find(c => c.id === t.childId)?.name ?? ''} onMsg={setMsg} onCreate={parent ? () => setEditing(t) : undefined} onSolve={parent ? undefined : id => setSolveId(id)} />)}
            {topics.length > 6 && <Button ghost title={allTopics ? 'Weniger anzeigen' : `Mehr anzeigen (${topics.length - 6})`} onPress={() => setAllTopics(x => !x)} />}
          </View>
        </View>
        {parent && <DoneSheets childIds={childIds} exam={false} />}
      </>
    );
  })();
  return (
    <View style={{ gap: 16 }}>
      {tabs}
      {body}
      {!parent && <SolveModal sheetId={solveId} onClose={() => setSolveId(null)} />}
    </View>
  );
}

/** Eltern: auf einen Blick, wo bei welchem Kind etwas ansteht. Antippen filtert alles darunter auf dieses Kind. */
function ParentOverview({ ids, focus, setFocus, onGo }: { ids: string[]; focus: string; setFocus: (id: string) => void; onGo: (p: LearnPart) => void }) {
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
    const fixList = (data.exams ?? []).filter(e => e.childId === k.id && !e.grade && (!e.date || (e.spell?.fix && !e.spell.done)));
    const fixme = fixList.length;
    const ago = (d: string) => { const n = Math.round((new Date(t0 + 'T12:00:00').getTime() - new Date(d + 'T12:00:00').getTime()) / 864e5); return n <= 0 ? 'heute' : n === 1 ? 'seit gestern' : `seit ${n} Tagen`; };
    // Konkrete Liste: was genau offen ist, mit Art und direktem Sprung in den richtigen Reiter
    const items: { icon: string; text: string; sub: string; go: 'themen' | 'klassenarbeit'; tone: 'warn' | 'info' }[] = [
      ...ws.filter(w => w.status === 'abgegeben').map(w => ({ icon: '✍️', text: w.title, sub: `${w.exam ? 'Probe-Arbeit' : 'Tagestest'} abgegeben, bitte prüfen`, go: (w.exam ? 'klassenarbeit' : 'themen') as 'themen' | 'klassenarbeit', tone: 'warn' as const })),
      ...ws.filter(w => w.status === 'offen').map(w => ({ icon: '📝', text: w.title, sub: `${w.retryOf ? (w.exam ? 'Schwachstellen nochmal' : 'Falsches nochmal') : w.exam ? 'Probe-Arbeit' : 'Tagestest'}, ${k.name} hat noch nicht gelöst (${ago(w.date)})`, go: (w.exam ? 'klassenarbeit' : 'themen') as 'themen' | 'klassenarbeit', tone: 'info' as const })),
      ...fixList.map(e => ({ icon: '⚠️', text: `${e.subject}${e.title ? ': ' + e.title : ''}`, sub: !e.date ? 'Klassenarbeit ohne Datum' : 'Rechtschreibung im Titel prüfen', go: 'klassenarbeit' as const, tone: 'warn' as const })),
    ];
    return { k, check, open, next, days, fixme, items, vocab: dueCount(data, k.id), claims: (data.vocabClaims ?? []).filter(c => c.childId === k.id).length };
  });
  const Pill = ({ text, color, bg, onPress }: { text: string; color: string; bg: string; onPress?: () => void }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={[s.card, { gap: 4, padding: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 4 }]}>
        <Text style={s.h2}>Was bei den Kindern ansteht</Text>
        {rows.length < 2 ? null : focus ? <Pressable onPress={() => setFocus('')}><Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>Alle Kinder zeigen</Text></Pressable> : <Text style={[s.muted, { fontSize: 12 }]}>Kind antippen für Details</Text>}
      </View>
      {rows.map(({ k, check, open, next, days, fixme, items, vocab, claims }) => {
        const on = focus === k.id || rows.length === 1, dim = !!focus && !on && rows.length > 1;
        return (
          <View key={k.id}>
          <Pressable onPress={() => setFocus(on ? '' : k.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, backgroundColor: on ? C.accentSoft : 'transparent', opacity: dim ? 0.45 : 1 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: k.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{k.name[0]}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[s.text, { fontWeight: '800', fontSize: 15 }]}>{k.name}</Text>
              <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                {check > 0 && <Pill text={`✍️ ${check} prüfen`} color={C.warn} bg={C.warnSoft} />}
                {open > 0 && <Pill text={`${open} ${open === 1 ? 'Test' : 'Tests'} beim Kind offen`} color={C.accent} bg={C.accentSoft} />}
                {next && <Pill text={`${next.subject} ${days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} T.`}`} color={days !== null && days <= 3 ? C.danger : C.fg} bg={days !== null && days <= 3 ? '#fde3e6' : C.surface2} onPress={() => { setFocus(k.id); onGo('klassenarbeit'); }} />}
                {fixme > 0 && <Pill text={`⚠️ ${fixme} unvollständig`} color={C.warn} bg={C.warnSoft} onPress={() => { setFocus(k.id); onGo('klassenarbeit'); }} />}
                {claims > 0 && <Pill text={`✋ ${claims} Vokabel-Einspruch`} color={C.warn} bg={C.warnSoft} onPress={() => { setFocus(k.id); onGo('vokabeln'); }} />}
                {vocab > 0 && <Pill text={`${vocab} Vokabeln`} color={C.fg} bg={C.surface2} />}
                {!check && !open && !next && !vocab && !fixme && !claims && <Text style={[s.muted, { fontSize: 12 }]}>Nichts offen ✓</Text>}
              </View>
            </View>
          </Pressable>
          {on && items.length > 0 && (
            <View style={{ gap: 6, paddingLeft: 52, paddingRight: 4, paddingBottom: 6 }}>
              {items.map((it, i) => (
                <Pressable key={i} onPress={() => onGo(it.go)} accessibilityRole="button"
                  style={[s.row, { flexWrap: 'nowrap', gap: 10, padding: 10, borderRadius: 12, backgroundColor: it.tone === 'warn' ? C.warnSoft : C.surface2 }]}>
                  <Text style={{ fontSize: 18 }}>{it.icon}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Clip style={[s.text, { fontWeight: '800', fontSize: 14 }]} lines={2} longPress>{it.text}</Clip>
                    <Text style={[s.muted, { fontSize: 12 }]}>{it.sub}</Text>
                  </View>
                  <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
          </View>
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

  const kid = data?.children.find(c => c.id === topic.childId);
  const [open2, setOpen2] = useState(false);
  const shown = open2 || busy || asking;
  const chip = (text: string, fg: string, bg: string) => <Text style={{ color: fg, backgroundColor: bg, fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' }} numberOfLines={1}>{text}</Text>;
  const status = busy ? chip('Wird erstellt', C.accent, C.accentSoft)
    : waiting ? chip('Abgegeben', C.warn, C.warnSoft)
    : open ? chip(parent ? 'Beim Kind offen' : 'Test bereit', C.accent, C.accentSoft)
    : u ? <UnderstandingChip u={u} />
    : sheets.length ? null : chip('Kein Test', C.muted, C.surface2);
  const small = { paddingVertical: 7, paddingHorizontal: 12 };
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 14, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen2(x => !x)} accessibilityRole="button" accessibilityState={{ expanded: shown }} accessibilityLabel={`${topic.subject}: ${topic.text}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
        <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: kid?.color ?? C.line }} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[s.text, { fontWeight: '800', fontSize: 15 }]} numberOfLines={shown ? undefined : 1}>{topic.subject}: {topic.text}</Text>
          <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}>
            <Text style={[s.muted, { fontSize: 12, flexShrink: 1 }]} numberOfLines={1}>{childName} · {date}</Text>
            {status}
          </View>
        </View>
        <View style={{ transform: [{ rotate: shown ? '90deg' : '0deg' }] }}><Icon name="chev" size={18} color={C.muted} /></View>
      </Pressable>
      {shown && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
          {photosOf(topic).length ? (
            <View style={[s.row, { gap: 8, alignItems: 'center' }]}>
              <PhotoImg uri={photosOf(topic)[0]} style={{ width: 56, height: 56, borderRadius: 8 }} />
              {photosOf(topic).length > 1 && <Text style={[s.muted, { fontSize: 12 }]}>{photosOf(topic).length} Seiten</Text>}
            </View>
          ) : null}
          <Text style={[s.muted, { fontSize: 12 }]}>{by && by.id !== topic.childId ? `Für ${childName} · von ${by.name}` : by ? `Von ${childName} selbst` : `Für ${childName}`}</Text>
          {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ flex: 1, color: C.accent, fontWeight: '700', fontSize: 13 }}>KI liest die Fotos und erstellt den Test. Das dauert meist 20 bis 60 Sekunden.</Text></View>}
          {!busy && !sheets.length && !ai && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>{parent ? 'Die KI braucht die Verbindung mit dem Familienserver. Bis dahin „Selbst Fragen schreiben“.' : 'Wartet auf einen Test'}</Text>}
          {open && parent && <Text style={[s.muted, { fontSize: 13 }]}>Test liegt bei {childName}, noch nicht gelöst.</Text>}
          {waiting && <Text style={[s.muted, { fontSize: 13 }]}>{parent ? 'Abgegeben, oben prüfen.' : 'Abgegeben, Eltern schauen drüber.'}</Text>}
          <View style={[s.row, { gap: 8 }]}>
            {open && onSolve && !busy && <Button title="Test lösen" style={small} onPress={() => onSolve(open.id)} />}
            {ai && !open && !waiting && !busy && <Button title={sheets.length ? 'Neuen Test erstellen' : 'Test erstellen'} style={small} onPress={makeTest} />}
            {busy && <Button ghost title="Abbrechen" style={small} onPress={() => ctl.current?.abort()} />}
            {ai && !busy && !asking && <Button ghost title="Frage stellen" style={small} onPress={() => setAsking(true)} />}
            {parent && !busy && <Button ghost title="Selbst Fragen schreiben" style={small} onPress={onCreate} />}
            {latest && <Button ghost title="Drucken" style={small} onPress={print} />}
            {parent && !busy && <Button ghost title="Löschen" style={small} onPress={() => update(d => ({ ...d, topics: (d.topics ?? []).filter(x => x.id !== topic.id) }))} />}
          </View>
          {asking && <AskBox topic={topic} childName={childName} onClose={() => setAsking(false)} />}
        </View>
      )}
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
      <Text style={[s.label, { color: C.accent }]}>Frag nach, was du nicht verstanden hast</Text>
      {log.map((x, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Text style={[s.text, { fontWeight: '700', fontSize: 15 }]}>{x.q}</Text>
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
