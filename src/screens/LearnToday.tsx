import { Pressable, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today } from '../data/logic';
import { studyToday } from '../data/studyplan';
import { dueCount, liveStreak } from '../data/vocab';
import { Button } from '../ui/Button';
import { Icon, IconName } from '../ui/Icon';
import { C, s, TINT } from '../ui/theme';
import { dayText } from './StudyPack';

export type LearnPart = 'heute' | 'themen' | 'klassenarbeit' | 'vokabeln' | 'statistik';

const daysTo = (d: string, from = today()) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 864e5);
const inDays = (n: number) => (n <= 0 ? 'heute' : n === 1 ? 'morgen' : `in ${n} Tagen`);

/** Eine Zeile „Das ist dran“: farbige Icon-Kachel, Text, Pfeil. Antippen springt dorthin, wo es erledigt wird. */
function Row({ icon, tint, title, sub, done, onPress, action }: { icon: IconName; tint: string; title: string; sub?: string; done?: boolean; onPress: () => void; action?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}${sub ? ', ' + sub : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: done ? C.okSoft : C.bg }}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: done ? '#fff' : tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={done ? 'check' : icon} size={20} color={done ? C.ok : C.fg} stroke={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.text, { fontWeight: '800', fontSize: 15 }]} numberOfLines={2}>{title}</Text>
        {!!sub && <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={2}>{sub}</Text>}
      </View>
      {action && !done ? <Text style={{ color: C.accent, fontWeight: '800', fontSize: 14 }}>{action}</Text> : <Icon name="chev" size={18} color={C.muted} />}
    </Pressable>
  );
}

/** Kind: Einstieg in den Lernbereich. Alles, was heute dran ist, an einer Stelle. */
export function LearnToday({ childId, onGo, onSolve, onNewTopic }: { childId: string; onGo: (p: LearnPart) => void; onSolve: (id: string) => void; onNewTopic: () => void }) {
  const { data } = useFamily();
  if (!data) return null;
  const date = today();
  const sheets = (data.worksheets ?? []).filter(w => w.childId === childId);
  const open = sheets.filter(w => w.status === 'offen');
  const waiting = sheets.filter(w => w.status === 'abgegeben');
  const plan = studyToday(data, childId, date);
  const planned = new Set(plan.map(p => p.prep.id));
  // Klassenarbeiten in den nächsten 14 Tagen ohne Lernplan, damit sie nicht untergehen
  const soon = (data.exams ?? []).filter(e => e.childId === childId && !e.grade && e.date && !planned.has(e.id) && daysTo(e.date) >= 0 && daysTo(e.date) <= 14)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  const due = dueCount(data, childId);
  const streak = liveStreak(data, childId);
  const doneToday = data.vocabStats?.[childId]?.last === date;
  const showVocab = due > 0 || (streak > 0 && !doneToday);
  const todo = open.length + plan.filter(p => !p.day.done).length + (due > 0 ? 1 : 0);
  const empty = !open.length && !plan.length && !soon.length && !showVocab && !waiting.length;

  return (
    <View style={{ gap: 16 }}>
      <View style={[s.card, { gap: 10 }]}>
        <View>
          <Text style={s.h2}>Heute dran</Text>
          <Text style={s.muted}>{empty ? 'Heute ist nichts offen.' : todo ? `${todo} ${todo === 1 ? 'Sache wartet' : 'Sachen warten'} auf dich.` : 'Alles geschafft für heute.'}</Text>
        </View>
        {open.map(w => (
          <Row key={w.id} icon="brush" tint={TINT[2]} title={w.title} sub={`${w.exam ? 'Probe-Arbeit' : w.retryOf ? 'Nochmal üben' : 'Test'} · ${w.questions.length} Aufgaben`} action="Lösen" onPress={() => onSolve(w.id)} />
        ))}
        {plan.map(({ prep, day, days }) => (
          <Row key={prep.id} icon="book" tint={TINT[0]} done={day.done}
            title={`${prep.subject}${days !== null ? ` · Arbeit ${inDays(days)}` : ''}`}
            sub={day.done ? 'Heute geschafft' : `${dayText(day)} · ${day.minutes} Min`} action="Lernen" onPress={() => onGo('klassenarbeit')} />
        ))}
        {showVocab && (
          <Row icon="star" tint={TINT[1]} title={due ? `${due} Vokabeln warten` : 'Vokabel-Serie retten'}
            sub={streak ? `${streak} ${streak === 1 ? 'Tag' : 'Tage'} Serie${doneToday ? '' : ', heute noch üben'}` : undefined} action="Üben" onPress={() => onGo('vokabeln')} />
        )}
        {soon.map(e => (
          <Row key={e.id} icon="cal" tint={TINT[3]} title={`${e.subject}: Arbeit ${inDays(daysTo(e.date!))}`} sub="Noch kein Lernplan. Unterlagen hochladen, dann entsteht er." onPress={() => onGo('klassenarbeit')} />
        ))}
        {waiting.map(w => (
          <Row key={w.id} icon="clock" tint={C.surface2} title={w.title} sub="Abgegeben. Mama oder Papa schauen drüber." onPress={() => onGo(w.exam ? 'klassenarbeit' : 'themen')} />
        ))}
      </View>
      <View style={[s.row, { gap: 8 }]}>
        <Button ghost title="+ Thema" style={{ flex: 1 }} onPress={onNewTopic} />
        <Button ghost title="+ Klassenarbeit" style={{ flex: 1 }} onPress={() => onGo('klassenarbeit')} />
      </View>
    </View>
  );
}
