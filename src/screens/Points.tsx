import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Idea } from '../data/types';
import { useFamily } from '../data/FamilyContext';
import { addPoints, decideIdea, decideRequest, pointsOf, proposeIdea, requestReward, reservedOf } from '../data/logic';
import { Button } from '../ui/Button';
import { PersonHead } from '../ui/Avatar';
import { Pots } from './Pots';
import { IconPicker } from '../ui/IconPicker';
import { C, s } from '../ui/theme';
import { parentPinOk } from '../ui/DeleteButton';

export function Points({ childIds, parent, admin = parent }: { childIds: string[]; parent: boolean; admin?: boolean }) {
  const { data, update } = useFamily();
  if (!data) return null;
  const requests = (data.requests ?? []).filter(r => childIds.includes(r.childId));
  const ideas = (data.ideas ?? []).filter(i => childIds.includes(i.childId));
  return (
    <View style={{ gap: 16 }}>
      <Pots childIds={childIds} parent={parent} admin={admin} />
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
      {admin && <ResetPoints childIds={childIds} />}
    </View>
  );
}

/** Eltern setzen Punktestände auf 0. Der Verlauf bleibt, es wird nur eine Gegenbuchung angelegt. */
function ResetPoints({ childIds }: { childIds: string[] }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string>('alle');
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const [done, setDone] = useState('');
  const [wipe, setWipe] = useState(true);
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const targets = who === 'alle' ? kids : kids.filter(k => k.id === who);
  const close = () => { setOpen(false); setPin(''); setBad(false); };
  const tryPin = (v: string) => {
    setPin(v); setBad(false);
    if (v.length < 4) return;
    if (!parentPinOk(data, v)) { setBad(true); return; }
    const ids = targets.map(k => k.id);
    if (wipe) update(d => ({ ...d, ledger: d.ledger.filter(l => !ids.includes(l.childId)), requests: (d.requests ?? []).filter(r => !ids.includes(r.childId)) }));
    else update(d => targets.reduce((x, k) => { const p = pointsOf(x, k.id); return p ? addPoints(x, k.id, -p, '🔄 Punkte auf 0 gesetzt') : x; }, d));
    setDone(`${targets.map(k => k.name).join(', ')}: auf 0 gesetzt${wipe ? ', Verlauf gelöscht' : ''}.`);
    close();
  };
  if (!open) return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable onPress={() => { setOpen(true); setDone(''); }} style={{ padding: 8 }}><Text style={{ color: C.muted, fontWeight: '700' }}>🔄 Punkte zurücksetzen</Text></Pressable>
      {!!done && <Text style={{ color: C.ok, fontWeight: '700', fontSize: 13 }}>{done}</Text>}
    </View>
  );
  return (
    <View style={[s.card, { gap: 10, borderWidth: 2, borderColor: C.danger }]}>
      <Text style={s.h2}>Punkte zurücksetzen</Text>
      <View style={[s.row, { gap: 6 }]}>
        {[{ id: 'alle', name: 'Alle Kinder' }, ...kids].map(k => (
          <Pressable key={k.id} onPress={() => setWho(k.id)} style={[s.chip, { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: who === k.id ? C.danger : C.surface2 }]}>
            <Text style={{ fontWeight: '800', color: who === k.id ? '#fff' : C.fg }}>{k.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.text}>{targets.map(k => `${k.name} ${pointsOf(data, k.id)}`).join(' · ')} → 0</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: wipe }} onPress={() => setWipe(w => !w)} style={[s.row, { gap: 10, flexWrap: 'nowrap' }]}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.danger, backgroundColor: wipe ? C.danger : C.surface, alignItems: 'center', justifyContent: 'center' }}>{wipe && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
        <Text style={[s.text, { flex: 1, fontSize: 14 }]}>Verlauf auch löschen (Neustart)</Text>
      </Pressable>
      <Text style={[s.muted, { fontSize: 13 }]}>{wipe ? 'Alle Buchungen, offene Wünsche und Einzahlungen in gemeinsame Ziele dieser Kinder werden gelöscht. Das lässt sich nicht rückgängig machen.' : 'Der Verlauf bleibt, es kommt nur eine Gegenbuchung dazu. Punkte in gemeinsamen Zielen bleiben im Topf.'} Zum Bestätigen die Eltern-PIN eingeben.</Text>
      <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6 }]} value={pin} secureTextEntry keyboardType="number-pad" placeholder="PIN"
          accessibilityLabel="Eltern-PIN" onChangeText={x => tryPin(x.replace(/\D/g, '').slice(0, 4))} />
        <Button ghost title="Abbrechen" onPress={close} />
      </View>
      {bad && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>PIN stimmt nicht.</Text>}
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
  const [mode, setMode] = useState<'kind' | 'alle' | 'pot'>('kind');
  const [icon, setIcon] = useState('🎯');
  const kid = data?.children.find(c => c.id === idea.childId);
  const n = Number(cost);
  const ok = cost !== '' && Number.isInteger(n) && n > 0 && n <= 10000;
  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 8, borderLeftWidth: 5, borderLeftColor: kid?.color ?? C.accent }}>
      <Text style={[s.text, { fontWeight: '800' }]}>{kid?.name}: {idea.title}</Text>
      <View style={s.row}>
        {(mode === 'pot' ? [200, 500, 1000, 2000] : [30, 50, 100, 200]).map(v => (
          <Pressable key={v} onPress={() => setCost(String(v))} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: cost === String(v) ? C.accent : C.surface }}>
            <Text style={{ fontWeight: '700', color: cost === String(v) ? '#fff' : C.fg }}>{v} P</Text>
          </Pressable>
        ))}
        <TextInput style={[s.input, { width: 90, backgroundColor: C.surface }]} value={cost} onChangeText={t => setCost(t.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" placeholder="Punkte" accessibilityLabel="Punkte" />
      </View>
      <View style={[s.row, { gap: 8 }]}>
        {([['kind', `Nur für ${kid?.name ?? 'das Kind'}`], ...(data && data.children.length > 1 ? [['alle', 'Für alle Kinder einzeln'], ['pot', '🎯 Gemeinsames Ziel']] : [])] as [typeof mode, string][]).map(([v, l]) => (
          <Pressable key={v} onPress={() => setMode(v)} accessibilityRole="radio" accessibilityState={{ checked: mode === v }}
            style={[s.chip, { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: mode === v ? C.accent : C.surface }]}>
            <Text style={{ fontWeight: '700', color: mode === v ? '#fff' : C.fg }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {mode === 'pot' && (
        <View style={[s.row, { flexWrap: 'nowrap' }]}>
          <IconPicker value={icon} onChange={setIcon} />
          <Text style={[s.muted, { flex: 1 }]}>Alle Kinder sparen zusammen. Die Punkte oben sind dann das gemeinsame Ziel, z. B. 500 oder 1000.</Text>
        </View>
      )}
      <View style={s.row}>
        <Button title={ok ? (mode === 'pot' ? `Ziel mit ${n} P anlegen` : `Freischalten für ${n} P`) : mode === 'pot' ? 'Ziel anlegen' : 'Freischalten'} color={C.ok} disabled={!ok} style={{ paddingVertical: 8 }} onPress={() => update(d => decideIdea(d, idea.id, n, mode === 'pot' ? 'pot' : mode === 'alle', icon))} />
        <Button ghost title="Ablehnen" style={{ paddingVertical: 8 }} onPress={() => update(d => decideIdea(d, idea.id, null))} />
      </View>
    </View>
  );
}
