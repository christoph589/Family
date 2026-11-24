import { DayTime, Repeat, TaskKind } from './types';

export interface TaskTemplate { title: string; icon: string; kind: TaskKind; time?: DayTime; repeat: Repeat; points: number; selfCheck?: boolean; school?: boolean }

export const TEMPLATES: TaskTemplate[] = [
  { title: 'Zähne putzen', icon: '🪥', kind: 'routine', time: 'morgens', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Zähne putzen', icon: '🪥', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Anziehen und Bett machen', icon: '🛏️', kind: 'routine', time: 'morgens', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Duschen', icon: '🚿', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: '15 Minuten lesen', icon: '📖', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 5 },
  { title: 'Tisch decken', icon: '🍽️', kind: 'pflicht', time: 'abends', repeat: 'taeglich', points: 3 },
  { title: 'Spülmaschine ausräumen', icon: '🧼', kind: 'pflicht', time: 'mittags', repeat: 'taeglich', points: 5 },
  { title: 'Zimmer aufräumen', icon: '🧸', kind: 'pflicht', time: 'abends', repeat: 'taeglich', points: 5 },
  { title: 'Müll rausbringen', icon: '🗑️', kind: 'pflicht', repeat: 'einmal', points: 3 },
  { title: 'Wäsche wegräumen', icon: '🧺', kind: 'pflicht', repeat: 'einmal', points: 5 },
  { title: 'Haustier füttern', icon: '🐾', kind: 'pflicht', time: 'morgens', repeat: 'taeglich', points: 3 },
  { title: 'Beim Kochen helfen', icon: '🥕', kind: 'pflicht', time: 'abends', repeat: 'einmal', points: 8 },
];

/** Schulpaket: kommt mit einem Tipp dazu. Nur an Schultagen, pausiert in den Ferien. */
export const SCHOOL_PACK: TaskTemplate[] = [
  { title: 'Pünktlich los zur Schule', icon: '⏰', kind: 'routine', time: 'morgens', repeat: 'werktags', points: 2, selfCheck: true, school: true },
  { title: 'Brotdose und Trinkflasche einpacken', icon: '🥪', kind: 'routine', time: 'morgens', repeat: 'werktags', points: 2, selfCheck: true, school: true },
  { title: 'Hausaufgaben erledigt', icon: '📚', kind: 'hausaufgabe', time: 'mittags', repeat: 'werktags', points: 10 },
  { title: 'Hausaufgabenheft den Eltern zeigen', icon: '📒', kind: 'hausaufgabe', time: 'mittags', repeat: 'werktags', points: 3 },
  { title: 'Brotdose in die Küche bringen', icon: '🧽', kind: 'routine', time: 'mittags', repeat: 'werktags', points: 2, selfCheck: true, school: true },
  { title: 'Schulsachen richten', icon: '🎒', kind: 'routine', time: 'abends', repeat: 'vorSchultag', points: 3, selfCheck: true, school: true },
  { title: 'Kleidung für morgen rauslegen', icon: '👕', kind: 'routine', time: 'abends', repeat: 'vorSchultag', points: 2, selfCheck: true, school: true },
  { title: 'Sportsachen prüfen', icon: '👟', kind: 'routine', time: 'abends', repeat: 'vorSchultag', points: 1, selfCheck: true, school: true },
];
TEMPLATES.push(...SCHOOL_PACK);

export const TIME_LABEL: Record<DayTime, string> = { morgens: '🌅 Morgens', mittags: '☀️ Nach der Schule', abends: '🌙 Abends' };
export const TIME_ORDER: Record<string, number> = { morgens: 0, mittags: 1, abends: 2, '': 3 };
export const KIND_LABEL: Record<TaskKind, string> = { routine: 'Routine', hausaufgabe: 'Hausaufgabe', pflicht: 'Haushalt' };
