import { ReactNode, useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { birthdaysOn, eventsOn, extraStates, isDueOn, peopleOf, schoolOn, today } from '../data/logic';
import { FamilyData } from '../data/types';
import { Button, Segmented } from './Button';
import { Avatar } from './Avatar';
import { C, s } from './theme';

export type CalMode = 'tag' | '3tage' | 'woche' | 'monat';
export type CalItem = { key: string; time?: string; end?: string; title: string; color: string; tag?: string; badge?: string; who?: string[]; people?: { id: string; name: string; color: string; photo?: string }[]; drive?: string; note?: string };
/** Filter nach Personen: leer = alle. Familientermine (ohne Personen) bleiben immer sichtbar. */
export const matchesPeople = (it: CalItem, ids: string[]) => !ids.length || !it.who?.length || it.who.some(w => ids.includes(w));
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
export function rangeLabel(mode: CalMode, anchor: string, short = false) {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => parse(d).toLocaleDateString('de-DE', o);
  if (mode === 'tag') return f(anchor, { weekday: 'short', day: 'numeric', month: 'long' });
  if (mode === 'monat') return f(anchor, { month: 'long', year: 'numeric' });
  const ds = daysOf(mode, anchor), a = ds[0], b = ds[ds.length - 1];
  if (short) return `${f(a, { day: 'numeric', month: a.slice(0, 7) === b.slice(0, 7) ? undefined : 'numeric' })}${a.slice(0, 7) === b.slice(0, 7) ? '.' : ''}–${f(b, { day: 'numeric', month: 'numeric' })}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${parse(a).getDate()}.–${f(b, { day: 'numeric', month: 'short' })}` : `${f(a, { day: 'numeric', month: 'short' })} – ${f(b, { day: 'numeric', month: 'short' })}`;
}

/** Alle Einträge eines Tages aus den Familiendaten. childIds = null zeigt alles (Eltern, Wandansicht). */
export function baseItems(data: FamilyData, date: string, childIds: string[] | null, onlyOwn = false, viewer?: string): CalItem[] {
  const people = peopleOf(data);
  const kids = data.children.filter(k => !childIds || childIds.includes(k.id));
  // Kürzel: erster Buchstabe, bei gleichem Anfangsbuchstaben zwei (Mia/Mama -> Mi/Ma)
  const ini = (n: string) => (people.filter(p => p.name[0] === n[0]).length > 1 ? n.slice(0, 2) : n[0]);
  const bd: CalItem[] = birthdaysOn(data, date).map(b => ({ key: 'b' + b.child.id, title: `🎂 ${b.child.name}${b.age !== undefined ? ` wird ${b.age}` : ''}`, color: b.child.color, tag: 'Geburtstag', who: [b.child.id] }));
  const school = kids.flatMap(k => {
    const sd = schoolOn(data, k.id, date);
    return sd && (sd.from || sd.to) ? [{ key: 's' + k.id, time: sd.from, end: sd.to, title: `🏫 ${k.name}`, color: k.color, tag: 'Schule', who: [k.id], people: [{ id: k.id, name: k.name, color: k.color, photo: k.photo }] }] : [];
  });
  const ev = eventsOn(data, date, childIds, onlyOwn, viewer).map(e => {
    const ps = e.who.map(w => people.find(p => p.id === w)).filter(Boolean) as typeof people;
    const nm = (id?: string) => (id ? people.find(p => p.id === id)?.name ?? id : undefined);
    const b = nm(e.bring), pk = nm(e.pick);
    const drive = b && pk && b === pk ? `🚗 ${b} hin und zurück` : [b && `🚗 ${b}`, pk && `🏠 ${pk}`].filter(Boolean).join(' · ') || undefined;
    return { key: e.id, time: e.time, end: e.end, title: `${e.icon ? e.icon + ' ' : ''}${e.title}`, color: ps.length === 1 ? ps[0].color : C.accent, tag: ps.length ? ps.map(p => p.name).join(', ') : 'Alle', who: e.who, people: ps, drive, note: e.note };
  });
  const tasks = data.tasks
    .filter(t => t.repeat === 'einmal' && t.date === date && isDueOn(t, date, data) && (!childIds || childIds.includes(t.childId)))
    .map(t => ({ key: 't' + t.id, title: `${t.icon ? t.icon + ' ' : ''}${t.title}`, color: data.children.find(k => k.id === t.childId)?.color ?? C.muted, tag: 'Aufgabe', who: [t.childId] }));
  // Feiertage jeden Tag, Schulferien nur am ersten und letzten Tag (sonst ist der Monat voll davon)
  const fmt = (x: string) => parse(x).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  const hol: CalItem[] = data.settings?.autoHoliday?.on === false ? [] : (data.settings?.autoHoliday?.ranges ?? []).flatMap(r => {
    if (r.kind === 'feiertag') return r.from <= date && date <= r.to ? [{ key: 'h' + r.from + r.name, title: `🎉 ${r.name}`, color: '#b26a00', tag: 'Feiertag' }] : [];
    if (date === r.from) return [{ key: 'h' + r.from + r.name, title: `🏖️ ${r.name}${r.to !== r.from ? ` bis ${fmt(r.to)}` : ''}`, color: '#0f6e73', tag: 'Ferien' }];
    if (date === r.to) return [{ key: 'h' + r.to + r.name + 'e', title: `🏖️ Letzter Tag ${r.name}`, color: '#0f6e73', tag: 'Ferien' }];
    return [];
  });
  // Kinder mit eigenem Bundesland: deren Ferien und abweichende Feiertage mit Namen
  const a = data.settings?.autoHoliday;
  const famKeys = new Set((a?.ranges ?? []).map(r => r.from + r.to + r.name));
  const extra: CalItem[] = a?.on === false ? [] : extraStates(data).flatMap(st => {
    const ks = kids.filter(k => k.state === st);
    if (!ks.length) return [];
    const nm = ks.map(k => k.name).join(', ');
    return (a?.extra?.[st]?.ranges ?? []).filter(r => !famKeys.has(r.from + r.to + r.name)).flatMap(r => {
      if (r.kind === 'feiertag') return r.from <= date && date <= r.to ? [{ key: 'h' + st + r.from + r.name, title: `🎉 ${r.name} (${nm})`, color: '#b26a00', tag: 'Feiertag', who: ks.map(k => k.id) }] : [];
      if (date === r.from) return [{ key: 'h' + st + r.from + r.name, title: `🏖️ ${nm}: ${r.name}${r.to !== r.from ? ` bis ${fmt(r.to)}` : ''}`, color: '#0f6e73', tag: 'Ferien', who: ks.map(k => k.id) }];
      if (date === r.to) return [{ key: 'h' + st + r.to + r.name + 'e', title: `🏖️ ${nm}: Letzter Tag ${r.name}`, color: '#0f6e73', tag: 'Ferien', who: ks.map(k => k.id) }];
      return [];
    });
  });
  return [...hol, ...extra, ...bd, ...school, ...ev].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')).concat(tasks);
}

export function CalNav({ mode, anchor, onMode, onAnchor, right }: { mode: CalMode; anchor: string; onMode: (m: CalMode) => void; onAnchor: (a: string) => void; right?: ReactNode }) {
  const narrow = useWindowDimensions().width < 600;
  if (narrow) return (
    <View style={{ gap: 10 }}>
      <Segmented value={mode} onChange={onMode} options={CAL_MODES} />
      <View style={[s.row, { flexWrap: 'nowrap', gap: 6 }]}>
        <Button ghost title="‹" accessibilityLabel="Zurück" onPress={() => onAnchor(stepAnchor(mode, anchor, -1))} style={{ paddingHorizontal: 12 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Heute" onPress={() => onAnchor(today())} style={{ flexShrink: 1, paddingHorizontal: 4 }}>
          <Text style={[s.text, { fontWeight: '800', fontSize: 14 }]} numberOfLines={1}>{rangeLabel(mode, anchor, true)}</Text>
          {anchor !== today() && <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700' }}>zu heute</Text>}
        </Pressable>
        <Button ghost title="›" accessibilityLabel="Weiter" onPress={() => onAnchor(stepAnchor(mode, anchor, 1))} style={{ paddingHorizontal: 12 }} />
        <View style={{ flex: 1 }} />
        {right}
      </View>
    </View>
  );
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
      <Text style={{ fontWeight: '700', color: C.fg, fontSize: big ? 17 : 13 }}>{it.time ? `${it.time}${it.end ? '–' + it.end : ''} ` : ''}{it.title}</Text>
      {it.tag ? <Text style={{ color: C.muted, fontSize: big ? 13 : 11 }}>{it.tag}</Text> : null}
    </View>
  );
}

/** Kalender in vier Ansichten. renderItem erlaubt z. B. Löschen im Eltern-Kalender. */
export function CalViews({ mode, anchor, itemsFor, renderItem, onPickDay, flat, onItemPress }: {
  mode: CalMode; anchor: string; itemsFor: (date: string) => CalItem[];
  renderItem?: (it: CalItem, big: boolean) => ReactNode; onPickDay?: (date: string) => void;
  /** innerhalb einer Karte: Tage grau statt weiß */
  flat?: boolean;
  /** Tipp auf einen Termin im Stundenraster */
  onItemPress?: (it: CalItem, date: string) => void;
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
              // Monat: Schule weglassen (steht jeden Tag gleich da), Aufgaben nur als Punkte, Termine als Zeilen.
              const school = items.filter(it => it.key.startsWith('s') && it.tag === 'Schule');
              const shownCount = items.length - school.length;
              const tasks = items.filter(it => it.key.startsWith('t'));
              const rest = items.filter(it => !school.includes(it) && !tasks.includes(it));
              const max = narrow ? 0 : 3;
              const lines = rest.slice(0, max);
              const dots = [...rest.slice(max), ...tasks];
              return (
                <Pressable key={d} disabled={!onPickDay} onPress={() => onPickDay?.(d)} accessibilityLabel={`${parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}, ${shownCount} Einträge`}
                  style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: narrow ? 58 : 112, borderRadius: 12, padding: narrow ? 4 : 6, gap: 3, backgroundColor: isToday ? C.accentSoft : pressed ? C.surface2 : C.bg, opacity: other ? 0.4 : 1, borderWidth: isToday ? 2 : 0, borderColor: C.accent })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                    <Text style={{ fontWeight: '800', color: isToday ? C.accent : C.fg, fontSize: narrow ? 13 : 15 }}>{parse(d).getDate()}</Text>
                  </View>
                  {lines.map(it => (
                    <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: it.time ? 'transparent' : it.color + '26', borderRadius: 6, paddingHorizontal: it.time ? 0 : 4, paddingVertical: 1 }}>
                      {it.time ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: it.color }} /> : null}
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, color: C.fg, fontWeight: it.time ? '500' : '700' }}>
                        {it.time ? <Text style={{ color: C.muted, fontWeight: '700' }}>{it.time} </Text> : null}{it.title}
                      </Text>
                    </View>
                  ))}
                  {dots.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 'auto' as any }}>
                      {dots.slice(0, narrow ? 6 : 10).map(it => <View key={it.key} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: it.color }} />)}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        {onPickDay && <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>Tag antippen für Details</Text>}
      </View>
    );
  }

  if (mode !== 'woche' || width >= 700) return <TimeGrid days={days} itemsFor={itemsFor} flat={flat} onItemPress={onItemPress} />;

  return <Agenda days={days} itemsFor={itemsFor} onItemPress={onItemPress} onPickDay={onPickDay} />;
}

