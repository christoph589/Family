import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { ALL_COLORS, CHILD_COLORS, holidayOn, parentsOf, PARENT_COLORS, today, uid } from '../data/logic';
import { TEMPLATES } from '../data/templates';
import { FamilyData } from '../data/types';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Familienmitglieder: Namen und Farben von Eltern und Kindern. */
export function Family() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
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
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{r.name[0]?.toUpperCase()}</Text>
            </Pressable>
            <TextInput style={[s.input, { flex: 1, minWidth: 0 }]} value={r.name} onChangeText={t => rename(r.id, r.role, t.slice(0, 24))} accessibilityLabel="Name" />
            {r.role === 'kind' ? (
              <TextInput style={[s.input, { width: 70 }]} value={data.children.find(c => c.id === r.id)?.grade ?? ''} placeholder="Klasse" accessibilityLabel={`Klasse von ${r.name}`}
                onChangeText={t => update(d => ({ ...d, children: d.children.map(c => (c.id === r.id ? { ...c, grade: t.slice(0, 6) || undefined } : c)) }))} />
            ) : <Text style={[s.muted, { flexShrink: 0, width: 70 }]}>Eltern</Text>}
            {r.role === 'eltern' && parents.length > 1 && (
              <Pressable onPress={() => setParents(ps => ps.filter(p => p.id !== r.id))}><Text style={{ color: C.danger, fontWeight: '700' }}>Entfernen</Text></Pressable>
            )}
          </View>
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
        <Button ghost title="+ Kind" onPress={() => update(d => {
          const id = uid();
          const starter = TEMPLATES.filter(t => ['Zähne putzen', 'Zimmer aufräumen'].includes(t.title)).map(t => ({ ...t, id: uid(), childId: id, active: true }));
          return { ...d, children: [...d.children, { id, name: 'Neues Kind', color: CHILD_COLORS[d.children.length % CHILD_COLORS.length] }], tasks: [...d.tasks, ...starter] };
        })} />
        <Button ghost title="+ Elternteil" onPress={() => setParents(ps => [...ps, { id: uid(), name: 'Neu', color: PARENT_COLORS[ps.length % PARENT_COLORS.length] }])} />
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
  if (!data) return null;
  const h = data.settings?.holiday;
  const active = holidayOn(data, today());
  const set = (holiday?: { on: boolean; until?: string }) => update(d => ({ ...d, settings: { ...d.settings, holiday } }));
  const opts: { label: string; until?: string }[] = [
    { label: 'Bis Sonntag', until: sundayIn(1) }, { label: '2 Wochen', until: sundayIn(2) },
    { label: '3 Wochen', until: sundayIn(3) }, { label: '6 Wochen', until: sundayIn(6) }, { label: 'Ohne Enddatum' },
  ];
  return (
    <View style={[s.card, active && { borderWidth: 2, borderColor: C.warn }]}>
      <Text style={s.label}>Ferienmodus</Text>
      {active ? (
        <>
          <Text style={[s.text, { fontWeight: '800' }]}>🏖️ Ferien {h?.until ? `bis einschließlich ${fmtDay(h.until)}` : 'ohne Enddatum'}</Text>
          <Text style={s.muted}>Schulaufgaben pausieren. Lernaufgaben, die ihr einzeln anlegt (Eigene Aufgabe › Hausaufgabe › Nur heute), erscheinen trotzdem. {h?.until ? 'Am letzten Ferientag kommt abends wieder „Schulsachen richten“.' : ''}</Text>
          <Button ghost title="Ferien beenden" onPress={() => set(undefined)} />
        </>
      ) : (
        <>
          <Text style={s.muted}>Pausiert alle Schulaufgaben. Routinen wie Zähne putzen und Haushalt laufen weiter.</Text>
          <View style={[s.row, { gap: 8 }]}>
            {opts.map(o => (
              <Pressable key={o.label} onPress={() => set({ on: true, until: o.until })}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.accent }}>
                <Text style={{ color: C.fg, fontWeight: '700' }}>{o.label}{o.until ? ` (${new Date(o.until + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })})` : ''}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
