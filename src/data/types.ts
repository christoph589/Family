export type TaskKind = 'hausaufgabe' | 'pflicht';
export type Repeat = 'einmal' | 'taeglich' | 'werktags';

export interface Child { id: string; name: string; color: string; grade?: string }
export interface Task {
  id: string; childId: string; title: string; kind: TaskKind; points: number;
  repeat: Repeat; date?: string; // date nur bei 'einmal' (YYYY-MM-DD)
  active: boolean;
}
export interface Completion { id: string; taskId: string; childId: string; date: string; status: 'wartet' | 'bestaetigt' }
export interface LedgerEntry { id: string; childId: string; points: number; reason: string; at: string }
export interface Reward { id: string; title: string; cost: number }

export interface FamilyData {
  version: 1;
  family: { id: string; name: string; parentPin: string };
  children: Child[];
  tasks: Task[];
  completions: Completion[];
  ledger: LedgerEntry[];
  rewards: Reward[];
}

// Punkte pro Note (1 bis 6). Keine Minuspunkte.
export const EXAM_POINTS: Record<number, number> = { 1: 40, 2: 30, 3: 15, 4: 5, 5: 0, 6: 0 };
