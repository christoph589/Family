import { FamilyData, LearnDay, Understanding, Worksheet } from './types';
import { today } from './logic';

/** So viele Tage bleibt die Lern-Statistik gespeichert. */
const KEEP_DAYS = 120;
/** Ab hier wird die Lernzeit gemessen. Vorher gibt es nur Vokabel- und Testzahlen. */
export const TIME_SINCE = '2026-11-27';

export function shiftDay(date: string, n: number) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
}

/** Bucht Lernaktivität eines Kindes auf einen Tag. subj = Fach, dem die Zeit zugerechnet wird. */
export function logLearn(d: FamilyData, childId: string, add: Omit<LearnDay, 'subj'> & { subject?: string }, date = today()): FamilyData {
  const all = d.learnLog ?? {};
  const mine = { ...(all[childId] ?? {}) };
  const cur: LearnDay = { ...(mine[date] ?? {}) };
  const plus = (k: 'w' | 'ok' | 'r' | 'm' | 't' | 's') => { const v = add[k]; if (v) cur[k] = (cur[k] ?? 0) + Math.round(v); };
  (['w', 'ok', 'r', 'm', 't', 's'] as const).forEach(plus);
  if (add.s && add.subject) cur.subj = { ...(cur.subj ?? {}), [add.subject]: (cur.subj?.[add.subject] ?? 0) + Math.round(add.s) };
  mine[date] = cur;
  const cut = shiftDay(date, -KEEP_DAYS);
  for (const k of Object.keys(mine)) if (k < cut) delete mine[k];
  return { ...d, learnLog: { ...all, [childId]: mine } };
}

/** Aktive Zeit messen: Pausen über `gap` Sekunden zählen nicht mit. */
export function activeTimer(gap = 90) {
  let last = Date.now(), total = 0;
  return {
    /** Bei jeder Eingabe aufrufen */
    tick() { const now = Date.now(); total += Math.min(gap, (now - last) / 1000); last = now; },
    /** Gemessene Sekunden abholen und zurücksetzen */
    take() { this.tick(); const t = total; total = 0; return Math.round(t); },
    reset() { last = Date.now(); total = 0; },
  };
}

/** Fach eines Tests: Fach des Themas, der Klassenarbeit oder aus dem Titel („Mathe: …“). */
export function sheetSubject(d: FamilyData, w: Worksheet) {
  const topic = (d.topics ?? []).find(t => t.id === w.topicId);
  if (topic && topic.subject && topic.subject !== 'Schule') return topic.subject;
  const prep = w.exam ? (d.exams ?? []).find(e => e.id === w.exam!.prepId) : undefined;
  if (prep) return prep.subject;
  const m = /^(?:Schwachstellen: |Nochmal: )?([^:]{2,24}):/.exec(w.title);
  return m ? m[1].trim() : 'Sonstiges';
}

/** Tag, an dem ein Test gemacht wurde: Abgabe, sonst Prüfung (Punkte-Buchung), sonst Erstellung. */
export function sheetDay(d: FamilyData, w: Worksheet) {
  if (w.doneAt) return w.doneAt;
  if (w.scan?.at) return w.scan.at.slice(0, 10);
  if (w.status === 'geprueft') {
    const e = d.ledger.find(x => x.childId === w.childId && (x.reason === `Geübt: ${w.title}` || x.reason === `Probe-Klassenarbeit: ${w.title}`));
    if (e) return e.at.slice(0, 10);
  }
  return w.date;
}

const U_SCORE: Record<Understanding, number> = { verstanden: 1, teilweise: 0.5, nochmal: 0 };

export interface DayRow { date: string; secs: number; words: number; ok: number; tests: number; active: boolean }
export interface SubjectRow { subject: string; secs: number; tests: number; words: number; understood: number; checked: number }
export interface Summary {
  days: DayRow[];
  secs: number; activeDays: number; words: number; ok: number; graded: number; rounds: number; mastered: number;
  tests: Worksheet[]; checked: number; understood: number;
  probes: { sheet: Worksheet; subject: string; date: string }[];
  subjects: SubjectRow[];
  hasTime: boolean;
}