/** Woche am Handy: eine Zeile pro Tag. Schule wird zu einer kurzen Zeile zusammengefasst, Termine stehen darunter. */
function Agenda({ days, itemsFor, onItemPress, onPickDay }: { days: string[]; itemsFor: (d: string) => CalItem[]; onItemPress?: (it: CalItem, date: string) => void; onPickDay?: (date: string) => void }) {
  const t = today();
  return (
    <View style={[s.card, { padding: 6, gap: 0 }]}>
      {days.map((d, i) => {
        const items = itemsFor(d);
        const school = items.filter(it => it.key.startsWith('s') && it.tag === 'Schule');
        const rest = items.filter(it => !school.includes(it));
        const isToday = d === t, wd = parse(d).getDay(), weekend = wd === 0 || wd === 6;
        const from = school.map(x => x.time).filter(Boolean).sort()[0], to = school.map(x => x.end).filter(Boolean).sort().pop();
        return (
          <View key={d} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: isToday ? C.accentSoft : 'transparent', borderRadius: isToday ? 14 : 0 }}>
            <Pressable disabled={!onPickDay} onPress={() => onPickDay?.(d)} accessibilityRole="button" accessibilityLabel={`${parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} öffnen`}
              style={{ width: 44, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: isToday ? C.accent : weekend ? C.accent2 : C.muted }}>{WD[(wd + 6) % 7]}</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: isToday ? C.accent : C.fg }}>{parse(d).getDate()}</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0, gap: 5, justifyContent: 'center' }}>
              {school.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 2 }}>{school.map(x => <View key={x.key} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.color }} />)}</View>
                  <Text style={{ fontSize: 12.5, color: C.muted }} numberOfLines={1}>🏫 Schule {from ?? ''}{to ? `–${to}` : ''}{school.length === 1 ? ` · ${school[0].title.replace('🏫 ', '')}` : ''}</Text>
                </View>
              )}
              {rest.map(it => (
                <Pressable key={it.key} disabled={!onItemPress} onPress={() => onItemPress?.(it, d)} accessibilityRole="button" accessibilityLabel={`${it.time ?? ''} ${it.title}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 4, borderLeftColor: it.color, backgroundColor: it.color + '14', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: C.muted, width: 50, flexShrink: 0 }}>{it.time ?? 'ganzt.'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: C.fg }} numberOfLines={1}>{it.title}</Text>
                    {(it.tag || it.drive) ? <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{[it.tag, it.drive].filter(Boolean).join(' · ')}</Text> : null}
                  </View>
                </Pressable>
              ))}
              {!items.length && <Text style={{ fontSize: 13, color: C.muted }}>frei</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const toMin = (t?: string) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Stundenraster wie ein Wandkalender: ganztägige Einträge oben, Termine als Blöcke nach Uhrzeit. */
function TimeGrid({ days, itemsFor, flat, onItemPress }: { days: string[]; itemsFor: (d: string) => CalItem[]; flat?: boolean; onItemPress?: (it: CalItem, date: string) => void }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const H = 46;
  const all = days.map(d => itemsFor(d));
  const timed = all.flat().filter(i => i.time);
  const minH = Math.min(7, ...timed.map(i => Math.floor(toMin(i.time)! / 60)));
  const maxH = Math.max(21, ...timed.map(i => Math.ceil((toMin(i.end) ?? toMin(i.time)! + 60) / 60)));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const t = today();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const GUTTER = 34;
  // Schulzeiten als schmale Streifen am linken Rand, sobald mehr als ein Tag zu sehen ist.
  // So bleibt auch bei vielen Kindern Platz für die eigentlichen Termine.
  const { width } = useWindowDimensions();
  const stripes = days.length > 1 || width < 600;
  let pad = 0;
  const isSchool = (i: CalItem) => i.key.startsWith('s') && i.tag === 'Schule';

  const layout = (items: CalItem[]) => {
    const ev = items.filter(i => i.time).map(i => {
      const start = toMin(i.time)!;
      const end = Math.max(start + 30, toMin(i.end) ?? start + 60);
      return { it: i, start, end, lane: 0, lanes: 1 };
    }).sort((a, b) => a.start - b.start || b.end - a.end);
    let cluster: typeof ev = [];
    let clusterEnd = -1;
    const flush = () => { const n = Math.max(...cluster.map(c => c.lane)) + 1; cluster.forEach(c => (c.lanes = n)); cluster = []; };
    for (const e of ev) {
      if (cluster.length && e.start >= clusterEnd) { flush(); clusterEnd = -1; }
      const used = new Set(cluster.filter(c => c.end > e.start).map(c => c.lane));
      let lane = 0; while (used.has(lane)) lane++;
      e.lane = lane; cluster.push(e); clusterEnd = Math.max(clusterEnd, e.end);
    }
    if (cluster.length) flush();
    return ev;
  };

  return (
    <View style={[s.card, { padding: flat ? 0 : 8, gap: 0, backgroundColor: flat ? 'transparent' : C.surface }]}>
      <View style={{ flexDirection: 'row', paddingLeft: GUTTER }}>
        {days.map(d => (
          <View key={d} style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ fontWeight: '800', color: d === t ? C.accent : C.fg, fontSize: 14 }} numberOfLines={1}>
              {parse(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' })}
            </Text>
          </View>
        ))}
      </View>
      {all.some(items => items.some(i => !i.time)) && (
        <View style={{ flexDirection: 'row', paddingLeft: GUTTER, gap: 2, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
          {all.map((items, i) => (
            <View key={days[i]} style={{ flex: 1, minWidth: 0, gap: 2 }}>
              {items.filter(x => !x.time).map(x => (
                <Pressable key={x.key} disabled={!onItemPress} onPress={() => onItemPress?.(x, days[i])}
                  style={{ backgroundColor: x.color + '33', borderLeftWidth: 3, borderLeftColor: x.color, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: C.fg }}>{x.title}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: GUTTER }}>
          {hours.map(h => <View key={h} style={{ height: H }}><Text style={{ fontSize: 11, color: C.muted, textAlign: 'right', paddingRight: 6, marginTop: -7 }}>{h}</Text></View>)}
        </View>
        {days.map((d, di) => (
          <View key={d} style={{ flex: 1, minWidth: 0, height: hours.length * H, borderLeftWidth: 1, borderLeftColor: C.line, backgroundColor: d === t ? C.accent + '08' : 'transparent' }}>
            {hours.map((h, i) => <View key={h} style={{ position: 'absolute', top: i * H, left: 0, right: 0, borderTopWidth: 1, borderTopColor: C.line }} />)}
            {stripes && (() => {
              const sch = all[di].filter(i => isSchool(i) && i.time);
              return sch.map((it, k) => {
                const st = toMin(it.time)!, en = toMin(it.end) ?? st + 360;
                return (
                  <Pressable key={it.key} disabled={!onItemPress} onPress={() => onItemPress?.(it, d)} accessibilityLabel={`Schule ${it.people?.[0]?.name ?? ''} ${it.time} bis ${it.end ?? ''}`}
                    style={{ position: 'absolute', left: 2 + k * 6, width: 5, top: ((st - minH * 60) / 60) * H, height: ((en - st) / 60) * H, backgroundColor: it.color, borderRadius: 3, opacity: 0.85 }} />
                );
              });
            })()}
            {(() => { const n = stripes ? all[di].filter(i => isSchool(i) && i.time).length : 0; pad = n ? 4 + n * 6 : 0; return null; })()}
            {layout(stripes ? all[di].filter(i => !isSchool(i)) : all[di]).map(({ it, start, end, lane, lanes }) => {
              const top = ((start - minH * 60) / 60) * H;
              const height = Math.max(22, ((end - start) / 60) * H - 2);
              return (
                <Pressable key={it.key} disabled={!onItemPress} onPress={() => onItemPress?.(it, d)} accessibilityLabel={`${it.time}${it.end ? ' bis ' + it.end : ''} ${it.title}`}
                  style={{ position: 'absolute', top, height, left: `calc(${pad}px + (100% - ${pad}px) * ${lane / lanes})` as any, width: `calc((100% - ${pad}px) / ${lanes})` as any, padding: 1 }}>
                  <View style={{ flex: 1, backgroundColor: it.color + '40', borderLeftWidth: 4, borderLeftColor: it.color, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' }}>
                    <Text numberOfLines={height > 40 ? 2 : 1} style={{ fontSize: 12, fontWeight: '800', color: C.fg }}>{it.title}</Text>
                    {height > 34 && <Text numberOfLines={1} style={{ fontSize: 10, color: C.muted }}>{it.time}{it.end ? ' – ' + it.end : ''}</Text>}
                    {!!it.people?.length && height > 54 && (
                      <View style={{ position: 'absolute', left: 6, right: 3, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ flexDirection: 'row' }}>
                          {it.people.slice(0, 4).map((p, i) => (
                            <View key={p.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 12, borderWidth: 1.5, borderColor: '#fff' }}>
                              <Avatar name={p.name} color={p.color} photo={p.photo} size={20} />
                            </View>
                          ))}
                        </View>
                        {it.people.length === 1 && <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, fontWeight: '800', color: it.people[0].color }}>{it.people[0].name}</Text>}
                      </View>
                    )}
                    {!it.people?.length && it.badge && height > 50 && (
                      <View style={{ position: 'absolute', right: 3, bottom: 3, backgroundColor: it.color, borderRadius: 4, paddingHorizontal: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{it.badge}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
            {d === t && nowMin >= minH * 60 && nowMin <= maxH * 60 && (
              <View pointerEvents="none" style={{ position: 'absolute', left: -4, right: 0, top: ((nowMin - minH * 60) / 60) * H, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger }} />
                <View style={{ flex: 1, height: 2, backgroundColor: C.danger }} />
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
