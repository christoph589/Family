import { FamilyData, Child } from './types';
import { addPoints, isDueOn, today } from './logic';
import { addDays, masteredCount } from './vocab';

/** Ein Tag zählt als "geschafft", wenn mindestens 3 von 4 fälligen Aufgaben erledigt sind. Tage ohne Aufgaben zählen nicht und brechen nichts. */
const STRONG = 0.75;

function doneSet(d: FamilyData, childId: string) {
  return new Set(d.completions.filter(c => c.childId === childId).map(c => `${c.taskId}|${c.date}`));
}
export function dayState(d: FamilyData, childId: string, date: string, done = doneSet(d, childId)): 'stark' | 'schwach' | 'frei' {
  const due = d.tasks.filter(t => t.childId === childId && isDueOn(t, date, d));
  if (!due.length) return 'frei';
  const n = due.filter(t => done.has(`${t.id}|${date}`)).length;
  return n / due.length >= STRONG ? 'stark' : 'schwach';
}

/** Aktuelle Serie: heute zählt mit, wenn schon geschafft. Ein offener heutiger Tag bricht die Serie nicht. */
export function taskStreak(d: FamilyData, childId: string, date = today()) {
  const done = doneSet(d, childId);
  let n = 0;
  let day = dayState(d, childId, date, done) === 'stark' ? date : addDays(date, -1);
  for (let i = 0; i < 400; i++) {
    const st = dayState(d, childId, day, done);
    if (st === 'schwach') break;
    if (st === 'stark') n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(d: FamilyData, childId: string, date = today()) {
  const done = doneSet(d, childId);
  let best = 0, cur = 0;
  for (let i = 365; i >= 0; i--) {
    const st = dayState(d, childId, addDays(date, -i), done);
    if (st === 'stark') { cur++; best = Math.max(best, cur); } else if (st === 'schwach' && i > 0) cur = 0;
  }
  return best;
}

/** Alle jemals verdienten Punkte (ohne Einlösen, Topf und Rücknahmen). */
export const lifetimeStars = (d: FamilyData, childId: string) =>
  d.ledger.filter(e => e.childId === childId && e.points > 0 && !e.potId).reduce((s, e) => s + e.points, 0);

// ---------- Begleiter ----------

export const BUDDIES = [
  { kind: 'drache', emoji: '🐉', label: 'Drache' }, { kind: 'fuchs', emoji: '🦊', label: 'Fuchs' },
  { kind: 'katze', emoji: '🐱', label: 'Katze' }, { kind: 'hund', emoji: '🐶', label: 'Hund' },
  { kind: 'einhorn', emoji: '🦄', label: 'Einhorn' }, { kind: 'panda', emoji: '🐼', label: 'Panda' },
  { kind: 'schildkroete', emoji: '🐢', label: 'Schildkröte' }, { kind: 'eule', emoji: '🦉', label: 'Eule' },
];
/** Stufen nach verdienten Punkten. Ab Stufe 1 ist das Tier geschlüpft. */
export const STAGES = [
  { at: 0, name: 'Ei', extra: '' }, { at: 30, name: 'Baby', extra: '' }, { at: 150, name: 'Klein', extra: '🧣' },
  { at: 400, name: 'Groß', extra: '🎩' }, { at: 1000, name: 'Held', extra: '👑' }, { at: 2500, name: 'Legende', extra: '🌈' },
];
export function buddyStage(stars: number) {
  let i = 0;
  while (i + 1 < STAGES.length && stars >= STAGES[i + 1].at) i++;
  const next = STAGES[i + 1];
  return { stage: i, ...STAGES[i], next, progress: next ? (stars - STAGES[i].at) / (next.at - STAGES[i].at) : 1 };
}
export function buddyMood(d: FamilyData, childId: string, date = today()): { face: string; text: string } {
  const done = doneSet(d, childId);
  const st = dayState(d, childId, date, done);
  if (st === 'stark') return { face: '😄', text: 'ist satt und glücklich' };
  const any = d.completions.some(c => c.childId === childId && c.date === date);
  if (any) return { face: '🙂', text: 'freut sich, mach weiter' };
  const y = d.completions.some(c => c.childId === childId && c.date === addDays(date, -1));
  return y || st === 'frei' ? { face: '🍎', text: 'hat Hunger auf erledigte Aufgaben' } : { face: '🥺', text: 'vermisst dich' };
}

// ---------- Abzeichen ----------

export type BadgeGroup = 'start' | 'weiter' | 'episch';
export const BADGE_GROUPS: { id: BadgeGroup; title: string }[] = [
  { id: 'start', title: 'Erste Schritte' }, { id: 'weiter', title: 'Weiter, immer weiter' }, { id: 'episch', title: 'Epische Erfolge' },
];
type Metric = 'tasks' | 'streak' | 'tooth' | 'stars' | 'mastered' | 'learnDays' | 'right' | 'tests' | 'pot' | 'special';
export interface Badge { id: string; icon: string; title: string; hint: string; group: BadgeGroup; metric: Metric; goal: number; unit: string }
const B = (id: string, icon: string, title: string, hint: string, group: BadgeGroup, metric: Metric, goal: number, unit: string): Badge => ({ id, icon, title, hint, group, metric, goal, unit });
export const BADGES: Badge[] = [
  B('erste', '🐣', 'Kesses Küken', 'Erste Aufgabe erledigt', 'start', 'tasks', 1, 'Aufgaben'),
  B('test', '🦉', 'Eifrige Eule', 'Ersten Test abgegeben', 'start', 'tests', 1, 'Tests'),
  B('lern3', '🐭', 'Muntere Maus', 'An 3 Tagen Vokabeln gelernt', 'start', 'learnDays', 3, 'Lerntage'),
  B('vok10', '🐸', 'Fleißiger Frosch', '10 Vokabeln sitzen', 'start', 'mastered', 10, 'Vokabeln'),
  B('topf', '🐝', 'Hilfsbereite Hummel', 'In den Familien-Topf eingezahlt', 'start', 'pot', 1, 'Einzahlungen'),
  B('sonder1', '🐞', 'Mutiger Marienkäfer', 'Erste Sonderaufgabe geschafft', 'start', 'special', 1, 'Sonderaufgaben'),
  B('serie3', '🐶', 'Hurtiger Hund', '3 Tage am Stück geschafft', 'weiter', 'streak', 3, 'Tage am Stück'),
  B('serie7', '🦊', 'Flotter Fuchs', '7 Tage am Stück geschafft', 'weiter', 'streak', 7, 'Tage am Stück'),
  B('zahn7', '🦫', 'Blitzblanker Biber', '7 Tage am Stück Zähne geputzt', 'weiter', 'tooth', 7, 'Tage am Stück'),
  B('sterne100', '🐱', 'Kuschelige Katze', '100 Punkte verdient', 'weiter', 'stars', 100, 'Punkte'),
  B('lern30', '🐨', 'Kluger Koala', 'An 30 Tagen Vokabeln gelernt', 'weiter', 'learnDays', 30, 'Lerntage'),
  B('vok100', '🐼', 'Pfiffiger Panda', '100 Vokabeln sitzen', 'weiter', 'mastered', 100, 'Vokabeln'),
  B('tests10', '🐙', 'Kluge Krake', '10 Tests abgegeben', 'weiter', 'tests', 10, 'Tests'),
  B('sonder5', '🦁', 'Lässiger Löwe', '5 Sonderaufgaben geschafft', 'weiter', 'special', 5, 'Sonderaufgaben'),
  B('serie30', '🐉', 'Donnernder Drache', '30 Tage am Stück geschafft', 'episch', 'streak', 30, 'Tage am Stück'),
  B('lern100', '🐘', 'Emsiger Elefant', 'An 100 Tagen Vokabeln gelernt', 'episch', 'learnDays', 100, 'Lerntage'),
  B('vok500', '🐋', 'Weiser Wal', '500 Vokabeln sitzen', 'episch', 'mastered', 500, 'Vokabeln'),
  B('richtig1000', '🦒', 'Großartige Giraffe', '1000 Vokabeln richtig beantwortet', 'episch', 'right', 1000, 'richtige Antworten'),
  B('sterne500', '🦄', 'Edles Einhorn', '500 Punkte verdient', 'episch', 'stars', 500, 'Punkte'),
  B('sterne1000', '🦅', 'Atemberaubender Adler', '1000 Punkte verdient', 'episch', 'stars', 1000, 'Punkte'),
  B('sonder20', '🐬', 'Dufter Delfin', '20 Sonderaufgaben geschafft', 'episch', 'special', 20, 'Sonderaufgaben'),
];

function toothStreak(d: FamilyData, childId: string, date: string) {
  const ids = d.tasks.filter(t => t.childId === childId && /z[äa]hne/i.test(t.title)).map(t => t.id);
  if (!ids.length) return 0;
  const days = new Set(d.completions.filter(c => ids.includes(c.taskId)).map(c => c.date));
  let best = 0, cur = 0;
  for (let i = 365; i >= 0; i--) { if (days.has(addDays(date, -i))) best = Math.max(best, ++cur); else cur = 0; }
  return best;
}

/** Alle Zahlen, an denen Abzeichen hängen. */
export function badgeMetrics(d: FamilyData, child: Child, date = today()): Record<Metric, number> {
  const id = child.id;
  const vs = d.vocabStats?.[id];
  const sp = new Set(d.tasks.filter(t => t.special && t.childId === id).map(t => t.id));
  return {
    tasks: d.completions.filter(c => c.childId === id).length,
    streak: bestStreak(d, id, date),
    tooth: toothStreak(d, id, date),
    stars: lifetimeStars(d, id),
    mastered: (d.vocab ?? []).filter(v => v.childId === id).reduce((n, v) => n + masteredCount(v), 0),
    learnDays: vs?.learnDays ?? Object.keys(vs?.days ?? {}).length,
    right: vs?.total ?? 0,
    tests: (d.worksheets ?? []).filter(w => w.childId === id && w.status !== 'offen').length,
    pot: d.ledger.filter(e => e.childId === id && e.potId).length,
    special: d.completions.filter(c => c.childId === id && c.status === 'bestaetigt' && sp.has(c.taskId)).length,
  };
}

export function earnedBadges(d: FamilyData, child: Child, date = today()): Set<string> {
  const m = badgeMetrics(d, child, date);
  return new Set(BADGES.filter(b => m[b.metric] >= b.goal).map(b => b.id));
}

// ---------- Überraschungskiste ----------

export const mondayOf = (date: string) => { const wd = (new Date(date + 'T12:00:00').getDay() + 6) % 7; return addDays(date, -wd); };
export const SURPRISE_DAYS = 5;
/** Starke Tage der letzten Woche (Mo bis So). */
export function lastWeekStrong(d: FamilyData, childId: string, date = today()) {
  const mon = addDays(mondayOf(date), -7), done = doneSet(d, childId);
  let n = 0;
  for (let i = 0; i < 7; i++) if (dayState(d, childId, addDays(mon, i), done) === 'stark') n++;
  return n;
}
export const surpriseReady = (d: FamilyData, child: Child, date = today()) =>
  child.surpriseWeek !== mondayOf(date) && lastWeekStrong(d, child.id, date) >= SURPRISE_DAYS;

export const PERKS = [
  '🍝 Du darfst ein Abendessen aussuchen',
  '🌙 15 Minuten länger aufbleiben',
  '🎬 Du suchst den Film am Familienabend aus',
  '🎲 Ein Spiel deiner Wahl mit Mama oder Papa',
  '🙌 Einmal Tischdienst frei',
];
export type Surprise = { kind: 'punkte'; points: number; text: string } | { kind: 'extra'; text: string };
export function drawSurprise(r = Math.random(), r2 = Math.random()): Surprise {
  if (r < 0.6) { const points = [5, 10, 10, 15, 20, 25][Math.floor(r2 * 6)]; return { kind: 'punkte', points, text: `${points} Bonus-Punkte` }; }
  return { kind: 'extra', text: PERKS[Math.floor(r2 * PERKS.length)] };
}
export function openSurprise(d: FamilyData, childId: string, s: Surprise, date = today()): FamilyData {
  const marked = { ...d, children: d.children.map(c => (c.id === childId ? { ...c, surpriseWeek: mondayOf(date) } : c)) };
  return addPoints(marked, childId, s.kind === 'punkte' ? s.points : 0, `🎁 Überraschungskiste: ${s.text}`);
}
