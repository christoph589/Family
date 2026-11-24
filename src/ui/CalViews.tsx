import { ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { birthdaysOn, eventsOn, isDueOn, peopleOf, schoolOn, today } from '../data/logic';
import { FamilyData } from '../data/types';
import { Button, Segmented } from './Button';
import { C, s } from './theme';

export type CalMode = 'tag' | '3tage' | 'woche' | 'monat';
export type CalItem = { key: string; time?: string; title: string; color: string; tag?: string };
export const CAL_MODES: { value: CalMode; label: string }[] = [
  { value: 'tag', label: 'Tag' }, { value: '3tage', label: '3 Tage' }, { value: 'woche', label: 'Woche' }, { value: 'monat', label: 'Monat' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (d: string) => new Date(d + 'T12:00:00');
export const addDays = (d: string, n: number) => { const x = parse(d); x.setDate(x.getDate() + n); return iso(x); };
const mondayOf = (d: string) => { const x = parse(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const addMonths = (d: string, n: number) => { const x = parse(d); x.setDate(1); x.setMonth(x.getMonth() + n); return iso(x); };
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Tage, die eine Ansicht zeigt. Monat: volle Wochen von Montag bis Sonntag. */
export function daysOf(mode: CalMode, anchor: string): string[] {
  if (mode === 'tag') return [anchor];
  if (mode === '3tage') return [anchor, addDays(anchor, 1), addDays(anchor, 2)];
  if (mode === 'woche') { const m = mondayOf(anchor); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); }
  const first = anchor.slice(0, 8) + '01';
  const start = mondayOf(first);
  const next = addMonths(first, 1);
  const out: string[] = [];
  for (let d = start; d < next || out.length % 7; d = addDays(d, 1)) out.push(d);
  return out;
}
export function stepAnchor(mode: CalMode, anchor: string, dir: 1 | -1) {
  if (mode === 'monat') return addMonths(anchor, dir);
  return addDays(anchor, dir * (mode === 'tag' ? 1 : mode === '3tage' ? 3 : 7));
}
export function rangeLabel(mode: CalMode, anchor: string) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => parse(d).toLocaleDateString('de-DE', o);
  if (mode === 'tag') return f(anchor, { weekday: 'long', day: 'numeric', month: 'long' });
  if (mode === 'monat') return f(anchor, { month: 'long', year: 'numeric' });
  const ds = daysOf(mode, anchor);
  return `${f(ds[0], { day: 'numeric', month: 'short' })} bis ${f(ds[ds.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Alle Einträge eines Tages aus den Familiendaten. childIds = null zeigt alles (Eltern, Wandansicht). */
export function baseItems(data: FamilyData, date: string, childIds: string[] | null): CalItem[] {
  const people = peopleOf(data);
  const kids = data.children.filter(k => !childIds || childIds.includes(k.id));
  const bd: CalItem[] = birthdaysOn(data, date).map(b => ({ key: 'b' + b.child.id, title: `🎂 ${b.child.name}${b.age !== undefined ? ` wird ${b.age}` : ''}`, color: b.child.color, tag: 'Geburtstag' }));
  const school = kids.flatMap(k => {
    const sd = schoolOn(data, k.id, date);
    return sd && (sd.from || sd.to) ? [{ key: 's' + k.id, time: sd.from, title: `🏫 Schule${sd.to ? ' bis ' + sd.to : ''}`, color: k.color, tag: k.name }] : [];
  });
  const ev = eventsOn(data, date, childIds).map(e => {
    const ps = e.who.map(w => people.find(p => p.id === w)).filter(Boolean) as typeof people;
    return { key: e.id, time: e.time, title: `${e.icon ? e.icon + ' ' : ''}${e.title}`, color: ps.length === 1 ? ps[0].color : C.accent, tag: ps.length ? ps.map(p => p.name).join(', ') : 'Alle' };
  });
  const tasks = data.tasks
    .filter(t => t.repeat === 'einmal' && t.date === date && isDueOn(t, date, data) && (!childIds || childIds.includes(t.childId)))
    .map(t => ({ key: 't' + t.id, title: `${t.icon ? t.icon + ' ' : ''}${t.title}`, color: data.children.find(k => k.id === t.childId)?.color ?? C.muted, tag: 'Aufgabe' }));
  return [...bd, ...school, ...ev].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')).concat(tasks);
}

export function CalNav({ mode, anchor, onMode, onAnchor, right }: { mode: CalMode; anchor: string; onMode: (m: CalMode) => void; onAnchor: (a: string) => void; right?: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Segmented value={mode} onChange={onMode} options={CAL_MODES} />
        {right}
      </View>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <Button ghost title="‹" accessibilityLabel="Zurück" onPress={() => onAnchor(stepAnchor(mode, anchor, -1))} style={{ paddingHorizontal: 14 }} />
        <Button ghost title="Heute" onPress={() => onAnchor(today())} />
        <Button ghost title="›" accessibilityLabel="Weiter" onPress={() => onAnchor(stepAnchor(mode, anchor, 1))} style={{ paddingHorizontal: 14 }} />
        <Text style={[s.text, { fontWeight: '800', flex: 1, textAlign: 'right' }]} numberOfLines={1}>{rangeLabel(mode, anchor)}</Text>
      </View>
    </View>
  );
}

function Row({ it, big }: { it: CalItem; big?: boolean }) {
  return (
    <View style={{ borderLeftWidth: 4, borderLeftColor: it.color, backgroundColor: it.color + '12', borderRadius: 6, paddingVertical: big ? 8 : 5, paddingHorizontal: 8 }}>
      <Text style={{ fontWeight: '700', color: C.fg, fontSize: big ? 17 : 13 }}>{it.time ? `${it.time} ` : ''}{it.title}</Text>
      {it.tag ? <Text style={{ color: C.muted, fontSize: big ? 13 : 11 }}>{it.tag}</Text> : null}
    </View>
  );
}

/** Kalender in vier Ansichten. renderItem erlaubt z. B. Löschen im Eltern-Kalender. */
export function CalViews({ mode, anchor, itemsFor, renderItem, onPickDay, flat }: {
  mode: CalMode; anchor: string; itemsFor: (date: string) => CalItem[];
  renderItem?: (it: CalItem, big: boolean) => ReactNode; onPickDay?: (date: string) => void;
  /** innerhalb einer Karte: Tage grau statt weiß */
  flat?: boolean;
}) {
  const { width } = useWindowDimensions();
  const days = daysOf(mode, anchor);
  const t = today();
  const render = (it: CalItem, big: boolean) => (renderItem ? renderItem(it, big) : <Row key={it.key} it={it} big={big} />);

  if (mode === 'monat') {
    const month = anchor.slice(0, 7);
    const narrow = width < 600;
    const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
    return (
      <View style={[s.card, { padding: flat ? 0 : 8, gap: 4 }]}>
        <View style={{ flexDirection: 'row' }}>
          {WD.map(w => <Text key={w} style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: C.muted, fontSize: 12 }}>{w}</Text>)}
        </View>
        {weeks.map((wk, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
            {wk.map(d => {
              const items = itemsFor(d);
              const other = d.slice(0, 7) !== month;
              const isToday = d === t;
              const shown = narrow ? 0 : 3;
              return (
                <Pressable key={d} disabled={!onPickDay} onPress={() => onPickDay?.(d)} accessibilityLabel={`${parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}, ${items.length} Einträge`}
                  style={{ flex: 1, minWidth: 0, minHeight: narrow ? 54 : 96, borderRadius: 8, padding: 4, gap: 2, backgroundColor: isToday ? C.accent + '18' : C.bg, opacity: other ? 0.45 : 1, borderWidth: isToday ? 2 : 0, borderColor: C.accent }}>
                  <Text style={{ fontWeight: '800', color: isToday ? C.accent : C.fg, fontSize: 13 }}>{parse(d).getDate()}</Text>
                  {items.slice(0, shown).map(it => (
                    <Text key={it.key} numberOfLines={1} style={{ fontSize: 11, color: C.fg, backgroundColor: it.color + '22', borderLeftWidth: 3, borderLeftColor: it.color, paddingHorizontal: 3, borderRadius: 3 }}>{it.time ? it.time + ' ' : ''}{it.title}</Text>
                  ))}
                  {narrow ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                      {items.slice(0, 6).map(it => <View key={it.key} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: it.color }} />)}
                    </View>
                  ) : items.length > shown ? <Text style={{ fontSize: 11, color: C.muted }}>+{items.length - shown} mehr</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {onPickDay && <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>Tag antippen für Details</Text>}
      </View>
    );
  }

  const big = mode === 'tag';
  return (
    <View style={[s.row, { alignItems: 'stretch', gap: 10 }]}>
      {days.map(d => {
        const items = itemsFor(d);
        const isToday = d === t;
        return (
          <View key={d} style={[s.card, flat && { backgroundColor: C.bg }, { flexGrow: 1, flexBasis: mode === 'woche' ? 140 : 220, minWidth: 0, padding: 12, gap: 8, borderWidth: isToday ? 2 : 0, borderColor: C.accent }]}>
            <Text style={{ fontWeight: '800', fontSize: big ? 20 : 15, color: isToday ? C.accent : C.fg }}>
              {parse(d).toLocaleDateString('de-DE', big ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'numeric' })}
            </Text>
            {items.length === 0 && <Text style={[s.muted, { fontSize: big ? 16 : 13 }]}>Keine Termine</Text>}
            {items.map(it => render(it, big))}
          </View>
        );
      })}
    </View>
  );
}
