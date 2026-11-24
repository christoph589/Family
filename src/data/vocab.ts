import { FamilyData, VocabCard, VocabDeck, VocabStats } from './types';
import { addPoints, today, uid } from './logic';

/** Tage bis zur nächsten Abfrage je Fach im Karteikasten. */
export const INTERVALS = [0, 1, 2, 4, 7, 14];
export const MASTERED = 4;
export const ROUND = 10;
/** Höchstens so viele Punkte pro Tag aus Vokabeln, damit niemand nur noch Runden farmt. */
export const DAILY_CAP = 15;
export const STREAK_BONUS: Record<number, number> = { 3: 5, 7: 10, 14: 20, 30: 40, 60: 60, 100: 100 };

export const LANGS: { value: string; label: string; flag: string; speech?: string }[] = [
  { value: 'Englisch', label: 'Englisch', flag: '🇬🇧', speech: 'en-GB' },
  { value: 'Französisch', label: 'Französisch', flag: '🇫🇷', speech: 'fr-FR' },
  { value: 'Spanisch', label: 'Spanisch', flag: '🇪🇸', speech: 'es-ES' },
  { value: 'Latein', label: 'Latein', flag: '🏛️' },
  { value: 'Italienisch', label: 'Italienisch', flag: '🇮🇹', speech: 'it-IT' },
  { value: 'Andere', label: 'Andere', flag: '🌍' },
];
export const langOf = (v: string) => LANGS.find(l => l.value === v) ?? LANGS[LANGS.length - 1];

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
}

/** Liest eine abgetippte oder kopierte Liste: eine Vokabel pro Zeile, z. B. "apple - Apfel". */
export function parseVocabList(text: string): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /\t+| +[-–—=:] +|\s*[=;|]\s*| - /.exec(line);
    if (!m) continue;
    const front = line.slice(0, m.index).trim(), back = line.slice(m.index + m[0].length).trim();
    if (front && back) out.push({ front: front.slice(0, 120), back: back.slice(0, 120) });
  }
  return out;
}

export const newCards = (items: { front: string; back: string }[], date = today()): VocabCard[] =>
  items.map(x => ({ id: uid(), front: x.front, back: x.back, box: 0, due: date, right: 0, wrong: 0 }));

export const dueCards = (deck: VocabDeck, date = today()) => deck.cards.filter(c => c.due <= date);
export const masteredCount = (deck: VocabDeck) => deck.cards.filter(c => c.box >= MASTERED).length;
export const dueCount = (d: FamilyData, childId: string, date = today()) =>
  (d.vocab ?? []).filter(x => x.childId === childId).reduce((n, x) => n + dueCards(x, date).length, 0);

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** Fällige zuerst (schwächste vorn). Ist nichts fällig, gibt es eine freie Runde mit den wackligsten Karten. */
export function buildRound(deck: VocabDeck, date = today(), size = ROUND): { cards: VocabCard[]; free: boolean } {
  const due = shuffle(dueCards(deck, date)).sort((a, b) => a.box - b.box).slice(0, size);
  if (due.length) return { cards: shuffle(due), free: false };
  return { cards: shuffle(shuffle(deck.cards).sort((a, b) => a.box - b.box).slice(0, size)), free: true };
}

export type Mode = 'choice' | 'flip' | 'type';
/** Je besser die Karte sitzt, desto schwerer die Abfrage: erst auswählen, dann umdrehen, dann selbst schreiben. */
export function modeFor(card: VocabCard, deck: VocabDeck): { mode: Mode; reverse: boolean } {
  const canChoice = deck.cards.length >= 4;
  if (card.box === 0) return { mode: canChoice ? 'choice' : 'flip', reverse: false };
  if (card.box === 1) return { mode: canChoice ? 'choice' : 'flip', reverse: true };
  if (card.box <= 3) return { mode: 'flip', reverse: Math.random() < 0.5 };
  return { mode: 'type', reverse: true };
}

export function choicesFor(card: VocabCard, deck: VocabDeck, reverse: boolean): string[] {
  const pick = (c: VocabCard) => (reverse ? c.front : c.back);
  const others = shuffle(deck.cards.filter(c => c.id !== card.id && pick(c) !== pick(card))).slice(0, 3).map(pick);
  return shuffle([pick(card), ...others]);
}

const norm = (v: string) => v.toLowerCase().normalize('NFC').replace(/\(.*?\)/g, '').replace(/^(to|the|a|an|le|la|les|l'|un|une|el|los|las|der|die|das)\s+/, '').replace(/[.!?¿¡"']/g, '').replace(/\s+/g, ' ').trim();
function dist(a: string, b: string) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
/** 'exact' = richtig, 'typo' = ein Tippfehler (zählt als richtig), 'wrong' = falsch. Mehrere Lösungen mit , / ; getrennt. */
export function checkTyped(input: string, solution: string): 'exact' | 'typo' | 'wrong' {
  const a = norm(input);
  if (!a) return 'wrong';
  const opts = [solution, ...solution.split(/[,/;]/)].map(norm).filter(Boolean);
  if (opts.includes(a)) return 'exact';
  if (opts.some(o => o.length > 4 && dist(a, o) <= 1)) return 'typo';
  return 'wrong';
}

