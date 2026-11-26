import { FamilyData, MealSlot, Recipe } from './types';

/**
 * Essen: Unverträglichkeiten, Erkennung der Zutaten und Wochen-Check.
 * Alles läuft lokal über Stichwörter, ohne KI und ohne Kosten.
 * Die Erkennung ist eine Hilfe, keine Garantie (z. B. Fertigprodukte, versteckte Zutaten).
 */

export type Allergen = 'laktose' | 'gluten' | 'nuesse' | 'erdnuss' | 'ei' | 'fisch' | 'soja' | 'sellerie';
export type DietStyle = 'vegetarisch' | 'vegan' | 'kein_schwein';
export interface Diet {
  /** Unverträglichkeiten oder Allergien */ avoid?: Allergen[];
  /** Ernährungsweise */ style?: DietStyle;
  /** Mag nicht, frei: z. B. "Pilze, Fisch, Rosenkohl" */ dislike?: string;
}

export const ALLERGENS: { v: Allergen; label: string; icon: string }[] = [
  { v: 'laktose', label: 'Laktose', icon: '🥛' }, { v: 'gluten', label: 'Gluten', icon: '🌾' },
  { v: 'nuesse', label: 'Nüsse', icon: '🌰' }, { v: 'erdnuss', label: 'Erdnüsse', icon: '🥜' },
  { v: 'ei', label: 'Ei', icon: '🥚' }, { v: 'fisch', label: 'Fisch', icon: '🐟' },
  { v: 'soja', label: 'Soja', icon: '🫘' }, { v: 'sellerie', label: 'Sellerie', icon: '🥬' },
];
export const STYLES: { v: DietStyle; label: string }[] = [
  { v: 'vegetarisch', label: 'Vegetarisch' }, { v: 'vegan', label: 'Vegan' }, { v: 'kein_schwein', label: 'Kein Schwein' },
];

const norm = (t: string) => t.trim().toLowerCase();
const has = (text: string, words: string[]) => words.some(w => text.includes(w));

