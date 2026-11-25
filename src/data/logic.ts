import { TEMPLATES } from './templates';
import { Child, Completion, FamilyData, MoneyAccount, Parent, Reward, PRACTICE_POINTS, Task, Understanding, Worksheet } from './types';

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
// Änderungen laufen u. U. mehrfach (Anzeige, Speichern, Konflikt). Damit dabei dieselben IDs entstehen,
// nimmt withIdTape die IDs beim ersten Lauf auf und spielt sie danach wieder ab.
let tape: { ids: string[]; pos: number } | null = null;
export const uid = () => {
  if (!tape) return newId();
  if (tape.pos < tape.ids.length) return tape.ids[tape.pos++];
  const id = newId(); tape.ids.push(id); tape.pos++; return id;
};
export function withIdTape<T>(ids: string[], run: () => T): T {
  const prev = tape; tape = { ids, pos: 0 };
  try { return run(); } finally { tape = prev; }
}
export const today = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

const weekday = (date: string) => new Date(date + 'T12:00:00').getDay();
const plusDays = (date: string, n: number) => { const x = new Date(date + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

export const isSchoolTask = (t: Task) => !!t.school || t.kind === 'hausaufgabe';

/** Ferien an diesem Tag? Ferienmodus an und (kein Enddatum oder Tag liegt davor). */
export function holidayOn(d: FamilyData | undefined, date: string) {
  return manualHolidayOn(d, date) || !!autoHolidayOn(d, date);
}
export function manualHolidayOn(d: FamilyData | undefined, date: string) {
  const h = d?.settings?.holiday;
  return !!h?.on && (!h.until || date <= h.until);
}
/** Ferien oder Feiertag laut Bundesland an diesem Tag (oder null). */
export function autoHolidayOn(d: FamilyData | undefined, date: string) {
  const a = d?.settings?.autoHoliday;
  if (!a?.on) return null;
  return a.ranges.find(r => r.from <= date && date <= r.to) ?? null;
}
const schoolDay = (d: FamilyData | undefined, date: string) => { const wd = weekday(date); return wd >= 1 && wd <= 5 && !holidayOn(d, date); };

/**
 * Steht die Aufgabe an dem Tag an?
 * Schulaufgaben gibt es nur an Schultagen (Mo bis Fr, keine Ferien). "Abends vor einem Schultag"
 * heißt So bis Do, also auch Sonntagabend und am letzten Ferientag. Einmalige Aufgaben
 * (von Eltern eingetragen) gelten immer, auch in den Ferien.
 */
export function isDueOn(t: Task, date: string, d?: FamilyData): boolean {
  if (!t.active) return false;
  if (t.repeat === 'einmal') return t.date === date;
  if (t.repeat === 'vorSchultag') return schoolDay(d, plusDays(date, 1));
  if (isSchoolTask(t)) return schoolDay(d, date);
  if (t.repeat === 'taeglich') return true;
  const wd = weekday(date);
  return wd >= 1 && wd <= 5;
}

export const REPEAT_LABEL: Record<string, string> = { einmal: 'Nur heute', werktags: 'Mo bis Fr', taeglich: 'Täglich', vorSchultag: 'Vor Schultagen (So bis Do)' };

export function tasksFor(data: FamilyData, childId: string, date: string) {
  return data.tasks
    .filter(t => t.childId === childId && isDueOn(t, date, data))
    .map(t => ({ task: t, completion: data.completions.find(c => c.taskId === t.id && c.date === date) }));
}

export function pointsOf(data: FamilyData, childId: string) {
  return data.ledger.filter(l => l.childId === childId).reduce((s, l) => s + l.points, 0);
}

/** Kind hakt ab oder nimmt zurück, solange noch nicht bestätigt. */
export function toggleByChild(data: FamilyData, task: Task, date: string): FamilyData {
  const existing = data.completions.find(c => c.taskId === task.id && c.date === date);
  if (task.selfCheck) return existing?.status === 'bestaetigt' ? undoConfirm(data, task, date) : confirm(data, task, date);
  if (existing?.status === 'bestaetigt') return data;
  const completions: Completion[] = existing
    ? data.completions.filter(c => c !== existing)
    : [...data.completions, { id: uid(), taskId: task.id, childId: task.childId, date, status: 'wartet' }];
  return { ...data, completions };
}

/** Eltern bestätigen. Erst dann gibt es Punkte. */
export function confirm(data: FamilyData, task: Task, date: string): FamilyData {
  const existing = data.completions.find(c => c.taskId === task.id && c.date === date);
  if (existing?.status === 'bestaetigt') return data;
  const completions = existing
    ? data.completions.map(c => (c === existing ? { ...c, status: 'bestaetigt' as const } : c))
    : [...data.completions, { id: uid(), taskId: task.id, childId: task.childId, date, status: 'bestaetigt' as const }];
  return addPoints({ ...data, completions }, task.childId, task.points, task.title);
}

/** Eltern nehmen eine Bestätigung zurück, Punkte werden abgezogen. */
export function undoConfirm(data: FamilyData, task: Task, date: string): FamilyData {
  const existing = data.completions.find(c => c.taskId === task.id && c.date === date && c.status === 'bestaetigt');
  if (!existing) return data;
  return addPoints({ ...data, completions: data.completions.filter(c => c !== existing) }, task.childId, -task.points, 'Zurückgenommen: ' + task.title);
}

export function addPoints(data: FamilyData, childId: string, points: number, reason: string): FamilyData {
  return { ...data, ledger: [{ id: uid(), childId, points, reason, at: new Date().toISOString() }, ...data.ledger] };
}

// --- Gemeinschaftstopf ---
export function potShares(d: FamilyData, potId: string) {
  const m = new Map<string, number>();
  d.ledger.filter(l => l.potId === potId).forEach(l => m.set(l.childId, (m.get(l.childId) ?? 0) - l.points));
  return d.children.map(c => ({ child: c, points: m.get(c.id) ?? 0 })).filter(x => x.points > 0);
}
export function potBalance(d: FamilyData, potId: string) {
  const pot = d.pots?.find(p => p.id === potId);
  return potShares(d, potId).reduce((s, x) => s + x.points, 0) + (pot?.bonus ?? 0);
}
export function contributeToPot(d: FamilyData, potId: string, childId: string, n: number): FamilyData {
  const pot = d.pots?.find(p => p.id === potId);
  if (!pot || pot.doneAt || n <= 0 || pointsOf(d, childId) - reservedOf(d, childId) < n) return d;
  return { ...d, ledger: [{ id: uid(), childId, points: -n, reason: `${pot.icon ?? '🎯'} In den Topf: ${pot.title}`, at: new Date().toISOString(), potId }, ...d.ledger] };
}
/** Topf auflösen: Punkte gehen an die Kinder zurück. */
export function dissolvePot(d: FamilyData, potId: string): FamilyData {
  const pot = d.pots?.find(p => p.id === potId);
  if (!pot) return d;
  const back = pot.doneAt ? [] : potShares(d, potId).map(x => ({ id: uid(), childId: x.child.id, points: x.points, reason: `↩️ Zurück aus dem Topf: ${pot.title}`, at: new Date().toISOString() }));
  return { ...d, pots: (d.pots ?? []).filter(p => p.id !== potId), ledger: [...back, ...d.ledger] };
}

export const CHILD_COLORS = ['#e2583e', '#4b55c4', '#2b8a4b', '#b26a00', '#a23b8c'];
export const PARENT_COLORS = ['#c2477a', '#2f7fb5', '#6b5b45', '#5a6b2b'];
export const ALL_COLORS = [...CHILD_COLORS, ...PARENT_COLORS, '#0f6e73', '#e0a100', '#7a4fd1', '#d0457f', '#1d9bb5', '#8a8f2a', '#5b6b78'];
/** Erste Farbe, die in der Familie noch niemand hat (bei 9+ Personen wichtig). */
export function freeColor(d: FamilyData, prefer: string[] = ALL_COLORS) {
  const used = new Set([...parentsOf(d).map(p => p.color), ...d.children.map(c => c.color)]);
  return prefer.find(c => !used.has(c)) ?? ALL_COLORS.find(c => !used.has(c)) ?? prefer[0];
}

/** Eltern der Familie. Ältere Daten ohne Eltern bekommen Mama und Papa. */
export function parentsOf(d: FamilyData): Parent[] {
  return d.parents ?? [{ id: 'mama', name: 'Mama', color: PARENT_COLORS[0] }, { id: 'papa', name: 'Papa', color: PARENT_COLORS[1] }];
}
export const isAdmin = (p?: Parent) => !!p && p.admin !== false;
export type Person = { id: string; name: string; color: string; role: 'eltern' | 'kind'; admin?: boolean; photo?: string; title?: string };
export function peopleOf(d: FamilyData): Person[] {
  return [...parentsOf(d).map(p => ({ id: p.id, name: p.name, color: p.color, photo: p.photo, title: p.title, admin: isAdmin(p), role: 'eltern' as const })), ...d.children.map(c => ({ id: c.id, name: c.name, color: c.color, photo: c.photo, role: 'kind' as const }))];
}

export function newFamily(name: string, pin: string, kids: { name: string; grade?: string; birthday?: string; gender?: Child['gender'] }[], parentNames: string[] = ['Mama', 'Papa']): FamilyData {
  const children: Child[] = kids.map((k, i) => ({ id: uid(), name: k.name, grade: k.grade, gradeYear: k.grade ? schoolYearOf(today()) : undefined, birthday: k.birthday, gender: k.gender, color: CHILD_COLORS[i % CHILD_COLORS.length] }));
  return {
    version: 1,
    family: { id: uid(), name, parentPin: pin },
    children,
    parents: parentNames.filter(n => n.trim()).map((n, i) => ({ id: uid(), name: n.trim(), color: PARENT_COLORS[i % PARENT_COLORS.length] })),
    tasks: children.flatMap(c => TEMPLATES.filter(t => ['Zähne putzen', 'Zimmer aufräumen', 'Hausaufgaben erledigt', 'Schulsachen richten'].includes(t.title)).map(t => ({ ...t, id: uid(), childId: c.id, active: true }))),
    completions: [],
    ledger: [],
    rewards: [
      { id: uid(), title: '30 Min. Bildschirmzeit extra', cost: 50 },
      { id: uid(), title: 'Abendessen aussuchen', cost: 80 },
      { id: uid(), title: 'Ausflug oder Kino', cost: 300 },
    ],
  };
}

/** Punkte, die schon für offene Wünsche reserviert sind. */
export function reservedOf(data: FamilyData, childId: string) {
  return (data.requests ?? []).filter(r => r.childId === childId)
    .reduce((sum, r) => sum + (data.rewards.find(x => x.id === r.rewardId)?.cost ?? 0), 0);
}

/** Kind wünscht sich eine Belohnung. Eltern bestätigen später. */
export function requestReward(data: FamilyData, childId: string, reward: Reward): FamilyData {
  if (pointsOf(data, childId) - reservedOf(data, childId) < reward.cost) return data;
  return { ...data, requests: [...(data.requests ?? []), { id: uid(), childId, rewardId: reward.id, at: new Date().toISOString() }] };
}

export function decideRequest(data: FamilyData, requestId: string, approve: boolean): FamilyData {
  const req = (data.requests ?? []).find(r => r.id === requestId);
  if (!req) return data;
  const rest = { ...data, requests: (data.requests ?? []).filter(r => r.id !== requestId) };
  const reward = data.rewards.find(r => r.id === req.rewardId);
  if (!approve || !reward || pointsOf(data, req.childId) < reward.cost) return rest;
  return addPoints(rest, req.childId, -reward.cost, 'Eingelöst: ' + reward.title);
}


export function setSheet(data: FamilyData, sheet: Worksheet): FamilyData {
  const list = data.worksheets ?? [];
  const exists = list.some(w => w.id === sheet.id);
  return { ...data, worksheets: exists ? list.map(w => (w.id === sheet.id ? sheet : w)) : [sheet, ...list] };
}

export function understandingOf(right: number, total: number): Understanding {
  if (right === total) return 'verstanden';
  return right / total >= 0.5 ? 'teilweise' : 'nochmal';
}
export const UNDERSTANDING_LABEL: Record<Understanding, string> = { verstanden: 'Verstanden', teilweise: 'Teilweise verstanden', nochmal: 'Nochmal üben' };

/** Eltern haben abgeglichen. Punkte gibt es fürs Üben. Optional werden die falschen Fragen nochmal geschickt. */
export function finishCheck(data: FamilyData, sheet: Worksheet, results: boolean[], retryWrong = false): FamilyData {
  const right = results.filter(Boolean).length;
  const done = { ...sheet, results, understanding: understandingOf(right, sheet.questions.length), status: 'geprueft' as const };
  let next = addPoints(setSheet(data, done), sheet.childId, sheet.exam ? EXAM_PREP_POINTS : PRACTICE_POINTS, `${sheet.exam ? 'Probe-Klassenarbeit' : 'Geübt'}: ${sheet.title}`);
  const bonus = selfBonus(data, sheet, done.understanding!);
  const self = (data.topics ?? []).find(t => t.id === sheet.topicId)?.by === sheet.childId;
  if (bonus) next = addPoints(next, sheet.childId, bonus, `${self ? '⭐ Bonus selbst gelernt' : '⭐ Verstanden'}: ${sheet.title}`);
  const wrong = sheet.questions.filter((_, i) => !results[i]);
  if (retryWrong && wrong.length) {
    next = setSheet(next, { id: uid(), childId: sheet.childId, topicId: sheet.topicId, title: sheet.exam ? `Schwachstellen: ${sheet.title}` : sheet.title.replace(/^Nochmal: /, ''), date: today(), questions: wrong, status: 'offen', retryOf: sheet.id });
  }
  return next;
}

/** Punkte für eine geprüfte Probe-Klassenarbeit (mehr Aufwand als ein Tagestest) */
export const EXAM_PREP_POINTS = 25;
/** Ergebnis einer Probe-Klassenarbeit: Punkte, ungefähre Note (gängiger Schlüssel), schwache Teilkompetenzen */
export function examScore(sheet: Worksheet, results: boolean[]) {
  const pts = sheet.exam?.points ?? sheet.questions.map(() => 1);
  const ps = sheet.paperScore;
  // Auf Papier: die Punkte, die die Eltern eingetragen haben (auch halbe)
  const one = (b: number, i: number) => (ps ? Math.min(b, ps[i] ?? 0) : results[i] ? b : 0);
  const total = pts.reduce((a, b) => a + b, 0), got = pts.reduce((a, b, i) => a + one(b, i), 0);
  const pct = total ? got / total : 0;
  const note = pct >= 0.92 ? 1 : pct >= 0.81 ? 2 : pct >= 0.67 ? 3 : pct >= 0.5 ? 4 : pct >= 0.3 ? 5 : 6;
  const weak = [...new Set((sheet.exam?.skills ?? []).filter((_, i) => !results[i]))];
  return { got, total, pct, note, weak };
}
export const regionOf = (d: FamilyData) => d.settings?.autoHoliday?.state ?? d.settings?.region;

/** Täglicher Test: 5 fürs Üben (PRACTICE_POINTS), dazu 10 bei "verstanden", 5 bei "teilweise" und 1, wenn das Kind den Stoff selbst hochgeladen hat.
 *  Nur beim ersten Test eines Themas. Selbst hochgeladene Themen höchstens SELF_BONUS_PER_DAY pro Tag, damit sich Mehrfach-Hochladen nicht lohnt. */
export const SELF_BONUS_PER_DAY = 2;
export const SELF_BONUS = { upload: 1, verstanden: 10, teilweise: 5, nochmal: 0 } as const;
export function selfBonus(data: FamilyData, sheet: Worksheet, u: Understanding): number {
  if (sheet.exam || sheet.retryOf) return 0;
  const topic = (data.topics ?? []).find(t => t.id === sheet.topicId);
  if (!topic) return 0;
  const first = (data.worksheets ?? []).filter(w => w.topicId === topic.id && w.status === 'geprueft' && w.id !== sheet.id).length === 0;
  if (!first) return 0;
  if (topic.by !== sheet.childId) return SELF_BONUS[u];
  const day = today();
  const used = data.ledger.filter(e => e.childId === sheet.childId && e.reason.startsWith('⭐ Bonus selbst gelernt') && e.at.slice(0, 10) === day).length;
  if (used >= SELF_BONUS_PER_DAY) return 0;
  return SELF_BONUS.upload + SELF_BONUS[u];
}

/** Letzter Stand des Verständnisses zu einem Thema. */
export function topicUnderstanding(data: FamilyData, topicId: string): Understanding | undefined {
  return (data.worksheets ?? []).find(w => w.topicId === topicId && w.status === 'geprueft')?.understanding;
}

/** Eigene Termine an einem Tag. childIds = null zeigt alle (Eltern). Kinder sehen keine Termine der Geschwister. */
/** childIds null = alle Termine. onlyOwn: nur Termine der Kinder selbst und der ganzen Familie, ohne reine Eltern-Termine. */
export function eventsOn(d: FamilyData, date: string, childIds: string[] | null, onlyOwn = false) {
  const parentIds = onlyOwn ? [] : parentsOf(d).map(p => p.id);
  const wd = new Date(date + 'T12:00:00').getDay();
  return (d.events ?? [])
    .filter(e => (e.weekly ? new Date(e.date + 'T12:00:00').getDay() === wd && e.date <= date : e.date === date))
    .filter(e => !childIds || e.who.length === 0 || e.who.some(w => childIds.includes(w) || parentIds.includes(w)))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
}

/** Schulzeit eines Kindes an dem Tag, falls Schultag und eingetragen. */
export function schoolOn(d: FamilyData, childId: string, date: string) {
  if (!schoolDay(d, date)) return null;
  const child = d.children.find(c => c.id === childId);
  const day = child?.timetable?.[String(weekday(date)) as '1'];
  if (!day || (!day.from && !day.to && !day.lessons?.some(Boolean))) return null;
  const ch = child?.schoolChange?.[date];
  if (ch?.off) return null;
  return ch?.to ? { ...day, to: ch.to, changed: true } : day;
}

/** Abweichung für einen Tag setzen (null = wie im Stundenplan). Alte Einträge fliegen nach einer Woche raus. */
export function setSchoolChange(d: FamilyData, childId: string, date: string, ch: { to?: string; off?: boolean; by?: string } | null): FamilyData {
  const cut = addDaysIso(today(), -7);
  return { ...d, children: d.children.map(c => {
    if (c.id !== childId) return c;
    const next = Object.fromEntries(Object.entries(c.schoolChange ?? {}).filter(([k]) => k >= cut && k !== date));
    if (ch) next[date] = ch;
    return { ...c, schoolChange: next };
  }) };
}
/** Fällt die Schule an dem Tag laut Abweichung ganz aus? */
export const schoolOff = (d: FamilyData, childId: string, date: string) => !!d.children.find(c => c.id === childId)?.schoolChange?.[date]?.off;

/** Text fürs Ferien-Banner, z. B. "Weihnachtsferien bis Fr., 9. Januar" */
export function holidayLabel(d: FamilyData, date: string): string | null {
  const fmt = (x: string) => new Date(x + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
  const a = autoHolidayOn(d, date);
  if (a) return a.kind === 'feiertag' ? `Feiertag: ${a.name}` : `${a.name} bis ${fmt(a.to)}`;
  if (manualHolidayOn(d, date)) { const u = d.settings?.holiday?.until; return `Ferien${u ? ' bis ' + fmt(u) : ''}`; }
  return null;
}

export function proposeIdea(d: FamilyData, childId: string, title: string): FamilyData {
  return { ...d, ideas: [...(d.ideas ?? []), { id: uid(), childId, title: title.trim().slice(0, 80), at: new Date().toISOString() }] };
}
/** Eltern schalten einen Kinderwunsch mit Punktepreis frei (cost) oder lehnen ab (null). */
export function decideIdea(d: FamilyData, ideaId: string, cost: number | null, forAll: boolean | 'pot' = false, icon?: string): FamilyData {
  const idea = (d.ideas ?? []).find(i => i.id === ideaId);
  const rest = { ...d, ideas: (d.ideas ?? []).filter(i => i.id !== ideaId) };
  if (!idea || cost === null) return rest;
  if (forAll === 'pot') return { ...rest, pots: [...(d.pots ?? []), { id: uid(), title: idea.title, icon: icon || '🎯', target: cost, createdAt: new Date().toISOString() }] };
  return { ...rest, rewards: [...d.rewards, { id: uid(), title: idea.title, cost, childId: forAll ? undefined : idea.childId }] };
}

// ---------- Kinderprofil ----------

/** Startjahr des Schuljahres (Schuljahr ab 1. August). */
export function schoolYearOf(date: string) { const [y, m] = date.split('-').map(Number); return m >= 8 ? y : y - 1; }

/** Aktuelle Klasse: eingetragene Klasse plus volle Schuljahre seitdem. "4b" wird zu "5b". */
export function currentGrade(c: Child, date = today()): string | undefined {
  if (!c.grade) return undefined;
  const m = c.grade.match(/^(\d+)(.*)$/);
  if (!m || c.gradeYear === undefined) return c.grade;
  const n = Number(m[1]) + Math.max(0, schoolYearOf(date) - c.gradeYear);
  return n > 13 ? 'fertig mit der Schule' : `${n}${m[2]}`;
}
export function gradeLabel(c: Child) { const g = currentGrade(c); return !g ? undefined : /^\d+$/.test(g) ? `${g}. Klasse` : /^\d/.test(g) ? `Klasse ${g}` : g; }

export function ageOf(c: Child, date = today()): number | undefined {
  if (!c.birthday) return undefined;
  const [by, bm, bd] = c.birthday.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
export const isBirthday = (c: Child, date = today()) => !!c.birthday && c.birthday.slice(5) === date.slice(5);

/** Geburtstage in den nächsten n Tagen (für Kalender und Wandansicht) */
export function birthdaysOn(d: FamilyData, date: string) {
  return d.children.filter(c => isBirthday(c, date)).map(c => ({ child: c, age: ageOf(c, date) }));
}

export const BIRTHDAY_BONUS = 25;
export function giveBirthdayBonus(d: FamilyData, childId: string, date = today()): FamilyData {
  const y = Number(date.slice(0, 4));
  if (d.birthdayBonus?.[childId] === y) return d;
  return { ...addPoints(d, childId, BIRTHDAY_BONUS, '🎂 Geburtstagsbonus'), birthdayBonus: { ...d.birthdayBonus, [childId]: y } };
}

/** Datum TT.MM.JJJJ zu YYYY-MM-DD, sonst null */
export function parseGermanDate(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [dd, mm, yy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x = new Date(yy, mm - 1, dd);
  if (x.getFullYear() !== yy || x.getMonth() !== mm - 1 || x.getDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
export const toGermanDate = (iso?: string) => (iso ? iso.split('-').reverse().join('.') : '');

// ---------- Taschengeld ----------

export const euro = (cents: number) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const accountOf = (d: FamilyData, childId: string): MoneyAccount => d.money?.[childId] ?? { tx: [] };
export const balanceOf = (d: FamilyData, childId: string) => accountOf(d, childId).tx.reduce((s, t) => s + t.cents, 0);
export function setAccount(d: FamilyData, childId: string, fn: (a: MoneyAccount) => MoneyAccount): FamilyData {
  return { ...d, money: { ...d.money, [childId]: fn(accountOf(d, childId)) } };
}
export function addTx(d: FamilyData, childId: string, cents: number, note: string, kind: import('./types').MoneyTx['kind'], date = today()): FamilyData {
  return setAccount(d, childId, a => ({ ...a, tx: [{ id: uid(), date, cents, note, kind }, ...a.tx] }));
}

const addDaysIso = (date: string, n: number) => { const x = new Date(date + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const addMonthIso = (date: string) => { const [y, m, d] = date.split('-').map(Number); const x = new Date(y, m, Math.min(d, 28), 12); return x.toISOString().slice(0, 10); };

/**
 * Bucht fälliges Taschengeld (wöchentlich oder monatlich ab "since").
 * Idempotent: lastPaid merkt sich den letzten Zahltag. Gibt dieselben Daten zurück, wenn nichts fällig ist.
 */
export function payAllowances(d: FamilyData, date = today()): FamilyData {
  let out = d;
  for (const c of d.children) {
    const a = accountOf(out, c.id).allowance;
    if (!a || a.cents <= 0) continue;
    let next = a.lastPaid ? (a.every === 'woche' ? addDaysIso(a.lastPaid, 7) : addMonthIso(a.lastPaid)) : a.since;
    let last = a.lastPaid;
    const tx: import('./types').MoneyTx[] = [];
    let guard = 0;
    while (next <= date && guard++ < 60) {
      tx.unshift({ id: uid(), date: next, cents: a.cents, note: a.every === 'woche' ? 'Taschengeld (Woche)' : 'Taschengeld (Monat)', kind: 'taschengeld' });
      last = next;
      next = a.every === 'woche' ? addDaysIso(next, 7) : addMonthIso(next);
    }
    if (tx.length) out = setAccount(out, c.id, acc => ({ ...acc, allowance: { ...a, lastPaid: last }, tx: [...tx, ...acc.tx] }));
  }
  return out;
}

/**
 * Grobe Richtwerte aus der Taschengeldtabelle der Jugendämter (Stand etwa 2024/25).
 * Bis 9 Jahre wöchentlich, ab 10 monatlich. Nur Orientierung, keine Vorgabe.
 */
export function allowanceHint(age?: number): string | null {
  if (age === undefined) return null;
  if (age < 6) return 'Unter 6 Jahren: etwa 0,50 bis 1 € pro Woche';
  const week: Record<number, string> = { 6: '1 bis 2 €', 7: '2 bis 3 €', 8: '3 bis 4 €', 9: '4 bis 5 €' };
  if (week[age]) return `Mit ${age} Jahren: etwa ${week[age]} pro Woche`;
  const month: Record<number, string> = { 10: '16,50 bis 19 €', 11: '19 bis 21 €', 12: '21 bis 24 €', 13: '24 bis 28 €', 14: '28 bis 33 €', 15: '33 bis 37 €', 16: '37 bis 46 €', 17: '46 bis 60 €' };
  return month[age] ? `Mit ${age} Jahren: etwa ${month[age]} pro Monat` : 'Ab 18: eigenes Budget absprechen';
}

/** Kind mit allen zugehörigen Daten entfernen. */
export function removeChild(d: FamilyData, childId: string): FamilyData {
  const money = { ...d.money }; delete money[childId];
  const bonus = { ...d.birthdayBonus }; delete bonus[childId];
  return {
    ...d,
    children: d.children.filter(c => c.id !== childId),
    tasks: d.tasks.filter(t => t.childId !== childId),
    completions: d.completions.filter(c => c.childId !== childId),
    ledger: d.ledger.filter(l => l.childId !== childId),
    rewards: d.rewards.filter(r => r.childId !== childId),
    requests: (d.requests ?? []).filter(r => r.childId !== childId),
    ideas: (d.ideas ?? []).filter(i => i.childId !== childId),
    topics: (d.topics ?? []).filter(t => t.childId !== childId),
    worksheets: (d.worksheets ?? []).filter(w => w.childId !== childId),
    events: (d.events ?? []).filter(e => !(e.who.length && e.who.every(w => w === childId))).map(e => ({ ...e, who: e.who.filter(w => w !== childId) })),
    money, birthdayBonus: bonus,
  };
}
