import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Question } from '../data/types';
import { Figure, MathText } from '../ui/Math';
import { C, s } from '../ui/theme';

export const SEP = ' | ';
export const norm = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[×*]/g, '·').replace(/^(ja|yes)$/, 'ja');

/** Ankreuz-Tabelle: alle Lösungen sind "x" oder "-". Dann gibt es Kästchen statt Tippen. */
export function isCheckTable(q: Question) {
  return q.type === 'table' && q.solution.split('|').every(p => ['x', '-', '✓', ''].includes(p.trim().toLowerCase()));
}
const qText = (q: Question) => (isCheckTable(q) ? q.q.replace(/\s*\(\s*x\s*oder\s*-\s*\)/i, '') : q.q);
const checked = (v: string) => ['x', '✓'].includes(v.trim().toLowerCase());
const crossed = (v: string) => ['-', '✗'].includes(v.trim().toLowerCase());
/** Kästchen-Zustand: leer -> Haken -> Kreuz -> leer. */
const nextMark = (v: string) => (checked(v) ? '-' : crossed(v) ? '' : 'x');

export function inputCount(q: Question) {
  return q.type === 'table' && q.table ? q.table.rows.flat().filter(c => c.trim() === '?').length : 1;
}
export function isAnswered(q: Question, a: string) {
  if (isCheckTable(q)) return splitAnswer(q, a).every(v => checked(v) || crossed(v));
  if (q.type === 'table') { const parts = a.split(SEP); return parts.length === inputCount(q) && parts.every(p => p.trim()); }
  return !!a.trim();
}
export function isCorrect(q: Question, a: string) {
  if (q.type === 'table') {
    const fix = (v: string) => (isCheckTable(q) ? (checked(v) ? 'x' : '-') : norm(v));
    const want = q.solution.split('|').map(fix), got = splitAnswer(q, a).map(fix);
    return want.length === got.length && want.every((w, i) => w === got[i]);
  }
  return norm(a) === norm(q.solution);
}

/** Frage zum Beantworten: Text, Auswahl oder Tabelle. */
export function QuestionInput({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <MathText text={qText(q)} style={{ ...s.text, fontWeight: '700', fontSize: 18 }} />
      <Figure svg={q.figure} />
      {q.paper && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 14 }}>✏️ Zeichne das auf Papier mit Geodreieck und Zirkel. Hier trägst du nur dein Messergebnis ein.</Text>}
      {q.type === 'choice' && q.options?.length ? (
        <View style={{ gap: 8 }}>
          {q.options.map((o, i) => (
            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ checked: value === o }} onPress={() => onChange(o)}
              style={{ padding: 12, borderRadius: 10, borderWidth: 2, borderColor: value === o ? C.accent : C.line, backgroundColor: value === o ? C.surface2 : C.surface }}>
              <MathText text={o} style={{ ...s.text, fontWeight: '600' }} />
            </Pressable>
          ))}
        </View>
      ) : q.type === 'table' && q.table ? (
        <>
        {isCheckTable(q) && <Text style={[s.muted, { fontSize: 13 }]}>1x tippen: ✓ ja · 2x tippen: ✗ nein · 3x tippen: leer</Text>}
        <TableGrid q={q} values={splitAnswer(q, value)} onCell={(k, v) => { const vals = splitAnswer(q, value); vals[k] = v; onChange(vals.join(SEP)); }} />
        </>
      ) : (
        <>
          <TextInput style={s.input} value={value} onChangeText={onChange} placeholder="Deine Antwort" autoCapitalize="none" />
          {/\//.test(q.solution) && <Text style={[s.muted, { fontSize: 12 }]}>Brüche so schreiben: 3/4</Text>}
        </>
      )}
    </View>
  );
}

export function splitAnswer(q: Question, value: string) {
  const n = inputCount(q);
  const parts = value ? value.split(SEP) : [];
  return Array.from({ length: n }, (_, i) => parts[i] ?? '');
}

