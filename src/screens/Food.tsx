import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { FamilyData, MealSlot, Recipe } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { addDays, daysOf, parse } from '../ui/CalViews';
import { C, s } from '../ui/theme';

const SLOTS: { value: MealSlot; label: string; icon: string }[] = [
  { value: 'mittag', label: 'Mittag', icon: '☀️' }, { value: 'abend', label: 'Abend', icon: '🌙' },
];
const norm = (t: string) => t.trim().toLowerCase();

export function mealsOn(d: FamilyData, date: string) { return (d.meals ?? []).filter(m => m.date === date); }

/** Zutaten auf die Einkaufsliste, ohne doppelte offene Einträge */
export function addToShopping(d: FamilyData, items: string[], by?: string): FamilyData {
  const open = new Set((d.shopping ?? []).filter(i => !i.done).map(i => norm(i.title)));
  const add = items.map(t => t.trim()).filter(t => t && !open.has(norm(t)));
  const unique = add.filter((t, i) => add.findIndex(x => norm(x) === norm(t)) === i);
  return { ...d, shopping: [...unique.map(title => ({ id: uid(), title, done: false, at: new Date().toISOString(), by })), ...(d.shopping ?? [])] };
}

export function Food({ who }: { who: string }) {
  const [tab, setTab] = useState<'plan' | 'liste'>('plan');
  const { data } = useFamily();
  const open = (data?.shopping ?? []).filter(i => !i.done).length;
  return (
    <View style={{ gap: 16 }}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'plan', label: '🍽️ Essensplan' }, { value: 'liste', label: `🛒 Einkaufsliste${open ? ` (${open})` : ''}` }]} />
      {tab === 'plan' ? <MealPlan who={who} /> : <Shopping who={who} />}
    </View>
  );
}

