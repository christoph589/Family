import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Question } from '../data/types';
import { Figure, MathText } from '../ui/Math';
import { C, s } from '../ui/theme';

export const SEP = ' | ';
export const norm = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[×*]/g, '·').replace(/^(ja|yes)$/, 'ja');

/** Zahl mit angehängter Einheit zerlegen: "4000g" → 4000 + "g". */
const numUnit = (v: string) => { const m = norm(v).match(/^(-?\d+(?:\.\d+)?)([a-zµ²³°%€\/.]*)$/); return m ? { n: Number(m[1]), u: m[2].replace(/\.$/, '') } : null; };
/** Gleichwertige Lösungen: „Durchschlag (oder Sieb)“ → Durchschlag, Sieb; „A oder B“ → A, B. */
export function alternatives(sol: string) {
  const out = [sol];
  const base = sol.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const split = (x: string) => x.split(/\s+oder\s+|;/i).map(y => y.replace(/^(oder|auch|bzw\.?|z\.\s*b\.)\s+/i, '').trim());
  if (base) out.push(...split(base));
  for (const m of sol.matchAll(/\(([^)]*)\)/g)) out.push(...split(m[1]));
  return [...new Set(out.filter(Boolean))];
}
const exact = (a: string, sol: string) => {
  if (norm(a) === norm(sol)) return true;
  const x = numUnit(a), y = numUnit(sol);
  return !!x && !!y && x.n === y.n && (x.u === y.u || !y.u || !x.u);
};
function lev(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; } }
  return d[b.length];
}
/**
 * Antworten vergleichen: Leerzeichen, Groß-/Kleinschreibung und Komma/Punkt egal.
 * Verlangt die Aufgabe nur die Zahl („4 kg = … g“), ist eine angehängte Einheit („4000 g“) auch richtig.
 * Stehen auf beiden Seiten verschiedene Einheiten, bleibt es falsch. Alternativen in Klammern oder mit „oder“ zählen.
 */
export function sameAnswer(a: string, sol: string) {
  return alternatives(sol).some(s => exact(a, s));
}
/** 'ok' = richtig, 'near' = nur ein kleiner Tippfehler (ab 5 Buchstaben 1, ab 9 Buchstaben 2), sonst 'no'. */
export function matchLevel(a: string, sol: string): 'ok' | 'near' | 'no' {
  if (sameAnswer(a, sol)) return 'ok';
  const x = norm(a);
  if (!/[a-zäöüß]/.test(x)) return 'no';
  return alternatives(sol).some(s => { const y = norm(s); const tol = y.length >= 9 ? 2 : y.length >= 5 ? 1 : 0; return /[a-zäöüß]/.test(y) && tol > 0 && lev(x, y) <= tol; }) ? 'near' : 'no';
}

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
    return want.length === got.length && want.every((w, i) => (isCheckTable(q) ? w === got[i] : sameAnswer(got[i], w)));
  }
  return sameAnswer(a, q.solution);
}

/** Richtig oder höchstens kleine Tippfehler (nur ein Vorschlag, die Eltern bestätigen). */
export function isNearCorrect(q: Question, a: string) {
  if (q.type === 'choice') return isCorrect(q, a);
  if (q.type === 'table') {
    if (isCheckTable(q)) return isCorrect(q, a);
    const want = q.solution.split('|'), got = splitAnswer(q, a);
    return want.length === got.length && want.every((w, i) => matchLevel(got[i], w.trim()) !== 'no');
  }
  return matchLevel(a, q.solution) !== 'no';
}