/** Tabelle: "?" ist ein Eingabefeld. Mit solution/values wird sie zur Abgleich-Ansicht. */
export function TableGrid({ q, values, onCell, solution }: { q: Question; values: string[]; onCell?: (k: number, v: string) => void; solution?: string[] }) {
  let k = -1;
  const cell = { width: 84, padding: 6, borderWidth: 1, borderColor: C.line, justifyContent: 'center' as const };
  return (
    <ScrollView horizontal>
      <View>
        <View style={{ flexDirection: 'row' }}>
          {q.table!.header.map((h, i) => <View key={i} style={[cell, { backgroundColor: C.surface2 }]}><MathText text={h} style={{ ...s.text, fontWeight: '700', fontSize: 14 }} /></View>)}
        </View>
        {q.table!.rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {r.map((c, ci) => {
              if (c.trim() !== '?') return <View key={ci} style={cell}><MathText text={c} style={{ ...s.text, fontSize: 14 }} /></View>;
              k += 1; const idx = k;
              if (isCheckTable(q)) {
                const v = values[idx] ?? '';
                const on = checked(v), off = crossed(v);
                const want = solution ? checked(solution[idx] ?? '') : on;
                const right = solution ? on === want && (on || off) : true;
                return (
                  <Pressable key={ci} disabled={!onCell} accessibilityRole="button"
                    accessibilityLabel={`${r[0]} ${q.table!.header[ci] ?? ''}: ${on ? 'Haken' : off ? 'Kreuz' : 'leer'}`} onPress={() => onCell?.(idx, nextMark(v))}
                    style={[cell, { alignItems: 'center', backgroundColor: solution ? (right ? C.okSoft : '#f8dcd8') : C.surface }]}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 2, borderColor: on ? C.ok : off ? C.danger : C.line, backgroundColor: on ? C.ok : off ? C.danger : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{on ? '✓' : off ? '✗' : ''}</Text>
                    </View>
                    {solution && !right && <Text style={{ fontSize: 11, color: C.muted }}>richtig: {want ? '✓' : '✗'}</Text>}
                  </Pressable>
                );
              }
              if (onCell) return (
                <View key={ci} style={[cell, { padding: 2 }]}>
                  <TextInput value={values[idx]} onChangeText={v => onCell(idx, v)} placeholder="?" autoCapitalize="none"
                    style={{ width: 76, paddingVertical: 6, paddingHorizontal: 6, fontSize: 15, color: C.fg, backgroundColor: C.bg, borderRadius: 6, textAlign: 'center' }} />
                </View>
              );
              const ok = solution ? norm(values[idx] ?? '') === norm(solution[idx] ?? '') : true;
              return (
                <View key={ci} style={[cell, { backgroundColor: ok ? C.okSoft : '#f8dcd8' }]}>
                  <Text style={{ fontWeight: '700', color: C.fg, textAlign: 'center' }}>{values[idx] || '–'}</Text>
                  {!ok && <Text style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>{solution?.[idx]}</Text>}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Abgleich-Ansicht für Eltern und für das Kind nach der Prüfung. */
export function AnswerView({ q, answer }: { q: Question; answer: string }) {
  return (
    <View style={{ gap: 6 }}>
      <MathText text={qText(q)} style={{ ...s.text, fontWeight: '700' }} />
      <Figure svg={q.figure} />
      {q.type === 'table' && q.table ? (
        <TableGrid q={q} values={splitAnswer(q, answer)} solution={q.solution.split('|').map(x => x.trim())} />
      ) : (
        <>
          <View style={[s.row, { gap: 6 }]}><Text style={s.text}>Antwort:</Text><MathText text={answer || '–'} style={{ ...s.text, fontWeight: '700' }} /></View>
          <View style={[s.row, { gap: 6 }]}><Text style={s.muted}>Lösung:</Text><MathText text={q.solution} style={s.muted} /></View>
        </>
      )}
    </View>
  );
}
