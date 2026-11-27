import { ExamPrep, FamilyData, StudyPart, VocabDeck } from './types';
import { today } from './logic';

/** Ab diesem Anteil sitzender Karten (Fach 1 oder höher) gilt ein Lernabschnitt als gelernt. */
export const PART_GOAL = 0.8;

const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);

export function partCards(deck: VocabDeck | undefined, part: StudyPart) {
  if (!deck) return [];
  const ids = new Set(part.cards);
  return deck.cards.filter(c => ids.has(c.id));
}
export function partShare(deck: VocabDeck | undefined, part: StudyPart) {
  const cs = partCards(deck, part);
  return cs.length ? cs.filter(c => c.box >= 1).length / cs.length : 0;
}
const partDone = (deck: VocabDeck | undefined, part: StudyPart) => partShare(deck, part) >= PART_GOAL;
const seenOn = (deck: VocabDeck | undefined, part: StudyPart, date: string) => partCards(deck, part).some(c => c.seen === date);

export type PlanKind = 'teil' | 'wdh' | 'probe' | 'schwach' | 'vorabend' | 'alles';
export interface PlanDay { date: string; kind: PlanKind; parts: number[]; label: string; minutes: number; done: boolean }

/**
 * Lernplan rückwärts vom Termin: erst die Abschnitte (eine Tagesportion je Abschnitt), dann Wiederholen,
 * 2 bis 3 Tage vorher die Probe-Arbeit, danach Schwachstellen und am Vorabend nur kurz drüberschauen.
 * Der Plan rechnet jeden Tag neu ab heute: Was schon vor heute gelernt wurde, fällt raus, Verpasstes rutscht nach vorn.
 */
export function planFor(prep: ExamPrep, deck: VocabDeck | undefined, o: { hasSheet: boolean; checked: boolean }, date = today()): PlanDay[] {
  const parts = prep.pack?.parts ?? [];
  if (!parts.length) return [];
  const D = prep.date ? daysBetween(date, prep.date) : null;
  if (D !== null && D <= 0) return [];
  const open = parts.map((_, i) => i).filter(i => !partDone(deck, parts[i]) || seenOn(deck, parts[i], date));
  const mins = (idx: number[]) => Math.min(30, Math.max(10, 5 + idx.reduce((a, i) => a + parts[i].cards.length, 0)));
  const title = (idx: number[]) => idx.map(i => parts[i].title).join(', ');
  const teilDone = (idx: number[]) => idx.every(i => partDone(deck, parts[i]));
  const anySeen = (day: string) => !!deck?.cards.some(c => c.seen === day);
  const out: PlanDay[] = [];
  const teil = (day: string, idx: number[]): PlanDay => ({ date: day, kind: 'teil', parts: idx, label: title(idx), minutes: mins(idx), done: teilDone(idx) });
  const probe = (day: string): PlanDay => ({ date: day, kind: 'probe', parts: [], label: 'Probe-Arbeit schreiben', minutes: 45, done: o.hasSheet });

  // Ohne Termin: jeden Tag ein Abschnitt, danach die Probe-Arbeit
  if (D === null) {
    open.forEach((i, k) => out.push(teil(addDays(date, k), [i])));
    out.push(probe(addDays(date, open.length)));
    return out;
  }
  // Morgen ist die Arbeit: heute alles einmal kurz
  if (D === 1) return [{ date, kind: 'alles', parts: parts.map((_, i) => i), label: 'Merkzettel lesen und alle Karten einmal üben', minutes: 30, done: anySeen(date) }];

  const probeDay = D >= 6 ? D - 3 : D >= 4 ? D - 2 : D - 1;
  const slots = probeDay; // Tage 0 .. probeDay-1 zum Lernen
  if (open.length <= slots) open.forEach((i, k) => out.push(teil(addDays(date, k), [i])));
  else for (let k = 0; k < slots; k++) out.push(teil(addDays(date, k), open.slice(Math.round((k * open.length) / slots), Math.round(((k + 1) * open.length) / slots))));
  // Übrige Lerntage: jeden zweiten Tag alles wiederholen (verteilt lernen statt pauken)
  for (let k = open.length ? out.length + 1 : 0; k < slots; k += 2) out.push({ date: addDays(date, k), kind: 'wdh', parts: [], label: 'Alle Karten wiederholen', minutes: 10, done: k === 0 && anySeen(date) });
  out.push(probe(addDays(date, probeDay)));
  for (let k = probeDay + 1; k < D - 1; k++) out.push({ date: addDays(date, k), kind: 'schwach', parts: [], label: 'Schwachstellen aus der Probe üben', minutes: 15, done: o.checked && anySeen(addDays(date, k)) });
  if (probeDay < D - 1) out.push({ date: addDays(date, D - 1), kind: 'vorabend', parts: [], label: 'Merkzettel lesen, Tasche packen, früh schlafen', minutes: 10, done: false });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Was heute für Klassenarbeiten dran ist, für die Startseite. */
export function studyToday(d: FamilyData, childId: string, date = today()) {
  const res: { prep: ExamPrep; day: PlanDay; days: number | null }[] = [];
  for (const prep of d.exams ?? []) {
    if (prep.childId !== childId || prep.grade || !prep.pack) continue;
    const deck = (d.vocab ?? []).find(v => v.id === prep.deckId);
    const sheets = (d.worksheets ?? []).filter(w => w.exam?.prepId === prep.id);
    const plan = planFor(prep, deck, { hasSheet: sheets.length > 0, checked: sheets.some(w => w.status === 'geprueft') }, date);
    const day = plan.find(p => p.date === date);
    if (day) res.push({ prep, day, days: prep.date ? daysBetween(date, prep.date) : null });
  }
  return res.sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
}
