import { useEffect, useRef, useState } from 'react';
import { PhotoImg } from '../ui/PhotoImg';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { useFamily } from '../data/FamilyContext';
import { examScore, finishCheck, selfBonus, EXAM_PREP_POINTS, setSheet, today, uid, understandingOf, UNDERSTANDING_LABEL } from '../data/logic';
import { PRACTICE_POINTS, Question, Topic, Understanding, Worksheet } from '../data/types';
import { Button } from '../ui/Button';
import { MathText } from '../ui/Math';
import { AnswerView, isAnswered, isCorrect, QuestionInput } from './QuestionViews';
import { C, s } from '../ui/theme';
import { PaperScore, ResultLine, scanAndGrade } from './Exam';
import { printHtml, sheetHtml } from '../ui/Print';
import { AI_ERROR, checkAnswers, getSample } from '../ai/generate';
import { currentGrade } from '../data/logic';
import { activeTimer, logLearn, sheetSubject } from '../data/learnstats';


/** Eltern legen eine Arbeit an. Später schlägt die KI Fragen und Lösungen vor. */
export function SheetEditor({ topic, onDone }: { topic: Topic; onDone: () => void }) {
  const { update } = useFamily();
  const [qs, setQs] = useState<Question[]>([{ q: '', solution: '' }, { q: '', solution: '' }, { q: '', solution: '' }]);
  const set = (i: number, k: Partial<Question>) => setQs(list => list.map((x, j) => (j === i ? { ...x, ...k } : x)));
  const filled = qs.filter(x => x.q.trim() && x.solution.trim());
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>Übung: {topic.subject}</Text>
      <Text style={s.muted}>{topic.text}. Ein paar Fragen reichen, um zu sehen, ob das Thema sitzt. Sobald die KI angebunden ist, schlägt sie diese aus Thema und Foto vor und du prüfst nur noch.</Text>
      {qs.map((x, i) => (
        <View key={i} style={{ gap: 6 }}>
          <Text style={s.label}>Frage {i + 1}</Text>
          <TextInput style={s.input} value={x.q} onChangeText={t => set(i, { q: t })} placeholder="z. B. Was ist 1/4 + 2/4?" />
          <TextInput style={s.input} value={x.solution} onChangeText={t => set(i, { solution: t })} placeholder="Lösung, z. B. 3/4" />
        </View>
      ))}
      <View style={s.row}>
        {qs.length < 10 && <Button ghost title="Weitere Frage" onPress={() => setQs(l => [...l, { q: '', solution: '' }])} />}
        <Button ghost title="Abbrechen" onPress={onDone} />
        <Button title={`An Kind schicken (${filled.length} Fragen)`} disabled={filled.length === 0} onPress={() => {
          const sheet: Worksheet = { id: uid(), childId: topic.childId, topicId: topic.id, title: `${topic.subject}: ${topic.text}`, date: today(), questions: filled.map(x => ({ q: x.q.trim(), solution: x.solution.trim() })), status: 'offen' };
          update(d => setSheet(d, sheet)); onDone();
        }} />
      </View>
    </View>
  );
}

