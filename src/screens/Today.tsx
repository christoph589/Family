import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { Button } from '../ui/Button';
import { useFamily } from '../data/FamilyContext';
import { confirm, eventsOn, holidayLabel, peopleOf, pointsOf, tasksFor, today, toggleByChild, undoConfirm, REPEAT_LABEL, schoolOn, schoolOff, setSchoolChange, gradeLabel, ageOf, birthdaysOn, giveBirthdayBonus, BIRTHDAY_BONUS } from '../data/logic';
import { Child, TaskKind } from '../data/types';
import { C, s, SHADOW, TINT } from '../ui/theme';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { driveText } from './Calendar';
import { EmergencyCard } from './Emergency';
import { WeatherCard } from '../ui/Weather';
import { TrainCards } from '../ui/Train';
import { QuestStrip } from './Quest';
import { shoppingFor, untilLabel } from './Food';
import { TIME_LABEL, TIME_ORDER } from '../data/templates';
import { dueCount, liveStreak } from '../data/vocab';
import { studyToday } from '../data/studyplan';
import { dayText } from './StudyPack';

export function Today({ childIds, parent, meId, admin }: { childIds: string[]; parent: boolean; meId?: string; admin?: boolean }) {
  const { data, update } = useFamily();
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const people = peopleOf(data);
  const events = eventsOn(data, today(), parent ? null : childIds, true, meId);
  const holiday = holidayLabel(data, today(), kids.length === 1 ? kids[0].id : undefined);
  const bdays = birthdaysOn(data, today()).filter(b => parent || childIds.includes(b.child.id));
  const year = Number(today().slice(0, 4));
  return (
    <View style={{ gap: 16 }}>
      {bdays.map(({ child, age }) => (
        <View key={child.id} style={[s.card, { backgroundColor: child.color, alignItems: 'center', paddingVertical: 24 }]}>
                    <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' }}>Alles Gute zum Geburtstag, {child.name}!</Text>
          {age !== undefined && <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Heute wirst du {age}.</Text>}
          {parent && data.birthdayBonus?.[child.id] !== year && (
            <Pressable onPress={() => update(d => giveBirthdayBonus(d, child.id))} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: child.color, fontWeight: '800' }}>Geburtstagsbonus +{BIRTHDAY_BONUS} Punkte</Text>
            </Pressable>
          )}
          {data.birthdayBonus?.[child.id] === year && <Text style={{ color: '#fff', fontWeight: '700' }}>+{BIRTHDAY_BONUS} Geburtstagspunkte sind da!</Text>}
        </View>
      ))}
      {holiday && (
        <View style={[s.card, { backgroundColor: C.warnSoft, flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={[s.text, { fontWeight: '800', flex: 1 }]}>{holiday}. Schulaufgaben machen Pause.</Text>
        </View>
      )}
      <TrainCards childIds={parent ? undefined : childIds} />
      <WeatherCard admin={admin} />
      {events.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Heute geplant</Text>
          <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
            {events.map((e, i) => {
              const ps = e.who.map(w => people.find(p => p.id === w)).filter(Boolean) as typeof people;
              const color = ps.length === 1 ? ps[0].color : C.accent;
              return (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <View style={{ minWidth: 56, height: 36, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '24' }}>
                    <Text style={{ color: ps.length === 1 ? color : C.accent, fontWeight: '800', fontSize: 13.5 }}>{e.time ?? 'Ganztag'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Clip style={[s.text, { fontWeight: '700', fontSize: 15.5 }]} lines={1}>{e.title}</Clip>
                    <View style={[s.row, { gap: 4 }]}>
                      {ps.length ? ps.map(p => <Avatar key={p.id} name={p.name} color={p.color} photo={p.photo} size={16} />) : null}
                      <Text style={[s.muted, { fontSize: 12.5 }]} numberOfLines={1}>{ps.length ? ps.map(p => p.name).join(', ') : 'Ganze Familie'}{e.end ? ` · bis ${e.end}` : ''}</Text>
                    </View>
                    {driveText(e, people) ? <Clip style={[s.text, { fontSize: 13, fontWeight: '600', marginTop: 3 }]} lines={1}>{driveText(e, people)}</Clip> : null}
                    {e.note ? <Clip style={[s.muted, { fontSize: 12, marginTop: 2 }]} lines={2}>{e.note}</Clip> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
      {parent && kids.length > 1 ? <KidOverview kids={kids} /> : (
        <View style={[s.row, { alignItems: 'flex-start', gap: 18 }]}>
          {kids.map(k => <ChildColumn key={k.id} child={k} parent={parent} />)}
        </View>
      )}
    </View>
  );
}

/** Eltern mit mehreren Kindern: pro Kind eine kurze Zeile. Antippen zeigt alle Aufgaben des Kindes. */
function KidOverview({ kids }: { kids: Child[] }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  const date = today();
  const sel = kids.find(k => k.id === open);
  if (sel) return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={() => setOpen(null)} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 }}>
        <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>← Alle Kinder</Text>
      </Pressable>
      <View style={[s.row, { alignItems: 'flex-start' }]}><ChildColumn child={sel} parent /></View>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>Kinder heute</Text>
      {kids.map(child => {
        const items = tasksFor(data!, child.id, date);
        const done = items.filter(i => i.completion?.status === 'bestaetigt').length;
        const wait = items.filter(i => i.completion?.status === 'wartet');
        const special = items.filter(i => i.task.special && i.completion?.status !== 'bestaetigt').length;
        const pct = items.length ? done / items.length : 0;
        return (
          <Pressable key={child.id} onPress={() => setOpen(child.id)} accessibilityRole="button" accessibilityLabel={`${child.name}: ${done} von ${items.length} erledigt`}
            style={[{ backgroundColor: C.surface, borderRadius: 18, padding: 14, gap: 10, borderLeftWidth: 5, borderLeftColor: child.color }, SHADOW.sm]}>
            <View style={[s.row, { flexWrap: 'nowrap', gap: 12 }]}>
              <Avatar name={child.name} color={child.color} photo={child.photo} size={46} />
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={[s.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
                  <Text style={[s.text, { fontWeight: '800', fontSize: 17, flexShrink: 1 }]} numberOfLines={1}>{child.name}</Text>
                  <View style={[s.row, { gap: 4, flexWrap: 'nowrap' }]}><Icon name="star" size={15} color={C.muted} /><Text style={{ fontWeight: '700', color: C.fg }}>{pointsOf(data!, child.id)}</Text></View>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct >= 1 ? C.ok : child.color, borderRadius: 4 }} />
                </View>
                <Text style={[s.muted, { fontSize: 13 }]}>{items.length ? (pct >= 1 ? `Alles erledigt (${items.length})` : `${done} von ${items.length} erledigt`) : 'Heute keine Aufgaben'}{special ? ` · ${special} Sonderaufgabe${special > 1 ? 'n' : ''}` : ''}</Text>
              </View>
              <Icon name="chev" size={18} color={C.muted} />
            </View>
            {wait.length > 0 && (
              <Pressable onPress={() => update(d => wait.reduce((x, i) => confirm(x, i.task, date), d))} accessibilityRole="button"
                style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.warnSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 8 }]}>
                <Text style={[s.text, { flex: 1, fontSize: 14, fontWeight: '700', color: C.warn }]} numberOfLines={1}>{wait.length} warten: {wait.map(i => i.task.title).join(', ')}</Text>
                <View style={{ backgroundColor: C.ok, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Alle bestätigen</Text></View>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function ChildColumn({ child, parent }: { child: Child; parent: boolean }) {
  const { data, update } = useFamily();
  const [sos, setSos] = useState(false);
  const [chg, setChg] = useState(false);
  const date = today();
  const items = tasksFor(data!, child.id, date);
  const done = items.filter(i => i.completion?.status === 'bestaetigt').length;
  const pct = items.length ? (done / items.length) * 100 : 0;
  const group = (kind: TaskKind | 'special', label: string) => {
    const list = items.filter(i => (kind === 'special' ? !!i.task.special : !i.task.special && i.task.kind === kind)).sort((a, b) => TIME_ORDER[a.task.time ?? ''] - TIME_ORDER[b.task.time ?? '']);
    if (!list.length) return null;
    return (
      <View style={{ gap: 6 }}>
        <Text style={s.label}>{label}</Text>
        <View style={{ backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
        {list.map(({ task, completion }, i) => {
          const st = completion?.status;
          const sp = task.special, late = !!sp?.until && sp.until < date && st !== 'bestaetigt';
          const bg = st === 'wartet' ? C.warnSoft : sp ? C.warnSoft : 'transparent';
          return (
            <View key={task.id} style={[s.row, { backgroundColor: bg, paddingVertical: 10, paddingHorizontal: 12, flexWrap: 'nowrap', gap: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: st === 'bestaetigt' ? 0.55 : 1 }]}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!st }} accessibilityLabel={task.title}
                onPress={() => update(d => (st === 'bestaetigt' && !task.selfCheck ? (parent ? undoConfirm(d, task, date) : d) : toggleByChild(d, task, date)))}
                style={{ width: 32, height: 32, borderRadius: 16, borderWidth: st ? 0 : 2, borderColor: '#c9c6bd', backgroundColor: st === 'bestaetigt' ? C.ok : st === 'wartet' ? C.warn : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {st === 'bestaetigt' ? <Icon name="check" size={18} color="#fff" stroke={2.6} /> : st === 'wartet' ? <Icon name="check" size={18} color="#fff" stroke={2.6} /> : null}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Clip style={[s.text, { fontWeight: '600', fontSize: 15.5, textDecorationLine: st === 'bestaetigt' ? 'line-through' : 'none' }]} lines={2} longPress>{task.title}</Clip>
                <Text style={[s.muted, { fontSize: 12.5, color: st === 'wartet' ? C.warn : C.muted, fontWeight: st === 'wartet' || late ? '700' : '400' }, late ? { color: C.danger } : null]}>{st === 'wartet' ? 'Wartet auf Eltern' : sp && st !== 'bestaetigt' ? `Sonderaufgabe${sp.until ? (late ? ' · Frist vorbei' : ` · bis ${sp.until.slice(8, 10)}.${sp.until.slice(5, 7)}.`) : ''}` : st === 'bestaetigt' ? (task.selfCheck ? 'Erledigt' : 'Bestätigt') : task.time ? TIME_LABEL[task.time] : task.repeat === 'einmal' ? 'Heute' : REPEAT_LABEL[task.repeat]}</Text>
              </View>
              {parent && st !== 'bestaetigt' ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${task.title} bestätigen, plus ${task.points} Punkte`} onPress={() => update(d => confirm(d, task, date))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.ok, paddingHorizontal: 12, height: 34, borderRadius: 17 }}>
                  <Icon name="check" size={15} color="#fff" stroke={2.6} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+{task.points}</Text>
                </Pressable>
              ) : (
                <View style={[s.chip, { backgroundColor: C.accentSoft }]}><Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>+{task.points}</Text></View>
              )}
            </View>
          );
        })}
        </View>
      </View>
    );
  };
  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 330, padding: 0, overflow: 'hidden', gap: 0 }]}>
      <View style={{ padding: 16, gap: 12, borderLeftWidth: 6, borderLeftColor: child.color, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={[s.row, { flexWrap: 'nowrap', gap: 12 }]}>
          <Avatar name={child.name} color={child.color} photo={child.photo} size={46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.fg, fontSize: 21, fontWeight: '700', letterSpacing: -0.3 }} numberOfLines={1}>{child.name}</Text>
            {gradeLabel(child) ? <Text style={{ color: C.muted, fontSize: 13, fontWeight: '500' }}>{gradeLabel(child)}{ageOf(child) !== undefined ? ` · ${ageOf(child)} Jahre` : ''}</Text> : null}
          </View>
          {parent && (
            <Pressable onPress={() => setSos(true)} accessibilityRole="button" accessibilityLabel={`Notfall-Karte ${child.name}`}
              style={{ height: 34, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#fbe4e1', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.danger }}>SOS</Text>
            </Pressable>
          )}
          {sos && <EmergencyCard child={child} onClose={() => setSos(false)} />}
          <View style={[s.row, { gap: 5, flexWrap: 'nowrap', backgroundColor: C.surface2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 }]}>
            <Icon name="star" size={16} color={C.fg} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.fg }}>{pointsOf(data!, child.id)}</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: C.muted, fontWeight: '600', fontSize: 13 }}>{items.length ? (done === items.length ? 'Alles geschafft!' : `${done} von ${items.length} erledigt`) : 'Heute frei'}</Text>
            {(() => {
              const sd = schoolOn(data!, child.id, date) as (ReturnType<typeof schoolOn> & { changed?: boolean }) | null, off = schoolOff(data!, child.id, date);
              if (!sd && !off) return null;
              return (
                <Pressable onPress={() => setChg(x => !x)} accessibilityRole="button" accessibilityLabel="Schulzeit heute ändern"
                  style={{ backgroundColor: sd?.changed || off ? C.warnSoft : C.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: sd?.changed || off ? C.warn : C.muted, fontWeight: '700', fontSize: 13 }}>{off ? 'Schule: heute frei ✎' : `Schule ${sd!.from ?? '?'}–${sd!.to ?? '?'}${sd!.changed ? ' (früher aus)' : ''} ✎`}</Text>
                </Pressable>
              );
            })()}
          </View>
          {chg && <SchoolChange child={child} date={date} by={parent ? 'eltern' : child.id} onDone={() => setChg(false)} />}
          <View style={{ height: 6, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, backgroundColor: child.color, borderRadius: 99 }} />
          </View>
        </View>
      </View>
      <View style={{ padding: 16, gap: 14 }}>
      <QuestStrip child={child} parent={parent} />
      {(() => {
        const lessons = (schoolOn(data!, child.id, date)?.lessons ?? []).filter(Boolean);
        return lessons.length ? <Clip style={[s.muted, { fontSize: 13 }]} lines={2}>{lessons.join(' · ')}</Clip> : null;
      })()}
      {(() => {
        const n = dueCount(data!, child.id), st = liveStreak(data!, child.id);
        const doneToday = data!.vocabStats?.[child.id]?.last === date;
        if (!n && !(st && !doneToday)) return null;
        return (
          <View style={[s.row, { alignItems: 'center', backgroundColor: TINT[1], borderRadius: 14, padding: 12, flexWrap: 'nowrap' }]}>
            <Text style={[s.text, { fontSize: 14, flexShrink: 1 }]}>
              {n ? <Text style={{ fontWeight: '800' }}>{n} Vokabeln warten</Text> : <Text style={{ fontWeight: '800' }}>Vokabel-Serie retten</Text>}
              {st ? <Text style={{ color: C.muted }}>{doneToday ? ` · ${st} Tage am Stück` : ` · ${st} Tage Serie, heute noch üben`}</Text> : <Text style={{ color: C.muted }}> · unter Lernen</Text>}
            </Text>
          </View>
        );
      })()}
      {studyToday(data!, child.id, date).map(({ prep, day, days }) => (
        <View key={prep.id} style={[s.row, { alignItems: 'center', backgroundColor: day.done ? C.okSoft : TINT[0], borderRadius: 14, padding: 12, flexWrap: 'nowrap', gap: 10 }]}>
          <View style={{ flexShrink: 0 }}><Icon name={day.done ? 'check' : 'book'} size={18} color={day.done ? C.ok : C.accent} stroke={2.2} /></View>
          <Text style={[s.text, { fontSize: 14, flex: 1 }]}>
            <Text style={{ fontWeight: '800' }}>{prep.subject}{days !== null ? (days === 1 ? ', Arbeit morgen' : `, Arbeit in ${days} Tagen`) : ''}</Text>
            <Text style={{ color: day.done ? C.ok : C.fg }}>{day.done ? ' · Heute geschafft' : ` · ${dayText(day)} (${day.minutes} Min)`}</Text>
            {!day.done && <Text style={{ color: C.muted }}> · unter Lernen</Text>}
          </Text>
        </View>
      ))}
      {(() => {
        const need = shoppingFor(data!, child.id);
        if (!need.length) return null;
        return (
          <View style={{ backgroundColor: C.accentSoft, borderRadius: 14, padding: 12, gap: 4 }}>
            <Text style={[s.label, { color: C.accent }]}>Braucht</Text>
            {need.map(i => { const u = untilLabel(i.until); return (
              <Text key={i.id} style={[s.text, { fontSize: 15 }]}><Text style={{ fontWeight: '700' }}>{i.title}</Text>{u ? <Text style={{ color: u.urgent ? C.danger : C.muted, fontSize: 13, fontWeight: u.urgent ? '800' : '500' }}>  {u.text}</Text> : null}{i.store ? <Text style={{ color: C.muted, fontSize: 13 }}> · {i.store}</Text> : null}</Text>
            ); })}
          </View>
        );
      })()}
      {group('special', 'Sonderaufgaben')}
      {group('routine', 'Routinen')}
      {group('hausaufgabe', 'Schule')}
      {group('pflicht', 'Haushalt')}
      {items.length === 0 && !studyToday(data!, child.id, date).length && <Text style={[s.muted, { textAlign: 'center', paddingVertical: 8 }]}>Heute steht nichts an.</Text>}
      </View>
    </View>
  );
}

/** Heute anders als im Stundenplan: früher aus oder ganz frei. Kinder dürfen das selbst eintragen. */
function SchoolChange({ child, date, by, onDone }: { child: Child; date: string; by: string; onDone: () => void }) {
  const { data, update } = useFamily();
  const cur = child.schoolChange?.[date];
  const [to, setTo] = useState(cur?.to ?? '');
  const ok = /^([01]?\d|2[0-3])[:.]?[0-5]\d$/.test(to.trim());
  const fix = (v: string) => { const m = v.trim().replace('.', ':'); return m.includes(':') ? m.padStart(5, '0') : `${m.slice(0, -2).padStart(2, '0')}:${m.slice(-2)}`; };
  const set = (ch: { to?: string; off?: boolean } | null) => { update(d => setSchoolChange(d, child.id, date, ch ? { ...ch, by } : null)); onDone(); };
  if (!data) return null;
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: 12, gap: 8 }}>
      <Text style={{ fontWeight: '800', color: C.fg }}>Schule heute anders?</Text>
      <View style={[s.row, { gap: 8 }]}>
        <TextInput style={[s.input, { width: 96, paddingVertical: 8, textAlign: 'center' }]} value={to} onChangeText={setTo} placeholder="11:30" keyboardType="numbers-and-punctuation" accessibilityLabel="Schule aus um" />
        <Button title="Früher aus" disabled={!ok} onPress={() => set({ to: fix(to) })} style={{ paddingVertical: 8, minHeight: 40 }} />
        <Button ghost title="Ganz frei" onPress={() => set({ off: true })} style={{ paddingVertical: 8, minHeight: 40 }} />
        {cur && <Button ghost title="Wie im Plan" onPress={() => set(null)} style={{ paddingVertical: 8, minHeight: 40 }} />}
      </View>
      <Text style={[s.muted, { fontSize: 12 }]}>Gilt nur für heute. Kalender und Wandansicht zeigen es gleich.</Text>
    </View>
  );
}
