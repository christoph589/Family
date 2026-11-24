import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { birthdaysOn, holidayLabel, peopleOf, pointsOf, schoolOn, tasksFor, today } from '../data/logic';
import { TIME_ORDER } from '../data/templates';
const TIME_ICON: Record<string, string> = { morgens: ' 🌅', mittags: ' ☀️', abends: ' 🌙' };
import { Child, FamilyData } from '../data/types';
import { Button } from '../ui/Button';
import { baseItems, CalItem, CalMode, CalNav, CalViews, daysOf, matchesPeople } from '../ui/CalViews';
import { EventForm } from './Calendar';
import { mealsOn } from './Food';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, s } from '../ui/theme';
import { Avatar, PersonHead } from '../ui/Avatar';
import { useFeedItems } from '../data/feeds';

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
  const [confirmDel, setConfirmDel] = useState(false);
  const feedItems = useFeedItems(data?.settings?.feeds, data ? peopleOf(data) : []);
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
        <View style={[s.card, { width: wide ? 300 : '100%' }]}>
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
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: wide ? undefined : '100%' }}>
          {data.children.filter(c => !filter.length || filter.includes(c.id)).map(c => <KidColumn key={c.id} data={data} child={c} date={date} />)}
        </View>
      </View>

      <View style={[s.card, { gap: 12 }]}>
        <CalNav mode={mode} anchor={anchor} onMode={m => { setMode(m); setAnchor(date); AsyncStorage.setItem('familienplaner:boardView', m).catch(() => {}); }} onAnchor={setAnchor}
          right={<Button title="+ Termin" onPress={() => { setAdding(true); setSel(null); }} />} />
        {adding && <EventForm people={people} days={daysOf('woche', anchor)} onCancel={() => setAdding(false)} onSave={ev => { update(d => ({ ...d, events: [...(d.events ?? []), ev] })); setAdding(false); setAnchor(ev.date); }} />}
        {sel && (
          <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 8, borderLeftWidth: 6, borderLeftColor: sel.it.color }}>
            <Text style={s.h2}>{sel.it.title}</Text>
            <Text style={s.muted}>{new Date(sel.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}{sel.it.time ? `, ${sel.it.time}${sel.it.end ? ' bis ' + sel.it.end : ''}` : ', ganztägig'}{sel.it.tag ? ` · ${sel.it.tag}` : ''}</Text>
            <View style={s.row}>
              {(data.events ?? []).some(e => e.id === sel.it.key) && (confirmDel
                ? <><Text style={s.text}>Wirklich löschen?</Text><Button title="Ja, löschen" color={C.danger} onPress={() => { update(d => ({ ...d, events: (d.events ?? []).filter(e => e.id !== sel.it.key) })); setSel(null); setConfirmDel(false); }} /></>
                : <Button ghost title="Termin löschen" onPress={() => setConfirmDel(true)} />)}
              <Button ghost title="Schließen" onPress={() => { setSel(null); setConfirmDel(false); }} />
            </View>
          </View>
        )}
        <CalViews flat mode={mode} anchor={anchor} itemsFor={d => [...baseItems(data, d, null), ...feedItems(d)].sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99')).filter(i => matchesPeople(i, filter))}
          onItemPress={(it, d) => { setSel({ it, date: d }); setConfirmDel(false); setAdding(false); }} onPickDay={d => { setAnchor(d); setMode('tag'); }} />
      </View>
      <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>Abhaken geht auf den Geräten der Kinder oder in der Eltern-Ansicht. Termine kann hier jeder eintragen.</Text>
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
          <Text style={{ color: C.muted, fontSize: big ? 13 : 11 }}>{e.tag}</Text>
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
