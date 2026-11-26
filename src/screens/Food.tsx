import { useState } from 'react';
import { PhotoImg } from '../ui/PhotoImg';
import { Image, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { peopleOf, today, uid } from '../data/logic';
import { FamilyData, MealSlot, Recipe, ShopItem } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { DateField } from '../ui/DateField';
import { Button, Segmented } from '../ui/Button';
import { addDays, daysOf, parse } from '../ui/CalViews';
import { C, s } from '../ui/theme';
import { Recipes, recipeScore } from './Recipes';
import { ConflictNote, DietEditor, DishTile, pickDishPhoto, WeekCheck, WeekPlanner } from './FoodPlus';
import { recipeOf } from '../data/food';

const SLOTS: { value: MealSlot; label: string; icon: string }[] = [
  { value: 'mittag', label: 'Mittag', icon: '☀️' }, { value: 'abend', label: 'Abend', icon: '🌙' },
];
const norm = (t: string) => t.trim().toLowerCase();

export function mealsOn(d: FamilyData, date: string) { return (d.meals ?? []).filter(m => m.date === date); }
/** Foto zum Gericht: hängt am Lieblingsrezept mit gleichem Namen, gilt also für jedes Mal, wenn es das gibt. */
export const dishPhoto = (d: FamilyData, title: string) => (d.recipes ?? []).find(r => norm(r.title) === norm(title))?.photo;

export { pickDishPhoto, shrinkDishPhoto } from './FoodPlus';

/** Gericht mit Foto (falls vorhanden) für die Wand und den Plan */
export function DishLine({ title, icon, photo, size = 20 }: { title: string; icon: string; photo?: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <DishTile title={title} photo={photo} style={{ width: size * 3.6, height: size * 2.7, borderRadius: 12 }} emojiSize={size * 1.4} />
      <Text style={[s.text, { fontWeight: '800', fontSize: size, flex: 1 }]} numberOfLines={2}>{icon} {title}</Text>
    </View>
  );
}

/** Zutaten auf die Einkaufsliste, ohne doppelte offene Einträge */
export function addToShopping(d: FamilyData, items: string[], by?: string): FamilyData {
  const open = new Set((d.shopping ?? []).filter(i => !i.done).map(i => norm(i.title)));
  const add = items.map(t => t.trim()).filter(t => t && !open.has(norm(t)));
  const unique = add.filter((t, i) => add.findIndex(x => norm(x) === norm(t)) === i);
  return { ...d, shopping: [...unique.map(title => ({ id: uid(), title, done: false, at: new Date().toISOString(), by })), ...(d.shopping ?? [])] };
}

export function Food({ who, meId, parent = true }: { who: string; meId?: string; parent?: boolean }) {
  const [tab, setTab] = useState<'plan' | 'rezepte' | 'liste' | 'wer'>('plan');
  const { data, update } = useFamily();
  const open = (data?.shopping ?? []).filter(i => !i.done).length;
  const narrow = useWindowDimensions().width < 600;
  return (
    <View style={{ gap: 16 }}>
      <Segmented value={tab} onChange={setTab} options={narrow
        ? [{ value: 'plan', label: 'Plan' }, { value: 'rezepte', label: 'Rezepte' }, { value: 'liste', label: `Liste${open ? ` (${open})` : ''}` }, { value: 'wer', label: 'Wer isst was' }]
        : [{ value: 'plan', label: '🍽️ Essensplan' }, { value: 'rezepte', label: '❤️ Lieblingsrezepte' }, { value: 'liste', label: `🛒 Einkaufsliste${open ? ` (${open})` : ''}` }, { value: 'wer', label: '🥦 Wer isst was' }]} />
      {tab === 'plan' && <MealPlan who={who} readOnly={!parent} onWish={() => setTab('rezepte')} />}
      {tab === 'rezepte' && meId && (
        <Recipes meId={meId} parent={parent}
          onShop={r => update(d => addToShopping(d, r.ingredients, who))}
          onPlan={(r, date, slot) => update(d => ({ ...d, meals: [...(d.meals ?? []).filter(m => !(m.date === date && m.slot === slot)), { id: uid(), date, slot, title: r.title }] }))} />
      )}
      {tab === 'liste' && <Shopping who={who} meId={meId} />}
      {tab === 'wer' && <DietEditor parent={parent} meId={meId} />}
    </View>
  );
}

export function MealPlan({ who, readOnly, onWish }: { who: string; readOnly?: boolean; onWish?: () => void }) {
  const { data, update } = useFamily();
  const [anchor, setAnchor] = useState(today());
  const [edit, setEdit] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [msg, setMsg] = useState('');
  const [planning, setPlanning] = useState(false);
  const narrow = useWindowDimensions().width < 600;
  if (!data) return null;
  const days = daysOf('woche', anchor);
  const hasIdeas = data.mealIdeas?.week === days[0] && data.mealIdeas.items.length > 0;
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
          {parse(days[0]).getDate()}.–{parse(days[6]).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
        </Text>
      </View>
      {!readOnly && !planning && <Button ghost title={hasIdeas ? '✨ Vorschlag für die Woche ansehen' : '✨ Woche planen'} onPress={() => { setPlanning(true); setEdit(null); }} style={{ alignSelf: 'flex-start' }} />}
      {!readOnly && planning && <WeekPlanner days={days} onDone={() => setPlanning(false)} />}
      {edit && <MealEditor key={edit.date + edit.slot} date={edit.date} slot={edit.slot} onDone={() => setEdit(null)} />}
      {narrow ? (
        <View style={[s.card, { padding: 6, gap: 0 }]}>
          {days.map((d, i) => {
            const isToday = d === today();
            return (
              <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: isToday ? C.accentSoft : 'transparent', borderRadius: isToday ? 14 : 0 }}>
                <View style={{ width: 38, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: isToday ? C.accent : C.muted }}>{parse(d).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: isToday ? C.accent : C.fg }}>{parse(d).getDate()}</Text>
                </View>
                {SLOTS.map(sl => {
                  const m = (data.meals ?? []).find(x => x.date === d && x.slot === sl.value);
                  return (
                    <Pressable key={sl.value} disabled={readOnly} onPress={() => setEdit({ date: d, slot: sl.value })} accessibilityLabel={`${sl.label} am ${d}: ${m?.title ?? 'leer'}`}
                      style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', backgroundColor: m ? '#fff2e0' : C.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: m ? '#f0c98f' : 'transparent' }}>
                      {m && dishPhoto(data, m.title) ? <PhotoImg uri={dishPhoto(data, m.title)} style={{ width: '100%', height: 54, borderRadius: 8, marginBottom: 4 }} resizeMode="cover" /> : null}
                      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>{sl.icon} {sl.label}</Text>
                      <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: m ? '700' : '400', color: m ? C.fg : C.muted }}>{m?.title ?? (readOnly ? '–' : '+')}</Text>
                      {m && <ConflictNote title={m.title} compact />}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : (
      <View style={[s.row, { alignItems: 'stretch', gap: 10 }]}>
        {days.map(d => {
          const isToday = d === today();
          return (
            <View key={d} style={[s.card, { flexGrow: 1, flexBasis: 150, minWidth: 0, padding: 12, gap: 8, borderWidth: isToday ? 2 : 0, borderColor: C.accent }]}>
              <Text style={{ fontWeight: '800', color: isToday ? C.accent : C.fg }}>{parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })}</Text>
              {SLOTS.map(sl => {
                const m = (data.meals ?? []).find(x => x.date === d && x.slot === sl.value);
                return (
                  <Pressable key={sl.value} disabled={readOnly} onPress={() => setEdit({ date: d, slot: sl.value })} accessibilityLabel={`${sl.label} am ${d}: ${m?.title ?? 'leer'}`}
                    style={{ backgroundColor: m ? '#fff2e0' : C.bg, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: m ? '#f0c98f' : 'transparent', borderStyle: m ? 'solid' : 'dashed' }}>
                    {m ? <DishTile title={m.title} photo={dishPhoto(data, m.title)} ingredients={recipeOf(data, m.title)?.ingredients} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginBottom: 6 }} emojiSize={30} /> : null}
                    <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700' }}>{sl.icon} {sl.label}</Text>
                    <Text style={{ fontWeight: m ? '700' : '400', color: m ? C.fg : C.muted }}>{m?.title ?? (readOnly ? 'noch offen' : '+ eintragen')}</Text>
                    {m && <ConflictNote title={m.title} compact />}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
      )}
      <WeekCheck days={days} readOnly={readOnly} />
      {readOnly && onWish && (
        <Pressable onPress={onWish} accessibilityRole="button" style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.accentSoft }]}>
          <Text style={{ fontSize: 26 }}>❤️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.text, { fontWeight: '800' }]}>Worauf hast du Lust?</Text>
            <Text style={s.muted}>Den Plan machen Mama und Papa. Bewerte Gerichte oder schlag neue vor, dann sehen sie, was du gern isst.</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.accent }}>›</Text>
        </Pressable>
      )}
      {!readOnly && weekIngredients.length > 0 && (
        <Button title={`🛒 Zutaten der Woche auf die Einkaufsliste (${weekIngredients.length})`} onPress={() => { update(d => addToShopping(d, weekIngredients, who)); setMsg('Zutaten sind auf der Einkaufsliste. Doppelte habe ich weggelassen.'); }} />
      )}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
      {!readOnly && <Text style={[s.muted, { fontSize: 13 }]}>Tipp: Gerichte merkt sich die App unter Lieblingsrezepte. Dort seht ihr auch, was die Kinder am liebsten essen.</Text>}
    </View>
  );
}

function MealEditor({ date, slot, onDone }: { date: string; slot: MealSlot; onDone: () => void }) {
  const { data, update } = useFamily();
  const existing = data?.meals?.find(m => m.date === date && m.slot === slot);
  const [title, setTitle] = useState(existing?.title ?? '');
  const known = data?.recipes?.find(r => norm(r.title) === norm(title));
  const [ingredients, setIngredients] = useState((existing && data?.recipes?.find(r => norm(r.title) === norm(existing.title))?.ingredients.join(', ')) ?? '');
  const [photo, setPhoto] = useState<string | undefined>(existing ? dishPhoto(data!, existing.title) : undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  if (!data) return null;
  const favs = [...(data.recipes ?? [])].sort((a, b) => recipeScore(b) - recipeScore(a) || countUses(data, b) - countUses(data, a)).slice(0, 12);
  const save = () => {
    const t = title.trim();
    update(d => {
      let meals = (d.meals ?? []).filter(m => !(m.date === date && m.slot === slot));
      if (t) meals = [...meals, { id: uid(), date, slot, title: t }];
      const ing = ingredients.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
      let recipes = d.recipes ?? [];
      if (t) {
        const r = recipes.find(x => norm(x.title) === norm(t));
        recipes = r ? recipes.map(x => (x.id === r.id ? { ...x, ingredients: ing.length ? ing : x.ingredients, photo } : x)) : [...recipes, { id: uid(), title: t, ingredients: ing, photo } as Recipe];
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
            <Pressable key={r.id} onPress={() => { setTitle(r.title); setIngredients(r.ingredients.join(', ')); setPhoto(r.photo); }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: norm(r.title) === norm(title) ? C.accent : C.surface }}>
              <Text style={{ color: norm(r.title) === norm(title) ? '#fff' : C.fg, fontWeight: '700' }}>{r.title}{recipeScore(r) > 0 ? ` ❤️${recipeScore(r)}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput style={s.input} value={title} onChangeText={t => { setTitle(t); const r = data.recipes?.find(x => norm(x.title) === norm(t)); if (r) { setIngredients(r.ingredients.join(', ')); setPhoto(r.photo); } }} placeholder="Was gibt es? z. B. Spaghetti Bolognese" autoFocus />
      <TextInput style={[s.input, { minHeight: 60 }]} multiline value={ingredients} onChangeText={setIngredients} placeholder="Zutaten, mit Komma getrennt (optional): Nudeln, Hackfleisch, Tomaten" />
      {known && <Text style={[s.muted, { fontSize: 13 }]}>Bekanntes Gericht, Zutaten übernommen.</Text>}
      <ConflictNote title={title} ingredients={ingredients.split(/[,\n]/).map(x => x.trim()).filter(Boolean)} />
      <View style={[s.row, { alignItems: 'center', gap: 10 }]}>
        {photo ? <PhotoImg uri={photo} style={{ width: 96, height: 72, borderRadius: 10 }} resizeMode="cover" /> : null}
        <Button ghost title={photoBusy ? 'Lädt …' : photo ? '📷 Anderes Foto' : '📷 Foto vom Gericht'} disabled={photoBusy}
          onPress={async () => { setPhotoBusy(true); try { const p = await pickDishPhoto(); if (p) setPhoto(p); } finally { setPhotoBusy(false); } }} />
        {photo && <Button ghost title="Foto entfernen" onPress={() => setPhoto(undefined)} />}
      </View>
      {photo && <Text style={[s.muted, { fontSize: 12 }]}>Das Foto gilt für dieses Gericht, also auch für alle anderen Tage, an denen es das gibt.</Text>}
      <View style={s.row}>
        <Button title="Speichern" onPress={save} />
        {existing && <Button ghost title="Leeren" onPress={() => { update(d => ({ ...d, meals: (d.meals ?? []).filter(m => m.id !== existing.id) })); onDone(); }} />}
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}
const countUses = (d: FamilyData, r: Recipe) => (d.meals ?? []).filter(m => norm(m.title) === norm(r.title)).length;

const STORES = ['Aldi', 'Lidl', 'Rewe', 'Edeka', 'Kaufland', 'Netto', 'Penny', 'dm', 'Rossmann', 'Drogerie', 'Apotheke', 'Baumarkt'];
const fmtShort = (d: string) => parse(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
/** Fälligkeit als kurzer Text mit Dringlichkeit */
export function untilLabel(until?: string): { text: string; urgent: boolean } | null {
  if (!until) return null;
  const t = today();
  if (until < t) return { text: `überfällig (${fmtShort(until)})`, urgent: true };
  if (until === t) return { text: 'heute', urgent: true };
  if (until === addDays(t, 1)) return { text: 'bis morgen', urgent: true };
  return { text: `bis ${fmtShort(until)}`, urgent: false };
}
/** Offene Einkäufe für eine Person, dringende zuerst */
export function shoppingFor(d: FamilyData, personId: string) {
  return (d.shopping ?? []).filter(i => !i.done && i.forWho === personId).sort((a, b) => (a.until ?? '9').localeCompare(b.until ?? '9'));
}

export function Shopping({ who, meId }: { who: string; meId?: string }) {
  const { data, update } = useFamily();
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ShopItem>>({});
  const [byStore, setByStore] = useState(false);
  if (!data) return null;
  const people = peopleOf(data);
  const list = data.shopping ?? [];
  const open = list.filter(i => !i.done).sort((a, b) => (a.until ?? '9').localeCompare(b.until ?? '9'));
  const done = list.filter(i => i.done);
  const kidMe = people.find(p => p.id === meId && p.role === 'kind');
  const add = () => {
    if (!text.trim()) return;
    // IDs hier vergeben, nicht in update(): update() kann bei Sync-Konflikten mehrfach laufen
    const extra = { ...draft, forWho: draft.forWho ?? kidMe?.id };
    const items = text.split(',').map(x => x.trim()).filter(Boolean).map(title => ({ id: uid(), title, done: false, at: new Date().toISOString(), by: who, ...extra }));
    update(d => {
      const openT = new Set((d.shopping ?? []).filter(i => !i.done).map(i => norm(i.title)));
      const fresh = items.filter((it, k) => !openT.has(norm(it.title)) && items.findIndex(x => norm(x.title) === norm(it.title)) === k);
      return { ...d, shopping: [...fresh, ...(d.shopping ?? [])] };
    });
    setText(''); setDraft({});
  };
  const toggle = (id: string) => update(d => ({ ...d, shopping: (d.shopping ?? []).map(i => (i.id === id ? { ...i, done: !i.done } : i)) }));
  const patch = (id: string, p: Partial<ShopItem>) => update(d => ({ ...d, shopping: (d.shopping ?? []).map(i => (i.id === id ? { ...i, ...p } : i)) }));

  const Details = ({ v, set }: { v: Partial<ShopItem>; set: (p: Partial<ShopItem>) => void }) => (
    <View style={{ gap: 10, backgroundColor: C.bg, borderRadius: 16, padding: 12 }}>
      <Text style={s.label}>Für wen</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Pressable onPress={() => set({ forWho: undefined })} style={[s.chip, { paddingVertical: 7, backgroundColor: !v.forWho ? C.accent : C.surface }]}>
          <Text style={{ fontWeight: '700', color: !v.forWho ? '#fff' : C.fg }}>Familie</Text>
        </Pressable>
        {people.map(p => (
          <Pressable key={p.id} accessibilityLabel={`Für ${p.name}`} onPress={() => set({ forWho: p.id })}
            style={[s.chip, { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 4, backgroundColor: v.forWho === p.id ? p.color : C.surface }]}>
            <Avatar name={p.name} color={p.color} photo={p.photo} size={24} />
            <Text style={{ fontWeight: '700', color: v.forWho === p.id ? '#fff' : C.fg }}>{p.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.label}>Bis wann</Text>
      <DateField value={v.until ?? ''} onChange={x => set({ until: x || undefined })} label="Bis wann" placeholder="Egal" clearable />
      <Text style={s.label}>Laden</Text>
      <View style={[s.row, { gap: 6 }]}>
        {STORES.map(st => (
          <Pressable key={st} onPress={() => set({ store: v.store === st ? undefined : st })} style={[s.chip, { paddingVertical: 7, backgroundColor: v.store === st ? C.fg : C.surface }]}>
            <Text style={{ fontWeight: '700', color: v.store === st ? '#fff' : C.fg }}>{st}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={s.input} value={v.note ?? ''} onChangeText={t => set({ note: t || undefined })} placeholder="Notiz, z. B. Angebot 1,99 € oder Größe 34" accessibilityLabel="Notiz" />
    </View>
  );

  const Row = ({ i }: { i: ShopItem }) => {
    const p = people.find(x => x.id === i.forWho);
    const u = untilLabel(i.until);
    const meta = [u?.text, i.store, i.note].filter(Boolean).join(' · ');
    return (
      <View style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8, gap: 8 }}>
        <View style={[s.row, { flexWrap: 'nowrap' }]}>
          <Pressable onPress={() => toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={i.title}
            style={{ width: 30, height: 30, borderRadius: 10, borderWidth: 2, borderColor: u?.urgent ? C.danger : C.accent }} />
          {p ? <Avatar name={p.name} color={p.color} photo={p.photo} size={28} /> : null}
          <Pressable onPress={() => { setEdit(edit === i.id ? null : i.id); }} style={{ flex: 1, minWidth: 0 }} accessibilityLabel={`${i.title} bearbeiten`}>
            <Text style={[s.text, { fontSize: 18, fontWeight: '600' }]}>{i.title}{p ? <Text style={{ color: p.color, fontWeight: '800', fontSize: 14 }}>  für {p.name}</Text> : null}</Text>
            {!!meta && <Text style={{ fontSize: 13, color: u?.urgent ? C.danger : C.muted, fontWeight: u?.urgent ? '700' : '500' }}>{meta}</Text>}
          </Pressable>
          <Pressable onPress={() => setEdit(edit === i.id ? null : i.id)} style={{ padding: 6 }} accessibilityLabel="Details"><Text style={{ fontSize: 18, color: C.muted }}>{edit === i.id ? '▴' : '⋯'}</Text></Pressable>
        </View>
        {edit === i.id && Details({ v: i, set: x => patch(i.id, x) })}
      </View>
    );
  };

  const groups = byStore
    ? [...new Set(open.map(i => i.store ?? ''))].sort((a, b) => (a || 'zzz').localeCompare(b || 'zzz')).map(st => ({ st, items: open.filter(i => (i.store ?? '') === st) }))
    : [{ st: '', items: open }];

  return (
    <View style={[s.card, { maxWidth: 720, width: '100%' }]}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={text} onChangeText={setText} onSubmitEditing={add} placeholder="Was fehlt? z. B. Milch, Brot" returnKeyType="done" />
        <Button title="+" accessibilityLabel="Hinzufügen" onPress={add} disabled={!text.trim()} />
      </View>
      {!!text.trim() && (
        <>
          <Text style={[s.muted, { fontSize: 13 }]}>Optional: für wen, bis wann, welcher Laden.</Text>
          {Details({ v: { ...draft, forWho: draft.forWho ?? kidMe?.id }, set: x => setDraft(d => ({ ...d, ...x })) })}
        </>
      )}
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.label}>Offen ({open.length})</Text>
        {open.length > 1 && (
          <Pressable onPress={() => setByStore(v => !v)}><Text style={{ color: C.accent, fontWeight: '700' }}>{byStore ? 'Nach Datum' : 'Nach Laden sortieren'}</Text></Pressable>
        )}
      </View>
      {open.length === 0 && <Text style={s.muted}>Alles da. 🎉</Text>}
      {groups.map(g => (
        <View key={g.st || '-'}>
          {byStore && <Text style={[s.label, { marginTop: 6, color: C.accent }]}>{g.st || 'Egal wo'}</Text>}
          {g.items.map(i => <View key={i.id}>{Row({ i })}</View>)}
        </View>
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
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text></View>
              <Text style={[s.text, { flex: 1, textDecorationLine: 'line-through' }]}>{i.title}</Text>
            </Pressable>
          ))}
        </>
      )}
      <Text style={[s.muted, { fontSize: 13 }]}>Alle in der Familie können etwas eintragen. Mit Komma gehen mehrere auf einmal. Tipp auf einen Eintrag ändert Person, Datum und Laden.</Text>
    </View>
  );
}
