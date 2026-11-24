import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { finishCheck, setSheet, today, uid } from '../data/logic';
import { Question, SHEET_POINTS, Topic, Worksheet } from '../data/types';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '.');

/** Eltern legen eine Arbeit an. Später schlägt die KI Fragen und Lösungen vor. */
export function SheetEditor({ topic, onDone }: { topic: Topic; onDone: () => void }) {
  const { update } = useFamily();
  const [qs, setQs] = useState<Question[]>([{ q: '', solution: '' }, { q: '', solution: '' }, { q: '', solution: '' }]);
  const set = (i: number, k: Partial<Question>) => setQs(list => list.map((x, j) => (j === i ? { ...x, ...k } : x)));
  const filled = qs.filter(x => x.q.trim() && x.solution.trim());
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>Arbeit: {topic.subject}</Text>
      <Text style={s.muted}>{topic.text}. Trag Fragen und Lösungen ein. Sobald die KI angebunden ist, schlägt sie diese aus Thema und Foto vor und du prüfst nur noch.</Text>
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
export function KidSheets({ childId }: { childId: string }) {
  const { data } = useFamily();
  const [openId, setOpenId] = useState<string | null>(null);
  const sheets = (data?.worksheets ?? []).filter(w => w.childId === childId);
  const open = sheets.filter(w => w.status === 'offen');
  const waiting = sheets.filter(w => w.status === 'abgegeben');
  const checked = sheets.filter(w => w.status === 'geprueft').slice(0, 5);
  if (!sheets.length) return null;
  const active = open.find(w => w.id === openId);
  return (
    <View style={[s.card, { borderWidth: open.length ? 2 : 0, borderColor: C.accent }]}>
      <Text style={s.h2}>Deine Arbeiten</Text>
      {active ? <SolveSheet sheet={active} onDone={() => setOpenId(null)} /> : open.map(w => (
        <View key={w.id} style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12 }]}>
          <Text style={[s.text, { flex: 1, minWidth: 160, fontWeight: '700' }]}>{w.title}</Text>
          <Button title={`Lösen (${w.questions.length})`} onPress={() => setOpenId(w.id)} style={{ paddingVertical: 8 }} />
        </View>
      ))}
      {waiting.map(w => <Text key={w.id} style={s.muted}>{w.title}: abgegeben, Eltern schauen drüber.</Text>)}
      {checked.map(w => <Text key={w.id} style={s.text}>{w.title}: Note {w.grade}, +{SHEET_POINTS[w.grade ?? 6]} P</Text>)}
    </View>
  );
}

function SolveSheet({ sheet, onDone }: { sheet: Worksheet; onDone: () => void }) {
  const { update } = useFamily();
  const [answers, setAnswers] = useState<string[]>(sheet.questions.map(() => ''));
  const complete = answers.every(a => a.trim());
  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{sheet.title}</Text>
      {sheet.questions.map((q, i) => (
        <View key={i} style={{ gap: 6, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
          <Text style={[s.text, { fontWeight: '700' }]}>{i + 1}. {q.q}</Text>
          <TextInput style={[s.input, { backgroundColor: C.surface }]} value={answers[i]} onChangeText={t => setAnswers(a => a.map((x, j) => (j === i ? t : x)))} placeholder="Deine Antwort" />
        </View>
      ))}
      <View style={s.row}>
        <Button ghost title="Später weiter" onPress={onDone} />
        <Button title="Abgeben" disabled={!complete} onPress={() => { update(d => setSheet(d, { ...sheet, answers: answers.map(a => a.trim()), status: 'abgegeben' })); onDone(); }} />
      </View>
      {!complete && <Text style={s.muted}>Beantworte alle Fragen, dann kannst du abgeben.</Text>}
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
  const { update } = useFamily();
  const [res, setRes] = useState<boolean[]>(sheet.questions.map((q, i) => norm(sheet.answers?.[i] ?? '') === norm(q.solution)));
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, padding: 12, borderRadius: 12 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{name}: {sheet.title}</Text>
      {sheet.questions.map((q, i) => (
        <View key={i} style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.text, { fontWeight: '700' }]}>{i + 1}. {q.q}</Text>
            <Text style={s.text}>Antwort: <Text style={{ fontWeight: '700' }}>{sheet.answers?.[i]}</Text></Text>
            <Text style={s.muted}>Lösung: {q.solution}</Text>
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: res[i] }} onPress={() => setRes(r => r.map((x, j) => (j === i ? !x : x)))}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: res[i] ? C.okSoft : '#f8dcd8', borderWidth: 1, borderColor: res[i] ? C.ok : C.danger }}>
            <Text style={{ fontWeight: '800', color: res[i] ? C.ok : C.danger }}>{res[i] ? 'Richtig' : 'Falsch'}</Text>
          </Pressable>
        </View>
      ))}
      <Text style={s.muted}>Gleiche Antworten sind schon als richtig markiert. Tippe zum Ändern.</Text>
      <Button title={`Fertig: ${res.filter(Boolean).length} von ${res.length} richtig`} color={C.ok} onPress={() => update(d => finishCheck(d, sheet, res))} />
    </View>
  );
}