/** Lösen-Fenster für ein offenes Blatt. Einmal in Learn eingebunden, damit jeder Reiter es öffnen kann. */
export function SolveModal({ sheetId, onClose }: { sheetId: string | null; onClose: () => void }) {
  const { data } = useFamily();
  const active = sheetId ? (data?.worksheets ?? []).find(w => w.id === sheetId && w.status === 'offen') : undefined;
  return (
    <Modal visible={!!active} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.screen}>
        {active && <SolveSheet sheet={active} onDone={onClose} />}
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Kind: Übungen und Ergebnisse. kind 'test' = Tagestests (offen, abgegeben, geprüft),
 * kind 'exam' = nur die Ergebnisse der Probe-Arbeiten (Lösen und Abgeben laufen in der Klassenarbeit selbst).
 */
export function KidSheets({ childId, kind = 'test', setOpenId }: { childId: string; kind?: 'test' | 'exam'; setOpenId: (id: string | null) => void }) {
  const { data } = useFamily();
  const exam = kind === 'exam';
  const sheets = (data?.worksheets ?? []).filter(w => w.childId === childId && !!w.exam === exam);
  const open = exam ? [] : sheets.filter(w => w.status === 'offen');
  const waiting = exam ? [] : sheets.filter(w => w.status === 'abgegeben');
  const checked = sheets.filter(w => w.status === 'geprueft').slice(0, exam ? 3 : 5);
  if (!sheets.length) return exam ? null : (
    <View style={s.card}>
      <Text style={s.h2}>Deine Übungen</Text>
      <Text style={s.muted}>Noch keine Übung da. Lege unten ein Thema an und lade Fotos hoch. Dann tippst du auf „Test erstellen“.</Text>
    </View>
  );
  if (exam && !checked.length) return null;
  return (
    <View style={[s.card, { borderWidth: open.length ? 2 : 0, borderColor: C.accent }]}>
      <Text style={s.h2}>{exam ? 'Ergebnisse deiner Probe-Arbeiten' : 'Deine Übungen'}</Text>
      {open.map(w => (
        <View key={w.id} style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12 }]}>
          <Text style={[s.text, { flex: 1, minWidth: 160, fontWeight: '700' }]}>{w.title}</Text>
          <Button title={`Lösen (${w.questions.length})`} onPress={() => setOpenId(w.id)} style={{ paddingVertical: 8 }} />
        </View>
      ))}
      {waiting.map(w => <Text key={w.id} style={s.muted}>{w.title}: abgegeben, Eltern schauen drüber.</Text>)}
      {checked.map(w => (
        <View key={w.id} style={{ gap: 4, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.text, { fontWeight: '700', flex: 1 }]}>{w.title}</Text>
            {w.understanding && !w.exam && <UnderstandingChip u={w.understanding} />}
          </View>
          {w.exam && w.results && <ResultLine sheet={w} />}
          {w.questions.map((q, i) => (w.results?.[i] ? null : <AnswerView key={i} q={q} answer={w.answers?.[i] ?? ''} />))}
        </View>
      ))}
    </View>
  );
}

// Angefangene Antworten bleiben erhalten, wenn das Kind den Test kurz verlässt.
const drafts: Record<string, string[]> = {};

// Startzeit der Probe-Arbeit, damit die Uhr beim kurzen Verlassen weiterläuft
const started: Record<string, number> = {};
const spent: Record<string, number> = {};
const clock = (w: Worksheet) => { const m = Math.floor((Date.now() - (started[w.id] ?? Date.now())) / 60000); return `${m} Min`; };