/** Stichwörter je Allergen. "frei"-Varianten (laktosefrei, glutenfrei) werden vorher entfernt. */
const ALLERGEN_WORDS: Record<Allergen, string[]> = {
  laktose: ['milch', 'sahne', 'käse', 'kaese', 'butter', 'joghurt', 'jogurt', 'quark', 'schmand', 'crème fraîche', 'creme fraiche', 'mozzarella', 'parmesan', 'feta', 'gouda', 'emmentaler', 'mascarpone', 'ricotta', 'frischkäse', 'skyr', 'kefir', 'buttermilch', 'bechamel', 'béchamel', 'raclette', 'gratin', 'überbacken', 'pizza', 'lasagne', 'milchreis', 'kaiserschmarrn', 'käsespätzle'],
  gluten: ['mehl', 'weizen', 'dinkel', 'roggen', 'gerste', 'nudel', 'spaghetti', 'penne', 'fusilli', 'makkaroni', 'tagliatelle', 'lasagne', 'spätzle', 'brot', 'brötchen', 'toast', 'paniermehl', 'semmelbrösel', 'paniert', 'schnitzel', 'pizza', 'pfannkuchen', 'pfannkuchen', 'crêpe', 'waffel', 'couscous', 'bulgur', 'gnocchi', 'maultasche', 'ravioli', 'tortellini', 'wrap', 'tortilla', 'burger', 'knödel', 'kaiserschmarrn', 'flammkuchen', 'quiche', 'blätterteig', 'teig', 'paniert', 'grieß', 'gries', 'fischstäbchen', 'nugget', 'cordon bleu'],
  nuesse: ['nuss', 'nüsse', 'mandel', 'haselnuss', 'walnuss', 'cashew', 'pistazie', 'pekan', 'macadamia', 'nutella', 'marzipan'],
  erdnuss: ['erdnuss', 'erdnüsse', 'peanut', 'satay'],
  ei: ['ei ', 'eier', 'eigelb', 'eiweiß', 'mayonnaise', 'mayo', 'pfannkuchen', 'kaiserschmarrn', 'spätzle', 'omelett', 'rührei', 'carbonara', 'frikadelle', 'bulette', 'waffel'],
  fisch: ['fisch', 'lachs', 'thunfisch', 'kabeljau', 'seelachs', 'forelle', 'hering', 'sardine', 'scholle', 'dorsch', 'pangasius', 'garnele', 'shrimp', 'krabbe', 'scampi', 'meeresfrüchte', 'muschel', 'tintenfisch', 'calamari', 'sushi', 'backfisch'],
  soja: ['soja', 'tofu', 'tempeh', 'edamame', 'miso'],
  sellerie: ['sellerie', 'suppengrün'],
};
const MEAT = ['fleisch', 'hack', 'rind', 'schwein', 'hähnchen', 'haehnchen', 'huhn', 'hühn', 'pute', 'truthahn', 'lamm', 'wurst', 'würstchen', 'speck', 'schinken', 'salami', 'bacon', 'schnitzel', 'gulasch', 'bolognese', 'frikadelle', 'bulette', 'chicken', 'nugget', 'kassler', 'leberkäse', 'braten', 'steak', 'döner', 'gyros', 'burger', 'cevapcici', 'chorizo', 'ente', 'wild', 'filet', 'geschnetzeltes', 'roulade', 'currywurst', 'bratwurst', 'maultasche', 'lasagne', 'carbonara', 'chili con carne'];
const PORK = ['schwein', 'speck', 'schinken', 'salami', 'bacon', 'kassler', 'leberkäse', 'gemischtes hack', 'hackfleisch', 'mett', 'bratwurst', 'currywurst', 'chorizo', 'carbonara', 'gyros'];
const VEGGIE_FREE_OK = ['vegetarisch', 'veggie', 'vegan', 'gemüse', 'tofu'];
const ANIMAL = [...ALLERGEN_WORDS.laktose, ...ALLERGEN_WORDS.ei, 'honig'];

/** Hauptbestandteile für die Abwechslung */
export type Base = 'nudeln' | 'reis' | 'kartoffel' | 'brot' | 'sonstiges';
export type Kind = 'fleisch' | 'gefluegel' | 'fisch' | 'vegetarisch';
const BASE_WORDS: Record<Exclude<Base, 'sonstiges'>, string[]> = {
  nudeln: ['nudel', 'spaghetti', 'penne', 'fusilli', 'makkaroni', 'tagliatelle', 'lasagne', 'pasta', 'spätzle', 'gnocchi', 'ravioli', 'tortellini', 'maultasche', 'farfalle', 'rigatoni', 'linguine', 'bandnudel', 'carbonara', 'bolognese'],
  reis: ['reis', 'risotto', 'paella', 'sushi', 'milchreis', 'bowl'],
  kartoffel: ['kartoffel', 'pommes', 'püree', 'puree', 'bratkartoffel', 'rösti', 'gratin', 'kroketten', 'wedges', 'kartoffelsalat', 'reibekuchen', 'kartoffelpuffer'],
  brot: ['brot', 'pizza', 'flammkuchen', 'toast', 'burger', 'wrap', 'tortilla', 'sandwich', 'baguette', 'brötchen', 'döner', 'abendbrot', 'stulle'],
};
const VEG = ['gemüse', 'salat', 'brokkoli', 'karotte', 'möhre', 'moehre', 'paprika', 'zucchini', 'tomate', 'spinat', 'blumenkohl', 'erbsen', 'bohnen', 'linsen', 'kichererbsen', 'kohl', 'lauch', 'porree', 'aubergine', 'gurke', 'kürbis', 'kuerbis', 'pilz', 'champignon', 'spargel', 'mangold', 'fenchel', 'rote bete', 'mais', 'süßkartoffel', 'rosenkohl', 'wirsing', 'sauerkraut', 'ratatouille', 'minestrone', 'gemüsesuppe', 'eintopf', 'kohlrabi', 'sellerie', 'pastinake', 'grünkohl'];
const POULTRY = ['hähnchen', 'haehnchen', 'huhn', 'hühn', 'pute', 'truthahn', 'chicken', 'nugget', 'ente', 'geflügel'];
const JUNK = ['pizza', 'pommes', 'burger', 'nugget', 'fischstäbchen', 'currywurst', 'döner', 'tiefkühl', 'fertig', 'chicken wings', 'hot dog', 'hotdog'];
const SWEET = ['pfannkuchen', 'milchreis', 'kaiserschmarrn', 'waffel', 'grießbrei', 'griesbrei', 'dampfnudel', 'germknödel', 'apfelstrudel', 'arme ritter', 'crêpe', 'crepe', 'eierkuchen', 'pancake', 'süß'];

