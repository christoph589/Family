import { useEffect, useState } from 'react';
import { loadHolidays, STATES } from '../data/holidays';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { ALL_COLORS, autoHolidayOn, CHILD_COLORS, manualHolidayOn, parentsOf, PARENT_COLORS, today, uid } from '../data/logic';
import { TEMPLATES } from '../data/templates';
import { ageOf, gradeLabel, removeChild, schoolYearOf } from '../data/logic';
import { Child } from '../data/types';
import { KidDraft, KidFields } from '../ui/KidFields';
import { FamilyData } from '../data/types';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Familienmitglieder: Namen und Farben von Eltern und Kindern. */
export function Family() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [delKid, setDelKid] = useState<string | null>(null);
  if (!data) return null;
  const parents = parentsOf(data);
  const setParents = (fn: (p: ReturnType<typeof parentsOf>) => ReturnType<typeof parentsOf>) => update(d => ({ ...d, parents: fn(parentsOf(d)) }));
  const rows = [
    ...parents.map(p => ({ id: p.id, name: p.name, color: p.color, role: 'eltern' as const })),
    ...data.children.map(c => ({ id: c.id, name: c.name, color: c.color, role: 'kind' as const })),
  ];
  const rename = (id: string, role: string, name: string) => role === 'eltern'
    ? setParents(ps => ps.map(p => (p.id === id ? { ...p, name } : p)))
    : update((d: FamilyData) => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, name } : c)) }));
  const recolor = (id: string, role: string, color: string) => role === 'eltern'
    ? setParents(ps => ps.map(p => (p.id === id ? { ...p, color } : p)))
    : update((d: FamilyData) => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, color } : c)) }));

  return (
    <View style={s.card}>
      <Text style={s.label}>Familie</Text>
      {rows.map(r => (
        <View key={r.id} style={{ gap: 8 }}>
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <Pressable accessibilityLabel={`Farbe für ${r.name}`} onPress={() => setOpen(o => (o === r.id ? null : r.id))}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: r.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{r.name[0]?.toUpperCase() ?? '?'}</Text>
            </Pressable>
            <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} value={r.name} onChangeText={t => rename(r.id, r.role, t.slice(0, 24))} accessibilityLabel="Name"
              placeholder={r.role === 'kind' ? 'Name des Kindes' : 'z. B. Mama, Papa, Oma'} autoFocus={focusId === r.id} selectTextOnFocus />
            <Text style={[s.muted, { flexShrink: 0 }]}>{r.role === 'kind' ? 'Kind' : 'Eltern'}</Text>
            {r.role === 'eltern' && parents.length > 1 && (
              <Pressable onPress={() => setParents(ps => ps.filter(p => p.id !== r.id))}><Text style={{ color: C.danger, fontWeight: '700' }}>Entfernen</Text></Pressable>
            )}
            {r.role === 'kind' && data.children.length > 1 && (
              <Pressable onPress={() => setDelKid(r.id)}><Text style={{ color: C.danger, fontWeight: '700' }}>Löschen</Text></Pressable>
            )}
          </View>
          {delKid === r.id && (
            <View style={{ marginLeft: 50, backgroundColor: '#fde8e6', borderRadius: 12, padding: 12, gap: 8 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{r.name || 'Dieses Kind'} wirklich löschen?</Text>
              <Text style={s.muted}>Dabei verschwinden auch Aufgaben, Punkte, Wünsche, Übungen, Taschengeld-Konto und Stundenplan. Das lässt sich nicht rückgängig machen.</Text>
              <View style={s.row}>
                <Button title="Ja, löschen" color={C.danger} onPress={() => { update(d => removeChild(d, r.id)); setDelKid(null); }} />
                <Button ghost title="Abbrechen" onPress={() => setDelKid(null)} />
              </View>
            </View>
          )}
          {r.role === 'kind' && <KidProfileEdit child={data.children.find(c => c.id === r.id)!} />}
          {open === r.id && (
            <View style={[s.row, { gap: 8, paddingLeft: 50 }]}>
              {ALL_COLORS.map(c => (
                <Pressable key={c} accessibilityLabel={`Farbe ${c}`} onPress={() => { recolor(r.id, r.role, c); setOpen(null); }}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: c === r.color ? C.fg : 'transparent' }} />
              ))}
            </View>
          )}
        </View>
      ))}
      <View style={s.row}>
        <Button ghost title="+ Kind" onPress={() => { const id = uid(); setFocusId(id); update(d => {
          const starter = TEMPLATES.filter(t => ['Zähne putzen', 'Zimmer aufräumen'].includes(t.title)).map(t => ({ ...t, id: uid(), childId: id, active: true }));
          return { ...d, children: [...d.children, { id, name: '', color: CHILD_COLORS[d.children.length % CHILD_COLORS.length] }], tasks: [...d.tasks, ...starter] };
        }); }} />
        <Button ghost title="+ Elternteil" onPress={() => { const id = uid(); setFocusId(id); setParents(ps => [...ps, { id, name: '', color: PARENT_COLORS[ps.length % PARENT_COLORS.length] }]); }} />
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>Tipp auf den Kreis ändert die Farbe. Termine und Aufgaben tragen die Farbe der Person.</Text>
    </View>
  );
}

