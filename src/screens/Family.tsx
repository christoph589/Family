import { useEffect, useState } from 'react';
import { loadHolidays, STATES } from '../data/holidays';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { ALL_COLORS, autoHolidayOn, freeColor, isAdmin, CHILD_COLORS, manualHolidayOn, parentsOf, PARENT_COLORS, today, uid } from '../data/logic';
import { TEMPLATES } from '../data/templates';
import { ageOf, gradeLabel, removeChild, schoolYearOf } from '../data/logic';
import { Child } from '../data/types';
import { KidDraft, KidFields } from '../ui/KidFields';
import { FamilyData } from '../data/types';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { Avatar, PhotoCropper, pickImageFile } from '../ui/Avatar';

/** Familienmitglieder: Namen und Farben von Eltern und Kindern. */
export function Family() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [delKid, setDelKid] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ id: string; src?: string; error?: string } | null>(null);
  if (!data) return null;
  const parents = parentsOf(data);
  const setParents = (fn: (p: ReturnType<typeof parentsOf>) => ReturnType<typeof parentsOf>) => update(d => ({ ...d, parents: fn(parentsOf(d)) }));
  const rows = [
    ...parents.map(p => ({ id: p.id, name: p.name, color: p.color, photo: p.photo, role: 'eltern' as const })),
    ...data.children.map(c => ({ id: c.id, name: c.name, color: c.color, photo: c.photo, role: 'kind' as const })),
  ];
  const rename = (id: string, role: string, name: string) => role === 'eltern'
    ? setParents(ps => ps.map(p => (p.id === id ? { ...p, name } : p)))
    : update((d: FamilyData) => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, name } : c)) }));
  const setPhoto = (id: string, role: string, photo?: string) => role === 'eltern'
    ? setParents(ps => ps.map(p => (p.id === id ? { ...p, photo } : p)))
    : update((d: FamilyData) => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, photo } : c)) }));
  const recolor = (id: string, role: string, color: string) => role === 'eltern'
    ? setParents(ps => ps.map(p => (p.id === id ? { ...p, color } : p)))
    : update((d: FamilyData) => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, color } : c)) }));

  return (
    <View style={s.card}>
      <Text style={s.label}>Familie</Text>
      {rows.map(r => (
        <View key={r.id} style={{ gap: 8 }}>
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <Pressable accessibilityLabel={`Foto oder Farbe für ${r.name}`} onPress={() => setOpen(o => (o === r.id ? null : r.id))}
              >
              <Avatar name={r.name} color={r.color} photo={r.photo} size={44} />
            </Pressable>
            <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} value={r.name} onChangeText={t => rename(r.id, r.role, t.slice(0, 24))} accessibilityLabel="Name"
              placeholder={r.role === 'kind' ? 'Name des Kindes' : 'Vorname, z. B. Christoph'} autoFocus={focusId === r.id} selectTextOnFocus />
            <Text style={[s.muted, { flexShrink: 0 }]}>{r.role === 'kind' ? 'Kind' : isAdmin(parents.find(p => p.id === r.id)) ? 'Admin' : 'Erwachsen'}</Text>
            {r.role === 'eltern' && parents.length > 1 && !(isAdmin(parents.find(p => p.id === r.id)) && parents.filter(isAdmin).length === 1) && (
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
          {r.role === 'eltern' && (() => {
            const p = parents.find(x => x.id === r.id)!;
            const adm = isAdmin(p);
            const lastAdmin = adm && parents.filter(isAdmin).length === 1;
            const set = (patch: Partial<typeof p>) => setParents(ps => ps.map(x => (x.id === p.id ? { ...x, ...patch } : x)));
            return (
              <View style={{ marginLeft: 50, gap: 8 }}>
                <View style={[s.row, { flexWrap: 'nowrap' }]}>
                  <Text style={s.muted}>Rolle</Text>
                  <TextInput style={[s.input, { flex: 1, minWidth: 0, paddingVertical: 8 }]} value={p.title ?? ''} onChangeText={t => set({ title: t.slice(0, 16) || undefined })}
                    placeholder="z. B. Papa, Mama, Oma" accessibilityLabel={`Rolle von ${r.name}`} />
                </View>
                <View style={s.row}>
                  {[{ v: true, l: 'Admin (alle Rechte)' }, { v: false, l: 'Ohne Admin, z. B. Oma, Opa' }].map(o => (
                    <Pressable key={String(o.v)} accessibilityRole="button" disabled={lastAdmin && !o.v}
                      onPress={() => set({ admin: o.v })}
                      style={[s.chip, { paddingVertical: 8, backgroundColor: adm === o.v ? r.color : C.surface2, opacity: lastAdmin && !o.v ? 0.4 : 1 }]}>
                      <Text style={{ color: adm === o.v ? '#fff' : C.fg, fontWeight: '700' }}>{o.l}</Text>
                    </Pressable>
                  ))}
                </View>
                {adm ? (
                  <Text style={[s.muted, { fontSize: 13 }]}>{lastAdmin ? 'Mindestens eine Person muss Admin bleiben. ' : ''}Meldet sich mit der Eltern-PIN an.</Text>
                ) : (<>
                  <View style={[s.row, { flexWrap: 'nowrap' }]}>
                    <Text style={s.text}>Eigene PIN</Text>
                    <TextInput style={[s.input, { width: 110, letterSpacing: 6, textAlign: 'center' }]} value={p.pin ?? ''} keyboardType="number-pad" placeholder="4 Ziffern"
                      accessibilityLabel={`PIN für ${r.name}`} onChangeText={t => set({ pin: t.replace(/\D/g, '').slice(0, 4) })} />
                    {(p.pin ?? '').length !== 4 && <Text style={{ color: C.warn, fontWeight: '700', flexShrink: 1 }}>fehlt noch</Text>}
                  </View>
                  <Text style={[s.muted, { fontSize: 13 }]}>Darf: alles sehen, Aufgaben abhaken und bestätigen, Termine, Essen und Einkauf eintragen, Lernen begleiten. Darf nicht: Einstellungen, Taschengeld, Punkte und Belohnungen, Noten.</Text>
                </>)}
              </View>
            );
          })()}
          {r.role === 'kind' && <KidProfileEdit child={data.children.find(c => c.id === r.id)!} />}
          {crop?.id === r.id && (
            <View style={{ paddingLeft: 50 }}>
              {crop.error ? <View style={s.row}><Text style={{ color: C.danger, flexShrink: 1 }}>{crop.error}</Text><Button ghost title="OK" onPress={() => setCrop(null)} /></View>
                : crop.src && <PhotoCropper src={crop.src} onCancel={() => setCrop(null)} onDone={ph => { setPhoto(r.id, r.role, ph); setCrop(null); }} />}
            </View>
          )}
          {open === r.id && (
            <View style={[s.row, { paddingLeft: 50 }]}>
              <Button ghost title={r.photo ? 'Anderes Foto' : '📷 Foto hochladen'} onPress={() => pickImageFile().then(res => { if (res) { setCrop({ id: r.id, ...res }); setOpen(null); } })} />
              {r.photo && <Button ghost title="Foto entfernen" onPress={() => setPhoto(r.id, r.role, undefined)} />}
            </View>
          )}
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
          return { ...d, children: [...d.children, { id, name: '', color: freeColor(d, CHILD_COLORS) }], tasks: [...d.tasks, ...starter] };
        }); }} />
        <Button ghost title="+ Elternteil" onPress={() => { const id = uid(); setFocusId(id); update(d => ({ ...d, parents: [...parentsOf(d), { id, name: '', color: freeColor(d, PARENT_COLORS) }] })); }} />
        <Button ghost title="+ Oma, Opa, …" onPress={() => { const id = uid(); setFocusId(id); update(d => ({ ...d, parents: [...parentsOf(d), { id, name: '', admin: false, color: freeColor(d) }] })); }} />
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>Tipp auf den Kreis: Foto hochladen oder Farbe ändern. Termine und Aufgaben tragen die Farbe der Person.</Text>
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

/** Eltern-PIN ändern. Die alte PIN wird abgefragt, falls das Tablet gerade offen herumliegt. */
export function ParentPin() {
  const { data, update } = useFamily();
  const [old, setOld] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data) return null;
  const digits = (t: string) => t.replace(/\D/g, '').slice(0, 4);
  function save() {
    if (old !== data!.family.parentPin) return setMsg({ ok: false, text: 'Die bisherige PIN stimmt nicht.' });
    if (pin.length !== 4) return setMsg({ ok: false, text: 'Die neue PIN braucht 4 Ziffern.' });
    if (pin !== pin2) return setMsg({ ok: false, text: 'Die beiden neuen PINs sind nicht gleich.' });
    update(d => ({ ...d, family: { ...d.family, parentPin: pin } }));
    setOld(''); setPin(''); setPin2('');
    setMsg({ ok: true, text: 'Neue Eltern-PIN gespeichert. Sie gilt sofort auf allen Geräten.' });
  }
  const field = (label: string, v: string, set: (t: string) => void) => (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: 140 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, { letterSpacing: 8, fontWeight: '800' }]} value={v} secureTextEntry keyboardType="number-pad" maxLength={4}
        accessibilityLabel={label} onChangeText={t => { set(digits(t)); setMsg(null); }} placeholder="••••" />
    </View>
  );
  return (
    <View style={s.card}>
      <Text style={s.h2}>🔒 Eltern-PIN ändern</Text>
      <Text style={s.muted}>Mit dieser PIN melden sich alle Erwachsenen mit Admin-Rechten an. Oma, Opa und andere ohne Admin haben ihre eigene PIN, die stellst du oben bei der Person ein.</Text>
      <View style={[s.row, { alignItems: 'flex-end' }]}>
        {field('Bisherige PIN', old, setOld)}
        {field('Neue PIN', pin, setPin)}
        {field('Neue PIN nochmal', pin2, setPin2)}
      </View>
      <Button title="PIN ändern" disabled={old.length !== 4 || pin.length !== 4 || pin2.length !== 4} onPress={save} />
      {msg && <Text style={{ color: msg.ok ? C.ok : C.danger, fontWeight: '700' }}>{msg.text}</Text>}
    </View>
  );
}
