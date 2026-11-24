import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { ALL_COLORS, parentsOf, PARENT_COLORS, uid } from '../data/logic';
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
            <Text style={[s.muted, { flexShrink: 0 }]}>{r.role === 'eltern' ? 'Eltern' : 'Kind'}</Text>
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
      <Button ghost title="+ Elternteil" onPress={() => setParents(ps => [...ps, { id: uid(), name: 'Neu', color: PARENT_COLORS[ps.length % PARENT_COLORS.length] }])} />
      <Text style={[s.muted, { fontSize: 13 }]}>Tipp auf den Kreis ändert die Farbe. Termine und Aufgaben tragen die Farbe der Person.</Text>
    </View>
  );
}
