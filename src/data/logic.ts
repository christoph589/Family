import { Child, Completion, FamilyData, Reward, PRACTICE_POINTS, Task, Understanding, Worksheet } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const today = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export function isDueOn(t: Task, date: string): boolean {
  if (!t.active) return false;
  if (t.repeat === 'einmal') return t.date === date;
  if (t.repeat === 'taeglich') return true;
  const wd = new Date(date + 'T12:00:00').getDay();
  return wd >= 1 && wd <= 5;
}

export function tasksFor(data: FamilyData, childId: string, date: string) {
  return data.tasks
    .filter(t => t.childId === childId && isDueOn(t, date))
    .map(t => ({ task: t, completion: data.completions.find(c => c.taskId === t.id && c.date === date) }));
}

export function pointsOf(data: FamilyData, childId: string) {
  return data.ledger.filter(l => l.childId === childId).reduce((s, l) => s + l.points, 0);
}

/** Kind hakt ab oder nimmt zurück, solange noch nicht bestätigt. */
export function toggleByChild(data: FamilyData, task: Task, date: string): FamilyData {
  const existing = data.completions.find(c => c.taskId === task.id && c.date === date);
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

export function newFamily(name: string, pin: string, kids: { name: string; grade?: string }[]): FamilyData {
  const children: Child[] = kids.map((k, i) => ({ id: uid(), name: k.name, grade: k.grade, color: CHILD_COLORS[i % CHILD_COLORS.length] }));
  return {
    version: 1,
    family: { id: uid(), name, parentPin: pin },
    children,
    tasks: children.flatMap(c => [
      { id: uid(), childId: c.id, title: 'Hausaufgaben erledigt', kind: 'hausaufgabe' as const, points: 10, repeat: 'werktags' as const, active: true },
      { id: uid(), childId: c.id, title: 'Zimmer aufräumen', kind: 'pflicht' as const, points: 5, repeat: 'taeglich' as const, active: true },
    ]),
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
