import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { peopleOf, uid } from '../data/logic';
import { DishIdea, FamilyData, MealSlot, Recipe } from '../data/types';
import { conflictsOf, dietSummary } from '../data/food';
import { AI_ERROR, suggestDishes } from '../ai/generate';
import { Button } from '../ui/Button';
import { Clip } from '../ui/Clip';
import { C, s } from '../ui/theme';
import { DishTile } from './FoodPlus';
import { PlanPicker, recipeScore } from './Recipes';
import { parse } from '../ui/CalViews';

const norm = (t: string) => t.trim().toLowerCase();
const CHIPS = ['Schnell (unter 30 Min.)', 'Vegetarisch', 'Günstig', 'Aus dem Ofen', 'Ohne Fleisch und Fisch'];

/** Rezeptvorschläge: ein KI-Aufruf (günstiges Modell), Ergebnis wird gemerkt, bis es übernommen oder verworfen wird. */
export function DishIdeas({ onPlan, onClose }: { onPlan: (r: Recipe, date: string, slot: MealSlot) => void; onClose: () => void }) {
  const { data, update } = useFamily();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [wish, setWish] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const people = peopleOf(data);
  const items = data.dishIdeas?.items ?? [];

  const hard = (d: FamilyData, i: DishIdea) =>
    conflictsOf({ ...d, recipes: [...(d.recipes ?? []), { id: 'x', title: i.title, ingredients: i.ingredients }] } as FamilyData, i.title, people).filter(c => c.hard);

  const ask = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const rs = data.recipes ?? [];
      const week = new Date(); const wEnd = new Date(); wEnd.setDate(wEnd.getDate() + 7); week.setDate(week.getDate() - 7);
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      const got = await suggestDishes({
        month: new Date().toLocaleDateString('de-DE', { month: 'long' }),
        people: people.length,
        diet: dietSummary(data, people),
        liked: rs.filter(r => recipeScore(r) > 0).sort((a, b) => recipeScore(b) - recipeScore(a)).map(r => r.title),
        disliked: rs.filter(r => recipeScore(r) < 0).map(r => r.title),
        have: [...rs.map(r => r.title), ...items.map(i => i.title)],
        planned: (data.meals ?? []).filter(m => m.date >= iso(week) && m.date <= iso(wEnd)).map(m => m.title),
        wish: [...chips, wish.trim()].filter(Boolean).join(', ') || undefined,
      });
      // Doppelte Sicherung: Gerichte, die zu einer Unverträglichkeit passen, gar nicht erst anzeigen
      const safe = got.filter(i => !hard(data, i).length);
      if (!safe.length) throw { code: 'all_conflict' };
      update(d => ({ ...d, dishIdeas: { at: new Date().toISOString(), items: [...safe, ...(d.dishIdeas?.items ?? [])].slice(0, 12) } }));
    } catch (e: any) { setErr(e?.code === 'all_conflict' ? 'Alle Vorschläge passten nicht zu euren Unverträglichkeiten (z. B. Sahne bei Laktose) und wurden aussortiert. Bitte mit anderem Wunsch nochmal versuchen.' : e?.code === 'invalid_json' ? 'Die KI hat keine brauchbaren Rezepte geliefert. Bitte nochmal versuchen.' : AI_ERROR[e?.code] ?? 'Der Vorschlag hat nicht geklappt. Bitte nochmal versuchen.'); }
    setBusy(false);
  };

  const toRecipe = (i: DishIdea): Recipe => ({ id: uid(), title: i.title, ingredients: i.ingredients, steps: [i.time && `⏱ ${i.time}`, i.steps].filter(Boolean).join('\n') || undefined, ai: true, at: new Date().toISOString() });
  const drop = (id: string) => update(d => { const left = (d.dishIdeas?.items ?? []).filter(x => x.id !== id); return { ...d, dishIdeas: left.length ? { ...d.dishIdeas!, items: left } : undefined }; });
  const keep = (i: DishIdea): Recipe => {
    const ex = (data.recipes ?? []).find(r => norm(r.title) === norm(i.title));
    if (ex) return ex;
    const r = toRecipe(i);
    update(d => ({ ...d, recipes: (d.recipes ?? []).some(x => norm(x.title) === norm(i.title)) ? d.recipes : [...(d.recipes ?? []), r] }));
    return r;
  };

  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent, gap: 12 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h2}>Rezeptvorschläge</Text>
        <Button ghost title="Schließen" onPress={onClose} />
      </View>
      <Text style={s.muted}>Neue Gerichte, die zu euren Unverträglichkeiten, Lieblingen und dem Monat passen. Antippen zum Merken oder Einplanen.</Text>
      <View style={[s.row, { gap: 6 }]}>
        {CHIPS.map(c => {
          const on = chips.includes(c);
          return (
            <Pressable key={c} onPress={() => setChips(on ? chips.filter(x => x !== c) : [...chips, c])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={[s.chip, { paddingVertical: 7, backgroundColor: on ? C.accent : C.surface2 }]}>
              <Text style={{ fontWeight: '700', color: on ? '#fff' : C.fg, fontSize: 13 }}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput style={s.input} value={wish} onChangeText={setWish} placeholder="Wunsch oder Zutaten (optional), z. B. Hackfleisch, Paprika" />
      <View style={s.row}>
        <Button title={busy ? 'KI denkt nach …' : items.length ? 'Weitere Ideen' : 'Ideen holen'} disabled={busy} onPress={ask} />
      </View>
      {busy && <ActivityIndicator color={C.accent} />}
      <Text style={[s.muted, { fontSize: 12 }]}>Ein KI-Aufruf mit dem günstigen Modell (zählt zum Tageslimit). Es gehen nur Gerichtsnamen und anonyme Unverträglichkeiten raus, keine Namen und keine Fotos. Die Erkennung von Unverträglichkeiten ist ohne Gewähr, bitte Zutaten kurz prüfen.</Text>
      {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
      {items.map(i => {
        const soft = conflictsOf({ ...data, recipes: [...(data.recipes ?? []), { id: 'x', title: i.title, ingredients: i.ingredients }] } as FamilyData, i.title, people).filter(c => !c.hard);
        return (
          <View key={i.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <DishTile title={i.title} ingredients={i.ingredients} style={{ width: 72, height: 54 }} emojiSize={26} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[s.text, { fontWeight: '800' }]}>{i.title}<Text style={{ fontSize: 12, color: C.accent }}>  ✨ NEU</Text></Text>
                {!!i.why && <Text style={[s.muted, { fontSize: 13 }]}>{[i.why, i.time && `⏱ ${i.time}`].filter(Boolean).join(' · ')}</Text>}
                {soft.length > 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: C.warn }}>{soft.map(c => `${c.name}: ${c.why}`).join(' · ')}</Text>}
                <Clip style={[s.muted, { fontSize: 13 }]} lines={2}>{i.ingredients.join(', ')}</Clip>
              </View>
            </View>
            <View style={[s.row, { gap: 6 }]}>
              <Button title="➕ Merken" accessibilityLabel={`${i.title} in die Rezepte übernehmen`} style={{ paddingVertical: 8, minHeight: 40 }}
                onPress={() => { keep(i); drop(i.id); setMsg(`${i.title} steht jetzt bei den Rezepten.`); }} />
              <Button ghost title="Einplanen" style={{ paddingVertical: 8, minHeight: 40 }} onPress={() => setPlan(plan === i.id ? null : i.id)} />
              <Button ghost title={open === i.id ? 'Zuklappen' : 'Ansehen'} style={{ paddingVertical: 8, minHeight: 40 }} onPress={() => setOpen(open === i.id ? null : i.id)} />
              <Button ghost title="✕ Nicht so" accessibilityLabel={`${i.title} verwerfen`} style={{ paddingVertical: 8, minHeight: 40 }} onPress={() => drop(i.id)} />
            </View>
            {open === i.id && (
              <View style={{ gap: 6, backgroundColor: C.surface2, borderRadius: 14, padding: 12 }}>
                <Text style={s.text}><Text style={{ fontWeight: '800' }}>Zutaten{'\n'}</Text>{i.ingredients.map(x => `• ${x}`).join('\n')}</Text>
                {!!i.steps && <Text style={s.text}><Text style={{ fontWeight: '800' }}>Zubereitung{'\n'}</Text>{i.steps}</Text>}
              </View>
            )}
            {plan === i.id && <PlanPicker onPick={(date, slot) => { const r = keep(i); onPlan(r, date, slot); drop(i.id); setPlan(null); setMsg(`${i.title} steht am ${parse(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })} im Plan und bei den Rezepten.`); }} />}
          </View>
        );
      })}
      {items.length > 0 && !busy && (
        <Button ghost title="Alle verwerfen" onPress={() => update(d => ({ ...d, dishIdeas: undefined }))} />
      )}
    </View>
  );
}