export function vocabPointsToday(d: FamilyData, childId: string, date = today()) {
  return d.ledger.filter(e => e.childId === childId && e.reason.startsWith('Vokabeln') && e.at.slice(0, 10) === date && e.points > 0).reduce((s, e) => s + e.points, 0);
}

export const levelOf = (total: number) => {
  const level = Math.floor(Math.sqrt(total / 8)) + 1;
  const from = 8 * (level - 1) ** 2, to = 8 * level ** 2;
  return { level, progress: (total - from) / (to - from), toNext: to - total };
};

export interface RoundResult { cardId: string; ok: boolean }
export interface Reward { points: number; streak: number; streakUp: boolean; streakBonus: number; perfect: boolean; capped: boolean; levelUp: boolean; level: number; newlyMastered: number }

/** Bucht eine fertige Runde: Karten wandern im Kasten, Serie und Level steigen, Punkte gibt es nur fürs Kind selbst. */
export function finishRound(d: FamilyData, deckId: string, results: RoundResult[], free: boolean, givePoints: boolean, date = today()): { data: FamilyData; reward: Reward } {
  const deck = (d.vocab ?? []).find(x => x.id === deckId);
  const empty: Reward = { points: 0, streak: 0, streakUp: false, streakBonus: 0, perfect: false, capped: false, levelUp: false, level: 1, newlyMastered: 0 };
  if (!deck) return { data: d, reward: empty };
  // Pro Karte zählt die erste Antwort der Runde. Falsches wird in der Runde wiederholt, wandert aber zurück in Fach 0.
  const first = new Map<string, boolean>();
  for (const r of results) if (!first.has(r.cardId)) first.set(r.cardId, r.ok);
  let newlyMastered = 0;
  const cards = deck.cards.map(c => {
    if (!first.has(c.id)) return c;
    const ok = first.get(c.id)!;
    if (free && ok) return { ...c, right: c.right + 1 };
    const box = ok ? Math.min(5, c.box + 1) : 0;
    if (box >= MASTERED && c.box < MASTERED) newlyMastered++;
    return { ...c, box, due: addDays(date, ok ? INTERVALS[box] : 0), right: c.right + (ok ? 1 : 0), wrong: c.wrong + (ok ? 0 : 1) };
  });
  const right = [...first.values()].filter(Boolean).length;
  const total = first.size;
  let data: FamilyData = { ...d, vocab: (d.vocab ?? []).map(x => (x.id === deckId ? { ...x, cards } : x)) };
  if (!givePoints) return { data, reward: { ...empty, newlyMastered, perfect: right === total && total > 0 } };

  const childId = deck.childId;
  const old: VocabStats = d.vocabStats?.[childId] ?? { streak: 0, best: 0, total: 0 };
  const streakUp = old.last !== date;
  const streak = !streakUp ? old.streak : old.last === addDays(date, -1) ? old.streak + 1 : 1;
  const stats: VocabStats = { streak, last: date, best: Math.max(old.best, streak), total: old.total + right };
  data = { ...data, vocabStats: { ...(d.vocabStats ?? {}), [childId]: stats } };

  const perfect = right === total && total >= 5;
  const raw = Math.ceil(right / 2) + (perfect ? 3 : 0) + newlyMastered;
  const room = Math.max(0, DAILY_CAP - vocabPointsToday(d, childId, date));
  const points = Math.min(raw, room);
  const streakBonus = streakUp ? STREAK_BONUS[streak] ?? 0 : 0;
  if (points > 0) data = addPoints(data, childId, points, `Vokabeln: ${deck.title} (${right}/${total})`);
  if (streakBonus > 0) data = addPoints(data, childId, streakBonus, `Vokabeln: ${streak} Tage am Stück`);
  const lv = levelOf(stats.total);
  return { data, reward: { points, streak, streakUp: streakUp && streak > 1, streakBonus, perfect, capped: raw > points, levelUp: lv.level > levelOf(old.total).level, level: lv.level, newlyMastered } };
}

/** Serie zählt nur, wenn gestern oder heute geübt wurde. */
export function liveStreak(d: FamilyData, childId: string, date = today()) {
  const st = d.vocabStats?.[childId];
  if (!st?.last) return 0;
  return st.last === date || st.last === addDays(date, -1) ? st.streak : 0;
}