export interface DishInfo {
  base: Base; kind: Kind; veg: boolean; junk: boolean; sweet: boolean;
  /** vermutlich enthalten */ allergens: Allergen[]; pork: boolean; animal: boolean;
  emoji: string;
}

/** Text eines Gerichts ohne "laktosefrei", "glutenfrei", "ohne Ei" usw. */
function dishText(title: string, ingredients: string[] = [], strip = true) {
  const raw = ' ' + norm([title, ...ingredients].join(' , ')) + ' ';
  if (!strip) return raw.replace(/[(),;:.]/g, ' ');
  return raw
    .replace(/(kokos|hafer|reis|dinkel|erbsen)(milch|drink|sahne)/g, ' pflanzendrink ').replace(/mandel(milch|drink)/g, ' mandel ').replace(/soja(milch|drink|joghurt|sahne)/g, ' soja ')
    .replace(/erdnussbutter/g, ' erdnuss ').replace(/butternut/g, ' kürbis ').replace(/kokosnuss|muskatnuss/g, ' gewürz ')
    .replace(/(laktose|gluten|ei|nuss|milch)[- ]?frei\w*( [^ ,]+)?/g, ' ')
    .replace(/vegane?[rsn]? (käse|milch|butter|sahne|joghurt|hack|wurst|schnitzel|burger|nuggets?)/g, ' vegan ')
    .replace(/ohne \w+/g, ' ')
    .replace(/[(),;:.]/g, ' ');
}

export function dishInfo(title: string, ingredients: string[] = []): DishInfo {
  const t = dishText(title, ingredients);
  const all = dishText(title, ingredients, false);
  const allergens = (Object.keys(ALLERGEN_WORDS) as Allergen[]).filter(a => {
    if (a === 'ei') return /\beier?\b|eigelb|eiweiß|mayo|pfannkuchen|kaiserschmarrn|spätzle|omelett|rührei|carbonara|frikadelle|bulette|waffel|eierkuchen/.test(t);
    if (a === 'nuesse') return has(t.replace(/erdnüsse|erdnuss/g, ' '), ALLERGEN_WORDS.nuesse);
    return has(t, ALLERGEN_WORDS[a]);
  });
  const fish = allergens.includes('fisch');
  const vegWord = has(t, VEGGIE_FREE_OK);
  const meat = !vegWord && has(t, MEAT);
  const kind: Kind = fish ? 'fisch' : meat ? (has(t, POULTRY) ? 'gefluegel' : 'fleisch') : 'vegetarisch';
  const base = (Object.keys(BASE_WORDS) as Exclude<Base, 'sonstiges'>[]).find(b => has(all, BASE_WORDS[b])) ?? 'sonstiges';
  const veg = has(all, VEG);
  const junk = has(all, JUNK);
  const sweet = has(all, SWEET);
  const pork = meat && has(t, PORK);
  const animal = kind !== 'vegetarisch' || has(t, ANIMAL);
  const emoji = /suppe|eintopf|chili/.test(t) ? '🍲' : /pizza|flammkuchen/.test(t) ? '🍕' : /burger/.test(t) ? '🍔' : /salat/.test(t) ? '🥗'
    : /wrap|tortilla|taco|burrito/.test(t) ? '🌯' : sweet ? '🥞' : fish ? '🐟' : base === 'nudeln' ? '🍝' : /curry/.test(t) ? '🍛' : base === 'reis' ? '🍚'
    : /pommes/.test(t) ? '🍟' : base === 'kartoffel' ? '🥔' : base === 'brot' ? '🥪' : kind === 'gefluegel' ? '🍗' : kind === 'fleisch' ? '🥩' : veg ? '🥦' : '🍽️';
  return { base, kind, veg, junk, sweet, allergens, pork, animal, emoji };
}

