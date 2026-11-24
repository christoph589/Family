export type TaskKind = 'routine' | 'hausaufgabe' | 'pflicht'; // pflicht = Haushalt
export type DayTime = 'morgens' | 'mittags' | 'abends';
/** vorSchultag = abends vor einem Schultag (So bis Do) */
export type Repeat = 'einmal' | 'taeglich' | 'werktags' | 'vorSchultag';

/** Ein Schultag im Stundenplan. Zeiten als HH:MM. */
export interface SchoolDay { from?: string; to?: string; lessons?: string[] }
/** Schlüssel 1 bis 5 = Montag bis Freitag */
export type Timetable = Partial<Record<'1' | '2' | '3' | '4' | '5', SchoolDay>>;
export interface Child { id: string; name: string; color: string; grade?: string; timetable?: Timetable }
/** Elternteil, z. B. Mama oder Papa. Für Kalender und Anzeige, wer gerade am Pad ist. */
export interface Parent { id: string; name: string; color: string }
export interface Task {
  id: string; childId: string; title: string; kind: TaskKind; points: number;
  repeat: Repeat; date?: string; // date nur bei 'einmal' (YYYY-MM-DD)
  active: boolean;
  icon?: string;
  time?: DayTime;
  /** Kind hakt selbst ab, Punkte sofort, ohne Eltern-Bestätigung. */
  selfCheck?: boolean;
  /** Gehört zur Schule: nur an Schultagen, pausiert in den Ferien. Hausaufgaben zählen immer dazu. */
  school?: boolean;
}
export interface Completion { id: string; taskId: string; childId: string; date: string; status: 'wartet' | 'bestaetigt' }
export interface LedgerEntry { id: string; childId: string; points: number; reason: string; at: string }
/** childId gesetzt = nur für dieses Kind (z. B. aus einem eigenen Wunsch) */
export interface Reward { id: string; title: string; cost: number; childId?: string }
/** Eigener Wunsch eines Kindes, Eltern legen den Punktepreis fest und schalten frei. */
export interface Idea { id: string; childId: string; title: string; at: string }
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

export interface CalEvent {
  id: string; title: string; date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  who: string[]; // leer = ganze Familie, sonst IDs von Kindern oder Eltern
  weekly?: boolean;
  icon?: string;
}

export interface FamilyData {
  version: 1;
  family: { id: string; name: string; parentPin: string };
  children: Child[];
  parents?: Parent[];
  tasks: Task[];
  completions: Completion[];
  ledger: LedgerEntry[];
  rewards: Reward[];
  requests?: RewardRequest[];
  ideas?: Idea[];
  topics?: Topic[];
  worksheets?: Worksheet[];
  events?: CalEvent[];
  settings?: { googleCalendarId?: string; googleCalendarName?: string; holiday?: { on: boolean; until?: string };
    /** Automatische Ferien und Feiertage nach Bundesland */
    autoHoliday?: { on: boolean; state: string; ranges: { name: string; from: string; to: string; kind: 'ferien' | 'feiertag' }[]; validTo: string } };
}

// Punkte pro Note (1 bis 6). Keine Minuspunkte.
export const EXAM_POINTS: Record<number, number> = { 1: 40, 2: 30, 3: 15, 4: 5, 5: 0, 6: 0 };

// Punkte fürs Üben. Es zählt, dass geübt wird, nicht wie viel richtig ist.
export const PRACTICE_POINTS = 10;
