import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { GCal, GEvent, getMcp, GOOGLE_ERROR, listCalendars, listWeek } from '../data/google';
import { peopleOf, Person, today, uid } from '../data/logic';
import { CalEvent } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { guessIcon, IconPicker } from '../ui/IconPicker';
import { baseItems, CalItem, CalMode, CalNav, CalViews, daysOf } from '../ui/CalViews';
import { C, s } from '../ui/theme';
import { useFeedItems } from '../data/feeds';
import { LetterImport } from './Letter';
import { PushSetup } from '../ui/Push';

const parse = (d: string) => new Date(d + 'T12:00:00');

type Item = CalItem;

export function Calendar({ childIds, parent, meId }: { childIds: string[]; parent: boolean; meId?: string }) {
  const { data, update } = useFamily();
  const [mode, setMode] = useState<CalMode>('woche');
  const [sel, setSel] = useState<{ it: CalItem; date: string } | null>(null);
  const [anchor, setAnchor] = useState(today());
  const [google, setGoogle] = useState<GEvent[]>([]);
  const [gState, setGState] = useState<'off' | 'avail' | 'loading' | 'ok' | 'error'>('off');
  const [gMsg, setGMsg] = useState('');
  const [cals, setCals] = useState<GCal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [letter, setLetter] = useState(false);
  // Kinder sehen zuerst nur ihre eigenen Termine und die der ganzen Familie
  const [all, setAll] = useState(false);
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

  const feedItems = useFeedItems(data?.settings?.feeds, data ? peopleOf(data) : []);
  if (!data) return null;
  const people = peopleOf(data);
  const personInTitle = (t: string) => people.find(k => t.toLowerCase().split(/[^\p{L}]+/u).includes(k.name.toLowerCase()));

  function itemsFor(date: string): Item[] {
    const mine = !parent && !all;
    const g: Item[] = google.filter(e => e.date === date).map(e => {
      const kid = personInTitle(e.title);
      return { key: 'g' + e.id, time: e.time, title: e.title, color: kid?.color ?? '#4285f4', tag: 'Google', kid: kid?.id };
    }).filter(e => !mine || (e.kid && childIds.includes(e.kid))).map(({ kid, ...e }) => e);
    const base = baseItems(data!, date, parent || all ? null : childIds, mine);
    const ext = feedItems(date).filter(i => !mine || !i.who?.length || i.who.some(w => childIds.includes(w)));
    const tasks = base.filter(i => i.key.startsWith('t'));
    return [...base.filter(i => !i.key.startsWith('t')), ...g, ...ext].sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99')).concat(tasks);
  }

  async function connect() {
    setGMsg(''); setGState('loading');
    try { setCals(await listCalendars()); setGState('avail'); }
    catch (e: any) { setGState('error'); setGMsg(GOOGLE_ERROR[e?.code] ?? 'Google Kalender ist nicht erreichbar.'); }
  }

  return (
    <View style={{ gap: 16 }}>
      <CalNav mode={mode} anchor={anchor} onMode={setMode} onAnchor={setAnchor} right={parent ? <View style={[s.row, { gap: 8 }]}><Button ghost title="📄 Elternbrief" onPress={() => setLetter(true)} /><Button title="+ Termin" onPress={() => setAdding(true)} /></View> : undefined} />

      {adding && <EventForm people={people} days={daysOf('woche', anchor)} onCancel={() => setAdding(false)} onSave={ev => { update(d => ({ ...d, events: [...(d.events ?? []), ev] })); setAdding(false); setAnchor(ev.date); }} />}

      {editing && <EventForm key={editing.id} initial={editing} people={people} days={daysOf('woche', anchor)} onCancel={() => setEditing(null)} onSave={ev => { update(d => ({ ...d, events: (d.events ?? []).map(e => (e.id === ev.id ? ev : e)) })); setEditing(null); }} />}
      {letter && <LetterImport onDone={n => { setLetter(false); }} />}

      {sel && (
        <View style={[s.card, { borderLeftWidth: 6, borderLeftColor: sel.it.color }]}>
          <Text style={s.h2}>{sel.it.title}</Text>
          <Text style={s.muted}>{new Date(sel.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}{sel.it.time ? `, ${sel.it.time}${sel.it.end ? ' bis ' + sel.it.end : ''}` : ', ganztägig'}{sel.it.tag ? ` · ${sel.it.tag}` : ''}</Text>
          {(() => { const ev = (data.events ?? []).find(e => e.id === sel.it.key); if (!ev) return null; const dt = driveText(ev, people); return (<>
            {dt ? <Text style={[s.text, { fontWeight: '700' }]}>{dt}</Text> : null}
            {ev.note ? <Text style={s.text}>📝 {ev.note}</Text> : null}
            {ev.remind !== undefined ? <Text style={s.muted}>{remindLabel(ev.remind)}</Text> : null}
          </>); })()}
          <View style={s.row}>
            {parent && (data.events ?? []).some(e => e.id === sel.it.key) && <Button ghost title="✏️ Bearbeiten" onPress={() => { setEditing((data.events ?? []).find(e => e.id === sel.it.key) ?? null); setSel(null); }} />}
            {parent && (data.events ?? []).some(e => e.id === sel.it.key) && <Button title="Termin löschen" color={C.danger} onPress={() => { update(dd => ({ ...dd, events: (dd.events ?? []).filter(e => e.id !== sel.it.key) })); setSel(null); }} />}
            <Button ghost title="Schließen" onPress={() => setSel(null)} />
          </View>
        </View>
      )}
      {!parent && (
        <Segmented value={all ? 'alle' : 'meine'} onChange={v => setAll(v === 'alle')} options={[{ value: 'meine', label: '👤 Meine Termine' }, { value: 'alle', label: '👨‍👩‍👧 Ganze Familie' }]} />
      )}
      <CalViews mode={mode} anchor={anchor} itemsFor={itemsFor} onItemPress={(it, date) => setSel({ it, date })} onPickDay={d => { setAnchor(d); setMode('tag'); }}
        renderItem={it => <EventRow key={it.key} item={it} canDelete={parent && !/^[gtsb]/.test(it.key)} onDelete={() => update(dd => ({ ...dd, events: (dd.events ?? []).filter(e => e.id !== it.key) }))} />} />
      <PushSetup meId={meId} />

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

export function EventForm({ people, days, onSave, onCancel, initial }: { people: Person[]; days: string[]; onSave: (e: CalEvent) => void; onCancel: () => void; initial?: CalEvent }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [iconTouched, setIconTouched] = useState(!!initial);
  const [date, setDate] = useState(initial?.date ?? (days.includes(today()) ? today() : days[0]));
  const [time, setTime] = useState(initial?.time ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [who, setWho] = useState<string[]>(initial?.who ?? []);
  const [weekly, setWeekly] = useState(!!initial?.weekly);
  const [bring, setBring] = useState(initial?.bring ?? '');
  const [pick, setPick] = useState(initial?.pick ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [remind, setRemind] = useState<number | undefined>(initial ? initial.remind : 60);
  const adults = people.filter(p => p.role === 'eltern');
  const re = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const fix = (t: string) => t.padStart(5, '0');
  const addMin = (t: string, n: number) => { const x = Math.min(23 * 60 + 59, +t.slice(0, 2) * 60 + +t.slice(3, 5) + n); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const timeOk = (!time || re.test(time)) && (!end || (re.test(end) && !!time && fix(end) > fix(time)));
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>{initial ? 'Termin bearbeiten' : 'Neuer Termin'}</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <IconPicker value={icon} onChange={v => { setIcon(v); setIconTouched(true); }} />
        <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={t => { setTitle(t); if (!iconTouched) setIcon(guessIcon(t)); }} placeholder="z. B. Fußballtraining" accessibilityLabel="Titel" />
      </View>
      <Text style={s.label}>Tag</Text>
      <View style={s.row}>
        <DateField value={date} onChange={v => v && setDate(v)} label="Datum" />
      </View>
      <Text style={s.label}>Uhrzeit</Text>
      <View style={s.row}>
        <Pressable onPress={() => { setTime(''); setEnd(''); }} style={[s.chip, { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: !time ? C.accent : C.surface2 }]}>
          <Text style={{ fontWeight: '700', color: !time ? '#fff' : C.fg }}>Ganztägig</Text>
        </Pressable>
        <DateField type="time" value={time} onChange={v => { setTime(v); if (v && (!end || fix(end) <= fix(v))) setEnd(addMin(v, 60)); }} label="Uhrzeit" placeholder="Beginn" />
        <Text style={s.muted}>bis</Text>
        <DateField type="time" value={end} onChange={setEnd} label="Ende" placeholder="Ende" clearable />
      </View>
      {!!time && (
        <View style={[s.row, { gap: 8 }]}>
          <Text style={s.muted}>Dauer:</Text>
          {[30, 60, 90, 120, 180].map(n => {
            const on = end === addMin(time, n);
            return (
              <Pressable key={n} onPress={() => setEnd(addMin(time, n))} style={[s.chip, { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: on ? C.accent : C.bg }]}>
                <Text style={{ fontWeight: '700', color: on ? '#fff' : C.fg }}>{n < 60 ? `${n} Min` : `${n / 60} Std`.replace('.5', ',5')}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!timeOk && <Text style={{ color: C.danger }}>Uhrzeit bitte so: 16:30. Das Ende muss nach dem Beginn liegen.</Text>}
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
      <Text style={s.label}>Wer fährt? (optional)</Text>
      <DriverRow label="🚗 Bringt" adults={adults} value={bring} onChange={setBring} />
      <DriverRow label="🏠 Holt ab" adults={adults} value={pick} onChange={setPick} />
      <Text style={s.label}>🔔 Erinnerung</Text>
      <View style={[s.row, { gap: 8 }]}>
        {REMINDERS.map(r => {
          const on = remind === r.value;
          return (
            <Pressable key={String(r.value)} onPress={() => setRemind(r.value)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[s.chip, { paddingVertical: 7, paddingHorizontal: 12, backgroundColor: on ? C.accent : C.bg }]}>
              <Text style={{ fontWeight: '700', color: on ? '#fff' : C.fg }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.label}>Notiz (optional)</Text>
      <TextInput style={s.input} value={note} onChangeText={setNote} placeholder="z. B. Mitbringen: Turnbeutel, 5 €" accessibilityLabel="Notiz" />
      <Pressable onPress={() => setWeekly(v => !v)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: weekly }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: weekly ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
          {weekly && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
        </View>
        <Text style={s.text}>Jede Woche</Text>
      </Pressable>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onCancel} />
        <Button title="Speichern" disabled={!title.trim() || !timeOk} onPress={() => onSave({ id: initial?.id ?? uid(), title: title.trim(), icon: icon.trim() || undefined, date, time: time ? fix(time) : undefined, end: time && end ? fix(end) : undefined, who, weekly, bring: bring.trim() || undefined, pick: pick.trim() || undefined, note: note.trim() || undefined, remind })} />
      </View>
    </View>
  );
}

function DriverRow({ label, adults, value, onChange }: { label: string; adults: Person[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[s.row, { gap: 8, alignItems: 'center' }]}>
      <Text style={[s.text, { width: 84, fontWeight: '700' }]}>{label}</Text>
      {adults.map(a => {
        const on = value === a.id;
        return (
          <Pressable key={a.id} onPress={() => onChange(on ? '' : a.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: a.color, backgroundColor: on ? a.color : C.surface }}>
            <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{a.name}</Text>
          </Pressable>
        );
      })}
      <TextInput style={[s.input, { flexGrow: 1, flexBasis: 140, minWidth: 120, paddingVertical: 8 }]} value={adults.some(a => a.id === value) ? '' : value}
        onChangeText={onChange} placeholder="oder: z. B. Oma, Fahrgemeinschaft" accessibilityLabel={`${label}: andere Person`} />
    </View>
  );
}

export const REMINDERS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: 'Keine' }, { value: 15, label: '15 Min vorher' }, { value: 60, label: '1 Std vorher' },
  { value: -1, label: 'Vorabend' }, { value: 1440, label: '1 Tag vorher' },
];
export const remindLabel = (v?: number) => (v === undefined ? '' : `🔔 ${REMINDERS.find(r => r.value === v)?.label ?? `${v} Min vorher`}`);

/** "🚗 Papa bringt · 🏠 Mama holt ab" */
export function driveText(e: { bring?: string; pick?: string }, people: { id: string; name: string }[]) {
  const n = (id?: string) => (id ? people.find(p => p.id === id)?.name ?? id : undefined);
  const b = n(e.bring), p = n(e.pick);
  if (b && p && b === p) return `🚗 ${b} fährt hin und zurück`;
  return [b && `🚗 ${b} bringt`, p && `🏠 ${p} holt ab`].filter(Boolean).join(' · ');
}
