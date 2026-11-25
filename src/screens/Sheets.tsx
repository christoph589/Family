import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { examScore, finishCheck, selfBonus, EXAM_PREP_POINTS, setSheet, today, uid, understandingOf, UNDERSTANDING_LABEL } from '../data/logic';
import { PRACTICE_POINTS, Question, Topic, Understanding, Worksheet } from '../data/types';
import { Button } from '../ui/Button';
import { MathText } from '../ui/Math';
import { AnswerView, isAnswered, isCorrect, QuestionInput } from './QuestionViews';
import { C, s } from '../ui/theme';
import { PaperScore, ResultLine, scanAndGrade } from './Exam';
import { printHtml, sheetHtml } from '../ui/Print';
import { currentGrade } from '../data/logic';


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

/** Kind löst offene Arbeiten. */
export function KidSheets({ childId, openId, setOpenId }: { childId: string; openId: string | null; setOpenId: (id: string | null) => void }) {
  const { data } = useFamily();
  const sheets = (data?.worksheets ?? []).filter(w => w.childId === childId);
  const open = sheets.filter(w => w.status === 'offen');
  const waiting = sheets.filter(w => w.status === 'abgegeben');
  const checked = sheets.filter(w => w.status === 'geprueft').slice(0, 5);
  if (!sheets.length) return (
    <View style={s.card}>
      <Text style={s.h2}>Deine Übungen</Text>
      <Text style={s.muted}>Noch keine Übung da. Lade unten Fotos von dem hoch, was heute dran war. Dann tippst du auf „Test erstellen“.</Text>
    </View>
  );
  const active = open.find(w => w.id === openId);
  return (
    <View style={[s.card, { borderWidth: open.length ? 2 : 0, borderColor: C.accent }]}>
      <Text style={s.h2}>Deine Übungen</Text>
      <Modal visible={!!active} animationType="slide" onRequestClose={() => setOpenId(null)}>
        <SafeAreaView style={s.screen}>
          {active && <SolveSheet sheet={active} onDone={() => setOpenId(null)} />}
        </SafeAreaView>
      </Modal>
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
const clock = (w: Worksheet) => { const m = Math.floor((Date.now() - (started[w.id] ?? Date.now())) / 60000); return `${m} Min`; };

function SolveSheet({ sheet, onDone }: { sheet: Worksheet; onDone: () => void }) {
  const { update } = useFamily();
  const [, tick] = useState(0);
  useEffect(() => { if (!sheet.exam) return; started[sheet.id] ??= Date.now(); const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t); }, [sheet.id]);
  const [answers, setAnswersState] = useState<string[]>(drafts[sheet.id] ?? sheet.questions.map(() => ''));
  const setAnswers = (fn: (a: string[]) => string[]) => setAnswersState(a => (drafts[sheet.id] = fn(a)));
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
    update(d => setSheet(d, { ...sheet, answers: answers.map(a => a.trim()), status: 'abgegeben' }));
    delete drafts[sheet.id]; onDone();
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
export function ReviewSheets({ childIds }: { childIds: string[] }) {
  const { data } = useFamily();
  const list = (data?.worksheets ?? []).filter(w => w.status === 'abgegeben' && childIds.includes(w.childId));
  if (!list.length) return null;
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.warn }]}>
      <Text style={s.h2}>Zum Prüfen ({list.length})</Text>
      {list.map(w => <ReviewOne key={w.id} sheet={w} name={data!.children.find(c => c.id === w.childId)?.name ?? ''} />)}
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
              <Image source={{ uri: p }} style={{ width: 96, height: 128, borderRadius: 10, backgroundColor: C.line }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable onPress={() => setBig(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 12 }}>
          {big && <Image source={{ uri: big }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />}
        </Pressable>
      </Modal>
      {pending && <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI korrigiert vor. Das dauert etwa eine Minute.</Text></View>}
      {!scan.ai && !pending && (
        <View style={{ gap: 6 }}>
          {!!scan.error && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{scan.error}</Text>}
          <View style={s.row}>
            {scan.photos.length > 0 && <Button title="🤖 KI-Vorkorrektur starten" onPress={() => scanAndGrade(sheet, scan.photos, who, update as any, scan.by)} style={{ paddingVertical: 8, minHeight: 40 }} />}
          </View>
        </View>
      )}
      {scan.ai?.summary ? <Text style={[s.text, { fontSize: 14 }]}>🤖 {scan.ai.summary}</Text> : null}
      <View style={s.row}>
        <Button ghost title="🔑 Lösungsblatt" onPress={() => printHtml(sheetHtml(sheet, { name: who.name, grade: who.grade, subject, solutions: true })).catch(() => {})} style={{ paddingVertical: 8, minHeight: 40 }} />
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

function ReviewDigital({ sheet, name }: { sheet: Worksheet; name: string }) {
  const { data, update } = useFamily();
  const [res, setRes] = useState<boolean[]>(sheet.questions.map((q, i) => isCorrect(q, sheet.answers?.[i] ?? '')));
  const bonus = data ? selfBonus(data, sheet, understandingOf(res.filter(Boolean).length, sheet.questions.length)) : 0;
  const score = sheet.exam ? examScore(sheet, res) : null;
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{name}: {sheet.title}</Text>
      {sheet.questions.map((q, i) => (
        <View key={i} style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }]}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={s.label}>{sheet.exam ? `Aufgabe ${i + 1}` : `Frage ${i + 1}`}</Text>
            <AnswerView q={q} answer={sheet.answers?.[i] ?? ''} />
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
      <Text style={s.muted}>Gleiche Antworten sind schon als richtig markiert. Tippe zum Ändern. {name} bekommt {sheet.exam ? EXAM_PREP_POINTS : PRACTICE_POINTS} Punkte fürs Üben{bonus ? ` und ${bonus} Bonuspunkte fürs Verstehen${(data?.topics ?? []).find(t => t.id === sheet.topicId)?.by === sheet.childId ? ' und selbst Hochladen' : ''}` : ''} und sieht danach die richtigen Lösungen.</Text>
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
