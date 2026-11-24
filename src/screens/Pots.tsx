import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { contributeToPot, dissolvePot, pointsOf, potBalance, potShares, reservedOf, uid } from '../data/logic';
import { Pot } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { IconPicker } from '../ui/IconPicker';
import { C, grad, s, SHADOW } from '../ui/theme';

/** Gemeinschaftstopf: alle Kinder sparen zusammen auf etwas Größeres. */
export function Pots({ childIds, parent, admin }: { childIds: string[]; parent: boolean; admin: boolean }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const active = (data.pots ?? []).filter(p => !p.doneAt);
  const done = (data.pots ?? []).filter(p => p.doneAt).slice(0, 3);
  if (!active.length && !admin) return null;
  return (
    <View style={{ gap: 14 }}>
      {active.map(p => <PotCard key={p.id} pot={p} childIds={childIds} parent={parent} admin={admin} />)}
      {admin && (!adding
        ? <Pressable accessibilityRole="button" onPress={() => setAdding(true)}
            style={({ pressed }) => [{ borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: C.accent + '66', padding: 18, alignItems: 'center', gap: 4, backgroundColor: pressed ? C.accentSoft : 'transparent' }]}>
            <Text style={{ fontSize: 28 }}>🎯</Text>
            <Text style={[s.text, { fontWeight: '800', color: C.accent }]}>Gemeinsames Ziel anlegen</Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>Alle Kinder sparen Punkte in einen Topf, z. B. für Freizeitpark, Kino-Abend oder ein Spiel für alle.</Text>
          </Pressable>
        : <NewPot onDone={() => setAdding(false)} />)}
      {done.length > 0 && (
        <Text style={[s.muted, { textAlign: 'center' }]}>🏆 Geschafft: {done.map(p => `${p.icon ?? ''} ${p.title}`).join(', ')}</Text>
      )}
    </View>
  );
}

function PotCard({ pot, childIds, parent, admin }: { pot: Pot; childIds: string[]; parent: boolean; admin: boolean }) {
  const { data, update } = useFamily();
  const [ask, setAsk] = useState<'none' | 'dissolve'>('none');
  const [editing, setEditing] = useState(false);
  if (!data) return null;
  if (editing) return <NewPot pot={pot} onDone={() => setEditing(false)} />;
  const bal = potBalance(data, pot.id);
  const shares = potShares(data, pot.id);
  const pct = Math.min(100, (bal / pot.target) * 100);
  const reached = bal >= pot.target;
  const me = !parent && childIds.length === 1 ? data.children.find(c => c.id === childIds[0]) : undefined;
  const myFree = me ? pointsOf(data, me.id) - reservedOf(data, me.id) : 0;
  return (
    <View style={[{ borderRadius: 26, overflow: 'hidden' }, SHADOW.md]}>
      <View style={[{ padding: 20, gap: 14 }, grad('#5b4cf0', '#ff6a5c', 120)]}>
        <View style={[s.row, { flexWrap: 'nowrap', gap: 14 }]}>
          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 34 }}>{pot.icon ?? '🎯'}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#ffffffcc', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Gemeinsames Ziel</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 }} numberOfLines={2}>{pot.title}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{bal}</Text>
            <Text style={{ color: '#ffffffcc', fontSize: 13, fontWeight: '700' }}>von {pot.target} ⭐</Text>
          </View>
        </View>
        {/* Balken: jeder Anteil in der Farbe des Kindes */}
        <View style={{ height: 18, borderRadius: 99, backgroundColor: '#ffffff40', overflow: 'hidden', flexDirection: 'row' }}>
          {shares.map(x => <View key={x.child.id} style={{ width: `${(x.points / Math.max(pot.target, bal)) * 100}%`, backgroundColor: x.child.color, borderRightWidth: 2, borderRightColor: '#ffffff88' }} />)}
          {!!pot.bonus && <View style={{ width: `${(pot.bonus / Math.max(pot.target, bal)) * 100}%`, backgroundColor: '#ffffff' }} />}
        </View>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{reached ? '🎉 Ziel erreicht!' : `Noch ${pot.target - bal} Punkte, ${Math.round(pct)} % geschafft`}</Text>
        {(shares.length > 0 || !!pot.bonus) && (
          <View style={[s.row, { gap: 8 }]}>
            {shares.map(x => (
              <View key={x.child.id} style={[s.row, { gap: 6, backgroundColor: '#ffffff26', borderRadius: 99, paddingVertical: 3, paddingLeft: 3, paddingRight: 10 }]}>
                <Avatar name={x.child.name} color={x.child.color} photo={x.child.photo} size={24} />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{x.child.name} {x.points}</Text>
              </View>
            ))}
            {!!pot.bonus && <View style={{ backgroundColor: '#ffffff26', borderRadius: 99, paddingVertical: 5, paddingHorizontal: 10 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>👪 Eltern {pot.bonus}</Text></View>}
          </View>
        )}
      </View>
      <View style={{ backgroundColor: C.surface, padding: 16, gap: 10 }}>
        {me && !reached && (
          <>
            <Text style={s.text}>Du hast <Text style={{ fontWeight: '800' }}>{myFree} Punkte</Text> frei. Wie viele legst du in den Topf?</Text>
            <View style={[s.row, { gap: 8 }]}>
              {[5, 10, 25, 50].map(n => (
                <Button key={n} title={`+${n}`} disabled={myFree < n} onPress={() => update(d => contributeToPot(d, pot.id, me.id, n))} style={{ minWidth: 70 }} />
              ))}
            </View>
          </>
        )}
        {me && reached && <Text style={s.text}>Super, ihr habt es geschafft! Mama und Papa lösen das Ziel ein.</Text>}
        {admin && (
          <View style={[s.row, { gap: 8 }]}>
            {!reached && <Button ghost title="👪 +25 von uns" onPress={() => update(d => ({ ...d, pots: (d.pots ?? []).map(p => (p.id === pot.id ? { ...p, bonus: (p.bonus ?? 0) + 25 } : p)) }))} />}
            <Button ghost title="✏️ Bearbeiten" onPress={() => setEditing(true)} />
            {reached && <Button title="🎉 Einlösen" color={C.ok} onPress={() => update(d => ({ ...d, pots: (d.pots ?? []).map(p => (p.id === pot.id ? { ...p, doneAt: new Date().toISOString() } : p)) }))} />}
            {ask === 'none'
              ? <Pressable onPress={() => setAsk('dissolve')} style={{ padding: 8 }}><Text style={{ color: C.danger, fontWeight: '700' }}>Ziel auflösen</Text></Pressable>
              : <>
                  <Text style={s.muted}>Alle eingezahlten Punkte gehen an die Kinder zurück.</Text>
                  <Button title="Ja, auflösen" color={C.danger} onPress={() => update(d => dissolvePot(d, pot.id))} />
                  <Button ghost title="Abbrechen" onPress={() => setAsk('none')} />
                </>}
          </View>
        )}
        {parent && !admin && <Text style={s.muted}>Die Kinder zahlen auf ihren eigenen Geräten oder in ihrer Ansicht ein.</Text>}
      </View>
    </View>
  );
}

