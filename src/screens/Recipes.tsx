import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { peopleOf, today, uid } from '../data/logic';
import { FamilyData, MealSlot, Recipe } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { addDays, parse } from '../ui/CalViews';
import { C, s } from '../ui/theme';

const norm = (t: string) => t.trim().toLowerCase();
export const VOTES = [{ v: 2, icon: '❤️', label: 'Lieblingsessen' }, { v: 1, icon: '👍', label: 'Mag ich' }, { v: -1, icon: '👎', label: 'Lieber nicht' }];
const iconOf = (v: number) => VOTES.find(x => x.v === v)?.icon ?? '';

/** Punktzahl für das Ranking: Summe der Bewertungen */
export const recipeScore = (r: Recipe) => Object.values(r.votes ?? {}).reduce((a, b) => a + b, 0);
/** Wann zuletzt im Plan (YYYY-MM-DD), damit Eltern Abwechslung sehen */
export const lastCooked = (d: FamilyData, r: Recipe) => (d.meals ?? []).filter(m => norm(m.title) === norm(r.title) && m.date <= today()).map(m => m.date).sort().pop();

export function ranked(d: FamilyData) {
  return [...(d.recipes ?? [])].sort((a, b) => recipeScore(b) - recipeScore(a) || a.title.localeCompare(b.title));
}