const isoDate = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
/** Sonntag am Ende der n-ten Woche ab heute. */
function sundayIn(weeks: number) { const x = new Date(); x.setHours(12); x.setDate(x.getDate() + ((7 - x.getDay()) % 7) + (weeks - 1) * 7); return isoDate(x); }
export const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });

/** Ferienmodus: Schulaufgaben pausieren. Einmalige Lernaufgaben der Eltern bleiben. */
export function Holiday() {
  const { data, update } = useFamily();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(false);
  const auto = data?.settings?.autoHoliday;
  const enableAuto = (state: string) => {
    setBusy(true); setErr('');
    loadHolidays(state)
      .then(r => { update(d => ({ ...d, settings: { ...d.settings, autoHoliday: { on: true, state, ...r } } })); setPick(false); })
      .catch(e => setErr(e?.message?.startsWith('Ferien') ? e.message : 'Ferien konnten nicht geladen werden. Bitte später nochmal versuchen.'))
      .finally(() => setBusy(false));
  };
  // Termine rechtzeitig für das nächste Jahr nachladen
  useEffect(() => {
    if (!auto?.on) return;
    const soon = new Date(); soon.setDate(soon.getDate() + 200);
    if (auto.validTo < isoDate(soon)) enableAuto(auto.state);
  }, [auto?.on, auto?.state, auto?.validTo]);
  if (!data) return null;
  const h = data.settings?.holiday;
  const now = today();
  const manual = manualHolidayOn(data, now);
  const autoNow = autoHolidayOn(data, now);
  const next = auto?.on ? auto.ranges.find(r => r.kind === 'ferien' && r.from > now) : undefined;
  const set = (holiday?: { on: boolean; until?: string }) => update(d => ({ ...d, settings: { ...d.settings, holiday } }));
  const opts: { label: string; until?: string }[] = [
    { label: 'Bis Sonntag', until: sundayIn(1) }, { label: '2 Wochen', until: sundayIn(2) },
    { label: '3 Wochen', until: sundayIn(3) }, { label: '6 Wochen', until: sundayIn(6) }, { label: 'Ohne Enddatum' },
  ];
  const chip = (label: string, onPress: () => void, on = false) => (
    <Pressable key={label} onPress={onPress} disabled={busy}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: on ? C.accent : C.surface }}>
      <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[s.card, (manual || autoNow) && { borderWidth: 2, borderColor: C.warn }]}>
      <Text style={s.label}>Ferien</Text>

      <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!auto?.on }} disabled={busy}
        onPress={() => (auto?.on ? update(d => ({ ...d, settings: { ...d.settings, autoHoliday: { ...d.settings!.autoHoliday!, on: false } } })) : auto?.state ? enableAuto(auto.state) : setPick(true))}
        style={[s.row, { flexWrap: 'nowrap' }]}>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: auto?.on ? C.ok : C.surface2, padding: 3, alignItems: auto?.on ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: '700' }]}>Automatisch nach Bundesland{auto?.state ? `: ${STATES.find(x => x.code === auto.state)?.name}` : ''}</Text>
          <Text style={[s.muted, { fontSize: 13 }]}>Schulferien und Feiertage. Schulaufgaben pausieren dann von selbst.</Text>
        </View>
      </Pressable>
      {busy && <Text style={s.muted}>Lade Ferientermine …</Text>}
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      {auto?.on && !pick && (
        <View style={{ gap: 4 }}>
          {autoNow && <Text style={[s.text, { fontWeight: '800' }]}>🏖️ Jetzt: {autoNow.name} bis {fmtDay(autoNow.to)}</Text>}
          {next && <Text style={s.muted}>Nächste Ferien: {next.name}, {fmtDay(next.from)} bis {fmtDay(next.to)}</Text>}
          <Pressable onPress={() => setPick(true)}><Text style={{ color: C.accent, fontWeight: '700' }}>Bundesland ändern</Text></Pressable>
        </View>
      )}
      {pick && <View style={[s.row, { gap: 8 }]}>{STATES.map(st => chip(st.name, () => enableAuto(st.code), auto?.state === st.code))}</View>}

      <Text style={[s.label, { marginTop: 8 }]}>Von Hand</Text>
      {manual ? (
        <>
          <Text style={[s.text, { fontWeight: '800' }]}>🏖️ Ferien {h?.until ? `bis einschließlich ${fmtDay(h.until)}` : 'ohne Enddatum'}</Text>
          <Button ghost title="Ferien beenden" onPress={() => set(undefined)} />
        </>
      ) : (
        <>
          <Text style={s.muted}>Für bewegliche Ferientage oder Brückentage, die nicht im Kalender stehen.</Text>
          <View style={[s.row, { gap: 8 }]}>
            {opts.map(o => chip(`${o.label}${o.until ? ` (${new Date(o.until + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })})` : ''}`, () => set({ on: true, until: o.until })))}
          </View>
        </>
      )}
      <Text style={[s.muted, { fontSize: 13 }]}>In den Ferien pausieren Schulaufgaben. Routinen und Haushalt laufen weiter. Lernaufgaben, die ihr einzeln anlegt (Hausaufgabe, Nur heute), erscheinen trotzdem.</Text>
    </View>
  );
}

