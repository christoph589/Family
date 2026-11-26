import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { Button } from '../ui/Button';
import { useFamily } from '../data/FamilyContext';
import { confirm, eventsOn, holidayLabel, peopleOf, pointsOf, tasksFor, today, toggleByChild, undoConfirm, REPEAT_LABEL, schoolOn, schoolOff, setSchoolChange, gradeLabel, ageOf, birthdaysOn, giveBirthdayBonus, BIRTHDAY_BONUS } from '../data/logic';
import { Child, TaskKind } from '../data/types';
import { C, grad, s, SHADOW } from '../ui/theme';
import { Avatar } from '../ui/Avatar';
import { driveText } from './Calendar';
import { EmergencyCard } from './Emergency';
import { WeatherCard } from '../ui/Weather';
import { TrainCards } from '../ui/Train';
import { QuestStrip } from './Quest';
import { shoppingFor, untilLabel } from './Food';
import { TIME_LABEL, TIME_ORDER } from '../data/templates';
import { dueCount, liveStreak } from '../data/vocab';

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
          <Text style={{ fontSize: 48 }}>🎂🎉🎈</Text>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' }}>Alles Gute zum Geburtstag, {child.name}!</Text>
          {age !== undefined && <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Heute wirst du {age}.</Text>}
          {parent && data.birthdayBonus?.[child.id] !== year && (
            <Pressable onPress={() => update(d => giveBirthdayBonus(d, child.id))} style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: child.color, fontWeight: '800' }}>🎁 Geburtstagsbonus +{BIRTHDAY_BONUS} Punkte</Text>
            </Pressable>
          )}
          {data.birthdayBonus?.[child.id] === year && <Text style={{ color: '#fff', fontWeight: '700' }}>🎁 +{BIRTHDAY_BONUS} Geburtstagspunkte sind da!</Text>}
        </View>
      ))}
      {holiday && (
        <View style={[s.card, { backgroundColor: C.warnSoft, flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={{ fontSize: 28 }}>🏖️</Text>
          <Text style={[s.text, { fontWeight: '800', flex: 1 }]}>{holiday}. Schulaufgaben machen Pause.</Text>
        </View>
      )}
      <TrainCards childIds={parent ? undefined : childIds} />
      <WeatherCard admin={admin} />
      {events.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Heute geplant</Text>
          <View style={[s.row, { gap: 10 }]}>
            {events.map(e => {
              const ps = e.who.map(w => people.find(p => p.id === w)).filter(Boolean) as typeof people;
              const color = ps.length === 1 ? ps[0].color : C.accent;
              return (
                <View key={e.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 20, padding: 12, paddingRight: 16, minWidth: 220, flexGrow: 1, flexBasis: 220 }, SHADOW.sm]}>
                  <View style={{ width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...grad(color, color + 'b3') }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: e.time ? 15 : 22 }}>{e.time ?? (e.icon || '📌')}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Clip style={[s.text, { fontWeight: '800' }]} lines={1}>{e.icon && e.time ? e.icon + ' ' : ''}{e.title}</Clip>
                    <View style={[s.row, { gap: 4, marginTop: 4 }]}>
                      {ps.length ? ps.map(p => <Avatar key={p.id} name={p.name} color={p.color} photo={p.photo} size={20} />) : null}
                      <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>{ps.length ? ps.map(p => p.name).join(', ') : 'Ganze Familie'}{e.end ? ` · bis ${e.end}` : ''}</Text>
                    </View>
                    {driveText(e, people) ? <Clip style={[s.text, { fontSize: 13, fontWeight: '700', marginTop: 4 }]} lines={1}>{driveText(e, people)}</Clip> : null}
                    {e.note ? <Clip style={[s.muted, { fontSize: 12, marginTop: 2 }]} lines={2}>📝 {e.note}</Clip> : null}
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
            style={[{ backgroundColor: C.surface, borderRadius: 22, padding: 14, gap: 10, borderLeftWidth: 6, borderLeftColor: child.color }, SHADOW.sm]}>
            <View style={[s.row, { flexWrap: 'nowrap', gap: 12 }]}>
              <Avatar name={child.name} color={child.color} photo={child.photo} size={46} />
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={[s.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
                  <Text style={[s.text, { fontWeight: '800', fontSize: 17, flexShrink: 1 }]} numberOfLines={1}>{child.name}</Text>
                  <Text style={{ fontWeight: '800', color: C.fg }}>⭐ {pointsOf(data!, child.id)}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct >= 1 ? C.ok : child.color, borderRadius: 4 }} />
                </View>
                <Text style={[s.muted, { fontSize: 13 }]}>{items.length ? (pct >= 1 ? `Alles erledigt 🎉 (${items.length})` : `${done} von ${items.length} erledigt`) : 'Heute keine Aufgaben'}{special ? ` · ⭐ ${special} Sonderaufgabe${special > 1 ? 'n' : ''}` : ''}</Text>
              </View>
              <Text style={{ color: C.muted, fontSize: 22 }}>›</Text>
            </View>
            {wait.length > 0 && (
              <Pressable onPress={() => update(d => wait.reduce((x, i) => confirm(x, i.task, date), d))} accessibilityRole="button"
                style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.warnSoft, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 8 }]}>
                <Text style={[s.text, { flex: 1, fontSize: 14, fontWeight: '700', color: C.warn }]} numberOfLines={1}>⏳ {wait.length} warten: {wait.map(i => i.task.title).join(', ')}</Text>
                <View style={{ backgroundColor: C.ok, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✓ Alle</Text></View>
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
      <View style={{ gap: 8 }}>
        <Text style={s.label}>{label}</Text>
        {list.map(({ task, completion }) => {
          const st = completion?.status;
          const sp = task.special, late = !!sp?.until && sp.until < date && st !== 'bestaetigt';
          const bg = st === 'wartet' ? C.warnSoft : sp ? '#fff6d6' : C.surface2;
          return (
            <View key={task.id} style={[s.row, { backgroundColor: bg, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 18, flexWrap: 'nowrap', gap: 12, borderWidth: sp ? 2 : 1.5, borderColor: st === 'wartet' ? C.warn + '88' : sp ? '#f2b705' : 'transparent', opacity: st === 'bestaetigt' ? 0.6 : 1 }]}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!st }} accessibilityLabel={task.title}
                onPress={() => update(d => (st === 'bestaetigt' && !task.selfCheck ? (parent ? undoConfirm(d, task, date) : d) : toggleByChild(d, task, date)))}
                style={[{ width: 46, height: 46, borderRadius: 23, borderWidth: st ? 0 : 2.5, borderColor: child.color + '88', backgroundColor: st === 'bestaetigt' ? C.ok : st === 'wartet' ? C.warn : C.surface, alignItems: 'center', justifyContent: 'center' }, st ? SHADOW.sm : null]}>
                <Text style={{ color: st ? '#fff' : child.color + '55', fontWeight: '800', fontSize: st ? 22 : 20 }}>{st === 'bestaetigt' ? '✓' : st === 'wartet' ? '⏳' : task.icon ?? ''}</Text>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Clip style={[s.text, { fontWeight: '700', textDecorationLine: st === 'bestaetigt' ? 'line-through' : 'none' }]} lines={2} longPress>{task.title}</Clip>
                <Text style={[s.muted, { fontSize: 12, color: st === 'wartet' ? C.warn : C.muted, fontWeight: st === 'wartet' || late ? '700' : '400' }, late ? { color: C.danger } : null]}>{st === 'wartet' ? 'Wartet auf Eltern' : sp && st !== 'bestaetigt' ? `⭐ Sonderaufgabe${sp.until ? (late ? ' · Frist vorbei' : ` · bis ${sp.until.slice(8, 10)}.${sp.until.slice(5, 7)}.`) : ''}` : st === 'bestaetigt' ? (task.selfCheck ? 'Erledigt' : 'Bestätigt') : task.time ? TIME_LABEL[task.time] : task.repeat === 'einmal' ? 'Heute' : REPEAT_LABEL[task.repeat]}</Text>
              </View>
              {parent && st !== 'bestaetigt' ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${task.title} bestätigen, plus ${task.points} Punkte`} onPress={() => update(d => confirm(d, task, date))}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.ok, paddingHorizontal: 12, height: 36, borderRadius: 18 }, SHADOW.sm]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>✓ +{task.points}</Text>
                </Pressable>
              ) : (
                <View style={[s.chip, { backgroundColor: child.color + '1f' }]}><Text style={{ color: child.color, fontWeight: '800', fontSize: 12 }}>+{task.points}</Text></View>
              )}
            </View>
          );
        })}
      </View>
    );
  };
  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 330, padding: 0, overflow: 'hidden', gap: 0 }]}>
      <View style={{ padding: 18, gap: 14, ...grad(child.color, child.color + 'c0') }}>
        <View style={[s.row, { flexWrap: 'nowrap', gap: 12 }]}>
          <View style={{ borderRadius: 30, borderWidth: 3, borderColor: '#ffffffaa' }}>
            <Avatar name={child.name} color={child.color} photo={child.photo} size={52} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1}>{child.name}</Text>
            {gradeLabel(child) ? <Text style={{ color: '#ffffffd0', fontSize: 13, fontWeight: '600' }}>{gradeLabel(child)}{ageOf(child) !== undefined ? ` · ${ageOf(child)} Jahre` : ''}</Text> : null}
          </View>
          {parent && (
            <Pressable onPress={() => setSos(true)} accessibilityRole="button" accessibilityLabel={`Notfall-Karte ${child.name}`}
              style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>🆘</Text>
            </Pressable>
          )}
          {sos && <EmergencyCard child={child} onClose={() => setSos(false)} />}
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: child.color }}>⭐ {pointsOf(data!, child.id)}</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{items.length ? (done === items.length ? 'Alles geschafft! 🎉' : `${done} von ${items.length} erledigt`) : 'Heute frei'}</Text>
            {(() => {
              const sd = schoolOn(data!, child.id, date) as (ReturnType<typeof schoolOn> & { changed?: boolean }) | null, off = schoolOff(data!, child.id, date);
              if (!sd && !off) return null;
              return (
                <Pressable onPress={() => setChg(x => !x)} accessibilityRole="button" accessibilityLabel="Schulzeit heute ändern"
                  style={{ backgroundColor: sd?.changed || off ? '#fff' : '#ffffff33', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: sd?.changed || off ? child.color : '#fff', fontWeight: '800', fontSize: 13 }}>{off ? '🏫 Heute frei ✎' : `🏫 ${sd!.from ?? '?'}–${sd!.to ?? '?'}${sd!.changed ? ' (früher aus)' : ''} ✎`}</Text>
                </Pressable>
              );
            })()}
          </View>
          {chg && <SchoolChange child={child} date={date} by={parent ? 'eltern' : child.id} onDone={() => setChg(false)} />}
          <View style={{ height: 8, backgroundColor: '#ffffff40', borderRadius: 99, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, backgroundColor: '#fff', borderRadius: 99 }} />
          </View>
        </View>
      </View>
      <View style={{ padding: 16, gap: 14 }}>
      <QuestStrip child={child} parent={parent} />
      {(() => {
        const lessons = (schoolOn(data!, child.id, date)?.lessons ?? []).filter(Boolean);
        return lessons.length ? <Clip style={[s.muted, { fontSize: 13 }]} lines={2}>📖 {lessons.join(' · ')}</Clip> : null;
      })()}
      {(() => {
        const n = dueCount(data!, child.id), st = liveStreak(data!, child.id);
        const doneToday = data!.vocabStats?.[child.id]?.last === date;
        if (!n && !(st && !doneToday)) return null;
        return (
          <View style={[s.row, { alignItems: 'center', backgroundColor: '#fff4ec', borderRadius: 16, padding: 12, flexWrap: 'nowrap' }]}>
            <Text style={{ fontSize: 22 }}>{st ? '🔥' : '🧠'}</Text>
            <Text style={[s.text, { fontSize: 14, flexShrink: 1 }]}>
              {n ? <Text style={{ fontWeight: '800' }}>{n} Vokabeln warten</Text> : <Text style={{ fontWeight: '800' }}>Vokabel-Serie retten</Text>}
              {st ? <Text style={{ color: C.muted }}>{doneToday ? ` · ${st} Tage am Stück` : ` · ${st} Tage Serie, heute noch üben`}</Text> : <Text style={{ color: C.muted }}> · unter Lernen</Text>}
            </Text>
          </View>
        );
      })()}
      {(() => {
        const need = shoppingFor(data!, child.id);
        if (!need.length) return null;
        return (
          <View style={{ backgroundColor: C.accentSoft, borderRadius: 16, padding: 12, gap: 4 }}>
            <Text style={[s.label, { color: C.accent }]}>🛒 Braucht</Text>
            {need.map(i => { const u = untilLabel(i.until); return (
              <Text key={i.id} style={[s.text, { fontSize: 15 }]}><Text style={{ fontWeight: '700' }}>{i.title}</Text>{u ? <Text style={{ color: u.urgent ? C.danger : C.muted, fontSize: 13, fontWeight: u.urgent ? '800' : '500' }}>  {u.text}</Text> : null}{i.store ? <Text style={{ color: C.muted, fontSize: 13 }}> · {i.store}</Text> : null}</Text>
            ); })}
          </View>
        );
      })()}
      {group('special', '⭐ Sonderaufgaben')}
      {group('routine', 'Routinen')}
      {group('hausaufgabe', 'Schule')}
      {group('pflicht', 'Haushalt')}
      {items.length === 0 && <Text style={[s.muted, { textAlign: 'center', paddingVertical: 8 }]}>Heute steht nichts an. 🌤️</Text>}
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
