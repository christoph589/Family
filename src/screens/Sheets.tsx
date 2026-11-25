import { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { examScore, finishCheck, selfBonus, EXAM_PREP_POINTS, setSheet, today, uid, understandingOf, UNDERSTANDING_LABEL } from '../data/logic';
import { PRACTICE_POINTS, Question, Topic, Understanding, Worksheet } from '../data/types';
import { Button } from '../ui/Button';
import { MathText } from '../ui/Math';
import { AnswerView, isAnswered, isCorrect, QuestionInput } from './QuestionViews';
import { C, s } from '../ui/theme';
import { ResultLine } from './Exam';


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
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.row, { flexWrap: 'nowrap', padding: 16, gap: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line }]}>
        <Button ghost title="‹ Zurück" onPress={onDone} style={{ paddingVertical: 8, paddingHorizontal: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: '800' }]} numberOfLines={1}>{sheet.title}</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>{done} von {sheet.questions.length} beantwortet{sheet.exam ? ` · ⏱ ${clock(sheet)} von ${sheet.exam.minutes} Min` : ''}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[s.pad, { maxWidth: 700 }]} keyboardShouldPersistTaps="handled">
        {sheet.questions.map((q, i) => (
          <View key={i} style={[s.card, { gap: 8 }]}>
            <Text style={s.label}>{sheet.exam ? `Aufgabe ${i + 1} · ${sheet.exam.points[i] ?? 1} ${(sheet.exam.points[i] ?? 1) === 1 ? 'Punkt' : 'Punkte'}` : `Frage ${i + 1}`}</Text>
            <QuestionInput q={q} value={answers[i] ?? ''} onChange={t => setAnswers(a => a.map((x, j) => (j === i ? t : x)))} />
          </View>
        ))}
        <Button title="Abgeben" disabled={!complete} onPress={() => {
          update(d => setSheet(d, { ...sheet, answers: answers.map(a => a.trim()), status: 'abgegeben' }));
          delete drafts[sheet.id]; onDone();
        }} />
        {!complete && <Text style={[s.muted, { textAlign: 'center' }]}>Beantworte alle Fragen, dann kannst du abgeben. Du kannst auch zurück und später weitermachen.</Text>}
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

function ReviewOne({ sheet, name }: { sheet: Worksheet; name: string }) {
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
            <Text style={s.label}>Frage {i + 1}</Text>
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
      <Text style={s.muted}>Gleiche Antworten sind schon als richtig markiert. Tippe zum Ändern. {name} bekommt {sheet.exam ? EXAM_PREP_POINTS : PRACTICE_POINTS} Punkte fürs Üben{bonus ? ` und ${bonus} Bonuspunkte, weil selbst hochgeladen` : ''} und sieht danach die richtigen Lösungen.</Text>
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
