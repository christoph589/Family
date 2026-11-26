import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { accountOf, addSplitTx, addTx, ageOf, allowanceHint, balanceOf, euro, moneyPot, moneyRules, movePot, setAccount, splitCents, today, txPot, uid } from '../data/logic';
import { tipFor } from '../data/moneyTips';
import { PersonHead } from '../ui/Avatar';
import { Child, MoneyPot, MoneyTx } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

/** "3,50" oder "3.5" zu Cent, sonst null */
const toCents = (t: string) => { const v = Number(t.replace(',', '.').trim()); return t.trim() && Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v * 100) : null; };
const KIND_ICON: Record<MoneyTx['kind'], string> = { taschengeld: '💶', geschenk: '🎁', verdient: '💪', ausgabe: '🛒', korrektur: '✏️', umbuchung: '↔️', zins: '📈' };
export const POTS: { id: MoneyPot; icon: string; name: string; hint: string }[] = [
  { id: 'aus', icon: '🛒', name: 'Ausgeben', hint: 'Dein Bargeld, du entscheidest.' },
  { id: 'spar', icon: '🐷', name: 'Sparen', hint: 'Für ein Ziel. Rausnehmen mit Eltern-OK.' },
  { id: 'invest', icon: '📈', name: 'Investieren', hint: 'Wächst jeden Monat durch Zinsen.' },
];
const potName = (p: MoneyPot) => POTS.find(x => x.id === p)!;
/** Stand von Investieren nach n Monaten mit Zinseszins und gleichbleibender Einzahlung */
const project = (start: number, perMonth: number, rate: number, months: number) => { let b = start; for (let i = 0; i < months; i++) b = b * (1 + rate / 100) + perMonth; return Math.round(b); };

/** Taschengeld-Konto je Kind. Bewusst getrennt von den Punkten. */
export function Money({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data } = useFamily();
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  if (parent && kids.length > 1) return <MoneyOverview kids={kids} />;
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      {kids.map(c => <Account key={c.id} child={c} parent={parent} />)}
    </View>
  );
}