function MealPlan({ who }: { who: string }) {
  const { data, update } = useFamily();
  const [anchor, setAnchor] = useState(today());
  const [edit, setEdit] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const days = daysOf('woche', anchor);
  const recipes = data.recipes ?? [];
  const weekMeals = (data.meals ?? []).filter(m => days.includes(m.date));
  const weekIngredients = weekMeals.flatMap(m => recipes.find(r => norm(r.title) === norm(m.title))?.ingredients ?? []);
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <Button ghost title="‹" accessibilityLabel="Vorige Woche" onPress={() => setAnchor(a => addDays(a, -7))} style={{ paddingHorizontal: 14 }} />
        <Button ghost title="Diese Woche" onPress={() => setAnchor(today())} />
        <Button ghost title="›" accessibilityLabel="Nächste Woche" onPress={() => setAnchor(a => addDays(a, 7))} style={{ paddingHorizontal: 14 }} />
        <Text style={[s.text, { fontWeight: '800', flex: 1, textAlign: 'right' }]} numberOfLines={1}>
          {parse(days[0]).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} bis {parse(days[6]).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
        </Text>
      </View>
      {edit && <MealEditor key={edit.date + edit.slot} date={edit.date} slot={edit.slot} onDone={() => setEdit(null)} />}
      <View style={[s.row, { alignItems: 'stretch', gap: 10 }]}>
        {days.map(d => {
          const isToday = d === today();
          return (
            <View key={d} style={[s.card, { flexGrow: 1, flexBasis: 150, minWidth: 0, padding: 12, gap: 8, borderWidth: isToday ? 2 : 0, borderColor: C.accent }]}>
              <Text style={{ fontWeight: '800', color: isToday ? C.accent : C.fg }}>{parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })}</Text>
              {SLOTS.map(sl => {
                const m = (data.meals ?? []).find(x => x.date === d && x.slot === sl.value);
                return (
                  <Pressable key={sl.value} onPress={() => setEdit({ date: d, slot: sl.value })} accessibilityLabel={`${sl.label} am ${d}: ${m?.title ?? 'leer'}`}
                    style={{ backgroundColor: m ? '#fff2e0' : C.bg, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: m ? '#f0c98f' : 'transparent', borderStyle: m ? 'solid' : 'dashed' }}>
                    <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>{sl.icon} {sl.label}</Text>
                    <Text style={{ fontWeight: m ? '700' : '400', color: m ? C.fg : C.muted }}>{m?.title ?? '+ eintragen'}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
      {weekIngredients.length > 0 && (
        <Button title={`🛒 Zutaten der Woche auf die Einkaufsliste (${weekIngredients.length})`} onPress={() => { update(d => addToShopping(d, weekIngredients, who)); setMsg('Zutaten sind auf der Einkaufsliste. Doppelte habe ich weggelassen.'); }} />
      )}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
      <Text style={[s.muted, { fontSize: 13 }]}>Tipp: Gerichte mit Zutaten merkt sich die App. Beim nächsten Mal reicht ein Tipp auf das Lieblingsgericht.</Text>
    </View>
  );
}

function MealEditor({ date, slot, onDone }: { date: string; slot: MealSlot; onDone: () => void }) {
  const { data, update } = useFamily();
  const existing = data?.meals?.find(m => m.date === date && m.slot === slot);
  const [title, setTitle] = useState(existing?.title ?? '');
  const known = data?.recipes?.find(r => norm(r.title) === norm(title));
  const [ingredients, setIngredients] = useState((existing && data?.recipes?.find(r => norm(r.title) === norm(existing.title))?.ingredients.join(', ')) ?? '');
  if (!data) return null;
  const favs = [...(data.recipes ?? [])].sort((a, b) => countUses(data, b) - countUses(data, a)).slice(0, 12);
  const save = () => {
    const t = title.trim();
    update(d => {
      let meals = (d.meals ?? []).filter(m => !(m.date === date && m.slot === slot));
      if (t) meals = [...meals, { id: uid(), date, slot, title: t }];
      const ing = ingredients.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
      let recipes = d.recipes ?? [];
      if (t && ing.length) {
        const r = recipes.find(x => norm(x.title) === norm(t));
        recipes = r ? recipes.map(x => (x.id === r.id ? { ...x, ingredients: ing } : x)) : [...recipes, { id: uid(), title: t, ingredients: ing } as Recipe];
      }
      return { ...d, meals, recipes };
    });
    onDone();
  };
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>{SLOTS.find(x => x.value === slot)?.icon} {SLOTS.find(x => x.value === slot)?.label}, {parse(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      {favs.length > 0 && (
        <View style={[s.row, { gap: 6 }]}>
          {favs.map(r => (
            <Pressable key={r.id} onPress={() => { setTitle(r.title); setIngredients(r.ingredients.join(', ')); }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: norm(r.title) === norm(title) ? C.accent : C.surface }}>
              <Text style={{ color: norm(r.title) === norm(title) ? '#fff' : C.fg, fontWeight: '700' }}>{r.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput style={s.input} value={title} onChangeText={t => { setTitle(t); const r = data.recipes?.find(x => norm(x.title) === norm(t)); if (r) setIngredients(r.ingredients.join(', ')); }} placeholder="Was gibt es? z. B. Spaghetti Bolognese" autoFocus />
      <TextInput style={[s.input, { minHeight: 60 }]} multiline value={ingredients} onChangeText={setIngredients} placeholder="Zutaten, mit Komma getrennt (optional): Nudeln, Hackfleisch, Tomaten" />
      {known && <Text style={[s.muted, { fontSize: 13 }]}>Bekanntes Gericht, Zutaten übernommen.</Text>}
      <View style={s.row}>
        <Button title="Speichern" onPress={save} />
        {existing && <Button ghost title="Leeren" onPress={() => { update(d => ({ ...d, meals: (d.meals ?? []).filter(m => m.id !== existing.id) })); onDone(); }} />}
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}
const countUses = (d: FamilyData, r: Recipe) => (d.meals ?? []).filter(m => norm(m.title) === norm(r.title)).length;

function Shopping({ who }: { who: string }) {
  const { data, update } = useFamily();
  const [text, setText] = useState('');
  if (!data) return null;
  const list = data.shopping ?? [];
  const open = list.filter(i => !i.done);
  const done = list.filter(i => i.done);
  const add = () => { if (!text.trim()) return; update(d => addToShopping(d, text.split(',').map(x => x.trim()), who)); setText(''); };
  const toggle = (id: string) => update(d => ({ ...d, shopping: (d.shopping ?? []).map(i => (i.id === id ? { ...i, done: !i.done } : i)) }));
  return (
    <View style={[s.card, { maxWidth: 640, width: '100%' }]}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={text} onChangeText={setText} onSubmitEditing={add} placeholder="Was fehlt? z. B. Milch, Brot" returnKeyType="done" />
        <Button title="+" accessibilityLabel="Hinzufügen" onPress={add} disabled={!text.trim()} />
      </View>
      {open.length === 0 && <Text style={s.muted}>Alles da. 🎉</Text>}
      {open.map(i => (
        <Pressable key={i.id} onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={i.title}
          style={[s.row, { flexWrap: 'nowrap', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }]}>
          <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.accent }} />
          <Text style={[s.text, { flex: 1, fontSize: 18 }]}>{i.title}</Text>
          {i.by ? <Text style={[s.muted, { fontSize: 12 }]}>{i.by}</Text> : null}
        </Pressable>
      ))}
      {done.length > 0 && (
        <>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.label}>Im Wagen ({done.length})</Text>
            <Pressable onPress={() => update(d => ({ ...d, shopping: (d.shopping ?? []).filter(i => !i.done) }))}><Text style={{ color: C.danger, fontWeight: '700' }}>Erledigte entfernen</Text></Pressable>
          </View>
          {done.map(i => (
            <Pressable key={i.id} onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={i.title}
              style={[s.row, { flexWrap: 'nowrap', paddingVertical: 6, opacity: 0.5 }]}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text></View>
              <Text style={[s.text, { flex: 1, textDecorationLine: 'line-through' }]}>{i.title}</Text>
            </Pressable>
          ))}
        </>
      )}
      <Text style={[s.muted, { fontSize: 13 }]}>Alle in der Familie können etwas eintragen. Mit Komma gehen mehrere auf einmal.</Text>
    </View>
  );
}
