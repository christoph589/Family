import { Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { addPoints, decideRequest, pointsOf, requestReward, reservedOf } from '../data/logic';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

export function Points({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  if (!data) return null;
  const requests = (data.requests ?? []).filter(r => childIds.includes(r.childId));
  return (
    <View style={{ gap: 16 }}>
      {parent && requests.length > 0 && (
        <View style={[s.card, { borderWidth: 2, borderColor: C.warn }]}>
          <Text style={s.h2}>Wünsche zum Bestätigen</Text>
          {requests.map(r => {
            const kid = data.children.find(c => c.id === r.childId);
            const rw = data.rewards.find(x => x.id === r.rewardId);
            return (
              <View key={r.id} style={[s.row, { backgroundColor: C.warnSoft, padding: 12, borderRadius: 12 }]}>
                <Text style={[s.text, { flex: 1, minWidth: 160, fontWeight: '700' }]}>{kid?.name}: {rw?.title} ({rw?.cost} P)</Text>
                <Button title="Bestätigen" color={C.ok} style={{ paddingVertical: 8 }} onPress={() => update(d => decideRequest(d, r.id, true))} />
                <Button ghost title="Ablehnen" style={{ paddingVertical: 8 }} onPress={() => update(d => decideRequest(d, r.id, false))} />
              </View>
            );
          })}
        </View>
      )}
      <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
        {data.children.filter(c => childIds.includes(c.id)).map(k => {
          const p = pointsOf(data, k.id);
          const free = p - reservedOf(data, k.id);
          const log = data.ledger.filter(l => l.childId === k.id).slice(0, 10);
          const mine = (data.requests ?? []).filter(r => r.childId === k.id);
          return (
            <View key={k.id} style={[s.card, { flexGrow: 1, flexBasis: 320, borderTopWidth: 6, borderTopColor: k.color }]}>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <Text style={s.h2}>{k.name}</Text>
                <Text style={{ fontSize: 28, fontWeight: '800', color: k.color }}>{p} P</Text>
              </View>
              {free !== p && <Text style={s.muted}>{p - free} P sind für Wünsche reserviert.</Text>}
              <Text style={s.label}>Einlösen</Text>
              {data.rewards.map(r => {
                const asked = mine.some(m => m.rewardId === r.id);
                const enough = (parent ? p : free) >= r.cost;
                return (
                  <View key={r.id} style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12, flexWrap: 'nowrap' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.text, { fontWeight: '700' }]}>{r.title}</Text>
                      <Text style={[s.muted, { fontSize: 13 }]}>{r.cost} P{!enough && !asked ? ` · noch ${r.cost - (parent ? p : free)} P` : ''}</Text>
                    </View>
                    {asked && !parent ? (
                      <Text style={{ color: C.warn, fontWeight: '700' }}>Angefragt</Text>
                    ) : enough ? (
                      <Button title={parent ? 'Einlösen' : 'Wünschen'} color={C.ok} style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                        onPress={() => update(d => (parent ? addPoints(d, k.id, -r.cost, 'Eingelöst: ' + r.title) : requestReward(d, k.id, r)))} />
                    ) : (
                      <Text style={[s.muted, { fontWeight: '700' }]}>Zu wenig</Text>
                    )}
                  </View>
                );
              })}
              {!parent && <Text style={[s.muted, { fontSize: 13 }]}>Dein Wunsch geht an Mama oder Papa. Wenn sie bestätigen, werden die Punkte abgezogen.</Text>}
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
    </View>
  );
}