/** Eltern mit mehreren Kindern: eine kurze Karte pro Kind, Anfragen direkt entscheiden, Antippen öffnet das Konto. */
function MoneyOverview({ kids }: { kids: Child[] }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const sel = kids.find(k => k.id === open);
  if (sel) return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={() => setOpen(null)} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 }}>
        <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>← Alle Kinder</Text>
      </Pressable>
      <View style={[s.row, { alignItems: 'flex-start' }]}><Account child={sel} parent /></View>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      {kids.map(child => {
        const acc = accountOf(data, child.id);
        const bals = POTS.map(p => [p, moneyPot(data, child.id, p.id)] as const);
        const reqs = acc.requests ?? [];
        return (
          <Pressable key={child.id} onPress={() => setOpen(child.id)} accessibilityRole="button" accessibilityLabel={`${child.name}: ${euro(balanceOf(data, child.id))}`}
            style={[s.card, { padding: 14, gap: 10, borderLeftWidth: 6, borderLeftColor: child.color }]}>
            <View style={[s.row, { flexWrap: 'nowrap', justifyContent: 'space-between' }]}>
              <Text style={[s.text, { fontWeight: '800', fontSize: 17, flexShrink: 1 }]} numberOfLines={1}>{child.name}</Text>
              <View style={[s.row, { gap: 6 }]}>
                <Text style={{ fontWeight: '800', fontSize: 18, color: C.fg }}>{euro(balanceOf(data, child.id))}</Text>
                <Text style={{ color: C.muted, fontSize: 22 }}>›</Text>
              </View>
            </View>
            <Text style={[s.muted, { fontSize: 13 }]}>{bals.map(([p, v]) => `${p.icon} ${euro(v)}`).join('   ')}{acc.goal ? `   ·   Ziel: ${acc.goal.title}` : ''}</Text>
            {reqs.map(q => (
              <View key={q.id} style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.warnSoft, borderRadius: 14, padding: 10, gap: 8 }]}>
                <Text style={[s.text, { flex: 1, fontSize: 14, fontWeight: '700' }]}>{euro(q.cents)} von {potName(q.from).icon} {potName(q.from).name} nach {potName(q.to).icon} {potName(q.to).name}{q.note ? ` · ${q.note}` : ''}</Text>
                <Button title="Ja" onPress={() => update(d => setAccount(movePot(d, child.id, q.cents, q.from, q.to, q.note || 'Umbuchung'), child.id, a => ({ ...a, requests: (a.requests ?? []).filter(x => x.id !== q.id) })))} style={{ paddingVertical: 6, paddingHorizontal: 12, minHeight: 0 }} />
                <Button ghost title="Nein" onPress={() => update(d => setAccount(d, child.id, a => ({ ...a, requests: (a.requests ?? []).filter(x => x.id !== q.id) })))} style={{ paddingVertical: 6, paddingHorizontal: 12, minHeight: 0 }} />
              </View>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

function Account({ child, parent }: { child: Child; parent: boolean }) {
  const { data, update } = useFamily();
  const [mode, setMode] = useState<'' | 'ausgabe' | 'plus' | 'regel' | 'ziel' | 'umbuchen'>('');
  const [pot, setPot] = useState<MoneyPot | 'split'>('split');
  const [from, setFrom] = useState<MoneyPot>('aus');
  const [to, setTo] = useState<MoneyPot>('spar');
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
  const bals = { aus: moneyPot(data, child.id, 'aus'), spar: moneyPot(data, child.id, 'spar'), invest: moneyPot(data, child.id, 'invest') };
  const rules = moneyRules(data);
  const sparBal = bals.spar;
  const goalPct = goal ? Math.min(100, Math.max(0, (sparBal / goal.cents) * 100)) : 0;
  const allowMonth = acc.allowance ? (acc.allowance.every === 'woche' ? (acc.allowance.cents * 52) / 12 : acc.allowance.cents) : 0;
  const investMonth = splitCents(data, Math.round(allowMonth)).find(([p]) => p === 'invest')?.[1] ?? 0;
  const sparMonth = splitCents(data, Math.round(allowMonth)).find(([p]) => p === 'spar')?.[1] ?? 0;
  const interestSum = acc.tx.filter(x => x.kind === 'zins').reduce((a, x) => a + x.cents, 0);
  const curve = [0, 12, 24, 36, 48, 60].map(m => project(bals.invest, investMonth, rules.rate, m));
  const requests = acc.requests ?? [];
  const reqCents = (p: MoneyPot) => requests.filter(q => q.from === p).reduce((a, q) => a + q.cents, 0);
  const txs = showAll ? acc.tx : acc.tx.slice(0, 8);
  const spentMonth = acc.tx.filter(t => t.cents < 0 && t.date.slice(0, 7) === today().slice(0, 7)).reduce((a, t) => a - t.cents, 0);

  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
      <PersonHead name={child.name} color={child.color} photo={child.photo} sub="Taschengeld-Konto" value={euro(bal)} />
      {acc.allowance ? (
        <Text style={s.muted}>Taschengeld: {euro(acc.allowance.cents)} pro {acc.allowance.every === 'woche' ? 'Woche' : 'Monat'}{spentMonth ? ` · diesen Monat ausgegeben: ${euro(spentMonth)}` : ''}</Text>
      ) : parent ? <Text style={s.muted}>Noch kein regelmäßiges Taschengeld eingestellt.</Text> : null}

      <View style={[s.row, { gap: 8, alignItems: 'stretch' }]}>
        {POTS.map(p => (
          <View key={p.id} style={{ flexGrow: 1, flexBasis: 140, backgroundColor: C.bg, borderRadius: 14, padding: 12, gap: 4 }}>
            <Text style={[s.text, { fontWeight: '800' }]}>{p.icon} {p.name}</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: bals[p.id] < 0 ? C.danger : C.fg }}>{euro(bals[p.id])}</Text>
            {p.id === 'spar' && goal ? (
              <>
                <Text style={[s.muted, { fontSize: 13 }]}>Ziel: {goal.title}</Text>
                <View style={{ height: 10, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${goalPct}%`, backgroundColor: child.color }} />
                </View>
                <Text style={[s.muted, { fontSize: 12 }]}>{sparBal >= goal.cents ? 'Geschafft! 🎉' : `Noch ${euro(goal.cents - sparBal)}${sparMonth ? ` · ca. ${Math.ceil((goal.cents - sparBal) / sparMonth)} Monate` : ''}`}</Text>
                <Pressable onPress={() => update(d => setAccount(d, child.id, a => ({ ...a, goal: undefined })))}><Text style={{ color: C.muted, fontWeight: '700', fontSize: 12 }}>Ziel entfernen</Text></Pressable>
              </>
            ) : p.id === 'invest' ? (
              <>
                <Text style={[s.muted, { fontSize: 12 }]}>{String(rules.rate).replace('.', ',')} % Zins pro Monat{interestSum ? ` · bisher +${euro(interestSum)} Zinsen` : ''}</Text>
                {(bals.invest > 0 || investMonth > 0) && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56, marginTop: 4 }}>
                      {curve.map((v, i) => <View key={i} style={{ flex: 1, height: `${Math.max(4, (v / Math.max(1, curve[5])) * 100)}%`, backgroundColor: child.color, opacity: 0.4 + i * 0.12, borderRadius: 4 }} />)}
                    </View>
                    <Text style={[s.muted, { fontSize: 12 }]}>So wächst es{investMonth ? ', wenn du weiter so einzahlst' : ''}: in 1 Jahr {euro(curve[1])}, in 5 Jahren {euro(curve[5])}</Text>
                  </>
                )}
              </>
            ) : <Text style={[s.muted, { fontSize: 12 }]}>{p.hint}</Text>}
            {reqCents(p.id) > 0 && <Text style={{ color: C.warn, fontSize: 12, fontWeight: '700' }}>Angefragt: {euro(reqCents(p.id))}</Text>}
          </View>
        ))}
      </View>
      {acc.allowance && <Text style={[s.muted, { fontSize: 13 }]}>Aufteilung: {100 - rules.spar - rules.invest} % Ausgeben · {rules.spar} % Sparen · {rules.invest} % Investieren</Text>}

      {requests.length > 0 && (
        <View style={{ gap: 6, backgroundColor: '#fff7e0', borderRadius: 12, padding: 12 }}>
          {requests.map(q => (
            <View key={q.id} style={[s.row, { gap: 8 }]}>
              <Text style={[s.text, { flex: 1 }]}>🙋 {euro(q.cents)} von {potName(q.from).name} nach {potName(q.to).name}{q.note ? ` („${q.note}“)` : ''}</Text>
              {parent ? (
                <>
                  <Button title="Ja" onPress={() => update(d => setAccount(movePot(d, child.id, q.cents, q.from, q.to, q.note || 'Umbuchung'), child.id, a => ({ ...a, requests: (a.requests ?? []).filter(x => x.id !== q.id) })))} style={{ paddingVertical: 6 }} />
                  <Button ghost title="Nein" onPress={() => update(d => setAccount(d, child.id, a => ({ ...a, requests: (a.requests ?? []).filter(x => x.id !== q.id) })))} style={{ paddingVertical: 6 }} />
                </>
              ) : <Text style={s.muted}>wartet auf Eltern</Text>}
            </View>
          ))}
        </View>
      )}

      <View style={{ backgroundColor: '#fff7e0', borderRadius: 12, padding: 12 }}>
        <Text style={[s.text, { fontSize: 15 }]}>💡 {tipFor(age, today())}</Text>
      </View>

      <View style={[s.row, { gap: 8 }]}>
        <Button ghost={mode !== 'ausgabe'} title="🛒 Ausgabe" onPress={() => { setMode('ausgabe'); setPot('aus'); }} style={{ paddingVertical: 8 }} />
        <Button ghost={mode !== 'umbuchen'} title="↔️ Umbuchen" onPress={() => { setMode('umbuchen'); setFrom('aus'); setTo('spar'); }} style={{ paddingVertical: 8 }} />
        {parent && <Button ghost={mode !== 'plus'} title="➕ Geld dazu" onPress={() => { setMode('plus'); setPot('split'); }} style={{ paddingVertical: 8 }} />}
        {!goal && <Button ghost={mode !== 'ziel'} title="🐷 Sparziel" onPress={() => setMode('ziel')} style={{ paddingVertical: 8 }} />}
        {parent && <Button ghost={mode !== 'regel'} title="⚙️ Taschengeld" onPress={() => { setMode('regel'); setEvery(acc.allowance?.every ?? ((age ?? 9) >= 10 ? 'monat' : 'woche')); setAmount(acc.allowance ? String(acc.allowance.cents / 100).replace('.', ',') : ''); }} style={{ paddingVertical: 8 }} />}
      </View>

      {mode !== '' && (
        <View style={{ gap: 8, borderWidth: 2, borderColor: C.accent, borderRadius: 12, padding: 12 }}>
          {mode === 'plus' && <Segmented value={plusKind} onChange={setPlusKind} options={[{ value: 'geschenk', label: '🎁 Geschenk' }, { value: 'verdient', label: '💪 Verdient' }]} />}
          {mode === 'plus' && <Segmented value={pot} onChange={setPot} options={[{ value: 'split', label: 'Aufteilen' }, ...POTS.map(p => ({ value: p.id, label: `${p.icon} ${p.name}` }))]} />}
          {mode === 'ausgabe' && parent && <Segmented value={pot} onChange={setPot} options={POTS.map(p => ({ value: p.id, label: `Aus ${p.icon} ${p.name}` }))} />}
          {mode === 'umbuchen' && (
            <>
              <Text style={s.label}>Von</Text>
              <Segmented value={from} onChange={v => { setFrom(v); if (v === to) setTo(POTS.find(p => p.id !== v)!.id); }} options={POTS.map(p => ({ value: p.id, label: `${p.icon} ${p.name}` }))} />
              <Text style={s.label}>Nach</Text>
              <Segmented value={to} onChange={setTo} options={POTS.filter(p => p.id !== from).map(p => ({ value: p.id, label: `${p.icon} ${p.name}` }))} />
              {!parent && <Text style={[s.muted, { fontSize: 13 }]}>Umbuchen geht nur mit Eltern-OK. Deine Anfrage landet bei Mama oder Papa.</Text>}
            </>
          )}
          {mode === 'regel' && (
            <>
              <Segmented value={every} onChange={setEvery} options={[{ value: 'woche', label: 'Pro Woche' }, { value: 'monat', label: 'Pro Monat' }]} />
              {allowanceHint(age) && <Text style={[s.muted, { fontSize: 13 }]}>Richtwert der Jugendämter: {allowanceHint(age)}. Nur Orientierung.</Text>}
              {!age && <Text style={[s.muted, { fontSize: 13 }]}>Tipp: Trag unter Verwalten den Geburtstag ein, dann zeige ich einen Richtwert.</Text>}
            </>
          )}
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <TextInput style={[s.input, { width: 110 }]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00 €" accessibilityLabel="Betrag in Euro" />
            {mode !== 'regel' && <TextInput style={[s.input, { flex: 1 }]} value={note} onChangeText={setNote} placeholder={mode === 'ausgabe' ? 'Wofür? z. B. Comic' : mode === 'ziel' ? 'Wofür sparst du?' : mode === 'umbuchen' ? 'Warum? (optional)' : 'Von wem oder wofür?'} />}
          </View>
          {mode === 'ausgabe' && cents !== null && cents > bals[pot === 'split' ? 'aus' : pot] && <Text style={{ color: C.warn }}>Das ist mehr, als in {potName(pot === 'split' ? 'aus' : pot).name} ist.</Text>}
          {mode === 'umbuchen' && cents !== null && cents > bals[from] && <Text style={{ color: C.warn }}>Das ist mehr, als in {potName(from).name} ist.</Text>}
          <View style={s.row}>
            <Button title={mode === 'umbuchen' && !parent ? 'Anfragen' : 'Speichern'} disabled={cents === null || (mode !== 'regel' && mode !== 'umbuchen' && !note.trim()) || (mode === 'umbuchen' && cents > bals[from])} onPress={() => {
              if (cents === null) return;
              if (mode === 'ausgabe') update(d => addTx(d, child.id, -cents, note.trim(), 'ausgabe', today(), pot === 'split' ? 'aus' : pot));
              if (mode === 'plus') update(d => (pot === 'split' ? addSplitTx(d, child.id, cents, note.trim(), plusKind) : addTx(d, child.id, cents, note.trim(), plusKind, today(), pot)));
              if (mode === 'umbuchen') {
                if (!parent) update(d => setAccount(d, child.id, a => ({ ...a, requests: [...(a.requests ?? []), { id: uid(), cents, from, to, note: note.trim(), at: today() }] })));
                else update(d => movePot(d, child.id, cents, from, to, note.trim() || 'Umbuchung'));
              }
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
            <Text style={[s.muted, { fontSize: 12 }]}>{new Date(t.date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} · {potName(txPot(t)).icon} {potName(txPot(t)).name}</Text>
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