export const recipeOf = (d: FamilyData, title: string) => (d.recipes ?? []).find(r => norm(r.title) === norm(title));
export const infoOf = (d: FamilyData, title: string) => { const r = recipeOf(d, title); return dishInfo(title, r?.ingredients); };

/** Hübscher Platzhalter: Farbe aus dem Namen, Emoji aus der Art des Gerichts */
const TILE = [['#ffe3c2', '#ffb980'], ['#d9f2e3', '#9fdcb8'], ['#e4e1ff', '#b9b2ff'], ['#ffe0e6', '#ffacbd'], ['#dff1ff', '#9fd3ff'], ['#fff3c4', '#ffd96a']];
export function tileOf(title: string): [string, string] {
  let h = 0; for (const ch of norm(title)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE[h % TILE.length] as [string, string];
}

// ---------- Personen und Konflikte ----------

export const dietOf = (d: FamilyData, id: string): Diet => (d.diet ?? {})[id] ?? {};
export interface Conflict { personId: string; name: string; why: string; hard: boolean }

/** Wer kann oder mag das nicht? hard = Unverträglichkeit/Ernährungsweise, sonst Geschmack. */
export function conflictsOf(d: FamilyData, title: string, people: { id: string; name: string }[]): Conflict[] {
  const r = recipeOf(d, title);
  const info = dishInfo(title, r?.ingredients);
  const t = dishText(title, r?.ingredients);
  const out: Conflict[] = [];
  for (const p of people) {
    const diet = dietOf(d, p.id);
    const hits = (diet.avoid ?? []).filter(a => info.allergens.includes(a));
    if (hits.length) out.push({ personId: p.id, name: p.name, why: hits.map(a => ALLERGENS.find(x => x.v === a)!.label).join(', '), hard: true });
    if (diet.style === 'vegan' && info.animal) out.push({ personId: p.id, name: p.name, why: 'nicht vegan', hard: true });
    else if (diet.style === 'vegetarisch' && (info.kind !== 'vegetarisch')) out.push({ personId: p.id, name: p.name, why: 'nicht vegetarisch', hard: true });
    else if (diet.style === 'kein_schwein' && info.pork) out.push({ personId: p.id, name: p.name, why: 'vermutlich Schwein', hard: true });
    const dis = (diet.dislike ?? '').split(/[,;\n]/).map(norm).filter(x => x.length > 2).filter(x => t.includes(x));
    if (dis.length) out.push({ personId: p.id, name: p.name, why: `mag kein ${dis.join(', ')}`, hard: false });
    else if (r?.votes?.[p.id] === -1) out.push({ personId: p.id, name: p.name, why: 'isst das lieber nicht', hard: false });
  }
  return out;
}

/** Kurztext für die KI, ohne Namen: "Person A: Laktose; Person B: vegetarisch, mag keine Pilze" */
export function dietSummary(d: FamilyData, people: { id: string }[]): string {
  const lines = people.map((p, i) => {
    const x = dietOf(d, p.id);
    const parts = [...(x.avoid ?? []).map(a => `verträgt kein ${ALLERGENS.find(y => y.v === a)!.label}`), x.style && STYLES.find(y => y.v === x.style)!.label, x.dislike && `mag nicht: ${x.dislike.slice(0, 120)}`].filter(Boolean);
    return parts.length ? `Person ${String.fromCharCode(65 + i)}: ${parts.join(', ')}` : '';
  }).filter(Boolean);
  return lines.join('\n');
}

// ---------- Wochen-Check ----------

export interface WeekHint { id: string; icon: string; text: string; /** Gericht, das ersetzt werden könnte */ swap?: { mealId: string; title: string; want: (i: DishInfo) => boolean; wantLabel: string } }
const BASE_LABEL: Record<Base, string> = { nudeln: 'Nudeln', reis: 'Reis', kartoffel: 'Kartoffeln', brot: 'Brot/Pizza', sonstiges: '' };

/** Freundliche Hinweise, wenn die Woche einseitig ist. Höchstens 3, das Wichtigste zuerst. */
export function weekCheck(d: FamilyData, days: string[]): { hints: WeekHint[]; rating: 'bunt' | 'okay' | 'einseitig' | 'leer'; count: number } {
  const meals = (d.meals ?? []).filter(m => days.includes(m.date)).sort((a, b) => a.date.localeCompare(b.date));
  const main = meals.filter(m => m.slot !== 'fruehstueck');
  if (main.length < 3) return { hints: [], rating: main.length ? 'okay' : 'leer', count: main.length };
  const infos = main.map(m => ({ m, i: infoOf(d, m.title) }));
  const hints: WeekHint[] = [];
  const latest = <T,>(xs: T[]) => xs[xs.length - 1];

  // gleiches Gericht mehrfach
  const seen = new Map<string, number>();
  for (const x of infos) seen.set(norm(x.m.title), (seen.get(norm(x.m.title)) ?? 0) + 1);
  const twice = [...seen.entries()].find(([, n]) => n >= 2);
  if (twice) {
    const m = latest(infos.filter(x => norm(x.m.title) === twice[0]))!.m;
    hints.push({ id: 'twice', icon: '🔁', text: `${m.title} gibt es ${twice[1]}× diese Woche.`, swap: { mealId: m.id, title: m.title, want: () => true, wantLabel: 'etwas anderes' } });
  }
  // gleiche Beilage zu oft
  for (const b of ['nudeln', 'kartoffel', 'reis', 'brot'] as Base[]) {
    const xs = infos.filter(x => x.i.base === b);
    if (xs.length >= Math.max(3, Math.ceil(main.length * 0.45))) {
      const m = latest(xs)!.m;
      hints.push({ id: 'base-' + b, icon: b === 'nudeln' ? '🍝' : b === 'kartoffel' ? '🥔' : b === 'reis' ? '🍚' : '🍕', text: `${xs.length}× ${BASE_LABEL[b]}. Wie wäre mal eine andere Beilage?`, swap: { mealId: m.id, title: m.title, want: i => i.base !== b, wantLabel: `ohne ${BASE_LABEL[b]}` } });
    }
  }
  // Gemüse
  const vegN = infos.filter(x => x.i.veg).length;
  if (vegN < Math.ceil(main.length / 3)) {
    const cand = infos.filter(x => !x.i.veg && !x.i.sweet);
    const m = latest(cand)?.m;
    hints.push({ id: 'veg', icon: '🥦', text: vegN === 0 ? 'Noch kein Gericht mit Gemüse dabei. Ein Salat dazu reicht oft schon.' : `Nur ${vegN}× Gemüse. Ein Gemüsegericht mehr täte der Woche gut.`, swap: m && { mealId: m.id, title: m.title, want: i => i.veg, wantLabel: 'mit Gemüse' } });
  }
  // Fleisch an fast jedem Tag
  const meatN = infos.filter(x => x.i.kind === 'fleisch' || x.i.kind === 'gefluegel').length;
  if (meatN >= 5 && meatN >= main.length * 0.6) {
    const m = latest(infos.filter(x => x.i.kind === 'fleisch'))?.m ?? latest(infos.filter(x => x.i.kind === 'gefluegel'))?.m;
    hints.push({ id: 'meat', icon: '🥩', text: `${meatN}× Fleisch. Ein vegetarischer Tag bringt Abwechslung.`, swap: m && { mealId: m.id, title: m.title, want: i => i.kind === 'vegetarisch', wantLabel: 'vegetarisch' } });
  }
  // Fastfood/Süßes
  const junkN = infos.filter(x => x.i.junk).length;
  if (junkN >= 3) {
    const m = latest(infos.filter(x => x.i.junk))!.m;
    hints.push({ id: 'junk', icon: '🍟', text: `${junkN}× Schnelles wie Pizza oder Pommes. Völlig okay ab und zu, vielleicht eins davon selbst gekocht?`, swap: { mealId: m.id, title: m.title, want: i => !i.junk, wantLabel: 'selbst gekocht' } });
  }
  const sweetN = infos.filter(x => x.i.sweet).length;
  if (sweetN >= 3) {
    const m = latest(infos.filter(x => x.i.sweet))!.m;
    hints.push({ id: 'sweet', icon: '🥞', text: `${sweetN}× Süßes als Hauptgericht.`, swap: { mealId: m.id, title: m.title, want: i => !i.sweet, wantLabel: 'herzhaft' } });
  }
  // Fisch: nur ein leiser Tipp, wenn die Woche voll ist und niemand Fisch meidet
  const fishBlocked = Object.values(d.diet ?? {}).some(x => x.avoid?.includes('fisch') || x.style === 'vegan' || x.style === 'vegetarisch');
  if (main.length >= 7 && !fishBlocked && !infos.some(x => x.i.kind === 'fisch') && hints.length < 2) {
    const m = latest(infos.filter(x => x.i.kind === 'fleisch'))?.m;
    hints.push({ id: 'fish', icon: '🐟', text: 'Diese Woche kein Fisch. Einmal pro Woche ist ein guter Richtwert.', swap: m && { mealId: m.id, title: m.title, want: i => i.kind === 'fisch', wantLabel: 'mit Fisch' } });
  }
  const kinds = new Set(infos.map(x => x.i.base)).size + new Set(infos.map(x => x.i.kind)).size;
  const rating = hints.length === 0 ? (kinds >= 5 ? 'bunt' : 'okay') : hints.length >= 2 ? 'einseitig' : 'okay';
  return { hints: hints.slice(0, 3), rating, count: main.length };
}

const score = (r: Recipe) => Object.values(r.votes ?? {}).reduce((a, b) => a + b, 0);
const lastDate = (d: FamilyData, title: string) => (d.meals ?? []).filter(m => norm(m.title) === norm(title)).map(m => m.date).sort().pop() ?? '';

/** Bester Ersatz aus der eigenen Sammlung: passt zum Wunsch, keine harten Konflikte, nicht kürzlich gegessen, gut bewertet. */
export function swapCandidates(d: FamilyData, days: string[], want: (i: DishInfo) => boolean, people: { id: string; name: string }[], n = 3): Recipe[] {
  const inWeek = new Set((d.meals ?? []).filter(m => days.includes(m.date)).map(m => norm(m.title)));
  const recentCut = days[0];
  return (d.recipes ?? [])
    .filter(r => !inWeek.has(norm(r.title)))
    .filter(r => want(dishInfo(r.title, r.ingredients)))
    .filter(r => !conflictsOf(d, r.title, people).some(c => c.hard))
    .map(r => ({ r, w: score(r) * 2 - (lastDate(d, r.title) >= addIso(recentCut, -7) ? 6 : 0) - conflictsOf(d, r.title, people).length }))
    .sort((a, b) => b.w - a.w)
    .slice(0, n).map(x => x.r);
}

function addIso(iso: string, n: number) { const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }

/** Woche ohne KI aus den Lieblingsgerichten füllen: abwechselnde Beilagen, keine harten Konflikte, Gemüse bevorzugt. */
export function autoFill(d: FamilyData, days: string[], slots: MealSlot[], people: { id: string; name: string }[], only?: string[]): { date: string; slot: MealSlot; title: string }[] {
  const pool = (d.recipes ?? []).filter(r => !conflictsOf(d, r.title, people).some(c => c.hard));
  if (!pool.length) return [];
  const out: { date: string; slot: MealSlot; title: string }[] = [];
  const used = new Set((d.meals ?? []).filter(m => days.includes(m.date)).map(m => norm(m.title)));
  const baseCount: Record<string, number> = {};
  for (const m of (d.meals ?? []).filter(m => days.includes(m.date))) { const b = infoOf(d, m.title).base; baseCount[b] = (baseCount[b] ?? 0) + 1; }
  let prevBase = '';
  for (const date of days) for (const slot of slots) {
    if (only && !only.includes(date)) continue;
    if ((d.meals ?? []).some(m => m.date === date && m.slot === slot)) continue;
    const best = pool.filter(r => !used.has(norm(r.title))).map(r => {
      const i = dishInfo(r.title, r.ingredients);
      const w = score(r) * 2 + (i.veg ? 2 : 0) - (baseCount[i.base] ?? 0) * 2 - (i.base === prevBase && i.base !== 'sonstiges' ? 3 : 0)
        - (lastDate(d, r.title) >= addIso(days[0], -7) ? 4 : 0) - (i.junk ? 2 : 0) + Math.random();
      return { r, i, w };
    }).sort((a, b) => b.w - a.w)[0];
    if (!best) continue;
    used.add(norm(best.r.title)); baseCount[best.i.base] = (baseCount[best.i.base] ?? 0) + 1; prevBase = best.i.base;
    out.push({ date, slot, title: best.r.title });
  }
  return out;
}

// ---------- Diktat für die Einkaufsliste ----------

const NUM: Record<string, string> = { zwei: '2', drei: '3', vier: '4', fünf: '5', fuenf: '5', sechs: '6', sieben: '7', acht: '8', neun: '9', zehn: '10', elf: '11', zwölf: '12', zwanzig: '20', dreißig: '30', fünfzig: '50', hundert: '100', zweihundert: '200', fünfhundert: '500', halbes: '½', halbe: '½', halben: '½' };
const FILLER = /^(und|bitte|noch|auch|dann|außerdem|ausserdem|wir brauchen|brauchen wir|ich brauche|kauf|kaufen|kauft|schreib|schreibe|setz|setze|auf die liste|auf die einkaufsliste|mal|ähm|äh)\s+/i;

/** Gesprochenen Satz in einzelne Einkäufe zerlegen: "Milch, zwei Gurken und Brot" → ["Milch", "2 Gurken", "Brot"] */
export function parseSpoken(text: string): string[] {
  return text
    .replace(/[.!?;]/g, ',')
    .split(/,|\bund\b|\bsowie\b|\baußerdem\b|\bausserdem\b|\bplus\b|\n/i)
    .map(x => {
      let t = x.trim();
      for (let i = 0; i < 3; i++) t = t.replace(FILLER, '').trim();
      t = t.replace(/\s+(bitte|noch|auch|kaufen|mitbringen|holen|auf die liste|auf die einkaufsliste)$/i, '').trim();
      t = t.replace(/^(ein|eine|einen)\s+(kilo|kilogramm|liter|pfund|packung|packungen|dose|flasche|netz|beutel|glas|becher|tüte|bund|kiste|stück)\b/i, '1 $2');
      t = t.replace(/^(ein paar|ein bisschen|eine|einen|einem|einer|ein|etwas|bisschen)\s+/i, m => (/paar/i.test(m) ? 'ein paar ' : ''));
      t = t.split(/\s+/).map(w => NUM[w.toLowerCase()] ?? w).join(' ');
      t = t.replace(/^(\d+|½)\s*(kilo|kilogramm)(?=\s|$)/i, '$1 kg').replace(/^(\d+|½)\s*(gramm)\b/i, '$1 g').replace(/^(\d+|½)\s*(liter)\b/i, '$1 l');
      return t ? t[0].toUpperCase() + t.slice(1) : '';
    })
    .filter(t => t.length > 1)
    .slice(0, 30);
}
