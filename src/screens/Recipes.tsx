import { useEffect, useState } from 'react';
import { DeleteButton } from '../ui/DeleteButton';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { useFamily } from '../data/FamilyContext';
import { peopleOf, today, uid } from '../data/logic';
import { FamilyData, MealSlot, Recipe } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Icon, IconName } from '../ui/Icon';
import { Button } from '../ui/Button';
import { addDays, parse } from '../ui/CalViews';
import { C, s } from '../ui/theme';
import { AI_ERROR, extractRecipe, getSample } from '../ai/generate';
import { pickPhotos } from './Exam';
import { ConflictNote, cropDishPhoto, DishTile, pickDishPhoto, shrinkDishPhoto } from './FoodPlus';
import { loadPhotos } from '../ui/PhotoImg';
import { cloudEnabled, sb } from '../data/cloud';
import { DishIdeas } from './DishIdeas';

/** Rezept von einer Webseite übernehmen (Server liest das eingebettete Rezept, ohne KI). */
async function importFromLink(url: string): Promise<{ title: string; ingredients: string[]; steps: string; image?: string; source?: string; servings?: string; time?: string; structured?: boolean }> {
  if (!cloudEnabled) throw { code: 'unavailable' };
  const { data, error } = await sb().functions.invoke('familie', { body: { action: 'recipe_import', url } });
  if (error) {
    let code = '';
    try { code = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* egal */ }
    throw { code: code || 'server' };
  }
  return data as any;
}
const IMPORT_ERROR: Record<string, string> = {
  unknown_action: 'Dafür muss die Server-Funktion „familie“ einmal neu eingespielt werden.',
  no_recipe: 'Auf der Seite wurde kein Rezept gefunden. Dann lieber Screenshot und „Aus Foto übernehmen“.',
  fetch_failed: 'Die Seite ließ sich nicht laden. Manche Seiten (z. B. mit Login) sperren das.',
  host_not_allowed: 'Diese Adresse ist nicht erlaubt.', bad_url: 'Das ist kein gültiger Link.',
};

const norm = (t: string) => t.trim().toLowerCase();
export const VOTES: { v: number; icon: IconName; label: string }[] = [{ v: 2, icon: 'heart', label: 'Lieblingsessen' }, { v: 1, icon: 'thumb', label: 'Mag ich' }, { v: -1, icon: 'thumbdown', label: 'Lieber nicht' }];
const iconOf = (v: number): IconName => VOTES.find(x => x.v === v)?.icon ?? 'thumb';

/** Punktzahl für das Ranking: Summe der Bewertungen */
export const recipeScore = (r: Recipe) => Object.values(r.votes ?? {}).reduce((a, b) => a + b, 0);
/** Wann zuletzt im Plan (YYYY-MM-DD), damit Eltern Abwechslung sehen */
export const lastCooked = (d: FamilyData, r: Recipe) => (d.meals ?? []).filter(m => norm(m.title) === norm(r.title) && m.date <= today()).map(m => m.date).sort().pop();

export function ranked(d: FamilyData) {
  return [...(d.recipes ?? [])].sort((a, b) => recipeScore(b) - recipeScore(a) || a.title.localeCompare(b.title));
}