function NewPot({ onDone, pot }: { onDone: () => void; pot?: Pot }) {
  const { data, update } = useFamily();
  const [title, setTitle] = useState(pot?.title ?? '');
  const [icon, setIcon] = useState(pot?.icon ?? '🎢');
  const [target, setTarget] = useState(String(pot?.target ?? 500));
  const [bonus, setBonus] = useState(String(pot?.bonus ?? 0));
  const t = Number(target), bo = Number(bonus) || 0;
  const paid = pot && data ? potBalance(data, pot.id) - (pot.bonus ?? 0) : 0;
  function save() {
    if (pot) update(d => ({ ...d, pots: (d.pots ?? []).map(p => (p.id === pot.id ? { ...p, title: title.trim(), icon, target: t, bonus: bo || undefined } : p)) }));
    else update(d => ({ ...d, pots: [...(d.pots ?? []), { id: uid(), title: title.trim(), icon, target: t, createdAt: new Date().toISOString() }] }));
    onDone();
  }
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>{pot ? 'Ziel bearbeiten' : 'Neues gemeinsames Ziel'}</Text>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <IconPicker value={icon} onChange={setIcon} />
        <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder="z. B. Freizeitpark" autoFocus accessibilityLabel="Ziel" />
      </View>
      <Text style={s.label}>Wie viele Punkte braucht ihr zusammen?</Text>
      <View style={[s.row, { gap: 8 }]}>
        {[200, 500, 1000, 2000].map(n => (
          <Pressable key={n} onPress={() => setTarget(String(n))} style={[s.chip, { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: t === n ? C.accent : C.surface2 }]}>
            <Text style={{ fontWeight: '800', color: t === n ? '#fff' : C.fg }}>{n}</Text>
          </Pressable>
        ))}
        <TextInput style={[s.input, { width: 100 }]} value={target} onChangeText={x => setTarget(x.replace(/\D/g, ''))} keyboardType="number-pad" accessibilityLabel="Punkte" />
      </View>
      {pot && (
        <>
          <Text style={s.label}>Von euch Eltern dazugelegt</Text>
          <TextInput style={[s.input, { width: 120 }]} value={bonus} onChangeText={x => setBonus(x.replace(/\D/g, ''))} keyboardType="number-pad" accessibilityLabel="Eltern-Anteil" />
          <Text style={[s.muted, { fontSize: 13 }]}>Die Kinder haben {paid} Punkte eingezahlt. Daran ändert sich nichts. Mit den neuen Werten steht der Topf bei {paid + bo} von {t || 0}{paid + bo >= t && t > 0 ? ', also erreicht 🎉' : ''}.</Text>
        </>
      )}
      <Text style={[s.muted, { fontSize: 13 }]}>Richtwert: Hausaufgaben bringen 10, Zähne putzen 2 Punkte. Bei 4 Kindern kommen so grob 150 bis 250 Punkte pro Woche zusammen, wenn alle mitmachen.</Text>
      <View style={s.row}>
        <Button title={pot ? 'Speichern' : 'Anlegen'} disabled={!title.trim() || !(t > 0)} onPress={save} />
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}
