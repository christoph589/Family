import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { accountOf, addTx, ageOf, allowanceHint, balanceOf, euro, setAccount, today } from '../data/logic';
import { tipFor } from '../data/moneyTips';
import { PersonHead } from '../ui/Avatar';
import { Child, MoneyTx } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

/** "3,50" oder "3.5" zu Cent, sonst null */
const toCents = (t: string) => { const v = Number(t.replace(',', '.').trim()); return t.trim() && Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v * 100) : null; };
const KIND_ICON: Record<MoneyTx['kind'], string> = { taschengeld: '💶', geschenk: '🎁', verdient: '💪', ausgabe: '🛒', korrektur: '✏️' };

/** Taschengeld-Konto je Kind. Bewusst getrennt von den Punkten. */
export function Money({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data } = useFamily();
  if (!data) return null;
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      {data.children.filter(c => childIds.includes(c.id)).map(c => <Account key={c.id} child={c} parent={parent} />)}
    </View>
  );
}

function Account({ child, parent }: { child: Child; parent: boolean }) {
  const { data, update } = useFamily();
  const [mode, setMode] = useState<'' | 'ausgabe' | 'plus' | 'regel' | 'ziel'>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [plusKind, setPlusKind] = useState<'geschenk' | 'verdient'>('geschenk');
  const [every, setEvery] = useState<'woche' | 'monat'>('woche');
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const acc = accountOf(data, child.id);
  const bal = balanceOf(data, child.id);
  const age = ageOf(child);
  const cents = toCents(amount);
  const reset = () => { setMode(''); setAmount(''); setNote(''); };
  const goal = acc.goal;
  const goalPct = goal ? Math.min(100, Math.max(0, (bal / goal.cents) * 100)) : 0;
  const txs = showAll ? acc.tx : acc.tx.slice(0, 8);
  const spentMonth = acc.tx.filter(t => t.cents < 0 && t.date.slice(0, 7) === today().slice(0, 7)).reduce((a, t) => a - t.cents, 0);

  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
      <PersonHead name={child.name} color={child.color} photo={child.photo} sub="Taschengeld-Konto" value={euro(bal)} />
      {acc.allowance ? (
        <Text style={s.muted}>Taschengeld: {euro(acc.allowance.cents)} pro {acc.allowance.every === 'woche' ? 'Woche' : 'Monat'}{spentMonth ? ` · diesen Monat ausgegeben: ${euro(spentMonth)}` : ''}</Text>
      ) : parent ? <Text style={s.muted}>Noch kein regelmäßiges Taschengeld eingestellt.</Text> : null}

      {goal ? (
        <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 6 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>🐷 Sparziel: {goal.title}</Text>
          <View style={{ height: 12, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${goalPct}%`, backgroundColor: child.color }} />
          </View>
          <Text style={s.muted}>{bal >= goal.cents ? 'Geschafft! Du hast genug gespart.' : `Noch ${euro(goal.cents - bal)} bis ${euro(goal.cents)}`}
            {bal < goal.cents && acc.allowance ? ` · ca. ${Math.ceil((goal.cents - bal) / acc.allowance.cents)} ${acc.allowance.every === 'woche' ? 'Wochen' : 'Monate'} Taschengeld` : ''}</Text>
          <Pressable onPress={() => update(d => setAccount(d, child.id, a => ({ ...a, goal: undefined })))}><Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>Sparziel entfernen</Text></Pressable>
        </View>
      ) : null}

      <View style={{ backgroundColor: '#fff7e0', borderRadius: 12, padding: 12 }}>
        <Text style={[s.text, { fontSize: 15 }]}>💡 {tipFor(age, today())}</Text>
      </View>

      <View style={[s.row, { gap: 8 }]}>
        <Button ghost={mode !== 'ausgabe'} title="🛒 Ausgabe" onPress={() => setMode('ausgabe')} style={{ paddingVertical: 8 }} />
        {parent && <Button ghost={mode !== 'plus'} title="➕ Geld dazu" onPress={() => setMode('plus')} style={{ paddingVertical: 8 }} />}
        {!goal && <Button ghost={mode !== 'ziel'} title="🐷 Sparziel" onPress={() => setMode('ziel')} style={{ paddingVertical: 8 }} />}
        {parent && <Button ghost={mode !== 'regel'} title="⚙️ Taschengeld" onPress={() => { setMode('regel'); setEvery(acc.allowance?.every ?? ((age ?? 9) >= 10 ? 'monat' : 'woche')); setAmount(acc.allowance ? String(acc.allowance.cents / 100).replace('.', ',') : ''); }} style={{ paddingVertical: 8 }} />}
      </View>

      {mode !== '' && (
        <View style={{ gap: 8, borderWidth: 2, borderColor: C.accent, borderRadius: 12, padding: 12 }}>
          {mode === 'plus' && <Segmented value={plusKind} onChange={setPlusKind} options={[{ value: 'geschenk', label: '🎁 Geschenk' }, { value: 'verdient', label: '💪 Verdient' }]} />}
          {mode === 'regel' && (
            <>
              <Segmented value={every} onChange={setEvery} options={[{ value: 'woche', label: 'Pro Woche' }, { value: 'monat', label: 'Pro Monat' }]} />
              {allowanceHint(age) && <Text style={[s.muted, { fontSize: 13 }]}>Richtwert der Jugendämter: {allowanceHint(age)}. Nur Orientierung.</Text>}
              {!age && <Text style={[s.muted, { fontSize: 13 }]}>Tipp: Trag unter Verwalten den Geburtstag ein, dann zeige ich einen Richtwert.</Text>}
            </>
          )}
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <TextInput style={[s.input, { width: 110 }]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00 €" accessibilityLabel="Betrag in Euro" />
            {mode !== 'regel' && <TextInput style={[s.input, { flex: 1 }]} value={note} onChangeText={setNote} placeholder={mode === 'ausgabe' ? 'Wofür? z. B. Comic' : mode === 'ziel' ? 'Wofür sparst du?' : 'Von wem oder wofür?'} />}
          </View>
          {mode === 'ausgabe' && cents !== null && cents > bal && <Text style={{ color: C.warn }}>Das ist mehr, als auf dem Konto ist.</Text>}
          <View style={s.row}>
            <Button title="Speichern" disabled={cents === null || (mode !== 'regel' && !note.trim())} onPress={() => {
              if (cents === null) return;
              if (mode === 'ausgabe') update(d => addTx(d, child.id, -cents, note.trim(), 'ausgabe'));
              if (mode === 'plus') update(d => addTx(d, child.id, cents, note.trim(), plusKind));
              if (mode === 'ziel') update(d => setAccount(d, child.id, a => ({ ...a, goal: { title: note.trim(), cents } })));
              if (mode === 'regel') update(d => setAccount(d, child.id, a => ({ ...a, allowance: { cents, every, since: today(), lastPaid: a.allowance?.lastPaid } })));
              reset();
            }} />
            {mode === 'regel' && acc.allowance && <Button ghost title="Taschengeld stoppen" onPress={() => { update(d => setAccount(d, child.id, a => ({ ...a, allowance: undefined }))); reset(); }} />}
            <Button ghost title="Abbrechen" onPress={reset} />
          </View>
          {mode === 'regel' && <Text style={[s.muted, { fontSize: 13 }]}>Wird ab heute automatisch gutgeschrieben{every === 'woche' ? ', jede Woche am selben Wochentag' : ', jeden Monat am selben Tag'}. Echtes Geld gebt ihr wie gewohnt, die App führt das Konto.</Text>}
        </View>
      )}

      <Text style={s.label}>Kontoauszug</Text>
      {acc.tx.length === 0 && <Text style={s.muted}>Noch keine Buchungen.</Text>}
      {txs.map(t => (
        <View key={t.id} style={[s.row, { flexWrap: 'nowrap', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }]}>
          <Text style={{ fontSize: 18 }}>{KIND_ICON[t.kind]}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontSize: 14 }]}>{t.note}</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>{new Date(t.date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</Text>
          </View>
          <Text style={{ fontWeight: '800', color: t.cents >= 0 ? C.ok : C.danger }}>{t.cents >= 0 ? '+' : ''}{euro(t.cents)}</Text>
          {parent && <Pressable accessibilityLabel="Buchung löschen" onPress={() => update(d => setAccount(d, child.id, a => ({ ...a, tx: a.tx.filter(x => x.id !== t.id) })))} style={{ paddingHorizontal: 6 }}><Text style={{ color: C.muted }}>✕</Text></Pressable>}
        </View>
      ))}
      {acc.tx.length > 8 && <Pressable onPress={() => setShowAll(v => !v)}><Text style={{ color: C.accent, fontWeight: '700' }}>{showAll ? 'Weniger' : `Alle ${acc.tx.length} Buchungen`}</Text></Pressable>}
      <Text style={[s.muted, { fontSize: 12 }]}>Das Konto hat nichts mit den Punkten zu tun. Es hilft zu sehen, wohin das Geld geht.</Text>
    </View>
  );
}