export function Recipes({ meId, parent, onPlan, onShop }: { meId: string; parent: boolean; onPlan: (r: Recipe, date: string, slot: MealSlot) => void; onShop: (r: Recipe) => void }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState<boolean | 'shot' | 'link'>(false);
  const [ideas, setIdeas] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [show, setShow] = useState<string | null>(null);
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
          {parent ? 'Ganz oben steht, was die Familie am liebsten isst. Antippen zeigt Zutaten und Rezept.' : 'Bewerte die Gerichte oder schlag ein neues vor. Mama und Papa sehen das Ranking und planen danach.'}
        </Text>
        {!adding && parent && <Button ghost title="Vorschläge" accessibilityLabel="Neue Rezepte vorschlagen lassen" onPress={() => setIdeas(v => !v)} />}
        {!adding && parent && <Button ghost title="Aus Link" accessibilityLabel="Rezept von einer Webseite übernehmen" onPress={() => { setAdding('link'); setEdit(null); setIdeas(false); }} />}
        {!adding && parent && <Button ghost title="Aus Screenshot" accessibilityLabel="Rezept aus Screenshot oder Foto übernehmen" onPress={() => { setAdding('shot'); setEdit(null); }} />}
        {!adding && <Button title={parent ? '+ Gericht' : '+ Vorschlagen'} onPress={() => { setAdding(true); setEdit(null); }} />}
      </View>
      {ideas && !adding && parent && <DishIdeas onPlan={onPlan} onClose={() => setIdeas(false)} />}
      {adding && <RecipeForm meId={meId} parent={parent} shot={adding === 'shot'} linkFirst={adding === 'link'} onDone={() => setAdding(false)} />}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
      {list.length === 0 && !adding && (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={s.muted}>Noch keine Gerichte. Jedes Gericht aus dem Essensplan landet automatisch hier.</Text>
        </View>
      )}
      {list.map(r => {
        const by = r.by ? people.find(p => p.id === r.by) : undefined;
        const voters = Object.entries(r.votes ?? {}).map(([id, v]) => ({ p: people.find(x => x.id === id), v })).filter(x => x.p);
        const last = lastCooked(data, r);
        const fresh = !!r.by && !last && !(data.meals ?? []).some(m => norm(m.title) === norm(r.title));
        if (edit === r.id) return <RecipeForm key={r.id} meId={meId} parent={parent} recipe={r} onDone={() => setEdit(null)} />;
        const open = show === r.id;
        const canEdit = parent || r.by === meId;
        const sub = [last ? `zuletzt ${parse(last).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}` : 'noch nie im Plan', by && `von ${by.name}`, fresh && 'neu', r.ai && 'KI-Idee'].filter(Boolean).join(' · ');
        return (
          <View key={r.id} style={[s.card, { padding: 10, gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 16, boxShadow: 'none', shadowOpacity: 0, elevation: 0 } as any]}>
            <Pressable onPress={() => setShow(open ? null : r.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${r.title}, Details ${open ? 'zuklappen' : 'aufklappen'}`}
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <DishTile title={r.title} photo={r.photo} ingredients={r.ingredients} style={{ width: 52, height: 52 }} emojiSize={24} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Clip style={[s.text, { fontWeight: '800', fontSize: 16, lineHeight: 21 }]} lines={2}>{r.title}</Clip>
                <Text style={[s.muted, { fontSize: 12.5, lineHeight: 17 }]} numberOfLines={1}>{sub}</Text>
                <ConflictNote title={r.title} compact />
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {VOTES.map(x => {
                const on = r.votes?.[meId] === x.v;
                const col = on ? (x.v === 2 ? C.danger : x.v === 1 ? C.accent : C.warn) : C.muted;
                return (
                  <Pressable key={x.v} onPress={() => vote(r, x.v)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${r.title}: ${x.label}`}
                    style={{ width: 38, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 99, borderWidth: 1, borderColor: on ? col : C.line, backgroundColor: on ? C.surface2 : C.surface }}>
                    <Icon name={x.icon} size={18} color={col} fill={on} />
                  </Pressable>
                );
              })}
              {voters.length > 0 && (
                <View style={{ flexDirection: 'row', marginLeft: 4, flexShrink: 1 }}>
                  {voters.slice(0, 6).map(({ p, v }, k) => (
                    <View key={p!.id} style={{ marginLeft: k ? -6 : 0 }}>
                      <Avatar name={p!.name} color={p!.color} photo={(p as any).photo} size={22} />
                      <View style={{ position: 'absolute', right: -3, bottom: -3, backgroundColor: C.surface, borderRadius: 99, padding: 1.5 }}>
                        <Icon name={iconOf(v)} size={9} color={v === 2 ? C.danger : v === 1 ? C.accent : C.warn} fill stroke={1.4} />
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flex: 1 }} />
              {parent && <Button title="Einplanen" accessibilityLabel={`${r.title} einplanen`} onPress={() => setPlan(plan === r.id ? null : r.id)} style={{ paddingVertical: 6, minHeight: 36, paddingHorizontal: 14 }} />}
              <Pressable onPress={() => setShow(open ? null : r.id)} accessibilityRole="button" accessibilityLabel={`Mehr zu ${r.title}`}
                style={{ width: 36, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 99, backgroundColor: open ? C.accentSoft : 'transparent' }}>
                <Icon name="more" size={20} color={open ? C.accent : C.muted} />
              </Pressable>
            </View>
            {plan === r.id && <PlanPicker onPick={(date, slot) => { onPlan(r, date, slot); setPlan(null); setMsg(`${r.title} steht am ${parse(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' })} im Plan.`); }} />}
            {open && (
              <View style={{ gap: 8, backgroundColor: C.surface2, borderRadius: 14, padding: 12 }}>
                {r.ingredients.length > 0 && <Text style={s.text}><Text style={{ fontWeight: '800' }}>Zutaten{'\n'}</Text>{r.ingredients.map(x => `• ${x}`).join('\n')}</Text>}
                {r.steps && <Text style={s.text}><Text style={{ fontWeight: '800' }}>Zubereitung{'\n'}</Text>{r.steps}</Text>}
                {!r.ingredients.length && !r.steps && <Text style={s.muted}>Noch kein Rezept hinterlegt.</Text>}
                {r.link && <Text style={{ color: C.accent, fontWeight: '700' }} onPress={() => Linking.openURL(r.link!)}>Originalrezept öffnen</Text>}
                {r.photoSrc && <Text style={[s.muted, { fontSize: 11 }]}>Bild: {r.photoSrc}</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {parent && r.ingredients.length > 0 && <Button ghost title="Zutaten auf Einkaufsliste" accessibilityLabel={`Zutaten für ${r.title} auf die Einkaufsliste`} style={{ paddingVertical: 6, minHeight: 36, paddingHorizontal: 12 }}
                    onPress={() => { onShop(r); setMsg(`Zutaten für ${r.title} stehen auf der Einkaufsliste.`); }} />}
                  {canEdit && <Button ghost title="Ändern" accessibilityLabel={`${r.title} bearbeiten`} style={{ paddingVertical: 6, minHeight: 36, paddingHorizontal: 12 }} onPress={() => { setEdit(r.id); setAdding(false); }} />}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}


export function PlanPicker({ onPick }: { onPick: (date: string, slot: MealSlot) => void }) {
  const { data } = useFamily();
  const [slot, setSlot] = useState<MealSlot>('abend');
  const days = Array.from({ length: 10 }, (_, i) => addDays(today(), i));
  return (
    <View style={{ gap: 8, backgroundColor: C.surface2, borderRadius: 16, padding: 10 }}>
      <View style={[s.row, { gap: 6 }]}>
        {(['mittag', 'abend'] as MealSlot[]).map(sl => (
          <Pressable key={sl} onPress={() => setSlot(sl)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: slot === sl ? C.fg : C.surface }}>
            <Text style={{ fontWeight: '700', color: slot === sl ? '#fff' : C.fg }}>{sl === 'mittag' ? 'Mittag' : 'Abend'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {days.map(d => {
          const taken = data?.meals?.find(m => m.date === d && m.slot === slot);
          return (
            <Pressable key={d} onPress={() => onPick(d, slot)} accessibilityLabel={`${d}${taken ? `, ersetzt ${taken.title}` : ''}`}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: taken ? C.line : C.line, alignItems: 'center', minWidth: 52 }}>
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

function RecipeForm({ meId, parent, recipe, onDone, shot, linkFirst }: { meId: string; parent: boolean; recipe?: Recipe; onDone: () => void; shot?: boolean; linkFirst?: boolean }) {
  const { data, update } = useFamily();
  const [title, setTitle] = useState(recipe?.title ?? '');
  const [ing, setIng] = useState(recipe?.ingredients.join('\n') ?? '');
  const [steps, setSteps] = useState(recipe?.steps ?? '');
  const [link, setLink] = useState(recipe?.link ?? '');
  const [photo, setPhoto] = useState<string | undefined>(recipe?.photo);
  const [photoSrc, setPhotoSrc] = useState<string | undefined>(recipe?.photoSrc);
  const [linking, setLinking] = useState(false);
  const dup = !recipe && data?.recipes?.find(r => norm(r.title) === norm(title));
  const [ai, setAi] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { let on = true; if (parent) getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, [parent]);
  // Über „Aus Screenshot“ geöffnet: gleich den Foto-Sammler zeigen
  useEffect(() => { if (shot) fromPhoto(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function fromPhoto() {
    const p = await pickPhotos(6, 'Rezept fotografieren').catch(() => []);
    if (!p.length) return;
    setReading(true); setErr('');
    try {
      const r = await extractRecipe(p);
      if (r.title && !title.trim()) setTitle(r.title);
      if (r.ingredients.length) setIng(r.ingredients.join('\n'));
      if (r.steps) setSteps(r.steps);
      if (r.dish && !photo) {
        const [src] = await loadPhotos([p[r.dish.img]]).catch(() => [] as string[]);
        const cut = src ? await cropDishPhoto(src, r.dish.box).catch(() => null) : null;
        if (cut) { setPhoto(cut); setPhotoSrc(undefined); }
      }
    } catch (e: any) { setErr(AI_ERROR[e?.code] ?? 'Das Rezept konnte nicht gelesen werden.'); }
    setReading(false);
  }
  async function fromLink() {
    setLinking(true); setErr('');
    try {
      const r = await importFromLink(link.trim());
      if (r.title && !title.trim()) setTitle(r.title);
      if (r.ingredients?.length) setIng(r.ingredients.join('\n'));
      if (r.steps) setSteps([[r.time && `⏱ ${r.time}`, r.servings && `${r.servings}`].filter(Boolean).join(' · '), r.steps].filter(Boolean).join('\n'));
      if (r.image) { const small = await shrinkDishPhoto(r.image).catch(() => null); if (small) { setPhoto(small); setPhotoSrc(r.source); } }
      if (!r.ingredients?.length) setErr('Nur der Name wurde gefunden, Zutaten bitte selbst ergänzen.');
      else if (!r.steps) setErr('Zutaten gefunden, aber keine Zubereitung. Bitte selbst ergänzen oder den Link behalten.');
    } catch (e: any) { setErr(IMPORT_ERROR[e?.code] ?? AI_ERROR[e?.code] ?? 'Übernehmen hat nicht geklappt.'); }
    setLinking(false);
  }
  const save = () => {
    const t = title.trim();
    if (!t) return;
    const ingredients = ing.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
    const extra = { steps: steps.trim() || undefined, link: /^https?:\/\/\S+$/i.test(link.trim()) ? link.trim() : undefined, photo, photoSrc: photo ? photoSrc : undefined };
    update(d => {
      const rs = d.recipes ?? [];
      if (recipe) return { ...d, recipes: rs.map(x => (x.id === recipe.id ? { ...x, title: t, ingredients, ...extra } : x)) };
      const ex = rs.find(x => norm(x.title) === norm(t));
      if (ex) return { ...d, recipes: rs.map(x => (x.id === ex.id ? { ...x, votes: { ...(x.votes ?? {}), [meId]: 2 } } : x)) };
      return { ...d, recipes: [...rs, parent ? { id: uid(), title: t, ingredients, ...extra } : { id: uid(), title: t, ingredients, ...extra, by: meId, at: new Date().toISOString(), votes: { [meId]: 2 } }] };
    });
    onDone();
  };
  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent }]}>
      <Text style={s.h2}>{recipe ? 'Gericht bearbeiten' : parent ? 'Neues Gericht' : 'Was möchtest du gern mal essen?'}</Text>
      {parent && ai && (
        <View style={{ gap: 4 }}>
          <Button ghost title={reading ? 'Lese Rezept …' : 'Aus Foto oder Screenshot übernehmen'} disabled={reading} onPress={fromPhoto} />
          {reading && <ActivityIndicator color={C.accent} />}
          <Text style={[s.muted, { fontSize: 12 }]}>Kochbuchseite fotografieren oder Screenshots aus Cookidoo, Chefkoch, Instagram und Co. (bis 6 Bilder). Die KI füllt Zutaten und Zubereitung aus und schneidet das Foto vom Gericht aus, falls eins drauf ist. Ein KI-Aufruf.</Text>
        </View>
      )}
      {linkFirst && !recipe && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Link zum Rezept</Text>
          <TextInput style={s.input} value={link} onChangeText={setLink} placeholder="https://www.chefkoch.de/rezepte/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus
            onSubmitEditing={() => { if (/^https?:\/\/\S+\.\S+/i.test(link.trim())) fromLink(); }} accessibilityLabel="Link zum Rezept" />
          <Button title={linking ? 'Lese Seite …' : 'Rezept holen'} disabled={linking || !/^https?:\/\/\S+\.\S+/i.test(link.trim()) || !cloudEnabled} onPress={fromLink} />
          <Text style={[s.muted, { fontSize: 12 }]}>Link von Chefkoch, Lecker, Kochbar, Blogs und vielen anderen kopieren. Famelio holt Name, Zutaten, Zubereitung und Bild. Kostenlos, ohne KI. Danach kannst du alles noch ändern.</Text>
          {!cloudEnabled && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>Dafür muss das Gerät mit der Familie verbunden sein.</Text>}
        </View>
      )}
      {(reading || linking) && !ai && <ActivityIndicator color={C.accent} />}
      {!!err && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{err}</Text>}
      <Text style={s.label}>Gericht</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Pfannkuchen mit Apfelmus" autoFocus={!recipe && !linkFirst} />
      <Text style={s.label}>Zutaten{parent ? ' (eine pro Zeile, mit Menge)' : ''}</Text>
      <TextInput style={[s.input, { minHeight: 90 }]} multiline value={ing} onChangeText={setIng} placeholder={parent ? '250 g Mehl\n3 Eier\n500 ml Milch' : 'Was braucht man dafür? (wenn du es weißt)'} />
      {parent && <>
        <Text style={s.label}>Zubereitung</Text>
        <TextInput style={[s.input, { minHeight: 120 }]} multiline value={steps} onChangeText={setSteps} placeholder={'1. Mehl, Eier und Milch glatt rühren\n2. 10 Minuten quellen lassen\n3. In der Pfanne goldbraun backen'} />
        {!linkFirst && <Text style={s.label}>Link zum Rezept (optional)</Text>}
        {!linkFirst && <TextInput style={s.input} value={link} onChangeText={setLink} placeholder="https://cookidoo.de/... oder https://www.chefkoch.de/..." autoCapitalize="none" keyboardType="url" />}
        {!linkFirst && /^https?:\/\/\S+\.\S+/i.test(link.trim()) && cloudEnabled && (
          <View style={{ gap: 4 }}>
            <Button ghost title={linking ? 'Lese Seite …' : 'Zutaten, Schritte und Bild vom Link holen'} disabled={linking} onPress={fromLink} />
            <Text style={[s.muted, { fontSize: 12 }]}>Kostenlos, ohne KI. Klappt bei den meisten Rezeptseiten. Das Bild wird nur für eure Familie gespeichert.</Text>
          </View>
        )}
      </>}
      <Text style={s.label}>Bild</Text>
      <View style={[s.row, { alignItems: 'center', gap: 10 }]}>
        <DishTile title={title || '?'} photo={photo} ingredients={ing.split(/[,\n]/)} style={{ width: 96, height: 72 }} emojiSize={30} />
        <Button ghost title={photo ? 'Anderes Foto' : 'Eigenes Foto'} onPress={async () => { const p = await pickDishPhoto().catch(() => null); if (p) { setPhoto(p); setPhotoSrc(undefined); } }} />
        {photo && <Button ghost title="Entfernen" onPress={() => { setPhoto(undefined); setPhotoSrc(undefined); }} />}
      </View>
      {!photo && <Text style={[s.muted, { fontSize: 12 }]}>Ohne Foto zeigt die App ein passendes Symbol. Am schönsten ist ein eigenes Foto vom fertigen Essen.</Text>}
      <ConflictNote title={title} ingredients={ing.split(/[,\n]/).map(x => x.trim()).filter(Boolean)} />
      {dup && <Text style={[s.muted, { fontSize: 13 }]}>Das gibt es schon in der Sammlung. Speichern zählt es als dein Lieblingsessen.</Text>}
      <View style={s.row}>
        <Button title={recipe ? 'Speichern' : parent ? 'Hinzufügen' : 'Vorschlagen'} disabled={!title.trim()} onPress={save} />
        {recipe && <DeleteButton parent={parent} onDelete={() => { update(d => ({ ...d, recipes: (d.recipes ?? []).filter(x => x.id !== recipe.id) })); onDone(); }} />}
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}