function KidProfileEdit({ child }: { child: Child }) {
  const { update } = useFamily();
  const [draft, setDraft] = useState<KidDraft>({ birthday: child.birthday ?? '', gender: child.gender, grade: child.grade ?? '' });
  const save = (patch: Partial<Child>) => update(d => ({ ...d, children: d.children.map(c => (c.id === child.id ? { ...c, ...patch } : c)) }));
  const age = ageOf(child);
  const missing = !child.birthday || !child.gender || !child.grade;
  return (
    <View style={{ paddingLeft: 50, gap: 4 }}>
      <KidFields value={draft} name={child.name} onChange={v => {
        const next = { ...draft, ...v };
        setDraft(next);
        if (v.gender) save({ gender: v.gender });
        if (v.grade !== undefined) save({ grade: v.grade.trim() || undefined, gradeYear: schoolYearOf(today()) });
        if (v.birthday !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(v.birthday)) save({ birthday: v.birthday });
      }} />
      <Text style={[s.muted, { fontSize: 13, color: missing ? C.warn : C.muted }]}>
        {missing ? 'Bitte Geburtstag, Geschlecht und Klasse ergänzen.' : `${age} Jahre · ${gradeLabel(child)} · Klasse zählt am 1. August hoch`}
      </Text>
    </View>
  );
}
