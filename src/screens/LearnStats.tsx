import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { examScore, today, UNDERSTANDING_LABEL } from '../data/logic';
import { fmtMin, pct, shiftDay, Summary, summarize, TIME_SINCE } from '../data/learnstats';
import { Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';
import { Child } from '../data/types';
import { SheetResult } from './Sheets';

type Part = 'themen' | 'klassenarbeit' | 'vokabeln';
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const wd = (k: string) => WD[new Date(k + 'T12:00:00').getDay()];
const dm = (k: string) => { const [, m, d] = k.split('-'); return `${+d}.${+m}.`; };

/** Eltern: Wer hat was und wie viel gelernt. Eine Zeile pro Kind, Antippen zeigt Details. */
export function LearnStats({ ids, onGo }: { ids: string[]; onGo: (childId: string, p: Part) => void }) {
  const { data } = useFamily();
  const [n, setN] = useState<'7' | '30'>('7');
  const [open, setOpen] = useState(ids.length === 1 ? ids[0] : '');
  if (!data) return null;
  const days = +n;
  const kids = data.children.filter(c => ids.includes(c.id));
  const rows = kids.map(k => ({ k, sum: summarize(data, k.id, days), prev: summarize(data, k.id, days, shiftDay(today(), -days)) }));
  const anyTime = rows.some(r => r.sum.secs > 0);
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.card, { gap: 6, padding: 12 }]}>
        <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 4 }]}>
          <Text style={[s.text, { fontWeight: '800' }]}>📊 Wer hat wie viel gelernt</Text>
          <Segmented value={n} onChange={setN} options={[{ value: '7', label: '7 Tage' }, { value: '30', label: '30 Tage' }]} />
        </View>
        {rows.map(({ k, sum }) => (
          <KidRow key={k.id} kid={k} sum={sum} days={days} on={open === k.id} dim={!!open && open !== k.id} onPress={() => setOpen(open === k.id ? '' : k.id)} />
        ))}
        <Text style={[s.muted, { fontSize: 12, paddingHorizontal: 4 }]}>
          Gezählt wird nur, was das Kind selbst gemacht hat. {anyTime ? 'Lernzeit = aktive Zeit in Vokabeln und Tests, Pausen zählen nicht.' : `Lernzeit wird ab ${dm(TIME_SINCE)} gemessen, vorher nur Vokabeln und Tests.`}
        </Text>
      </View>
      {rows.filter(r => r.k.id === open).map(({ k, sum, prev }) => <KidDetail key={k.id} kid={k} sum={sum} prev={prev} days={days} onGo={p => onGo(k.id, p)} />)}
    </View>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View style={{ minWidth: 0, flexGrow: 1, flexBasis: 120 }}>
      <Text style={{ fontWeight: '800', fontSize: 15, color: tone ?? C.fg }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function KidRow({ kid, sum, days, on, dim, onPress }: { kid: Child; sum: Summary; days: number; on: boolean; dim: boolean; onPress: () => void }) {
  const acc = pct(sum.ok, sum.graded);
  const und = pct(sum.understood, sum.checked);
  const max = Math.max(1, ...sum.days.map(d => (sum.secs ? d.secs : d.words)));
  const spark = sum.days.slice(-14);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: on }}
      style={{ padding: 8, borderRadius: 14, gap: 8, backgroundColor: on ? C.accentSoft : 'transparent', opacity: dim ? 0.45 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: kid.color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{kid.name[0]}</Text>
        </View>
        <Text style={[s.text, { fontWeight: '800', fontSize: 15, flex: 1, minWidth: 0 }]} numberOfLines={1}>{kid.name}</Text>
        {/* Mini-Verlauf: je Tag ein Strich */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 22 }} accessibilityLabel={`An ${sum.activeDays} von ${days} Tagen gelernt`}>
          {spark.map(d => { const v = sum.secs ? d.secs : d.words; return <View key={d.date} style={{ width: days > 7 ? 4 : 7, height: v ? Math.max(4, Math.round((v / max) * 22)) : 3, borderRadius: 2, backgroundColor: v ? kid.color : d.tests ? C.accent : C.line }} />; })}
        </View>
        <Text style={{ color: C.muted, fontSize: 16 }}>{on ? '▾' : '›'}</Text>
      </View>
      {sum.activeDays === 0 ? (
        <Text style={[s.muted, { fontSize: 13, paddingLeft: 44 }]}>In den letzten {days} Tagen nichts gelernt.</Text>
      ) : (
        <View style={[s.row, { gap: 8, paddingLeft: 44, flexWrap: 'wrap' }]}>
          <Stat value={`${sum.activeDays}/${days}`} label="Tage gelernt" />
          {sum.secs > 0 && <Stat value={fmtMin(sum.secs)} label="Lernzeit" />}
          {(sum.words > 0 || !sum.flash) && <Stat value={String(sum.words)} label={acc !== null ? `Vokabeln · ${acc} % richtig` : 'Vokabeln'} tone={acc !== null && acc < 60 ? C.danger : undefined} />}
          {sum.flash > 0 && <Stat value={String(sum.flash)} label="Lernkarten (Arbeit)" />}
          <Stat value={String(sum.tests.length)} label={und !== null ? `Tests · ${und} % verstanden` : 'Tests'} tone={und !== null && und < 50 ? C.danger : undefined} />
        </View>
      )}
    </Pressable>
  );
}

