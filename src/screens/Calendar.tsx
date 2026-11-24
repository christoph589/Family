import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { GCal, GEvent, getMcp, GOOGLE_ERROR, listCalendars, listWeek } from '../data/google';
import { peopleOf, Person, today, uid } from '../data/logic';
import { CalEvent } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { baseItems, CalItem, CalMode, CalNav, CalViews, daysOf } from '../ui/CalViews';
import { C, s } from '../ui/theme';

const parse = (d: string) => new Date(d + 'T12:00:00');
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type Item = CalItem;

export function Calendar({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  const [mode, setMode] = useState<CalMode>('woche');
  const [anchor, setAnchor] = useState(today());
  const [google, setGoogle] = useState<GEvent[]>([]);
  const [gState, setGState] = useState<'off' | 'avail' | 'loading' | 'ok' | 'error'>('off');
  const [gMsg, setGMsg] = useState('');
  const [cals, setCals] = useState<GCal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const days = daysOf(mode, anchor);
  const calId = data?.settings?.googleCalendarId;

  useEffect(() => { getMcp().then(m => m && setGState(s => (s === 'off' ? 'avail' : s))); }, []);
  useEffect(() => {
    if (!calId) return;
    let on = true;
    setGState('loading');
    listWeek(calId, days[0], days[days.length - 1])
      .then(ev => { if (on) { setGoogle(ev); setGState('ok'); setGMsg(''); } })
      .catch(e => { if (on) { setGState('error'); setGMsg(GOOGLE_ERROR[e?.code] ?? 'Google Kalender konnte nicht geladen werden.'); } });
    return () => { on = false; };
  }, [calId, days[0], days.length]);

  if (!data) return null;
  const people = peopleOf(data);
  const personInTitle = (t: string) => people.find(k => t.toLowerCase().split(/[^\p{L}]+/u).includes(k.name.toLowerCase()));

  function itemsFor(date: string): Item[] {
    const g: Item[] = google.filter(e => e.date === date).map(e => {
      const kid = personInTitle(e.title);
      return { key: 'g' + e.id, time: e.time, title: e.title, color: kid?.color ?? '#4285f4', tag: 'Google' };
    });
    const base = baseItems(data!, date, parent ? null : childIds);
    const tasks = base.filter(i => i.key.startsWith('t'));
    return [...base.filter(i => !i.key.startsWith('t')), ...g].sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99')).concat(tasks);
  }

  async function connect() {
    setGMsg(''); setGState('loading');
    try { setCals(await listCalendars()); setGState('avail'); }
    catch (e: any) { setGState('error'); setGMsg(GOOGLE_ERROR[e?.code] ?? 'Google Kalender ist nicht erreichbar.'); }
  }

  return (
    <View style={{ gap: 16 }}>
      <CalNav mode={mode} anchor={anchor} onMode={setMode} onAnchor={setAnchor} right={parent ? <Button title="+ Termin" onPress={() => setAdding(true)} /> : undefined} />

      {adding && <EventForm people={people} days={daysOf('woche', anchor)} onCancel={() => setAdding(false)} onSave={ev => { update(d => ({ ...d, events: [...(d.events ?? []), ev] })); setAdding(false); }} />}

      <CalViews mode={mode} anchor={anchor} itemsFor={itemsFor} onPickDay={d => { setAnchor(d); setMode('tag'); }}
        renderItem={it => <EventRow key={it.key} item={it} canDelete={parent && !/^[gtsb]/.test(it.key)} onDelete={() => update(dd => ({ ...dd, events: (dd.events ?? []).filter(e => e.id !== it.key) }))} />} />

      {parent && gState !== 'off' && (
        <View style={s.card}>
          <Text style={s.label}>Google Kalender</Text>
          {calId ? (
            <View style={s.row}>
              <Text style={[s.text, { flex: 1 }]}>Zeigt: <Text style={{ fontWeight: '700' }}>{data.settings?.googleCalendarName}</Text>{gState === 'loading' ? ' · lädt …' : ''}</Text>
              <Button ghost title="Ändern" onPress={() => { update(d => ({ ...d, settings: { ...d.settings, googleCalendarId: undefined } })); setGoogle([]); connect(); }} />
            </View>
          ) : cals ? (
            <View style={{ gap: 8 }}>
              <Text style={s.muted}>Welchen Kalender soll die Familie sehen? Am besten einen eigenen Familienkalender, nicht den Arbeitskalender.</Text>
              <View style={[s.row, { gap: 8 }]}>
                {cals.map(c => (
                  <Pressable key={c.id} onPress={() => update(d => ({ ...d, settings: { ...d.settings, googleCalendarId: c.id, googleCalendarName: c.name } }))}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.accent }}>
                    <Text style={{ color: C.fg, fontWeight: '600' }}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={s.row}>
              <Text style={[s.muted, { flex: 1 }]}>Termine aus deinem Google Kalender hier anzeigen (nur lesen). Steht ein Name aus der Familie im Termin (z. B. „Papa“), bekommt er dessen Farbe.</Text>
              <Button title={gState === 'loading' ? 'Lädt …' : 'Verbinden'} disabled={gState === 'loading'} onPress={connect} />
            </View>
          )}
          {gMsg ? <Text style={{ color: C.danger }}>{gMsg}</Text> : null}
        </View>
      )}
    </View>
  );
}

function EventRow({ item, canDelete, onDelete }: { item: Item; canDelete: boolean; onDelete: () => void }) {
  const [ask, setAsk] = useState(false);
  return (
    <Pressable disabled={!canDelete} onPress={() => setAsk(a => !a)} style={{ borderLeftWidth: 4, borderLeftColor: item.color, backgroundColor: C.bg, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, gap: 2 }}>
      <Text style={[s.text, { fontSize: 14, fontWeight: '700' }]}>{item.time ? `${item.time} ` : ''}{item.title}</Text>
      {item.tag ? <Text style={[s.muted, { fontSize: 11 }]}>{item.tag}</Text> : null}
      {ask && <Pressable onPress={onDelete}><Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>Termin löschen</Text></Pressable>}
    </Pressable>
  );
}

function EventForm({ people, days, onSave, onCancel }: { people: Person[]; days: string[]; onSave: (e: CalEvent) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [date, setDate] = useState(days.includes(today()) ? today() : days[0]);
  const [time, setTime] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [weekly, setWeekly] = useState(false);
  const timeOk = !time || /^([01]?\d|2[0-3]):[0-5]\d$/.test(time);
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>Neuer Termin</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { width: 60, textAlign: 'center' }]} value={icon} onChangeText={t => setIcon(t.slice(0, 4))} placeholder="⚽" accessibilityLabel="Symbol" />
        <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder="z. B. Fußballtraining" />
      </View>
      <Text style={s.label}>Tag</Text>
      <Segmented value={date} onChange={setDate} options={days.map((d, i) => ({ value: d, label: `${WD[i]} ${parse(d).getDate()}.` }))} />
      <View style={s.row}>
        <TextInput style={[s.input, { width: 110 }]} value={time} onChangeText={setTime} placeholder="16:30" accessibilityLabel="Uhrzeit" />
        <Text style={s.muted}>Uhrzeit (optional)</Text>
      </View>
      {!timeOk && <Text style={{ color: C.danger }}>Uhrzeit bitte so: 16:30</Text>}
      <Text style={s.label}>Für wen</Text>
      <View style={[s.row, { gap: 8 }]}>
        {[{ id: '', name: 'Ganze Familie', color: C.accent }, ...people].map(k => {
          const on = k.id ? who.includes(k.id) : who.length === 0;
          return (
            <Pressable key={k.id || 'all'} onPress={() => setWho(w => (!k.id ? [] : w.includes(k.id) ? w.filter(x => x !== k.id) : [...w, k.id]))}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 2, borderColor: k.color, backgroundColor: on ? k.color : C.surface }}>
              <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{k.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => setWeekly(v => !v)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: weekly }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: weekly ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
          {weekly && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
        </View>
        <Text style={s.text}>Jede Woche</Text>
      </Pressable>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onCancel} />
        <Button title="Speichern" disabled={!title.trim() || !timeOk} onPress={() => onSave({ id: uid(), title: title.trim(), icon: icon.trim() || undefined, date, time: time ? time.padStart(5, '0') : undefined, who, weekly })} />
      </View>
    </View>
  );
}