export function Recipes({ meId, parent, onPlan, onShop }: { meId: string; parent: boolean; onPlan: (r: Recipe, date: string, slot: MealSlot) => void; onShop: (r: Recipe) => void }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const list = ranked(data);
  const people = peopleOf(data);
  const vote = (r: Recipe, v: number) => update(d => ({ ...d, recipes: (d.recipes ?? []).map(x => {
    if (x.id !== r.id) return x;
    const votes = { ...(x.votes ?? {}) };
    if (votes[meId] === v) delete votes[meId]; else votes[meId] = v;
    return { ...x, votes };
  }) }));
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={[s.muted, { flex: 1, minWidth: 200 }]}>
          {parent ? 'Ganz oben steht, was die Familie am liebsten isst. Antippen zum Einplanen.' : 'Bewerte die Gerichte oder schlag ein neues vor. Mama und Papa sehen das Ranking und planen danach.'}
        </Text>
        {!adding && <Button title={parent ? '+ Gericht' : '+ Vorschlagen'} onPress={() => { setAdding(true); setEdit(null); }} />}
      </View>
      {adding && <RecipeForm meId={meId} parent={parent} onDone={() => setAdding(false)} />}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
      {list.length === 0 && !adding && (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 34 }}>🍲</Text>
          <Text style={s.muted}>Noch keine Gerichte. Jedes Gericht aus dem Essensplan landet automatisch hier.</Text>
        </View>
      )}
      {list.map((r, i) => {
        const score = recipeScore(r);
        const by = r.by ? people.find(p => p.id === r.by) : undefined;
        const voters = Object.entries(r.votes ?? {}).map(([id, v]) => ({ p: people.find(x => x.id === id), v })).filter(x => x.p);
        const last = lastCooked(data, r);
        const fresh = !!r.by && !last && !(data.meals ?? []).some(m => norm(m.title) === norm(r.title));
        if (edit === r.id) return <RecipeForm key={r.id} meId={meId} parent={parent} recipe={r} onDone={() => setEdit(null)} />;
        return (
          <View key={r.id} style={[s.card, { padding: 14, gap: 10 }]}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: i < 3 && score > 0 ? '#fff2e0' : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '800', color: i < 3 && score > 0 ? '#c27100' : C.muted }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[s.text, { fontWeight: '800' }]}>{r.title}{fresh && <Text style={{ fontSize: 12, color: C.accent }}>  NEU</Text>}</Text>
                {r.ingredients.length > 0 && <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={2}>{r.ingredients.join(', ')}</Text>}
                <Text style={[s.muted, { fontSize: 12 }]}>
                  {[by && `Vorschlag von ${by.name}`, last ? `zuletzt ${parse(last).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}` : 'noch nie im Plan'].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
            {voters.length > 0 && (
              <View style={[s.row, { gap: 6 }]}>
                {voters.map(({ p, v }) => (
                  <View key={p!.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.surface2, borderRadius: 99, paddingRight: 8, padding: 2 }}>
                    <Avatar name={p!.name} color={p!.color} photo={(p as any).photo} size={22} />
                    <Text style={{ fontSize: 13 }}>{iconOf(v)}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={[s.row, { gap: 6 }]}>
              {VOTES.map(x => {
                const on = r.votes?.[meId] === x.v;
                return (
                  <Pressable key={x.v} onPress={() => vote(r, x.v)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${r.title}: ${x.label}`}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5, borderColor: on ? C.accent : C.line, backgroundColor: on ? C.accentSoft : C.surface }}>
                    <Text style={{ fontWeight: '700', color: C.fg }}>{x.icon}{parent ? '' : ` ${x.label}`}</Text>
                  </Pressable>
                );
              })}
              {parent && <View style={{ flex: 1 }} />}
              {parent && <Button title="📅 Einplanen" onPress={() => setPlan(plan === r.id ? null : r.id)} style={{ paddingVertical: 8, minHeight: 40 }} />}
              {parent && r.ingredients.length > 0 && <Button ghost title="🛒" accessibilityLabel={`Zutaten für ${r.title} auf die Einkaufsliste`} style={{ paddingVertical: 8, minHeight: 40, paddingHorizontal: 14 }}
                onPress={() => { onShop(r); setMsg(`Zutaten für ${r.title} stehen auf der Einkaufsliste.`); }} />}
              {(parent || r.by === meId) && <Button ghost title="✏️" accessibilityLabel={`${r.title} bearbeiten`} style={{ paddingVertical: 8, minHeight: 40, paddingHorizontal: 14 }} onPress={() => { setEdit(r.id); setAdding(false); }} />}
            </View>
            {plan === r.id && <PlanPicker onPick={(date, slot) => { onPlan(r, date, slot); setPlan(null); setMsg(`${r.title} steht am ${parse(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })} im Plan.`); }} />}
          </View>
        );
      })}
    </View>
  );
}


function PlanPicker({ onPick }: { onPick: (date: string, slot: MealSlot) => void }) {
  const { data } = useFamily();
  const [slot, setSlot] = useState<MealSlot>('abend');
  const days = Array.from({ length: 10 }, (_, i) => addDays(today(), i));
  return (
    <View style={{ gap: 8, backgroundColor: C.surface2, borderRadius: 16, padding: 10 }}>
      <View style={[s.row, { gap: 6 }]}>
        {(['mittag', 'abend'] as MealSlot[]).map(sl => (
          <Pressable key={sl} onPress={() => setSlot(sl)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: slot === sl ? C.fg : C.surface }}>
            <Text style={{ fontWeight: '700', color: slot === sl ? '#fff' : C.fg }}>{sl === 'mittag' ? '☀️ Mittag' : '🌙 Abend'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {days.map(d => {
          const taken = data?.meals?.find(m => m.date === d && m.slot === slot);
          return (
            <Pressable key={d} onPress={() => onPick(d, slot)} accessibilityLabel={`${d}${taken ? `, ersetzt ${taken.title}` : ''}`}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: taken ? '#f0c98f' : C.line, alignItems: 'center', minWidth: 52 }}>
              <Text style={{ fontWeight: '800', fontSize: 13 }}>{d === today() ? 'Heute' : parse(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' })}</Text>
              {taken && <Text numberOfLines={1} style={{ fontSize: 10, color: C.muted, maxWidth: 70 }}>{taken.title}</Text>}
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.muted, { fontSize: 12 }]}>Orange umrandet heißt: da steht schon etwas, das wird ersetzt.</Text>
    </View>
  );
}

function RecipeForm({ meId, parent, recipe, onDone }: { meId: string; parent: boolean; recipe?: Recipe; onDone: () => void }) {
  const { data, update } = useFamily();
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [ing, setIng] = useState(recipe?.ingredients.join(', ') ?? '');
  const dup = !recipe && data?.recipes?.find(r => norm(r.title) === norm(title));
  const save = () => {
    const t = title.trim();
    if (!t) return;
    const ingredients = ing.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
    update(d => {
      const rs = d.recipes ?? [];
      if (recipe) return { ...d, recipes: rs.map(x => (x.id === recipe.id ? { ...x, title: t, ingredients } : x)) };
      const ex = rs.find(x => norm(x.title) === norm(t));
      if (ex) return { ...d, recipes: rs.map(x => (x.id === ex.id ? { ...x, votes: { ...(x.votes ?? {}), [meId]: 2 } } : x)) };
      return { ...d, recipes: [...rs, { id: uid(), title: t, ingredients, by: meId, at: new Date().toISOString(), votes: { [meId]: 2 } }] };
    });
    onDone();
  };
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>{recipe ? 'Gericht bearbeiten' : parent ? 'Neues Gericht' : 'Was möchtest du gern mal essen?'}</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Pfannkuchen mit Apfelmus" autoFocus />
      <TextInput style={[s.input, { minHeight: 60 }]} multiline value={ing} onChangeText={setIng} placeholder={parent ? 'Zutaten, mit Komma getrennt' : 'Was braucht man dafür? (wenn du es weißt)'} />
      {dup && <Text style={[s.muted, { fontSize: 13 }]}>Das gibt es schon in der Sammlung. Speichern zählt es als dein Lieblingsessen.</Text>}
      <View style={s.row}>
        <Button title={recipe ? 'Speichern' : parent ? 'Hinzufügen' : 'Vorschlagen'} disabled={!title.trim()} onPress={save} />
        {recipe && (parent || recipe.by === meId) && <Button ghost title="Löschen" onPress={() => { update(d => ({ ...d, recipes: (d.recipes ?? []).filter(x => x.id !== recipe.id) })); onDone(); }} />}
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}