/** Frage zum Beantworten: Text, Auswahl oder Tabelle. */
export function QuestionInput({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <MathText text={qText(q)} style={{ ...s.text, fontWeight: '700', fontSize: 18 }} />
      <Figure svg={q.figure} />
      {q.paper && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 14 }}>✏️ Zeichne das auf Papier mit Geodreieck und Zirkel. Hier trägst du nur dein Messergebnis ein.</Text>}
      {q.type === 'choice' && q.options?.length ? (
        <View style={{ gap: 8, flexDirection: 'row', flexWrap: 'wrap' }}>
          {q.options.map((o, i) => (
            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ checked: value === o }} onPress={() => onChange(o)}
              style={{ flexBasis: q.options!.every(x => x.length <= 12) ? '47%' : '100%', flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: value === o ? C.accent : C.line, backgroundColor: value === o ? C.accentSoft : C.surface }}>
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
          {/erkl|begründ|beschreib|warum|wie bist du|satz/i.test(q.q)
            ? <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={value} onChangeText={onChange} placeholder="Deine Antwort" autoCapitalize="sentences" />
            : <TextInput style={s.input} value={value} onChangeText={onChange} placeholder="Deine Antwort" autoCapitalize="none" />}
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
export function TableGrid({ q, values, onCell, solution, accepted, cellOk }: { q: Question; values: string[]; onCell?: (k: number, v: string) => void; solution?: string[]; accepted?: boolean; cellOk?: boolean[] }) {
  let k = -1;
  const cols = Math.max(1, q.table!.header.length || q.table!.rows[0]?.length || 1);
  // Spalten passen sich der Breite an, damit am Handy nichts abgeschnitten wird
  // Volle Breite: Spalten teilen sich den Platz, jede mindestens 72 breit. Mehr Spalten als Platz: seitlich wischen.
  const cell = { flex: 1, minWidth: cols > 5 ? 72 : 0, padding: 6, borderWidth: 1, borderColor: C.line, justifyContent: 'center' as const };
  return (
    <ScrollView horizontal={cols > 5} scrollEnabled={cols > 5} contentContainerStyle={{ flexGrow: 1 }} style={{ width: '100%' }}>
      <View style={{ flexGrow: 1, width: cols > 5 ? undefined : '100%' }}>
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
                    style={{ width: '100%', minWidth: 56, paddingVertical: 6, paddingHorizontal: 6, fontSize: 15, color: C.fg, backgroundColor: C.bg, borderRadius: 6, textAlign: 'center' }} />
                </View>
              );
              const lv = solution ? matchLevel(values[idx] ?? '', solution[idx] ?? '') : 'ok';
              // Hat die KI oder haben die Eltern die Aufgabe als richtig bestätigt, zeigt jede Zelle ✓ (Abweichung nur als Hinweis)
              const good = lv === 'ok' || !!accepted || !!cellOk?.[idx];
              const hint = lv === 'ok' ? '' : good ? `Schreibweise: ${solution?.[idx]}` : lv === 'near' ? `fast richtig: ${solution?.[idx]}` : `richtig: ${solution?.[idx]}`;
              return (
                <View key={ci} style={[cell, { backgroundColor: good ? C.okSoft : lv === 'near' ? C.warnSoft : '#f8dcd8' }]}>
                  <Text style={{ fontWeight: '700', color: C.fg, textAlign: 'center' }}>{solution ? (good ? '✓ ' : lv === 'near' ? '≈ ' : '✗ ') : ''}{values[idx] || '–'}</Text>
                  {!!hint && <Text style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{hint}</Text>}
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
export function AnswerView({ q, answer, accepted, cellOk }: { q: Question; answer: string; accepted?: boolean; cellOk?: boolean[] | null }) {
  return (
    <View style={{ gap: 6 }}>
      <MathText text={qText(q)} style={{ ...s.text, fontWeight: '700' }} />
      <Figure svg={q.figure} />
      {q.type === 'table' && q.table ? (
        <TableGrid q={q} values={splitAnswer(q, answer)} solution={q.solution.split('|').map(x => x.trim())} accepted={accepted} cellOk={cellOk ?? undefined} />
      ) : (
        <>
          <View style={[s.row, { gap: 6 }]}><Text style={s.text}>Antwort:</Text><MathText text={answer || '–'} style={{ ...s.text, fontWeight: '700' }} /></View>
          <View style={[s.row, { gap: 6 }]}><Text style={s.muted}>Lösung:</Text><MathText text={q.solution} style={s.muted} /></View>
        </>
      )}
    </View>
  );
}
