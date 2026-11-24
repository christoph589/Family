export type TaskKind = 'routine' | 'hausaufgabe' | 'pflicht'; // pflicht = Haushalt
export type DayTime = 'morgens' | 'mittags' | 'abends';
export type Repeat = 'einmal' | 'taeglich' | 'werktags';

export interface Child { id: string; name: string; color: string; grade?: string }
export interface Task {
  id: string; childId: string; title: string; kind: TaskKind; points: number;
  repeat: Repeat; date?: string; // date nur bei 'einmal' (YYYY-MM-DD)
  active: boolean;
  icon?: string;
  time?: DayTime;
  /** Kind hakt selbst ab, Punkte sofort, ohne Eltern-Bestätigung. */
  selfCheck?: boolean;
}
export interface Completion { id: string; taskId: string; childId: string; date: string; status: 'wartet' | 'bestaetigt' }
export interface LedgerEntry { id: string; childId: string; points: number; reason: string; at: string }
export interface Reward { id: string; title: string; cost: number }
export interface RewardRequest { id: string; childId: string; rewardId: string; at: string }
export interface Topic { id: string; childId: string; subject: string; text: string; photo?: string; photos?: string[]; date: string }

export type Understanding = 'verstanden' | 'teilweise' | 'nochmal';
export interface Question {
  q: string;
  /** Text/Auswahl: die Lösung. Tabelle: Lösungen der leeren Felder in Lesereihenfolge, getrennt mit " | ". */
  solution: string;
  type?: 'text' | 'choice' | 'table';
  options?: string[];
  /** Zeichnung als SVG (Bruchkreis, Zahlenstrahl, Diagramm). Wird vor der Anzeige bereinigt. */
  figure?: string;
  /** Tabelle: "?" markiert ein Feld zum Ausfüllen. */
  table?: { header: string[]; rows: string[][] };
}
export interface Worksheet {
  id: string; childId: string; topicId?: string; title: string; date: string;
  questions: Question[];
  answers?: string[];
  results?: boolean[];
  status: 'offen' | 'abgegeben' | 'geprueft';
  understanding?: Understanding;
  retryOf?: string;
}

export interface FamilyData {
  version: 1;
  family: { id: string; name: string; parentPin: string };
  children: Child[];
  tasks: Task[];
  completions: Completion[];
  ledger: LedgerEntry[];
  rewards: Reward[];
  requests?: RewardRequest[];
  topics?: Topic[];
  worksheets?: Worksheet[];
}

// Punkte pro Note (1 bis 6). Keine Minuspunkte.
export const EXAM_POINTS: Record<number, number> = { 1: 40, 2: 30, 3: 15, 4: 5, 5: 0, 6: 0 };

// Punkte fürs Üben. Es zählt, dass geübt wird, nicht wie viel richtig ist.
export const PRACTICE_POINTS = 10;
