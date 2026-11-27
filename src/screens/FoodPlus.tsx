import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { peopleOf, today, uid } from '../data/logic';
import { FamilyData, MealIdea, MealSlot } from '../data/types';
import { ALLERGENS, autoFill, conflictsOf, Diet, dietOf, dietSummary, dishInfo, recipeOf, STYLES, swapCandidates, weekCheck } from '../data/food';
import { AI_ERROR, suggestWeek } from '../ai/generate';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { PhotoImg } from '../ui/PhotoImg';
import { parse } from '../ui/CalViews';
import { C, grad, s, STRONG } from '../ui/theme';
import { Icon } from '../ui/Icon';

const norm = (t: string) => t.trim().toLowerCase();
const dayLabel = (d: string) => parse(d).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const slotLabel = (sl: MealSlot) => (sl === 'mittag' ? 'Mittag' : sl === 'abend' ? 'Abend' : 'Frühstück');

/** Foto auswählen und auf ca. 480 px klein rechnen (etwa 30 KB), damit die Familiendaten schlank bleiben. */
export async function pickDishPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [4, 3] });
  if (res.canceled || !res.assets.length) return null;
  const a = res.assets[0];
  return shrinkDishPhoto(a.uri, a.width);
}
/** Bild (Datei oder data-URL) auf höchstens 480 px Breite als JPEG. */
export async function shrinkDishPhoto(uri: string, width?: number): Promise<string | null> {
  const ctx = ImageManipulator.manipulate(uri);
  if (!width || width > 480) ctx.resize({ width: 480 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}

/** Ausschnitt (Anteile 0 bis 1) aus einem Bild, z. B. das Foto des Gerichts in einem Rezept-Screenshot. */
export async function cropDishPhoto(uri: string, box: [number, number, number, number]): Promise<string | null> {
  const full = await ImageManipulator.manipulate(uri).renderAsync();
  const W = full.width, H = full.height;
  const x = Math.max(0, Math.round(box[0] * W)), y = Math.max(0, Math.round(box[1] * H));
  const w = Math.min(W - x, Math.round((box[2] - box[0]) * W)), h = Math.min(H - y, Math.round((box[3] - box[1]) * H));
  if (w < 60 || h < 40) return null;
  const ctx = ImageManipulator.manipulate(uri).crop({ originX: x, originY: y, width: w, height: h });
  if (w > 480) ctx.resize({ width: 480 });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
}

/** Bild zum Gericht: eigenes Foto, sonst ein farbiger Platzhalter mit passendem Emoji. Kostet nichts. */
export function DishTile({ title, photo, ingredients, style, emojiSize = 34 }: { title: string; photo?: string; ingredients?: string[]; style?: any; emojiSize?: number }) {
  if (photo) return <PhotoImg uri={photo} style={[{ borderRadius: 10 }, style]} resizeMode="cover" accessibilityIgnoresInvertColors />;
  const tint = STRONG[[...title].reduce((a, ch) => a + ch.charCodeAt(0), 0) % STRONG.length];
  return (
    <View style={[{ borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: tint }, style]} accessibilityElementsHidden importantForAccessibility="no">
      <Icon name="food" size={Math.round(emojiSize * 0.95)} color={tint === STRONG[1] ? '#4a3300' : '#fff'} stroke={2.1} />
    </View>
  );
}

/** Kurze Warnung, wer ein Gericht nicht verträgt oder nicht mag */
export function ConflictNote({ title, compact, ingredients }: { title: string; compact?: boolean; ingredients?: string[] }) {
  const { data } = useFamily();
  if (!data || !title.trim()) return null;
  const known = recipeOf(data, title);
  const d = ingredients && !known ? { ...data, recipes: [...(data.recipes ?? []), { id: '_', title, ingredients }] } : data;
  const cs = conflictsOf(d, title, peopleOf(data));
  if (!cs.length) return null;
  const hard = cs.filter(c => c.hard), soft = cs.filter(c => !c.hard);
  if (compact) return <Text style={{ fontSize: 11, fontWeight: '800', color: hard.length ? C.danger : C.warn }} numberOfLines={1}>{hard.length ? '⚠️ ' + hard.map(c => c.name).join(', ') : '👎 ' + soft.map(c => c.name).join(', ')}</Text>;
  return (
    <View style={{ gap: 4, backgroundColor: hard.length ? '#ffe8eb' : C.warnSoft, borderRadius: 12, padding: 10 }}>
      {hard.map(c => <Text key={c.personId + c.why} style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>⚠️ {c.name}: {c.why}</Text>)}
      {soft.map(c => <Text key={c.personId + c.why} style={{ color: '#8a5a00', fontWeight: '600', fontSize: 13 }}>👎 {c.name} {c.why}</Text>)}
      {hard.length > 0 && <Text style={[s.muted, { fontSize: 11 }]}>Erkannt an Name und Zutaten, ohne Gewähr. Bei Allergien bitte selbst prüfen.</Text>}
    </View>
  );
}

/** Unverträglichkeiten, Ernährungsweise und Abneigungen je Person */
export function DietEditor({ parent, meId }: { parent: boolean; meId?: string }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  const people = peopleOf(data);
  const set = (id: string, p: Partial<Diet>) => update(d => ({ ...d, diet: { ...(d.diet ?? {}), [id]: { ...dietOf(d, id), ...p } } }));
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.muted}>
        {parent ? 'Wer verträgt was nicht, wer isst kein Fleisch, wer mag keine Pilze? Der Essensplan warnt dann und die Vorschläge halten sich daran.' : 'Hier steht, was jeder nicht verträgt. Was du nicht magst, kannst du selbst eintragen.'}
      </Text>
      {people.map(p => <DietRow key={p.id} p={p} parent={parent} mine={p.id === meId} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} set={x => set(p.id, x)} diet={dietOf(data, p.id)} />)}
      <Text style={[s.muted, { fontSize: 12 }]}>Die App erkennt Zutaten an Stichwörtern (z. B. Sahne, Käse = Laktose). Das hilft beim Planen, ersetzt aber bei echten Allergien nicht den Blick aufs Etikett. Für KI-Vorschläge gehen die Angaben ohne Namen an die KI.</Text>
    </View>
  );
}