function SolveSheet({ sheet, onDone }: { sheet: Worksheet; onDone: () => void }) {
  const { update } = useFamily();
  const [, tick] = useState(0);
  useEffect(() => { if (!sheet.exam) return; started[sheet.id] ??= Date.now(); const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t); }, [sheet.id]);
  const [answers, setAnswersState] = useState<string[]>(drafts[sheet.id] ?? sheet.questions.map(() => ''));
  // Aktive Lernzeit: Pausen über 5 Minuten ohne Eingabe zählen nicht. Bleibt erhalten, wenn das Kind später weitermacht.
  const timer = useRef(activeTimer(300)).current;
  useEffect(() => () => { spent[sheet.id] = (spent[sheet.id] ?? 0) + timer.take(); }, [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAnswers = (fn: (a: string[]) => string[]) => { timer.tick(); setAnswersState(a => (drafts[sheet.id] = fn(a))); };
  const done = sheet.questions.filter((q, i) => isAnswered(q, answers[i] ?? '')).length;
  const complete = done === sheet.questions.length;
  // Am Handy eine Aufgabe pro Bildschirm, am Tablet alle untereinander
  const { width } = useWindowDimensions();
  const step = width < 700;
  const [cur, setCur] = useState(0);
  const n = sheet.questions.length;
  const scroller = useRef<any>(null);
  const go = (i: number) => { setCur(Math.max(0, Math.min(n - 1, i))); scroller.current?.scrollTo({ y: 0, animated: false }); };
  const card = (q: Question, i: number) => (
    <View key={i} style={[s.card, { gap: 12 }, step && { padding: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{i + 1}</Text>
        </View>
        <Text style={[s.text, { flex: 1, fontWeight: '800', fontSize: 15 }]}>{sheet.exam ? 'Aufgabe' : 'Frage'} {i + 1}<Text style={{ color: C.muted, fontWeight: '600' }}> von {n}</Text></Text>
        {sheet.exam && <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent, backgroundColor: C.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' }}>{sheet.exam.points[i] ?? 1} {(sheet.exam.points[i] ?? 1) === 1 ? 'Punkt' : 'Punkte'}</Text>}
        {sheet.exam?.skills[i] && !step ? <Text style={[s.muted, { fontSize: 12 }]}>{sheet.exam.skills[i]}</Text> : null}
      </View>
      <QuestionInput q={q} value={answers[i] ?? ''} onChange={t => setAnswers(a => a.map((x, j) => (j === i ? t : x)))} />
    </View>
  );
  const submit = <Button title="Abgeben" disabled={!complete} onPress={() => {
    const done = { ...sheet, answers: answers.map(a => a.trim()), status: 'abgegeben' as const, doneAt: today() };
    const secs = (spent[sheet.id] ?? 0) + timer.take(); spent[sheet.id] = 0;
    update(d => logLearn(setSheet(d, done), sheet.childId, { t: 1, s: secs, subject: sheetSubject(d, sheet) }));
    delete drafts[sheet.id]; onDone();
    runCheck(done, update);
  }} />;
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.row, { flexWrap: 'nowrap', padding: 16, gap: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line }]}>
        <Button ghost title={step ? "✕" : "‹ Zurück"} accessibilityLabel="Später weitermachen" onPress={onDone} style={{ paddingVertical: 8, paddingHorizontal: 12 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800' }]} numberOfLines={1}>{sheet.title}</Text>
          <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{done}/{n} beantwortet{sheet.exam ? ` · ⏱ ${clock(sheet)}/${sheet.exam.minutes} Min` : ''}</Text>
        </View>
      </View>
      <View style={{ height: 4, backgroundColor: C.line }}><View style={{ height: 4, width: `${Math.round((done / Math.max(1, n)) * 100)}%`, backgroundColor: complete ? C.ok : C.accent }} /></View>
      {step && n > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line }}>
          {sheet.questions.map((q, i) => {
            const ok = isAnswered(q, answers[i] ?? ''), on = i === cur;
            return (
              <Pressable key={i} onPress={() => go(i)} accessibilityLabel={`Aufgabe ${i + 1}${ok ? ', beantwortet' : ''}`}
                style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? C.accent : ok ? C.ok : C.line, backgroundColor: ok ? (on ? C.accent : C.okSoft) : on ? C.accentSoft : C.surface }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: on && ok ? '#fff' : ok ? C.ok : on ? C.accent : C.muted }}>{i + 1}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <ScrollView ref={scroller} contentContainerStyle={[s.pad, { maxWidth: 700 }, step && { padding: 12, gap: 12 }]} keyboardShouldPersistTaps="handled">
        {step ? (<>
          {card(sheet.questions[cur], cur)}
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <Button ghost title="‹ Zurück" disabled={cur === 0} onPress={() => go(cur - 1)} style={{ flex: 1 }} />
            {cur < n - 1 ? <Button title="Weiter ›" onPress={() => go(cur + 1)} style={{ flex: 1 }} /> : <View style={{ flex: 1 }}>{submit}</View>}
          </View>
          {cur === n - 1 && !complete && <Text style={[s.muted, { textAlign: 'center' }]}>Noch {n - done} offen. Tippe oben auf die Nummern ohne Haken.</Text>}
        </>) : (<>
          {sheet.questions.map(card)}
          {submit}
          {!complete && <Text style={[s.muted, { textAlign: 'center' }]}>Beantworte alle Fragen, dann kannst du abgeben. Du kannst auch zurück und später weitermachen.</Text>}
        </>)}
      </ScrollView>
    </View>
  );
}

/** Eltern gleichen Antworten mit Lösungen ab. */
export function ReviewSheets({ childIds, exam }: { childIds: string[]; exam?: boolean }) {
  const { data } = useFamily();
  const list = (data?.worksheets ?? []).filter(w => w.status === 'abgegeben' && childIds.includes(w.childId) && (exam === undefined || !!w.exam === exam));
  const [openId, setOpenId] = useState<string | null>(null);
  if (!list.length) return null;
  const cur = list.length === 1 ? list[0].id : openId;
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.warn, gap: 10 }]}>
      <Text style={s.h2}>✍️ Zum Prüfen ({list.length})</Text>
      {list.map(w => {
        const kid = data!.children.find(c => c.id === w.childId);
        const on = cur === w.id;
        const kind = w.exam ? (w.scan ? 'Probe-Arbeit · Foto' : 'Probe-Arbeit') : w.retryOf ? 'Nochmal üben' : 'Tagestest';
        return (
          <View key={w.id} style={{ gap: 8 }}>
            {list.length > 1 && (
              <Pressable onPress={() => setOpenId(on ? null : w.id)} accessibilityRole="button" accessibilityState={{ expanded: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? C.warnSoft : C.bg, borderRadius: 12, padding: 12 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kid?.color ?? C.accent }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Clip style={[s.text, { fontWeight: '800', fontSize: 15 }]} lines={1} longPress>{kid?.name}: {w.title}</Clip>
                  <Text style={[s.muted, { fontSize: 12 }]}>{kind} · {w.questions.length} Aufgaben</Text>
                </View>
                <Text style={{ color: C.accent, fontWeight: '800' }}>{on ? '▲' : 'Prüfen ›'}</Text>
              </Pressable>
            )}
            {on && <ReviewOne sheet={w} name={kid?.name ?? ''} />}
          </View>
        );
      })}
    </View>
  );
}

/** Auf Papier geschrieben und fotografiert: Fotos, KI-Vorschlag und Punkte zum Bestätigen. */
function ScanReview({ sheet, name }: { sheet: Worksheet; name: string }) {
  const { data, update } = useFamily();
  const [big, setBig] = useState<string | null>(null);
  const scan = sheet.scan!;
  const child = data?.children.find(c => c.id === sheet.childId);
  const prep = (data?.exams ?? []).find(e => e.id === sheet.exam?.prepId);
  const subject = prep?.subject ?? sheet.title.split(':')[0];
  const who = { name: child?.name ?? name, grade: child ? currentGrade(child) : undefined };
  const pending = !scan.ai && !scan.error && Date.now() - new Date(scan.at).getTime() < 4 * 60000;
  return (
    <View style={{ gap: 10, backgroundColor: C.bg, padding: 12, borderRadius: 14 }}>
      <View>
        <Text style={[s.text, { fontWeight: '800' }]}>{name}: {sheet.title}</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>Auf Papier geschrieben · {scan.photos.length} {scan.photos.length === 1 ? 'Foto' : 'Fotos'}</Text>
      </View>
      {scan.photos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {scan.photos.map((p, i) => (
            <Pressable key={i} onPress={() => setBig(p)} accessibilityLabel={`Seite ${i + 1} groß ansehen`}>
              <PhotoImg uri={p} style={{ width: 96, height: 128, borderRadius: 10, backgroundColor: C.line }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable onPress={() => setBig(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 12 }}>
          {big && <PhotoImg uri={big} resizeMode="contain" style={{ width: '100%', height: '100%' }} />}
        </Pressable>
      </Modal>
      {pending && <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI korrigiert vor. Das dauert etwa eine Minute.</Text></View>}
      {!scan.ai && !pending && (
        <View style={{ gap: 6 }}>
          {!!scan.error && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{scan.error}</Text>}
          <View style={s.row}>
            {scan.photos.length > 0 && <Button title="KI-Vorkorrektur starten" onPress={() => scanAndGrade(sheet, scan.photos, who, update as any, scan.by)} style={{ paddingVertical: 8, minHeight: 40 }} />}
          </View>
        </View>
      )}
      {scan.ai?.summary ? <Text style={[s.text, { fontSize: 14 }]}>{scan.ai.summary}</Text> : null}
      <View style={s.row}>
        <Button ghost title="Lösungsblatt" onPress={() => printHtml(sheetHtml(sheet, { name: who.name, grade: who.grade, subject, solutions: true })).catch(() => {})} style={{ paddingVertical: 8, minHeight: 40 }} />
      </View>
      {!pending && <PaperScore key={scan.ai ? 'ai' : 'leer'} sheet={sheet} />}
      <Text style={[s.muted, { fontSize: 12 }]}>Die KI kann Handschrift und Zeichnungen falsch lesen. Die Note zählt erst, wenn du auf „Fertig“ tippst.</Text>
    </View>
  );
}

function ReviewOne({ sheet, name }: { sheet: Worksheet; name: string }) {
  if (sheet.scan) return <ScanReview sheet={sheet} name={name} />;
  return <ReviewDigital sheet={sheet} name={name} />;
}

/** Freitext-Antworten, die nicht wörtlich passen, lässt die KI inhaltlich abgleichen. */
const checking = new Set<string>();
function needsCheck(sheet: Worksheet) {
  return sheet.questions.some((q, i) => q.type !== 'choice' && !isCorrect(q, sheet.answers?.[i] ?? '') && (sheet.answers?.[i] ?? '').trim());
}
async function runCheck(sheet: Worksheet, update: (f: (d: any) => any) => void) {
  if (checking.has(sheet.id) || !needsCheck(sheet)) return '';
  if (!(await getSample())) return 'Die KI ist auf diesem Gerät nicht verbunden.';
  checking.add(sheet.id);
  let err = '';
  try {
    const aiCheck = await checkAnswers(sheet, sheet.answers ?? []);
    update(d => { const cur = (d.worksheets ?? []).find((w: Worksheet) => w.id === sheet.id); return cur && cur.status === 'abgegeben' ? setSheet(d, { ...cur, aiCheck }) : d; });
  } catch (e: any) { err = AI_ERROR[e?.code] ?? 'Die KI hat gerade nicht geantwortet.'; }
  checking.delete(sheet.id);
  return err;
}

function ReviewDigital(props: { sheet: Worksheet; name: string }) {
  // neu aufbauen, sobald der KI-Abgleich da ist, damit die Vorschläge übernommen werden
  return <ReviewDigitalInner key={props.sheet.aiCheck ? 'ki' : 'roh'} {...props} />;
}

function ReviewDigitalInner({ sheet, name }: { sheet: Worksheet; name: string }) {
  const { data, update } = useFamily();
  const ai = sheet.aiCheck;
  const [res, setRes] = useState<boolean[]>(sheet.questions.map((q, i) => isCorrect(q, sheet.answers?.[i] ?? '') || !!ai?.ok[i]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const want = (!ai || (sheet.exam && !ai.pts)) && needsCheck(sheet);
  const start = () => { setBusy(true); setErr(''); runCheck(sheet, update).then(e => setErr(e)).finally(() => setBusy(false)); };
  useEffect(() => { if (want) start(); }, [sheet.id]);
  const bonus = data ? selfBonus(data, sheet, understandingOf(res.filter(Boolean).length, sheet.questions.length)) : 0;
  const score = sheet.exam ? examScore(sheet, res) : null;
  // Probe-Arbeit mit KI-Teilpunkten: Antworten zeigen, darunter Punkte je Aufgabe bestätigen
  if (sheet.exam && ai?.pts) return (
    <View style={{ gap: 8, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{name}: {sheet.title}</Text>
      {sheet.questions.map((q, i) => (
        <View key={i} style={{ gap: 2, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.label}>Aufgabe {i + 1}</Text>
            <Text style={{ fontWeight: '800', fontSize: 13, color: ai.pts![i] >= sheet.exam!.points[i] ? C.ok : ai.pts![i] > 0 ? C.warn : C.danger }}>{String(ai.pts![i]).replace('.', ',')} / {sheet.exam!.points[i]}</Text>
          </View>
          <AnswerView q={q} answer={sheet.answers?.[i] ?? ''} />
          {ai.notes[i] ? <Text style={{ fontSize: 13, color: C.muted }}>{ai.notes[i]}</Text> : null}
        </View>
      ))}
      <PaperScore sheet={sheet} />
    </View>
  );
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{name}: {sheet.title}</Text>
      {busy && <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI gleicht die Antworten mit der Lösung ab …</Text></View>}
      {!busy && want && (
        <View style={{ gap: 6 }}>
          {!!err && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{err}</Text>}
          <Button ghost title="Von der KI prüfen lassen" onPress={start} style={{ paddingVertical: 8, minHeight: 40 }} />
        </View>
      )}
      {sheet.questions.map((q, i) => (
        <View key={i} style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }]}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={s.label}>{sheet.exam ? `Aufgabe ${i + 1}` : `Frage ${i + 1}`}</Text>
            <AnswerView q={q} answer={sheet.answers?.[i] ?? ''} />
            {ai?.notes[i] && !isCorrect(q, sheet.answers?.[i] ?? '') ? <Text style={{ fontSize: 13, color: ai.ok[i] ? C.ok : C.muted }}>{ai.notes[i]}</Text> : null}
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: res[i] }} onPress={() => setRes(r => r.map((x, j) => (j === i ? !x : x)))}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: res[i] ? C.okSoft : '#f8dcd8', borderWidth: 1, borderColor: res[i] ? C.ok : C.danger }}>
            <Text style={{ fontWeight: '800', color: res[i] ? C.ok : C.danger }}>{res[i] ? 'Richtig' : 'Falsch'}</Text>
          </Pressable>
        </View>
      ))}
      {score && (
        <View style={{ backgroundColor: C.accentSoft, borderRadius: 12, padding: 10, gap: 2 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>{score.got} von {score.total} Punkten · ungefähr Note {score.note}</Text>
          {score.weak.length > 0 && <Text style={[s.text, { fontSize: 14 }]}>Schwachstellen: <Text style={{ fontWeight: '700', color: C.danger }}>{score.weak.join(', ')}</Text></Text>}
          <Text style={[s.muted, { fontSize: 12 }]}>Die Note ist nur ein Richtwert nach einem üblichen Schlüssel, jede Lehrkraft bewertet anders.</Text>
        </View>
      )}
      <Text style={s.muted}>{ai ? 'Die KI hat vorsortiert, auch anders formulierte Antworten. Bitte kurz drüberschauen.' : 'Gleiche Antworten sind schon als richtig markiert.'} Tippe auf Richtig/Falsch zum Ändern. {name} bekommt {sheet.exam ? EXAM_PREP_POINTS : PRACTICE_POINTS} Punkte fürs Üben{bonus ? ` und ${bonus} Bonuspunkte fürs Verstehen${(data?.topics ?? []).find(t => t.id === sheet.topicId)?.by === sheet.childId ? ' und selbst Hochladen' : ''}` : ''} und sieht danach die richtigen Lösungen.</Text>
      <View style={s.row}>
        {res.some(r => !r) && <Button title={sheet.exam ? 'Schwachstellen üben lassen' : 'Falsches nochmal üben lassen'} onPress={() => update(d => finishCheck(d, sheet, res, true))} />}
        <Button title={res.every(Boolean) ? 'Fertig, alles verstanden' : 'Fertig'} color={C.ok} onPress={() => update(d => finishCheck(d, sheet, res))} />
      </View>
    </View>
  );
}

const U_COLOR: Record<Understanding, [string, string]> = { verstanden: [C.ok, C.okSoft], teilweise: [C.warn, C.warnSoft], nochmal: [C.danger, '#f8dcd8'] };
export function UnderstandingChip({ u }: { u: Understanding }) {
  const [fg, bg] = U_COLOR[u];
  return <Text style={{ color: fg, backgroundColor: bg, fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' }}>{UNDERSTANDING_LABEL[u]}</Text>;
}

/** Ergebnis eines geprüften Tests zum Nachschauen (nur lesen): Antworten, Lösungen, richtig/falsch. */
export function SheetResult({ sheet }: { sheet: Worksheet }) {
  const res = sheet.results ?? [];
  const pts = sheet.exam?.points;
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
      {sheet.exam ? <ResultLine sheet={sheet} /> : sheet.understanding ? <View style={s.row}><UnderstandingChip u={sheet.understanding} /><Text style={s.muted}>{res.filter(Boolean).length} von {sheet.questions.length} richtig</Text></View> : null}
      {sheet.questions.map((q, i) => {
        const ok = res[i];
        const got = sheet.paperScore?.[i];
        return (
          <View key={i} style={{ gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, paddingTop: i ? 8 : 0 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.label}>{sheet.exam ? 'Aufgabe' : 'Frage'} {i + 1}</Text>
              <Text style={{ fontWeight: '800', fontSize: 13, color: ok ? C.ok : C.danger }}>{pts && got !== undefined ? `${String(got).replace('.', ',')} / ${pts[i]} P.` : ok ? '✓ richtig' : '✗ falsch'}</Text>
            </View>
            <AnswerView q={q} answer={sheet.answers?.[i] ?? (sheet.scan ? '(auf Papier)' : '')} />
          </View>
        );
      })}
    </View>
  );
}

/** Eltern: alle geprüften Tests oder Probe-Arbeiten zum Nachschauen. */
export function DoneSheets({ childIds, exam }: { childIds: string[]; exam: boolean }) {
  const { data } = useFamily();
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!data) return null;
  const list = (data.worksheets ?? []).filter(w => childIds.includes(w.childId) && w.status === 'geprueft' && !!w.exam === exam)
    .sort((a, b) => (b.doneAt ?? b.date).localeCompare(a.doneAt ?? a.date));
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 5);
  return (
    <View style={[s.card, { gap: 8 }]}>
      <Text style={s.label}>{exam ? 'Ergebnisse Probe-Arbeiten' : 'Ergebnisse Tagestests'} ({list.length})</Text>
      {shown.map(w => {
        const kid = data.children.find(c => c.id === w.childId);
        const on = openId === w.id;
        const r = w.exam ? examScore(w, w.results ?? []) : null;
        const day = new Date((w.doneAt ?? w.date) + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
        return (
          <View key={w.id} style={{ gap: 6 }}>
            <Pressable onPress={() => setOpenId(on ? null : w.id)} accessibilityRole="button" accessibilityState={{ expanded: on }}
              style={[s.row, { flexWrap: 'nowrap', gap: 8, padding: 10, borderRadius: 12, backgroundColor: on ? C.accentSoft : C.bg }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kid?.color ?? C.accent }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Clip style={[s.text, { fontWeight: '700', fontSize: 14 }]} lines={1} longPress>{w.title}</Clip>
                <Text style={[s.muted, { fontSize: 12 }]}>{kid?.name} · {day}{w.retryOf ? ' · Wiederholung' : ''}</Text>
              </View>
              {r ? <Text style={{ fontWeight: '800', fontSize: 12, color: r.note <= 2 ? C.ok : r.note >= 4 ? C.danger : C.warn }}>Note ca. {r.note}</Text> : w.understanding ? <UnderstandingChip u={w.understanding} /> : null}
              <Text style={{ color: C.muted }}>{on ? '▾' : '›'}</Text>
            </Pressable>
            {on && <SheetResult sheet={w} />}
          </View>
        );
      })}
      {list.length > 5 && <Button ghost title={all ? 'Weniger zeigen' : `Alle ${list.length} zeigen`} onPress={() => setAll(x => !x)} />}
    </View>
  );
}
