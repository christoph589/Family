import { DayTime, Repeat, TaskKind } from './types';

export interface TaskTemplate { title: string; icon: string; kind: TaskKind; time?: DayTime; repeat: Repeat; points: number; selfCheck?: boolean }

export const TEMPLATES: TaskTemplate[] = [
  { title: 'Zähne putzen', icon: '🪥', kind: 'routine', time: 'morgens', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Zähne putzen', icon: '🪥', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Anziehen und Bett machen', icon: '🛏️', kind: 'routine', time: 'morgens', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: 'Schulranzen packen', icon: '🎒', kind: 'routine', time: 'abends', repeat: 'werktags', points: 3, selfCheck: true },
  { title: 'Duschen', icon: '🚿', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 2, selfCheck: true },
  { title: '15 Minuten lesen', icon: '📖', kind: 'routine', time: 'abends', repeat: 'taeglich', points: 5 },
  { title: 'Hausaufgaben erledigt', icon: '📚', kind: 'hausaufgabe', time: 'mittags', repeat: 'werktags', points: 10 },
  { title: 'Tisch decken', icon: '🍽️', kind: 'pflicht', time: 'abends', repeat: 'taeglich', points: 3 },
  { title: 'Spülmaschine ausräumen', icon: '🧼', kind: 'pflicht', time: 'mittags', repeat: 'taeglich', points: 5 },
  { title: 'Zimmer aufräumen', icon: '🧸', kind: 'pflicht', time: 'abends', repeat: 'taeglich', points: 5 },
  { title: 'Müll rausbringen', icon: '🗑️', kind: 'pflicht', repeat: 'einmal', points: 3 },
  { title: 'Wäsche wegräumen', icon: '🧺', kind: 'pflicht', repeat: 'einmal', points: 5 },
  { title: 'Haustier füttern', icon: '🐾', kind: 'pflicht', time: 'morgens', repeat: 'taeglich', points: 3 },
  { title: 'Beim Kochen helfen', icon: '🥕', kind: 'pflicht', time: 'abends', repeat: 'einmal', points: 8 },
];

export const TIME_LABEL: Record<DayTime, string> = { morgens: '🌅 Morgens', mittags: '☀️ Nach der Schule', abends: '🌙 Abends' };
export const TIME_ORDER: Record<string, number> = { morgens: 0, mittags: 1, abends: 2, '': 3 };
export const KIND_LABEL: Record<TaskKind, string> = { routine: 'Routine', hausaufgabe: 'Hausaufgabe', pflicht: 'Haushalt' };
