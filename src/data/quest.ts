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

export interface Badge { id: string; icon: string; title: string; hint: string }
export const BADGES: Badge[] = [
  { id: 'erste', icon: '🌱', title: 'Erster Schritt', hint: 'Erste Aufgabe erledigt' },
  { id: 'serie3', icon: '🔥', title: 'Am Ball', hint: '3 Tage am Stück geschafft' },
  { id: 'serie7', icon: '⚡', title: 'Wochen-Held', hint: '7 Tage am Stück geschafft' },
  { id: 'serie30', icon: '🏆', title: 'Unaufhaltsam', hint: '30 Tage am Stück geschafft' },
  { id: 'zahn7', icon: '🦷', title: 'Strahlemann', hint: '7 Tage am Stück Zähne geputzt' },
  { id: 'sterne100', icon: '⭐', title: 'Sternensammler', hint: '100 Punkte verdient' },
  { id: 'sterne500', icon: '🌟', title: 'Sternenregen', hint: '500 Punkte verdient' },
  { id: 'sterne1000', icon: '💫', title: 'Galaxie', hint: '1000 Punkte verdient' },
  { id: 'vok10', icon: '🧠', title: 'Wortschatz', hint: '10 Vokabeln sitzen' },
  { id: 'vok100', icon: '📖', title: 'Wörterbuch', hint: '100 Vokabeln sitzen' },
  { id: 'test', icon: '✏️', title: 'Durchgezogen', hint: 'Ersten Test abgegeben' },
  { id: 'topf', icon: '🤝', title: 'Teamplayer', hint: 'In den Familien-Topf eingezahlt' },
  { id: 'sonder1', icon: '🎯', title: 'Sonderauftrag', hint: 'Erste Sonderaufgabe geschafft' },
  { id: 'sonder5', icon: '🦸', title: 'Sonderheld', hint: '5 Sonderaufgaben geschafft' },
];

function toothStreak(d: FamilyData, childId: string, date: string) {
  const ids = d.tasks.filter(t => t.childId === childId && /z[äa]hne/i.test(t.title)).map(t => t.id);
  if (!ids.length) return 0;
  const days = new Set(d.completions.filter(c => ids.includes(c.taskId)).map(c => c.date));
  let best = 0, cur = 0;
  for (let i = 365; i >= 0; i--) { if (days.has(addDays(date, -i))) best = Math.max(best, ++cur); else cur = 0; }
  return best;
}

export function earnedBadges(d: FamilyData, child: Child, date = today()): Set<string> {
  const id = child.id, out = new Set<string>();
  if (d.completions.some(c => c.childId === id)) out.add('erste');
  const bs = bestStreak(d, id, date);
  if (bs >= 3) out.add('serie3'); if (bs >= 7) out.add('serie7'); if (bs >= 30) out.add('serie30');
  if (toothStreak(d, id, date) >= 7) out.add('zahn7');
  const st = lifetimeStars(d, id);
  if (st >= 100) out.add('sterne100'); if (st >= 500) out.add('sterne500'); if (st >= 1000) out.add('sterne1000');
  const m = (d.vocab ?? []).filter(v => v.childId === id).reduce((n, v) => n + masteredCount(v), 0);
  if (m >= 10) out.add('vok10'); if (m >= 100) out.add('vok100');
  if ((d.worksheets ?? []).some(w => w.childId === id && w.status !== 'offen')) out.add('test');
  if (d.ledger.some(e => e.childId === id && e.potId)) out.add('topf');
  const sp = new Set(d.tasks.filter(t => t.special && t.childId === id).map(t => t.id));
  const nSp = d.completions.filter(c => c.childId === id && c.status === 'bestaetigt' && sp.has(c.taskId)).length;
  if (nSp >= 1) out.add('sonder1'); if (nSp >= 5) out.add('sonder5');
  return out;
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
