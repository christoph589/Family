import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Idea } from '../data/types';
import { useFamily } from '../data/FamilyContext';
import { addPoints, decideIdea, decideRequest, pointsOf, proposeIdea, requestReward, reservedOf } from '../data/logic';
import { Button } from '../ui/Button';
import { PersonHead } from '../ui/Avatar';
import { C, s } from '../ui/theme';

export function Points({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  if (!data) return null;
  const requests = (data.requests ?? []).filter(r => childIds.includes(r.childId));
  const ideas = (data.ideas ?? []).filter(i => childIds.includes(i.childId));
  return (
    <View style={{ gap: 16 }}>
      {parent && ideas.length > 0 && (
        <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
          <Text style={s.h2}>Neue Wünsche der Kinder</Text>
          <Text style={s.muted}>Legt fest, wie viele Punkte der Wunsch kostet. Danach kann das Kind ihn einlösen, sobald es genug Punkte hat.</Text>
          {ideas.map(i => <IdeaRow key={i.id} idea={i} />)}
        </View>
      )}
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
            <View key={k.id} style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
              <PersonHead name={k.name} color={k.color} photo={k.photo} sub="Punktekonto" value={`⭐ ${p}`} />
              {free !== p && <Text style={s.muted}>{p - free} P sind für Wünsche reserviert.</Text>}
              <Text style={s.label}>Einlösen</Text>
              {data.rewards.filter(r => !r.childId || r.childId === k.id).map(r => {
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
              {!parent && <NewIdea childId={k.id} pending={(data.ideas ?? []).filter(i => i.childId === k.id)} />}
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

function NewIdea({ childId, pending }: { childId: string; pending: Idea[] }) {
  const { update } = useFamily();
  const [text, setText] = useState('');
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 12 }}>
      <Text style={[s.text, { fontWeight: '800' }]}>💡 Eigener Wunsch</Text>
      <Text style={[s.muted, { fontSize: 13 }]}>Was wünschst du dir? Mama oder Papa sagen dir, wie viele Punkte es kostet.</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1, backgroundColor: C.surface }]} value={text} onChangeText={setText} placeholder="z. B. Pizza-Abend, Übernachtungsparty" />
        <Button title="Senden" disabled={!text.trim()} onPress={() => { update(d => proposeIdea(d, childId, text)); setText(''); }} />
      </View>
      {pending.map(i => <Text key={i.id} style={{ color: C.warn, fontWeight: '700' }}>⏳ {i.title}: wartet auf Mama oder Papa</Text>)}
    </View>
  );
}

function IdeaRow({ idea }: { idea: Idea }) {
  const { data, update } = useFamily();
  const [cost, setCost] = useState('');
  const [forAll, setForAll] = useState(false);
  const kid = data?.children.find(c => c.id === idea.childId);
  const n = Number(cost);
  const ok = cost !== '' && Number.isInteger(n) && n > 0 && n <= 10000;
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 8, borderLeftWidth: 5, borderLeftColor: kid?.color ?? C.accent }}>
      <Text style={[s.text, { fontWeight: '800' }]}>{kid?.name}: {idea.title}</Text>
      <View style={s.row}>
        {[30, 50, 100, 200].map(v => (
          <Pressable key={v} onPress={() => setCost(String(v))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: cost === String(v) ? C.accent : C.surface }}>
            <Text style={{ fontWeight: '700', color: cost === String(v) ? '#fff' : C.fg }}>{v} P</Text>
          </Pressable>
        ))}
        <TextInput style={[s.input, { width: 90, backgroundColor: C.surface }]} value={cost} onChangeText={t => setCost(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" placeholder="Punkte" accessibilityLabel="Punkte" />
      </View>
      {data && data.children.length > 1 && (
        <Pressable onPress={() => setForAll(v => !v)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: forAll }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: forAll ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
            {forAll && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text>}
          </View>
          <Text style={s.text}>Für alle Kinder freischalten</Text>
        </Pressable>
      )}
      <View style={s.row}>
        <Button title={ok ? `Freischalten für ${n} P` : 'Freischalten'} color={C.ok} disabled={!ok} style={{ paddingVertical: 8 }} onPress={() => update(d => decideIdea(d, idea.id, n, forAll))} />
        <Button ghost title="Ablehnen" style={{ paddingVertical: 8 }} onPress={() => update(d => decideIdea(d, idea.id, null))} />
      </View>
    </View>
  );
}
