import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { euro, peopleOf, uid } from '../data/logic';
import { daysUntil, giftsOf, Occ, parseEuro, yearPlan } from '../data/gifts';
import { Gift } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';
import { Money } from './Money';
import { KidWishes, ParentWishes } from './Wishes';
import { pendingWishes } from '../data/wishes';

/** Geld-Reiter: Taschengeld, Wunschzettel und (für Eltern) Geschenke. */
export function MoneyTab({ childIds, parent, meId }: { childIds: string[]; parent: boolean; meId?: string }) {
  const { data } = useFamily();
  const [part, setPart] = useState<'taschengeld' | 'wuensche' | 'geschenke'>('taschengeld');
  const fresh = data ? pendingWishes(data).filter(w => childIds.includes(w.childId)).length : 0;
  if (!parent) return (
    <View style={{ gap: 14 }}>
      <Segmented value={part} onChange={setPart} options={[{ value: 'taschengeld', label: '👛 Taschengeld' }, { value: 'wuensche', label: '🎁 Wunschzettel' }]} />
      {part === 'taschengeld' ? <Money childIds={childIds} parent={parent} /> : childIds.map(id => <KidWishes key={id} childId={id} />)}
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      <Segmented value={part} onChange={setPart} options={[{ value: 'taschengeld', label: '👛 Taschengeld' }, { value: 'wuensche', label: fresh ? `📝 Wünsche (${fresh})` : '📝 Wünsche' }, { value: 'geschenke', label: '🎁 Geschenke' }]} />
      {part === 'taschengeld' ? <Money childIds={childIds} parent={parent} /> : part === 'wuensche' ? <ParentWishes childIds={childIds} meId={meId} /> : <Gifts meId={meId} />}
    </View>
  );
}

const when = (n: number) => (n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 60 ? `in ${n} Tagen` : `in ${Math.round(n / 30.4)} Monaten`);
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