function Trend({ now, before, unit = ' %' }: { now: number | null; before: number | null; unit?: string }) {
  if (now === null || before === null) return null;
  const diff = now - before;
  if (Math.abs(diff) < 3) return <Text style={{ fontSize: 12, color: C.muted, fontWeight: '700' }}>gleich wie davor</Text>;
  return <Text style={{ fontSize: 12, fontWeight: '800', color: diff > 0 ? C.ok : C.danger }}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}{unit} {diff > 0 ? 'besser' : 'weniger'} als davor</Text>;
}

function KidDetail({ kid, sum, prev, days, onGo }: { kid: Child; sum: Summary; prev: Summary; days: number; onGo: (p: Part) => void }) {
  const { data } = useFamily();
  const [allTests, setAllTests] = useState(false);
  const [openTest, setOpenTest] = useState<string | null>(null);
  if (!data) return null;
  const useTime = sum.secs > 0;
  const val = (d: Summary['days'][number]) => (useTime ? d.secs / 60 : d.words);
  const max = Math.max(1, ...sum.days.map(val));
  const acc = pct(sum.ok, sum.graded), accPrev = pct(prev.ok, prev.graded);
  const und = pct(sum.understood, sum.checked), undPrev = pct(prev.understood, prev.checked);
  const cards = (data.vocab ?? []).filter(v => v.childId === kid.id && !v.prepId).flatMap(v => v.cards);
  const sitting = cards.filter(c => c.box >= 3).length;
  const t0 = today();
  const next = (data.exams ?? []).filter(e => e.childId === kid.id && e.date && e.date >= t0).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 3);
  const grades = (data.exams ?? []).filter(e => e.childId === kid.id && e.grade).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 4);
  const tests = allTests ? sum.tests : sum.tests.slice(0, 5);
  const waiting = sum.tests.filter(w => w.status === 'abgegeben').length;
  const maxSubj = Math.max(1, ...sum.subjects.map(x => x.secs));
  return (
    <View style={[s.card, { gap: 14 }]}>
      <Text style={s.h2}>{kid.name}, letzte {days} Tage</Text>

      <View style={{ gap: 6 }}>
        <Text style={s.label}>{useTime ? 'Lernzeit pro Tag (Minuten)' : 'Vokabeln pro Tag'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: days > 7 ? 2 : 6, height: 100, marginTop: 4 }}>
          {sum.days.map(d => { const v = val(d); return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              {days <= 7 && <Text style={{ fontSize: 10, color: C.muted }}>{v ? Math.round(v) : ''}</Text>}
              <View style={{ width: '100%', height: v ? Math.max(4, Math.round((v / max) * 50)) : 3, borderRadius: 3, backgroundColor: v ? kid.color : C.line }} />
              {d.tests > 0 ? <Text style={{ fontSize: 9, color: C.accent, fontWeight: '800' }}>✍️</Text> : <Text style={{ fontSize: 9 }}> </Text>}
              {(days <= 7 || ['1', '15'].includes(String(+d.date.slice(8)))) ? <Text style={{ fontSize: 10, color: C.muted }} numberOfLines={1}>{days <= 7 ? wd(d.date) : dm(d.date)}</Text> : <Text style={{ fontSize: 10 }}> </Text>}
            </View>
          ); })}
        </View>
        <Text style={[s.muted, { fontSize: 12 }]}>✍️ = Test oder Probe-Arbeit an dem Tag</Text>
      </View>

      <View style={[s.row, { gap: 10, alignItems: 'stretch' }]}>
        <Pressable onPress={() => onGo('vokabeln')} style={{ flexGrow: 1, flexBasis: 150, backgroundColor: C.bg, borderRadius: 14, padding: 12, gap: 2 }}>
          <Text style={s.label}>🔤 Vokabeln</Text>
          <Text style={[s.text, { fontWeight: '800' }]}>{sum.words} abgefragt{sum.rounds ? ` · ${sum.rounds} ${sum.rounds === 1 ? 'Runde' : 'Runden'}` : ''}</Text>
          {acc !== null && <Text style={[s.text, { fontSize: 14 }]}>{acc} % beim ersten Mal richtig</Text>}
          <Trend now={acc} before={accPrev} />
          <Text style={[s.muted, { fontSize: 12 }]}>{sum.mastered ? `${sum.mastered} neu gelernt · ` : ''}{sitting} von {cards.length} sitzen</Text>
          {sum.flash > 0 && <Text style={[s.muted, { fontSize: 12 }]}>Dazu {sum.flash} Lernkarten für Klassenarbeiten</Text>}
        </Pressable>
        <Pressable onPress={() => onGo('themen')} style={{ flexGrow: 1, flexBasis: 150, backgroundColor: C.bg, borderRadius: 14, padding: 12, gap: 2 }}>
          <Text style={s.label}>📝 Tests</Text>
          <Text style={[s.text, { fontWeight: '800' }]}>{sum.tests.length} gemacht</Text>
          {und !== null && <Text style={[s.text, { fontSize: 14 }]}>{und} % verstanden</Text>}
          <Trend now={und} before={undPrev} />
          {waiting > 0 && <Text style={[s.muted, { fontSize: 12 }]}>{waiting} {waiting === 1 ? 'wartet' : 'warten'} auf Prüfung</Text>}
        </Pressable>
      </View>

      {sum.subjects.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Was gelernt wurde</Text>
          {sum.subjects.map(x => {
            const u = pct(x.understood, x.checked);
            const bits = [x.secs ? fmtMin(x.secs) : '', x.words ? `${x.words} Wörter` : '', x.cards ? `${x.cards} Lernkarten` : '', x.tests ? `${x.tests} ${x.tests === 1 ? 'Test' : 'Tests'}` : '', u !== null ? `${u} % verstanden` : ''].filter(Boolean);
            return (
              <View key={x.subject} style={{ gap: 3 }}>
                <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
                  <Text style={[s.text, { fontWeight: '700', fontSize: 14, flexShrink: 1 }]} numberOfLines={1}>{x.subject}</Text>
                  <Text style={{ fontSize: 12, color: u !== null && u < 50 ? C.danger : C.muted }} numberOfLines={1}>{bits.join(' · ')}</Text>
                </View>
                {useTime && <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}><View style={{ width: `${Math.round((x.secs / maxSubj) * 100)}%`, height: '100%', backgroundColor: kid.color }} /></View>}
              </View>
            );
          })}
        </View>
      )}

      {sum.tests.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Tests und Probe-Arbeiten</Text>
          {tests.map(w => {
            const r = w.exam && w.status === 'geprueft' ? examScore(w, w.results ?? []) : null;
            const tag = r ? `Note ca. ${r.note}` : w.understanding ? UNDERSTANDING_LABEL[w.understanding] : 'wartet auf Prüfung';
            const tone = r ? (r.note <= 2 ? C.ok : r.note >= 4 ? C.danger : C.warn) : w.understanding === 'verstanden' ? C.ok : w.understanding === 'nochmal' ? C.danger : w.understanding ? C.warn : C.muted;
            return (
              <View key={w.id} style={{ gap: 6 }}>
              <Pressable onPress={() => (w.status === 'geprueft' ? setOpenTest(openTest === w.id ? null : w.id) : onGo(w.exam ? 'klassenarbeit' : 'themen'))} accessibilityRole="button"
                style={[s.row, { flexWrap: 'nowrap', gap: 8, padding: 8, borderRadius: 10, backgroundColor: openTest === w.id ? C.accentSoft : C.bg }]}>
                <Text style={{ fontSize: 15 }}>{w.exam ? '📄' : '📝'}</Text>
                <Text style={[s.text, { flex: 1, minWidth: 0, fontSize: 14 }]} numberOfLines={1}>{w.title}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: tone }} numberOfLines={1}>{tag}</Text>
              </Pressable>
              {openTest === w.id && <SheetResult sheet={w} />}
              </View>
            );
          })}
          {sum.tests.length > 5 && <Pressable onPress={() => setAllTests(x => !x)}><Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>{allTests ? 'Weniger zeigen' : `Alle ${sum.tests.length} zeigen`}</Text></Pressable>}
        </View>
      )}

      {(next.length > 0 || grades.length > 0) && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Klassenarbeiten</Text>
          {next.map(e => <Text key={e.id} style={[s.text, { fontSize: 14 }]}>📅 {e.subject}{e.title ? `: ${e.title}` : ''} <Text style={{ color: C.muted }}>am {dm(e.date!)}</Text></Text>)}
          {grades.map(e => <Text key={e.id} style={[s.text, { fontSize: 14 }]}>🎓 {e.subject}{e.title ? `: ${e.title}` : ''} <Text style={{ fontWeight: '800' }}>Note {e.grade}</Text></Text>)}
        </View>
      )}

      {sum.activeDays === 0 && <Text style={s.muted}>In diesem Zeitraum hat {kid.name} nichts gelernt.</Text>}
    </View>
  );
}
