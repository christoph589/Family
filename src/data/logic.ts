import { TEMPLATES } from './templates';
import { Child, Completion, FamilyData, Parent, Reward, PRACTICE_POINTS, Task, Understanding, Worksheet } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const today = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

const weekday = (date: string) => new Date(date + 'T12:00:00').getDay();
const plusDays = (date: string, n: number) => { const x = new Date(date + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

export const isSchoolTask = (t: Task) => !!t.school || t.kind === 'hausaufgabe';

/** Ferien an diesem Tag? Ferienmodus an und (kein Enddatum oder Tag liegt davor). */
export function holidayOn(d: FamilyData | undefined, date: string) {
  const h = d?.settings?.holiday;
  return !!h?.on && (!h.until || date <= h.until);
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

export const CHILD_COLORS = ['#e2583e', '#4b55c4', '#2b8a4b', '#b26a00', '#a23b8c'];
export const PARENT_COLORS = ['#c2477a', '#2f7fb5', '#6b5b45', '#5a6b2b'];
export const ALL_COLORS = [...CHILD_COLORS, ...PARENT_COLORS, '#0f6e73', '#e0a100'];

/** Eltern der Familie. Ältere Daten ohne Eltern bekommen Mama und Papa. */
export function parentsOf(d: FamilyData): Parent[] {
  return d.parents ?? [{ id: 'mama', name: 'Mama', color: PARENT_COLORS[0] }, { id: 'papa', name: 'Papa', color: PARENT_COLORS[1] }];
}
export type Person = { id: string; name: string; color: string; role: 'eltern' | 'kind' };
export function peopleOf(d: FamilyData): Person[] {
  return [...parentsOf(d).map(p => ({ ...p, role: 'eltern' as const })), ...d.children.map(c => ({ id: c.id, name: c.name, color: c.color, role: 'kind' as const }))];
}

export function newFamily(name: string, pin: string, kids: { name: string; grade?: string }[], parentNames: string[] = ['Mama', 'Papa']): FamilyData {
  const children: Child[] = kids.map((k, i) => ({ id: uid(), name: k.name, grade: k.grade, color: CHILD_COLORS[i % CHILD_COLORS.length] }));
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
  let next = addPoints(setSheet(data, done), sheet.childId, PRACTICE_POINTS, `Geübt: ${sheet.title}`);
  const wrong = sheet.questions.filter((_, i) => !results[i]);
  if (retryWrong && wrong.length) {
    next = setSheet(next, { id: uid(), childId: sheet.childId, topicId: sheet.topicId, title: sheet.title.replace(/^Nochmal: /, ''), date: today(), questions: wrong, status: 'offen', retryOf: sheet.id });
  }
  return next;
}

/** Letzter Stand des Verständnisses zu einem Thema. */
export function topicUnderstanding(data: FamilyData, topicId: string): Understanding | undefined {
  return (data.worksheets ?? []).find(w => w.topicId === topicId && w.status === 'geprueft')?.understanding;
}

/** Eigene Termine an einem Tag. childIds = null zeigt alle (Eltern). Kinder sehen keine Termine der Geschwister. */
export function eventsOn(d: FamilyData, date: string, childIds: string[] | null) {
  const parentIds = parentsOf(d).map(p => p.id);
  const wd = new Date(date + 'T12:00:00').getDay();
  return (d.events ?? [])
    .filter(e => (e.weekly ? new Date(e.date + 'T12:00:00').getDay() === wd && e.date <= date : e.date === date))
    .filter(e => !childIds || e.who.length === 0 || e.who.some(w => childIds.includes(w) || parentIds.includes(w)))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
}

/** Schulzeit eines Kindes an dem Tag, falls Schultag und eingetragen. */
export function schoolOn(d: FamilyData, childId: string, date: string) {
  if (!schoolDay(d, date)) return null;
  const day = d.children.find(c => c.id === childId)?.timetable?.[String(weekday(date)) as '1'];
  if (!day || (!day.from && !day.to && !day.lessons?.some(Boolean))) return null;
  return day;
}