export function dietText(x: Diet) {
  return [...(x.avoid ?? []).map(a => `kein ${ALLERGENS.find(y => y.v === a)!.label}`), x.style && STYLES.find(y => y.v === x.style)!.label, x.dislike && `mag nicht: ${x.dislike}`].filter(Boolean).join(' · ');
}

function DietRow({ p, parent, mine, open, onToggle, set, diet: x }: { p: { id: string; name: string; color: string; photo?: string }; parent: boolean; mine: boolean; open: boolean; onToggle: () => void; set: (x: Partial<Diet>) => void; diet: Diet }) {
  const canHard = parent, canSoft = parent || mine;
  const summary = dietText(x);
  const hard = !!(x.avoid?.length || x.style);
  return (
    <View style={[s.card, { padding: 12, gap: 10 }]}>
      <Pressable onPress={onToggle} disabled={!canSoft} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[s.row, { flexWrap: 'nowrap' }]}>
        <Avatar name={p.name} color={p.color} photo={p.photo} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>{p.name}</Text>
          <Text style={{ fontSize: 13, color: hard ? C.danger : C.muted, fontWeight: hard ? '700' : '500' }} numberOfLines={open ? undefined : 2}>{summary || 'isst alles'}</Text>
        </View>
        {canSoft && <Text style={{ fontSize: 16, color: C.muted, fontWeight: '700' }}>{open ? 'Schließen' : 'Ändern'}</Text>}
      </Pressable>
      {open && (
        <>
          {canHard && <Text style={s.label}>Verträgt nicht</Text>}
          {canHard && (
            <View style={[s.row, { gap: 6 }]}>
              {ALLERGENS.map(a => {
                const on = !!x.avoid?.includes(a.v);
                return (
                  <Pressable key={a.v} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${p.name}: ${a.label} unverträglich`}
                    onPress={() => set({ avoid: on ? (x.avoid ?? []).filter(v => v !== a.v) : [...(x.avoid ?? []), a.v] })}
                    style={[s.chip, { paddingVertical: 7, borderWidth: 1.5, borderColor: on ? C.danger : C.line, backgroundColor: on ? '#ffe8eb' : C.surface }]}>
                    <Text style={{ fontWeight: '700', color: on ? C.danger : C.fg }}>{a.icon} {a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {canHard && <Text style={s.label}>Isst</Text>}
          {canHard && (
            <View style={[s.row, { gap: 6 }]}>
              {STYLES.map(st => {
                const on = x.style === st.v;
                return (
                  <Pressable key={st.v} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => set({ style: on ? undefined : st.v })}
                    style={[s.chip, { paddingVertical: 7, backgroundColor: on ? C.ok : C.surface2 }]}>
                    <Text style={{ fontWeight: '700', color: on ? '#fff' : C.fg }}>{st.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={s.label}>Mag nicht</Text>
          <DislikeInput key={p.id + (x.dislike ?? '')} name={p.name} value={x.dislike ?? ''} onSave={v => set({ dislike: v || undefined })} />
        </>
      )}
    </View>
  );
}

function DislikeInput({ name, value, onSave }: { name: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const save = () => { if (v.trim() !== value) onSave(v.trim()); };
  return <TextInput style={s.input} value={v} onChangeText={setV} onBlur={save} onSubmitEditing={save} returnKeyType="done" placeholder="z. B. Pilze, Fisch, Rosenkohl" accessibilityLabel={`${name} mag nicht`} />;
}

/** Wochen-Check: freundliche Hinweise mit Tauschvorschlag aus der eigenen Sammlung */
export function WeekCheck({ days, readOnly }: { days: string[]; readOnly?: boolean }) {
  const { data, update } = useFamily();
  const [openHint, setOpenHint] = useState<string | null>(null);
  if (!data) return null;
  const people = peopleOf(data);
  const r = weekCheck(data, days);
  if (r.rating === 'leer') return null;
  const head = r.rating === 'bunt' ? { icon: '', text: 'Schön abwechslungsreich diese Woche.', bg: C.okSoft } : r.rating === 'okay' && !r.hints.length ? { icon: '', text: r.count < 3 ? 'Noch zu wenig geplant für eine Einschätzung.' : 'Die Woche sieht gut aus.', bg: C.okSoft } : { icon: '', text: r.rating === 'einseitig' ? 'Die Woche ist etwas einseitig. Ideen:' : 'Eine kleine Idee für mehr Abwechslung:', bg: C.warnSoft };
  return (
    <View style={[s.card, { padding: 14, gap: 8, backgroundColor: head.bg }]}>
      <Text style={[s.text, { fontWeight: '800' }]}>{head.text}</Text>
      {r.hints.map(h => {
        const cands = h.swap ? swapCandidates(data, days, h.swap.want, people) : [];
        const meal = h.swap && data.meals?.find(m => m.id === h.swap!.mealId);
        return (
          <View key={h.id} style={{ gap: 6 }}>
            <Text style={s.text}>{h.icon} {h.text}</Text>
            {!readOnly && meal && cands.length > 0 && (openHint === h.id ? (
              <View style={{ gap: 6, backgroundColor: C.surface, borderRadius: 12, padding: 10 }}>
                <Text style={[s.muted, { fontSize: 13 }]}>{dayLabel(meal.date)} statt {meal.title}, {h.swap!.wantLabel}:</Text>
                <View style={[s.row, { gap: 6 }]}>
                  {cands.map(c => (
                    <Pressable key={c.id} onPress={() => { update(d => ({ ...d, meals: (d.meals ?? []).map(m => (m.id === meal.id ? { ...m, title: c.title } : m)) })); setOpenHint(null); }}
                      style={[s.chip, { paddingVertical: 7, borderWidth: 1.5, borderColor: C.accent, backgroundColor: C.surface }]} accessibilityLabel={`${meal.title} durch ${c.title} ersetzen`}>
                      <Text style={{ fontWeight: '700' }}>{dishInfo(c.title, c.ingredients).emoji} {c.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : <Text style={{ color: C.accent, fontWeight: '700' }} onPress={() => setOpenHint(h.id)}>Tauschvorschlag ansehen</Text>)}
          </View>
        );
      })}
    </View>
  );
}

/** Freie Plätze füllen: ohne KI aus Lieblingsgerichten oder mit KI inkl. neuer Ideen (1 Aufruf, Ergebnis wird gemerkt) */
export function WeekPlanner({ days, onDone }: { days: string[]; onDone: () => void }) {
  const { data, update } = useFamily();
  const [slots, setSlots] = useState<MealSlot[]>(['abend']);
  const [onlyFuture, setOnlyFuture] = useState(true);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  if (!data) return null;
  const people = peopleOf(data);
  const week = days[0];
  const free = days.filter(d => !onlyFuture || d >= today()).flatMap(date => slots.map(slot => ({ date, slot }))).filter(x => !(data.meals ?? []).some(m => m.date === x.date && m.slot === x.slot));
  const cached = data.mealIdeas?.week === week ? data.mealIdeas.items.filter(i => !(data.meals ?? []).some(m => m.date === i.date && m.slot === i.slot)) : [];
  const ideas: MealIdea[] = cached;
  const key = (i: { date: string; slot: string }) => i.date + i.slot;

  const local = () => {
    const out = autoFill(data, days, slots, people, free.map(x => x.date)).filter(x => free.some(f => key(f) === key(x)));
    if (!out.length) { setErr(data.recipes?.length ? 'Keine passenden Lieblingsgerichte gefunden.' : 'Noch keine Lieblingsgerichte gespeichert. Trag erst ein paar Gerichte ein oder nimm den KI-Vorschlag.'); return; }
    update(d => ({ ...d, mealIdeas: { week, at: new Date().toISOString(), items: out.map(x => ({ ...x })) } }));
    setPicked(Object.fromEntries(out.map(x => [key(x), true]))); setErr('');
  };
  const ai = async () => {
    setBusy(true); setErr('');
    try {
      const recipes = [...(data.recipes ?? [])].map(r => ({ title: r.title, score: Object.values(r.votes ?? {}).reduce((a, b) => a + b, 0), last: (data.meals ?? []).filter(m => norm(m.title) === norm(r.title)).map(m => m.date).sort().pop() }))
        .sort((a, b) => b.score - a.score);
      const items = await suggestWeek({
        slots: free.map(x => ({ ...x, weekday: parse(x.date).toLocaleDateString('de-DE', { weekday: 'long' }) })),
        planned: (data.meals ?? []).filter(m => days.includes(m.date)).map(m => m.title),
        recipes, diet: dietSummary(data, people), people: people.length, wish: wish.trim() || undefined,
      });
      // Nur Vorschläge ohne harte Konflikte vorauswählen (doppelte Sicherung)
      update(d => ({ ...d, mealIdeas: { week, at: new Date().toISOString(), items } }));
      setPicked(Object.fromEntries(items.map(i => [key(i), !conflictsOf({ ...data, recipes: [...(data.recipes ?? []), ...(i.isNew ? [{ id: 'x', title: i.title, ingredients: i.ingredients ?? [] }] : [])] } as FamilyData, i.title, people).some(c => c.hard)])));
    } catch (e: any) { setErr(AI_ERROR[e?.code] ?? 'Der Vorschlag hat nicht geklappt. Bitte nochmal versuchen.'); }
    setBusy(false);
  };
  const accept = () => {
    const take = ideas.filter(i => picked[key(i)] !== false);
    const newOnes = take.filter(i => i.isNew && !recipeOf(data, i.title)).map(i => ({ id: uid(), title: i.title, ingredients: i.ingredients ?? [], steps: i.steps, ai: true, at: new Date().toISOString() }));
    update(d => ({
      ...d,
      meals: [...(d.meals ?? []).filter(m => !take.some(t => t.date === m.date && t.slot === m.slot)), ...take.map(t => ({ id: uid(), date: t.date, slot: t.slot, title: t.title }))],
      recipes: [...(d.recipes ?? []), ...newOnes.filter(n => !(d.recipes ?? []).some(r => norm(r.title) === norm(n.title)))],
      mealIdeas: undefined,
    }));
    onDone();
  };

  return (
    <View style={[s.card, { borderWidth: 2, borderColor: C.accent, gap: 12 }]}>
      <Text style={s.h2}>Woche planen</Text>
      {!ideas.length ? (
        <>
          <Text style={s.label}>Welche Mahlzeiten</Text>
          <View style={[s.row, { gap: 6 }]}>
            {(['mittag', 'abend'] as MealSlot[]).map(sl => {
              const on = slots.includes(sl);
              return (
                <Pressable key={sl} onPress={() => setSlots(on ? slots.filter(x => x !== sl) : [...slots, sl])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={[s.chip, { paddingVertical: 8, backgroundColor: on ? C.fg : C.surface2 }]}>
                  <Text style={{ fontWeight: '700', color: on ? '#fff' : C.fg }}>{slotLabel(sl)}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setOnlyFuture(v => !v)} style={[s.chip, { paddingVertical: 8, backgroundColor: onlyFuture ? C.accentSoft : C.surface2 }]}>
              <Text style={{ fontWeight: '700' }}>{onlyFuture ? '✓ ab heute' : 'ganze Woche'}</Text>
            </Pressable>
          </View>
          <Text style={s.muted}>{free.length ? `${free.length} freie Plätze. Schon Eingetragenes bleibt.` : 'Keine freien Plätze in dieser Auswahl.'}</Text>
          <TextInput style={s.input} value={wish} onChangeText={setWish} placeholder="Wunsch für die KI (optional), z. B. Mittwoch wenig Zeit, mal was Asiatisches" />
          <View style={s.row}>
            <Button ghost title="Aus Lieblingsgerichten (gratis)" disabled={!free.length || busy} onPress={local} />
            <Button title={busy ? 'KI plant …' : 'Mit KI, auch neue Ideen'} disabled={!free.length || busy} onPress={ai} />
            <Button ghost title="Abbrechen" onPress={onDone} />
          </View>
          {busy && <ActivityIndicator color={C.accent} />}
          <Text style={[s.muted, { fontSize: 12 }]}>Der KI-Vorschlag ist ein Aufruf vom Tageslimit. Er berücksichtigt Bewertungen und „Wer isst was“ (ohne Namen) und wird gemerkt, bis ihr ihn übernehmt.</Text>
        </>
      ) : (
        <>
          <Text style={s.muted}>Abhaken, was passt, dann übernehmen. Neue Ideen landen mit Zutaten in den Rezepten.</Text>
          {ideas.map(i => {
            const on = picked[key(i)] !== false;
            const known = recipeOf(data, i.title);
            const cs = conflictsOf({ ...data, recipes: [...(data.recipes ?? []), ...(!known && i.ingredients ? [{ id: 'x', title: i.title, ingredients: i.ingredients }] : [])] } as FamilyData, i.title, people);
            return (
              <Pressable key={key(i)} onPress={() => setPicked(p => ({ ...p, [key(i)]: !on }))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', opacity: on ? 1 : 0.5, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: C.accent, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                </View>
                <DishTile title={i.title} photo={known?.photo} ingredients={known?.ingredients ?? i.ingredients} style={{ width: 52, height: 40 }} emojiSize={20} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, color: C.muted, fontWeight: '700' }}>{dayLabel(i.date)} · {slotLabel(i.slot)}</Text>
                  <Text style={[s.text, { fontWeight: '700' }]}>{i.title}{i.isNew && !known ? <Text style={{ color: C.accent, fontSize: 12 }}>  NEU</Text> : null}</Text>
                  {!!i.why && <Text style={[s.muted, { fontSize: 12 }]}>{i.why}</Text>}
                  {cs.length > 0 && <Text style={{ fontSize: 12, fontWeight: '700', color: cs.some(c => c.hard) ? C.danger : C.warn }}>{cs.map(c => `${c.hard ? '⚠️' : '👎'} ${c.name}: ${c.why}`).join(' · ')}</Text>}
                </View>
              </Pressable>
            );
          })}
          <View style={s.row}>
            <Button title={`Übernehmen (${ideas.filter(i => picked[key(i)] !== false).length})`} disabled={!ideas.some(i => picked[key(i)] !== false)} onPress={accept} />
            <Button ghost title="Verwerfen" onPress={() => { update(d => ({ ...d, mealIdeas: undefined })); setPicked({}); }} />
            <Button ghost title="Schließen" onPress={onDone} />
          </View>
        </>
      )}
      {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
    </View>
  );
}