export function Gifts({ meId }: { meId?: string }) {
  const { data, update } = useFamily();
  const [addOcc, setAddOcc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const plan = yearPlan(data, meId);
  const max = Math.max(1, ...plan.months.map(m => m.cents));
  return (
    <View style={{ gap: 14 }}>
      <View style={[s.card, { gap: 10 }]}>
        <Text style={s.label}>Nächste 12 Monate</Text>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end' }]}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: C.fg }}>{euro(plan.planned)}</Text>
            <Text style={s.muted}>geplant{plan.bought ? ` · ${euro(plan.bought)} schon gekauft` : ''}</Text>
          </View>
          {plan.open > 0 && (
            <View style={{ backgroundColor: C.okSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' }}>
              <Text style={{ color: C.ok, fontWeight: '800', fontSize: 18 }}>{euro(plan.perMonth)}</Text>
              <Text style={{ color: C.ok, fontSize: 12, fontWeight: '700' }}>pro Monat zurücklegen</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64 }} accessibilityLabel="Geschenke pro Monat">
          {plan.months.map(m => (
            <View key={m.ym} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View style={{ width: '100%', height: Math.max(3, (m.cents / max) * 44), borderRadius: 4, backgroundColor: m.cents ? C.accent : C.surface2 }} />
              <Text style={{ fontSize: 10, color: C.muted, fontWeight: '700' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {plan.planned === 0 && <Text style={[s.muted, { fontSize: 13 }]}>Trag Ideen mit ungefährem Preis ein. Dann siehst du, wann wie viel fällig wird und was du jeden Monat beiseitelegen solltest.</Text>}
      </View>

      {plan.occ.map(o => {
        const gs = giftsOf(data, o, meId);
        const n = daysUntil(o.date);
        const big = gs.length > 0 || n <= 45 || open === o.key;
        return big
          ? <OccCard key={o.key} o={o} gifts={gs} days={n} meId={meId} onRemoveOcc={o.custom ? () => update(d => ({ ...d, giftOccasions: (d.giftOccasions ?? []).filter(x => x.id !== o.key) })) : undefined} />
          : (
            <Pressable key={o.key} onPress={() => setOpen(o.key)} accessibilityRole="button" accessibilityLabel={`${o.title} öffnen`}
              style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }]}>
              <Text style={{ fontSize: 20 }}>{o.icon}</Text>
              <Text style={[s.text, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>{o.title}</Text>
              <Text style={[s.muted, { fontSize: 13 }]}>{fmtDate(o.date)} · {when(n)}</Text>
              <Text style={{ color: C.accent, fontWeight: '800' }}>+</Text>
            </Pressable>
          );
      })}

      {addOcc ? <OccForm onDone={() => setAddOcc(false)} /> : <Button ghost title="+ Anlass hinzufügen" onPress={() => setAddOcc(true)} />}
      <Text style={[s.muted, { fontSize: 12 }]}>Nur für Eltern sichtbar. Geschenke für dich selbst siehst du nicht, damit die Überraschung bleibt.</Text>
    </View>
  );
}

function OccCard({ o, gifts, days, meId, onRemoveOcc }: { o: Occ; gifts: Gift[]; days: number; meId?: string; onRemoveOcc?: () => void }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState(false);
  const people = peopleOf(data!);
  const forPeople = (o.forIds.length ? people.filter(p => o.forIds.includes(p.id)) : people).filter(p => p.id !== meId);
  const sum = gifts.reduce((t, g) => t + (g.cents ?? 0), 0);
  const name = (id?: string) => people.find(p => p.id === id);
  const set = (id: string, p: Partial<Gift>) => update(d => ({ ...d, gifts: (d.gifts ?? []).map(g => (g.id === id ? { ...g, ...p } : g)) }));
  const del = (id: string) => update(d => ({ ...d, gifts: (d.gifts ?? []).filter(g => g.id !== id) }));
  const sorted = [...gifts].sort((a, b) => (name(a.forId)?.name ?? '').localeCompare(name(b.forId)?.name ?? ''));
  return (
    <View style={[s.card, { gap: 10, padding: 16 }]}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <Text style={{ fontSize: 26 }}>{o.icon}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800', fontSize: 17 }]} numberOfLines={1}>{o.title}</Text>
          <Text style={[s.muted, { fontSize: 13, color: days <= 14 ? C.danger : C.muted, fontWeight: days <= 14 ? '700' : '400' }]}>{fmtDate(o.date)} · {when(days)}</Text>
        </View>
        {sum > 0 && <Text style={{ fontWeight: '800', color: C.fg }}>{euro(sum)}</Text>}
      </View>
      {sorted.map(g => {
        const p = name(g.forId), done = g.status === 'gekauft';
        return (
          <View key={g.id} style={[s.row, { flexWrap: 'nowrap', gap: 8, backgroundColor: done ? C.okSoft : C.bg, borderRadius: 12, padding: 8 }]}>
            <Pressable onPress={() => set(g.id, { status: done ? 'idee' : 'gekauft' })} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${g.title} gekauft`}
              style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.ok, backgroundColor: done ? C.ok : C.surface, alignItems: 'center', justifyContent: 'center' }}>
              {done && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.text, { fontSize: 15, fontWeight: '700' }]} numberOfLines={2}>{g.title}</Text>
              <Text style={{ fontSize: 12, color: p?.color ?? C.muted, fontWeight: '700' }}>{p ? `für ${p.name}` : ''}{done ? <Text style={{ color: C.ok }}>{p ? ' · ' : ''}gekauft</Text> : null}</Text>
            </View>
            {g.cents !== undefined && <Text style={{ fontWeight: '700', color: C.fg }}>{euro(g.cents)}</Text>}
            <Pressable onPress={() => del(g.id)} accessibilityRole="button" accessibilityLabel={`${g.title} löschen`} hitSlop={8}><Text style={{ color: C.muted, fontSize: 18 }}>×</Text></Pressable>
          </View>
        );
      })}
      {adding
        ? <GiftForm people={forPeople} onCancel={() => setAdding(false)} onSave={g => { update(d => ({ ...d, gifts: [...(d.gifts ?? []), { ...g, id: uid(), occ: o.key, year: +o.date.slice(0, 4), status: 'idee', by: meId, at: new Date().toISOString() }] })); setAdding(false); }} />
        : (
          <View style={s.row}>
            <Button ghost title="+ Idee" onPress={() => setAdding(true)} />
            {onRemoveOcc && !gifts.length && <Button ghost title="Anlass entfernen" onPress={onRemoveOcc} />}
          </View>
        )}
    </View>
  );
}

function GiftForm({ people, onSave, onCancel }: { people: { id: string; name: string; color: string }[]; onSave: (g: { title: string; cents?: number; forId?: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [forId, setForId] = useState(people.length === 1 ? people[0].id : '');
  const cents = parseEuro(price);
  return (
    <View style={{ gap: 8, backgroundColor: C.accentSoft, borderRadius: 14, padding: 10 }}>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Lego Set, Fahrradhelm" accessibilityLabel="Geschenkidee" autoFocus />
      <TextInput style={s.input} value={price} onChangeText={setPrice} placeholder="ca. Preis in €" keyboardType="decimal-pad" accessibilityLabel="Preis" />
      {people.length > 1 && (
        <View style={[s.row, { gap: 6 }]}>
          {people.map(p => {
            const on = forId === p.id;
            return (
              <Pressable key={p.id} onPress={() => setForId(on ? '' : p.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 2, borderColor: p.color, backgroundColor: on ? p.color : C.surface }}>
                <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onCancel} />
        <Button title="Merken" disabled={!title.trim() || (!!price.trim() && cents === undefined)} onPress={() => onSave({ title: title.trim(), cents, forId: forId || undefined })} />
      </View>
    </View>
  );
}

function OccForm({ onDone }: { onDone: () => void }) {
  const { data, update } = useFamily();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [forId, setForId] = useState('');
  const m = date.trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  const md = m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 ? `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  const people = peopleOf(data!);
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>Neuer Anlass</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Geburtstag Oma" accessibilityLabel="Anlass" />
      <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="Tag und Monat, z. B. 12.05." accessibilityLabel="Tag und Monat" />
      <Text style={s.label}>Für wen (optional)</Text>
      <View style={[s.row, { gap: 6 }]}>
        {people.map(p => {
          const on = forId === p.id;
          return (
            <Pressable key={p.id} onPress={() => setForId(on ? '' : p.id)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 2, borderColor: p.color, backgroundColor: on ? p.color : C.surface }}>
              <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>Kommt jedes Jahr wieder. Für Menschen außerhalb der Familie einfach den Namen in den Titel schreiben.</Text>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onDone} />
        <Button title="Anlegen" disabled={!title.trim() || !md} onPress={() => { update(d => ({ ...d, giftOccasions: [...(d.giftOccasions ?? []), { id: 'occ' + uid(), title: title.trim(), md: md!, forId: forId || undefined, icon: /geburt/i.test(title) ? '🎂' : '🎁' }] })); onDone(); }} />
      </View>
    </View>
  );
}

