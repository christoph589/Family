import { Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { addPoints, pointsOf } from '../data/logic';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

export function Points({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  if (!data) return null;
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      {data.children.filter(c => childIds.includes(c.id)).map(k => {
        const p = pointsOf(data, k.id);
        const log = data.ledger.filter(l => l.childId === k.id).slice(0, 10);
        return (
          <View key={k.id} style={[s.card, { flexGrow: 1, flexBasis: 320, borderTopWidth: 6, borderTopColor: k.color }]}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.h2}>{k.name}</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: k.color }}>{p} P</Text>
            </View>
            <Text style={s.label}>Einlösen</Text>
            {data.rewards.map(r => (
              <View key={r.id} style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12, flexWrap: 'nowrap' }]}>
                <Text style={[s.text, { flex: 1, fontWeight: '700' }]}>{r.title}</Text>
                <Text style={[s.muted, { fontWeight: '700' }]}>{r.cost} P</Text>
                <Button title="Einlösen" disabled={!parent || p < r.cost} color={C.ok} style={{ paddingVertical: 7, paddingHorizontal: 10 }}
                  onPress={() => update(d => addPoints(d, k.id, -r.cost, 'Eingelöst: ' + r.title))} />
              </View>
            ))}
            {!parent && <Text style={[s.muted, { fontSize: 13 }]}>Einlösen geht über Mama oder Papa.</Text>}
            <Text style={s.label}>Verlauf</Text>
            {log.length === 0 && <Text style={s.muted}>Noch keine Punkte.</Text>}
            {log.map(l => (
              <View key={l.id} style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }]}>
                <Text style={[s.text, { flex: 1, fontSize: 14 }]}>{l.reason}</Text>
                <Text style={{ fontWeight: '800', color: l.points >= 0 ? C.ok : C.danger }}>{l.points >= 0 ? '+' : ''}{l.points}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