/** Zusammenfassung für ein Kind über `n` Tage bis `end` (einschließlich). */
export function summarize(d: FamilyData, childId: string, n: number, end = today()): Summary {
  const log = d.learnLog?.[childId] ?? {};
  const vDays = d.vocabStats?.[childId]?.days ?? {};
  const cards = (d.vocab ?? []).filter(v => v.childId === childId).flatMap(v => v.cards);
  const from = shiftDay(end, -(n - 1));
  const inRange = (x: string) => x >= from && x <= end;
  // Vokabel-Runden vor Einführung des Lern-Logs: aus den Punkte-Buchungen „Vokabeln: Titel (3/10)“
  const ledgerRounds: Record<string, { w: number; ok: number; r: number }> = {};
  for (const e of d.ledger) {
    if (e.childId !== childId || !e.at || !inRange(e.at.slice(0, 10))) continue;
    const m = /^Vokabeln: .*\((\d+)\/(\d+)\)$/.exec(e.reason);
    if (!m) continue;
    const k = e.at.slice(0, 10), x = (ledgerRounds[k] ??= { w: 0, ok: 0, r: 0 });
    x.ok += +m[1]; x.w += +m[2]; x.r++;
  }
  const sheets = (d.worksheets ?? []).filter(w => w.childId === childId && w.status !== 'offen').map(w => ({ w, day: sheetDay(d, w) })).filter(x => inRange(x.day));
  const subjects = new Map<string, SubjectRow>();
  const subj = (k: string) => { let r = subjects.get(k); if (!r) subjects.set(k, (r = { subject: k, secs: 0, tests: 0, words: 0, understood: 0, checked: 0 })); return r; };

  const days: DayRow[] = [];
  let secs = 0, words = 0, ok = 0, graded = 0, rounds = 0, mastered = 0;
  for (let i = 0; i < n; i++) {
    const k = shiftDay(from, i), L = log[k] ?? {}, lr = ledgerRounds[k];
    const w = Math.max(L.w ?? 0, vDays[k] ?? 0, lr?.w ?? 0, cards.filter(c => c.seen === k).length);
    // Trefferquote nur aus Runden mit bekannter Auswertung
    const okK = L.w ? L.ok ?? 0 : lr?.ok ?? 0, gradedK = L.w ? L.w : lr?.w ?? 0;
    const t = sheets.filter(x => x.day === k).length;
    const sec = L.s ?? 0;
    days.push({ date: k, secs: sec, words: w, ok: okK, tests: t, active: !!(sec || w || t) });
    secs += sec; words += w; ok += okK; graded += gradedK; rounds += L.r ?? lr?.r ?? 0; mastered += L.m ?? 0;
    for (const [s, v] of Object.entries(L.subj ?? {})) subj(s).secs += v;
  }
  for (const { w } of sheets) {
    const r = subj(sheetSubject(d, w)); r.tests++;
    if (w.understanding) { r.checked++; r.understood += U_SCORE[w.understanding]; }
  }
  // Vokabeln je Sprache: Wörter, die im Zeitraum zuletzt geübt wurden
  for (const v of (d.vocab ?? []).filter(v => v.childId === childId)) {
    const nSeen = v.cards.filter(c => c.seen && inRange(c.seen)).length;
    if (!nSeen) continue;
    const k = v.prepId ? (d.exams ?? []).find(e => e.id === v.prepId)?.subject ?? v.lang : v.lang;
    subj(k).words += nSeen;
  }
  const done = sheets.map(x => x.w);
  const checked = done.filter(w => w.understanding && !w.exam);
  const probes = sheets.filter(x => x.w.exam && x.w.status === 'geprueft').map(x => ({ sheet: x.w, subject: sheetSubject(d, x.w), date: x.day })).sort((a, b) => b.date.localeCompare(a.date));
  return {
    days, secs, activeDays: days.filter(x => x.active).length, words, ok, graded, rounds, mastered,
    tests: done.sort((a, b) => sheetDay(d, b).localeCompare(sheetDay(d, a))),
    checked: checked.length, understood: checked.reduce((a, w) => a + U_SCORE[w.understanding!], 0),
    probes,
    subjects: [...subjects.values()].sort((a, b) => b.secs - a.secs || b.tests - a.tests || b.words - a.words),
    hasTime: end >= TIME_SINCE || days.some(x => x.secs > 0),
  };
}

export const fmtMin = (secs: number) => {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
};
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
