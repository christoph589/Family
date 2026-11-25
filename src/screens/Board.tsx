import { useEffect, useState } from 'react';
import { DeleteButton } from '../ui/DeleteButton';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { potBalance, potShares, birthdaysOn, holidayLabel, peopleOf, pointsOf, schoolOn, tasksFor, today } from '../data/logic';
import { TIME_ORDER } from '../data/templates';
const TIME_ICON: Record<string, string> = { morgens: ' 🌅', mittags: ' ☀️', abends: ' 🌙' };
import { Child, FamilyData } from '../data/types';
import { Button } from '../ui/Button';
import { baseItems, CalItem, CalMode, CalNav, CalViews, daysOf, matchesPeople } from '../ui/CalViews';
import { EventForm, IcloudForm } from './Calendar';
import { eventTarget, icloudSave } from '../data/icloud';
import { MealPlan, mealsOn, Shopping, shoppingFor, untilLabel } from './Food';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Popup } from '../ui/Popup';
import { C, grad, s, SHADOW } from '../ui/theme';
import { Avatar, PersonHead } from '../ui/Avatar';
import { useFeedItems } from '../data/feeds';
import { useIcloudItems } from '../data/icloud';

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

/** Wandansicht: nur lesen, für ein Tablet an der Wand. Aktualisiert sich selbst. */
export function Board({ onExit }: { onExit: () => void }) {
  const { data, update } = useFamily();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(new Date());
  const [ask, setAsk] = useState(false);
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<CalMode>('woche');
  const [anchor, setAnchor] = useState(today());
  const [touched, setTouched] = useState(0);
  const [filter, setFilter] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<{ it: CalItem; date: string } | null>(null);
  const [icAdd, setIcAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pane, setPaneState] = useState<Pane>('kalender');
  const setPane = (p: Pane) => { setPaneState(p); AsyncStorage.setItem('familienplaner:boardPane', p).catch(() => {}); };
  // Pro Gerät: Kinder-Spalten, Punkte und gemeinsames Ziel ausblenden, dann steht der Kalender oben
  const [kids, setKidsState] = useState(true);
  const setKids = (v: boolean) => { setKidsState(v); AsyncStorage.setItem('familienplaner:boardKids', v ? '1' : '0').catch(() => {}); };
  useEffect(() => { AsyncStorage.getItem('familienplaner:boardKids').then(v => v === '0' && setKidsState(false), () => {}); }, []);
  useEffect(() => { AsyncStorage.getItem('familienplaner:boardPane').then(v => v && setPaneState(v as Pane), () => {}); }, []);
  const feedItems = useFeedItems(data?.settings?.feeds, data ? peopleOf(data) : [], data?.settings?.hiddenFeed);
  const icItems = useIcloudItems(data?.settings?.icloud, data ? peopleOf(data) : []);
  useEffect(() => { AsyncStorage.getItem('familienplaner:boardView').then(v => v && setMode(v as CalMode), () => {}); }, []);
  // Nach 2 Minuten ohne Bedienung zurück zu heute
  useEffect(() => { const t = setTimeout(() => setAnchor(today()), 120000); return () => clearTimeout(t); }, [anchor, mode, touched]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  // Bildschirm anlassen, soweit der Browser das erlaubt
  useEffect(() => {
    let lock: any;
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const get = () => nav?.wakeLock?.request?.('screen').then((l: any) => { lock = l; }).catch(() => {});
    get();
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') get(); };
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', onVis);
    return () => { lock?.release?.(); if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', onVis); };
  }, []);
  if (!data) return null;
  const date = iso(now);
  const wide = width >= 900;
  const people = peopleOf(data);
  const holiday = holidayLabel(data, date);
  const open = (data.shopping ?? []).filter(i => !i.done).length;

  return (
    <ScrollView onTouchStart={() => setTouched(x => x + 1)} style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: wide ? 24 : 16, gap: 16 }}>
      <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
        <View>
          <Text style={{ fontSize: wide ? 64 : 44, fontWeight: '800', color: C.fg, lineHeight: wide ? 68 : 48 }}>
            {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={{ fontSize: wide ? 22 : 18, color: C.muted, fontWeight: '600' }}>
            {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} · {data.family.name}
          </Text>
        </View>
        {holiday && (
          <View style={{ backgroundColor: C.warnSoft, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontWeight: '800', color: C.fg, fontSize: 16 }}>🏖️ {holiday}</Text>
          </View>
        )}
        <View style={[s.row, { gap: 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Alle anzeigen" onPress={() => setFilter([])}
            style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: filter.length ? 'transparent' : C.accent, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>👨‍👩‍👧‍👦</Text>
          </Pressable>
          <Pressable onPress={() => setKids(!kids)} accessibilityRole="switch" accessibilityState={{ checked: kids }} accessibilityLabel="Aufgaben und Punkte der Kinder anzeigen"
            style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: kids ? '#f5b301' : 'transparent', backgroundColor: kids ? '#fff6d6' : C.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, opacity: kids ? 1 : 0.35 }}>⭐</Text>
          </Pressable>
          {people.map(p => {
            const on = filter.includes(p.id);
            return (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Nur ${p.name}`} accessibilityState={{ selected: on }}
                onPress={() => setFilter(f => (f.includes(p.id) ? f.filter(x => x !== p.id) : [...f, p.id]))}
                style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: on ? C.fg : 'transparent', padding: 2 }}>
                <View style={{ opacity: filter.length && !on ? 0.4 : 1 }}><Avatar name={p.name} color={p.color} photo={p.photo} size={42} /></View>
              </Pressable>
            );
          })}
        </View>
        {!ask ? (
          <Pressable accessibilityRole="button" onPress={() => setAsk(true)} style={{ padding: 8 }}>
            <Text style={{ color: C.muted, fontWeight: '700' }}>Wandansicht beenden</Text>
          </Pressable>
        ) : (
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <TextInput autoFocus style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6 }]} value={pin} secureTextEntry keyboardType="number-pad" placeholder="PIN"
              onChangeText={t => { const v = t.replace(/\D/g, '').slice(0, 4); setPin(v); if (v === data.family.parentPin) { setAsk(false); setPin(''); onExit(); } }} />
            <Button ghost title="✕" onPress={() => { setAsk(false); setPin(''); }} />
          </View>
        )}
      </View>

      {birthdaysOn(data, date).map(({ child, age }) => (
        <View key={child.id} style={[s.card, { backgroundColor: child.color, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
          <Text style={{ fontSize: 44 }}>🎂🎉</Text>
          <Text style={{ color: '#fff', fontSize: wide ? 30 : 22, fontWeight: '800', flex: 1 }}>Alles Gute zum Geburtstag, {child.name}!{age !== undefined ? ` Heute ${age} Jahre.` : ''}</Text>
        </View>
      ))}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
        {wide && !kids ? (
          // Volle Breite: Termine, Essen und Einkauf nebeneinander
          <View style={{ flexDirection: 'row', gap: 16, width: '100%', alignItems: 'stretch' }}>
            <View style={[s.card, { flex: 2 }]}>
              <Text style={s.label}>Heute</Text>
              <DayEvents data={data} date={date} big filter={filter} />
            </View>
            <View style={[s.card, { flex: 1, backgroundColor: '#fff2e0' }]}>
              <Text style={s.label}>Heute gibt es</Text>
              {mealsOn(data, date).length
                ? mealsOn(data, date).sort((a, b) => a.slot.localeCompare(b.slot) * -1).map(m => <Text key={m.id} style={[s.text, { fontWeight: '800', fontSize: 20 }]}>{m.slot === 'mittag' ? '☀️' : m.slot === 'abend' ? '🌙' : '🥣'} {m.title}</Text>)
                : <Text style={s.muted}>Noch nichts geplant</Text>}
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.label}>🛒 Einkaufsliste{open ? ` (${open})` : ''}</Text>
              {open ? (data.shopping ?? []).filter(i => !i.done).slice(0, 6).map(i => <Text key={i.id} style={[s.text, { fontWeight: '600' }]} numberOfLines={1}>• {i.title}</Text>) : <Text style={s.muted}>Alles da</Text>}
              {open > 6 && <Text style={s.muted}>und {open - 6} weitere</Text>}
            </View>
          </View>
        ) : (
        <View style={[s.card, { width: wide && kids ? 300 : '100%' }]}>
          <Text style={s.label}>Heute</Text>
          <DayEvents data={data} date={date} big filter={filter} />
          {mealsOn(data, date).length > 0 && (
            <View style={{ backgroundColor: '#fff2e0', borderRadius: 10, padding: 10, gap: 2 }}>
              <Text style={s.label}>Heute gibt es</Text>
              {mealsOn(data, date).sort((a, b) => a.slot.localeCompare(b.slot) * -1).map(m => <Text key={m.id} style={[s.text, { fontWeight: '700' }]}>{m.slot === 'mittag' ? '☀️' : m.slot === 'abend' ? '🌙' : '🥣'} {m.title}</Text>)}
            </View>
          )}
          {(data.shopping ?? []).some(i => !i.done) && <Text style={s.muted}>🛒 {(data.shopping ?? []).filter(i => !i.done).length} Sachen auf der Einkaufsliste</Text>}
        </View>
        )}
        {kids && <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: wide ? undefined : '100%' }}>
          {data.children.filter(c => !filter.length || filter.includes(c.id)).map(c => <KidColumn key={c.id} data={data} child={c} date={date} />)}
        </View>}
      </View>

      {kids && (data.pots ?? []).filter(p => !p.doneAt).map(p => {
        const bal = potBalance(data, p.id);
        return (
          <View key={p.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 22, padding: 16 }, grad('#5b4cf0', '#ff6a5c', 120), SHADOW.sm]}>
            <Text style={{ fontSize: 36 }}>{p.icon ?? '🎯'}</Text>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Gemeinsam für: {p.title}</Text>
              <View style={{ height: 14, borderRadius: 99, backgroundColor: '#ffffff40', overflow: 'hidden', flexDirection: 'row' }}>
                {potShares(data, p.id).map(x => <View key={x.child.id} style={{ width: `${(x.points / Math.max(p.target, bal)) * 100}%`, backgroundColor: x.child.color }} />)}
                {!!p.bonus && <View style={{ width: `${(p.bonus / Math.max(p.target, bal)) * 100}%`, backgroundColor: '#fff' }} />}
              </View>
            </View>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{bal}<Text style={{ fontSize: 15, color: '#ffffffcc' }}> / {p.target} ⭐</Text></Text>
          </View>
        );
      })}
      <View style={[s.row, { gap: 10 }]} accessibilityRole="tablist">
        {PANES.map(x => (
          <Pressable key={x.value} accessibilityRole="tab" accessibilityState={{ selected: pane === x.value }} onPress={() => setPane(x.value)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18, backgroundColor: pane === x.value ? C.fg : C.surface }, pane === x.value ? null : SHADOW.sm]}>
            <Text style={{ fontSize: 20 }}>{x.icon}</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: pane === x.value ? '#fff' : C.fg }}>{x.label}</Text>
            {x.value === 'einkauf' && open > 0 && <View style={{ backgroundColor: C.accent2, borderRadius: 10, minWidth: 20, paddingHorizontal: 5, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{open}</Text></View>}
          </Pressable>
        ))}
      </View>
      {pane === 'stundenplan' && <WallTimetable data={data} kids={data.children.filter(c => !filter.length || filter.includes(c.id))} date={date} />}
      {pane === 'essen' && <MealPlan who="Wandansicht" />}
      {pane === 'einkauf' && <Shopping who="Wandansicht" />}
      {pane === 'kalender' && <View style={[s.card, { gap: 12 }]}>
        <CalNav mode={mode} anchor={anchor} onMode={m => { setMode(m); setAnchor(date); AsyncStorage.setItem('familienplaner:boardView', m).catch(() => {}); }} onAnchor={setAnchor}
          right={<View style={[s.row, { gap: 8 }]}>
            {eventTarget(data.settings) === 'both' && <Button ghost title="🍎 + iCloud" onPress={() => { setIcAdd(true); setSel(null); }} />}
            <Button title="+ Termin" onPress={() => { if (eventTarget(data.settings) === 'icloud') setIcAdd(true); else setAdding(true); setSel(null); }} />
          </View>} />
        {icAdd && <Popup onClose={() => setIcAdd(false)}><IcloudForm initial={{ date: anchor }} cals={data.settings?.icloud ?? []} onCancel={() => setIcAdd(false)} onSave={async ev => { await icloudSave(ev, (data.settings?.icloud ?? []).map(c => c.href)); setIcAdd(false); setAnchor(ev.date); }} /></Popup>}
        {adding && <EventForm people={people} days={daysOf('woche', anchor)} onCancel={() => setAdding(false)} onSave={ev => { update(d => ({ ...d, events: [...(d.events ?? []), ev] })); setAdding(false); setAnchor(ev.date); }} />}
        {sel && (
          <Popup accent={sel.it.color} onClose={() => { setSel(null); setConfirmDel(false); }}>
            <Text style={s.h2}>{sel.it.title}</Text>
            <Text style={s.muted}>{new Date(sel.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}{sel.it.time ? `, ${sel.it.time}${sel.it.end ? ' bis ' + sel.it.end : ''}` : ', ganztägig'}{sel.it.tag ? ` · ${sel.it.tag}` : ''}</Text>
            {sel.it.drive ? <Text style={[s.text, { fontWeight: '700' }]}>{sel.it.drive}</Text> : null}
            {sel.it.note ? <Text style={s.text}>📝 {sel.it.note}</Text> : null}
            <View style={s.row}>
              {(data.events ?? []).some(e => e.id === sel.it.key) && <DeleteButton parent={false} title="Termin löschen" onDelete={() => { update(d => ({ ...d, events: (d.events ?? []).filter(e => e.id !== sel.it.key) })); setSel(null); }} />}
              <Button ghost title="Schließen" onPress={() => { setSel(null); setConfirmDel(false); }} />
            </View>
          </Popup>
        )}
        <CalViews flat mode={mode} anchor={anchor} itemsFor={d => [...baseItems(data, d, null), ...feedItems(d), ...icItems(d)].sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99')).filter(i => matchesPeople(i, filter))}
          onItemPress={(it, d) => { setSel({ it, date: d }); setConfirmDel(false); setAdding(false); }} onPickDay={d => { setAnchor(d); setMode('tag'); }} />
      </View>}
      <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>Aufgaben abhaken geht auf den Geräten der Kinder oder in der Eltern-Ansicht. Termine, Essen und Einkauf kann hier jeder eintragen.</Text>
    </ScrollView>
  );
}

function DayEvents({ data, date, big, filter }: { data: FamilyData; date: string; big?: boolean; filter: string[] }) {
  const all = baseItems(data, date, null).filter(i => matchesPeople(i, filter) && !i.key.startsWith('t'));
  if (!all.length) return <Text style={[s.muted, { fontSize: big ? 16 : 13 }]}>Keine Termine</Text>;
  return (
    <View style={{ gap: 6 }}>
      {all.map(e => (
        <View key={e.key} style={{ borderLeftWidth: 4, borderLeftColor: e.color, paddingLeft: 8 }}>
          <Text style={{ fontWeight: '700', color: C.fg, fontSize: big ? 17 : 13 }}>{e.time ? `${e.time}${e.end ? '–' + e.end : ''} ` : ''}{e.title}</Text>
          <Text style={{ color: C.muted, fontSize: big ? 13 : 11 }}>{e.tag}{e.drive ? `  ${e.drive}` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

function KidColumn({ data, child, date }: { data: FamilyData; child: Child; date: string }) {
  const items = tasksFor(data, child.id, date).sort((a, b) => TIME_ORDER[a.task.time ?? ''] - TIME_ORDER[b.task.time ?? '']);
  const done = items.filter(i => i.completion?.status === 'bestaetigt').length;
  const open = items.filter(i => i.completion?.status !== 'bestaetigt');
  const sd = schoolOn(data, child.id, date);
  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 260 }]}>
      <PersonHead name={child.name} color={child.color} photo={child.photo} value={`⭐ ${pointsOf(data, child.id)}`} />
      {sd && (sd.from || sd.to) ? <Text style={[s.text, { fontWeight: '700' }]}>🏫 Schule {sd.from ?? '?'}–{sd.to ?? '?'}</Text> : null}
      {shoppingFor(data, child.id).map(i => { const u = untilLabel(i.until); return (
        <Text key={i.id} style={[s.text, { fontSize: 15 }]}>🛒 <Text style={{ fontWeight: '700' }}>{i.title}</Text>{u ? <Text style={{ color: u.urgent ? C.danger : C.muted, fontWeight: u.urgent ? '800' : '500' }}>  {u.text}</Text> : null}</Text>
      ); })}
      <View>
        <Text style={[s.muted, { marginBottom: 4 }]}>{done} von {items.length} erledigt</Text>
        <View style={{ height: 12, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${items.length ? (done / items.length) * 100 : 0}%`, backgroundColor: child.color }} />
        </View>
      </View>
      {open.length === 0 && items.length > 0 && <Text style={[s.text, { fontWeight: '800', color: C.ok }]}>🎉 Alles erledigt!</Text>}
      {open.map(({ task, completion }) => (
        <View key={task.id} style={[s.row, { flexWrap: 'nowrap' }]}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: completion ? C.warn : child.color, backgroundColor: completion ? C.warn : 'transparent' }} />
          <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>{task.icon ? task.icon + ' ' : ''}{task.title}{TIME_ICON[task.time ?? ''] ?? ''}</Text>
          {completion && <Text style={{ color: C.warn, fontSize: 12, fontWeight: '700' }}>wartet</Text>}
        </View>
      ))}
    </View>
  );
}

type Pane = 'kalender' | 'stundenplan' | 'essen' | 'einkauf';
const PANES: { value: Pane; icon: string; label: string }[] = [
  { value: 'kalender', icon: '📅', label: 'Kalender' }, { value: 'stundenplan', icon: '🏫', label: 'Stundenplan' },
  { value: 'essen', icon: '🍽️', label: 'Essensplan' }, { value: 'einkauf', icon: '🛒', label: 'Einkaufsliste' },
];
const WDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

/** Stundenpläne aller Kinder als Wochenraster: Zeilen = Kinder, Spalten = Mo bis Fr. */
function WallTimetable({ data, kids, date }: { data: FamilyData; kids: Child[]; date: string }) {
  const [open, setOpen] = useState<string[]>([]);
  const all = open.length > 0 && open.length >= kids.length;
  const wd = new Date(date + 'T12:00:00').getDay(); // 1 = Montag
  const withPlan = kids.filter(k => k.timetable && Object.values(k.timetable).some(d => d && (d.from || d.to || d.lessons?.some(Boolean))));
  if (!withPlan.length) return <View style={s.card}><Text style={s.muted}>Noch kein Stundenplan eingetragen. Das geht in der Eltern-Ansicht unter Kalender › Stundenplan.</Text></View>;
  return (
    <View style={[s.card, { padding: 12, gap: 0 }]}>
      <View style={{ flexDirection: 'row' }}>
        <Pressable onPress={() => setOpen(all ? [] : kids.map(k => k.id))} style={{ width: 150, justifyContent: 'center' }} accessibilityRole="button">
          <Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>{all ? '▴ Alle zuklappen' : '▾ Alle aufklappen'}</Text>
        </Pressable>
        {WDAYS.map((d, i) => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: i + 1 === wd ? C.accent : C.fg }}>{d}</Text>
          </View>
        ))}
      </View>
      {withPlan.map(k => (
        <Pressable key={k.id} onPress={() => setOpen(o => (o.includes(k.id) ? o.filter(x => x !== k.id) : [...o, k.id]))} accessibilityRole="button" accessibilityLabel={`Stundenplan ${k.name} ${open.includes(k.id) ? 'zuklappen' : 'aufklappen'}`}
          style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 8, alignItems: 'stretch' }}>
          <View style={{ width: 150, flexDirection: 'row', alignItems: open.includes(k.id) ? 'flex-start' : 'center', gap: 10, paddingTop: open.includes(k.id) ? 6 : 0 }}>
            <Avatar name={k.name} color={k.color} photo={k.photo} size={36} />
            <Text style={[s.text, { fontWeight: '800', flex: 1 }]} numberOfLines={1}>{k.name}</Text>
            <Text style={{ color: C.muted, fontSize: 14, paddingRight: 6 }}>{open.includes(k.id) ? '▴' : '▾'}</Text>
          </View>
          {WDAYS.map((_, i) => {
            const day = k.timetable?.[String(i + 1) as '1'];
            const lessons = (day?.lessons ?? []).filter(Boolean);
            const today = i + 1 === wd;
            return (
              <View key={i} style={{ flex: 1, padding: 3 }}>
                <View style={{ flex: 1, borderRadius: 12, padding: 8, gap: 2, backgroundColor: day && (day.from || day.to) ? k.color + (today ? '33' : '17') : C.surface2, borderWidth: today ? 2 : 0, borderColor: k.color }}>
                  {day && (day.from || day.to) ? <Text style={{ fontWeight: '800', fontSize: 14, color: C.fg }}>{day.from ?? '?'}–{day.to ?? '?'}</Text> : <Text style={s.muted}>–</Text>}
                  {lessons.length > 0 && (open.includes(k.id)
                    ? <View style={{ gap: 3, marginTop: 4 }}>
                        {(day?.lessons ?? []).map((l, n) => l ? (
                          <View key={n} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            <Text style={{ width: 18, fontSize: 11, fontWeight: '800', color: k.color }}>{n + 1}.</Text>
                            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.fg }} numberOfLines={1}>{l}</Text>
                          </View>
                        ) : null)}
                      </View>
                    : <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{lessons.length} Stunden</Text>)}
                </View>
              </View>
            );
          })}
        </Pressable>
      ))}
    </View>
  );
}
