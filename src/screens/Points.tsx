import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Idea, Reward } from '../data/types';
import { useFamily } from '../data/FamilyContext';
import { addPoints, uid, decideIdea, decideRequest, pointsOf, proposeIdea, requestReward, reservedOf } from '../data/logic';
import { Button } from '../ui/Button';
import { PersonHead } from '../ui/Avatar';
import { Pots } from './Pots';
import { IconPicker } from '../ui/IconPicker';
import { Icon } from '../ui/Icon';
import { C, s } from '../ui/theme';
import { usePinEntry } from '../data/pin';

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
      {admin && <RewardEditor />}
      <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
        {data.children.filter(c => childIds.includes(c.id)).map(k => {
          const p = pointsOf(data, k.id);
          const free = p - reservedOf(data, k.id);
          const log = data.ledger.filter(l => l.childId === k.id).slice(0, 10);
          const mine = (data.requests ?? []).filter(r => r.childId === k.id);
          return (
            <View key={k.id} style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
              <PersonHead name={k.name} color={k.color} photo={k.photo} sub="Punktekonto" value={`★ ${p}`} />
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
              {parent && <Adjust childId={k.id} />}
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

/** Eltern legen Belohnungen und ihre Punktepreise fest. */
function RewardEditor() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('');
  if (!data) return null;
  const set = (id: string, f: (r: Reward) => Reward) => update(d => ({ ...d, rewards: d.rewards.map(r => (r.id === id ? f(r) : r)) }));
  if (!open) return (
    <Pressable onPress={() => setOpen(true)} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="gift" size={22} color={C.accent} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.text, { fontWeight: '800' }]}>Belohnungen ändern</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>{data.rewards.length} Belohnungen</Text>
      </View>
      <Icon name="chev" size={18} color={C.muted} />
    </Pressable>
  );
  return (
    <View style={[s.card, { gap: 10, borderWidth: 2, borderColor: C.accent }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h2}>Belohnungen</Text>
        <Button ghost title="Fertig" onPress={() => setOpen(false)} style={{ paddingVertical: 6 }} />
      </View>
      {data.rewards.map(r => (
        <View key={r.id} style={{ gap: 6, backgroundColor: C.bg, borderRadius: 12, padding: 10 }}>
          <View style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
            <TextInput style={[s.input, { flex: 1, backgroundColor: C.surface }]} defaultValue={r.title} onEndEditing={e => { const v = e.nativeEvent.text.trim(); if (v) set(r.id, x => ({ ...x, title: v })); }} onBlur={(e: any) => { const v = String(e?.target?.value ?? '').trim(); if (v && v !== r.title) set(r.id, x => ({ ...x, title: v })); }} accessibilityLabel="Belohnung" />
            <TextInput style={[s.input, { width: 72, textAlign: 'center', fontWeight: '800', backgroundColor: C.surface }]} defaultValue={String(r.cost)} keyboardType="number-pad" accessibilityLabel={`Preis für ${r.title}`}
              onChangeText={v => { const n = Number(v.replace(/\D/g, '').slice(0, 5)); if (n > 0) set(r.id, x => ({ ...x, cost: n })); }} />
            <Text style={s.muted}>P</Text>
          </View>
          <View style={[s.row, { gap: 6 }]}>
            {[{ id: '', name: 'Alle' }, ...data.children].map(k => {
              const on = (r.childId ?? '') === k.id;
              return (
                <Pressable key={k.id || 'alle'} onPress={() => set(r.id, x => ({ ...x, childId: k.id || undefined }))} style={[s.chip, { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: on ? C.accent : C.surface }]}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : C.fg }}>{k.name}</Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => update(d => ({ ...d, rewards: d.rewards.filter(x => x.id !== r.id), requests: (d.requests ?? []).filter(q => q.rewardId !== r.id) }))} style={{ padding: 6 }}>
              <Text style={{ color: C.danger, fontWeight: '700' }}>Entfernen</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={s.label}>Neue Belohnung</Text>
      <View style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder="z. B. Eis essen gehen" />
        <TextInput style={[s.input, { width: 72, textAlign: 'center' }]} value={cost} onChangeText={v => setCost(v.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" placeholder="100" accessibilityLabel="Preis in Punkten" />
      </View>
      <Button title="Hinzufügen" disabled={!title.trim() || !Number(cost)} onPress={() => { update(d => ({ ...d, rewards: [...d.rewards, { id: uid(), title: title.trim(), cost: Number(cost) }] })); setTitle(''); setCost(''); }} />
      <Text style={[s.muted, { fontSize: 12 }]}>„Alle“ heißt: jedes Kind sieht die Belohnung. Mit einem Namen nur dieses Kind.</Text>
    </View>
  );
}

/** Eltern geben Punkte von Hand oder ziehen welche ab, mit Grund im Verlauf. */
function Adjust({ childId }: { childId: string }) {
  const { update } = useFamily();
  const [n, setN] = useState('');
  const [why, setWhy] = useState('');
  const v = Number(n) || 0;
  const go = (sign: 1 | -1) => { update(d => addPoints(d, childId, sign * v, `${sign > 0 ? '➕' : '➖'} ${why.trim() || 'Von Hand'}`)); setN(''); setWhy(''); };
  const [show, setShow] = useState(false);
  if (!show) return <Button ghost title="Punkte von Hand geben oder abziehen" onPress={() => setShow(true)} />;
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 12 }}>
      <Text style={[s.text, { fontWeight: '800' }]}>Punkte von Hand</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { width: 70, textAlign: 'center', backgroundColor: C.surface }]} value={n} onChangeText={x => setN(x.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="10" accessibilityLabel="Anzahl Punkte" />
        <TextInput style={[s.input, { flex: 1, backgroundColor: C.surface }]} value={why} onChangeText={setWhy} placeholder="Grund, z. B. Oma geholfen" />
      </View>
      <View style={s.row}>
        <Button title="+ Geben" color={C.ok} disabled={!v} onPress={() => go(1)} style={{ paddingVertical: 8 }} />
        <Button ghost title="− Abziehen" disabled={!v} onPress={() => go(-1)} style={{ paddingVertical: 8 }} />
      </View>
    </View>
  );
}

/** Eltern setzen Punktestände auf 0. Der Verlauf bleibt, es wird nur eine Gegenbuchung angelegt. */
function ResetPoints({ childIds }: { childIds: string[] }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string>('alle');
  const [done, setDone] = useState('');
  const [wipe, setWipe] = useState(true);
  const pin = usePinEntry('any', () => reset());
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const targets = who === 'alle' ? kids : kids.filter(k => k.id === who);
  const close = () => { setOpen(false); pin.reset(); };
  const reset = () => {
    const ids = targets.map(k => k.id);
    if (wipe) update(d => ({ ...d, ledger: d.ledger.filter(l => !ids.includes(l.childId)), requests: (d.requests ?? []).filter(r => !ids.includes(r.childId)) }));
    else update(d => targets.reduce((x, k) => { const p = pointsOf(x, k.id); return p ? addPoints(x, k.id, -p, 'Punkte auf 0 gesetzt') : x; }, d));
    setDone(`${targets.map(k => k.name).join(', ')}: auf 0 gesetzt${wipe ? ', Verlauf gelöscht' : ''}.`);
    close();
  };
  if (!open) return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable onPress={() => { setOpen(true); setDone(''); }} style={{ padding: 8 }}><Text style={{ color: C.muted, fontWeight: '700' }}>Punkte zurücksetzen</Text></Pressable>
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
        <TextInput style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6 }]} value={pin.pin} editable={!pin.busy} secureTextEntry keyboardType="number-pad" placeholder="PIN"
          accessibilityLabel="Eltern-PIN" onChangeText={pin.onChange} />
        <Button ghost title="Abbrechen" onPress={close} />
      </View>
      {pin.busy && <Text style={[s.muted, { fontSize: 13 }]}>Prüfe …</Text>}
      {!!pin.msg && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{pin.msg}</Text>}
    </View>
  );
}

function NewIdea({ childId, pending }: { childId: string; pending: Idea[] }) {
  const { update } = useFamily();
  const [text, setText] = useState('');
  return (
    <View style={{ gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 12 }}>
      <Text style={[s.text, { fontWeight: '800' }]}>Eigener Wunsch</Text>
      <Text style={[s.muted, { fontSize: 13 }]}>Was wünschst du dir? Mama oder Papa sagen dir, wie viele Punkte es kostet.</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1, backgroundColor: C.surface }]} value={text} onChangeText={setText} placeholder="z. B. Pizza-Abend, Übernachtungsparty" />
        <Button title="Senden" disabled={!text.trim()} onPress={() => { update(d => proposeIdea(d, childId, text)); setText(''); }} />
      </View>
      {pending.map(i => <Text key={i.id} style={{ color: C.warn, fontWeight: '700' }}>{i.title}: wartet auf Mama oder Papa</Text>)}
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
        {([['kind', `Nur für ${kid?.name ?? 'das Kind'}`], ...(data && data.children.length > 1 ? [['alle', 'Für alle Kinder einzeln'], ['pot', 'Gemeinsames Ziel']] : [])] as [typeof mode, string][]).map(([v, l]) => (
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
