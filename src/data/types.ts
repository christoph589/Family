export type TaskKind = 'routine' | 'hausaufgabe' | 'pflicht'; // pflicht = Haushalt
export type DayTime = 'morgens' | 'mittags' | 'abends';
/** vorSchultag = abends vor einem Schultag (So bis Do) */
export type Repeat = 'einmal' | 'taeglich' | 'werktags' | 'vorSchultag';

/** Ein Schultag im Stundenplan. Zeiten als HH:MM. */
export interface SchoolDay { from?: string; to?: string; lessons?: string[] }
/** Schlüssel 1 bis 5 = Montag bis Freitag */
export type Timetable = Partial<Record<'1' | '2' | '3' | '4' | '5', SchoolDay>>;
export type Gender = 'junge' | 'maedchen' | 'divers';
export interface Child {
  photo?: string;
  id: string; name: string; color: string;
  /** Klasse wie eingegeben, z. B. "4" oder "4b". Steigt jedes Schuljahr automatisch (siehe gradeYear). */
  grade?: string;
  /** Startjahr des Schuljahres, in dem grade eingetragen wurde (Schuljahr beginnt am 1. August) */
  gradeYear?: number;
  birthday?: string; // YYYY-MM-DD
  gender?: Gender;
  timetable?: Timetable;
  /** Notfall-Karte: nur das Nötigste, sieht jeder Erwachsene der Familie */
  emergency?: Emergency;
  /** Begleiter-Tier, das mit Punkten wächst */
  buddy?: { kind: string; name?: string; since: string };
  /** Abzeichen, die das Kind schon gesehen hat (für "Neu!") */
  seenBadges?: string[];
  /** Woche (Montag YYYY-MM-DD), deren Überraschungskiste geöffnet wurde */
  surpriseWeek?: string;
}

export interface Emergency { doctor?: string; doctorPhone?: string; allergies?: string; meds?: string; blood?: string; insurance?: string; school?: string; schoolPhone?: string; contacts?: string; notes?: string }

/** Taschengeld, bewusst getrennt von Punkten. Beträge in Cent. */
export interface MoneyTx { id: string; date: string; cents: number; note: string; kind: 'taschengeld' | 'geschenk' | 'verdient' | 'ausgabe' | 'korrektur' }
export interface MoneyAccount {
  allowance?: { cents: number; every: 'woche' | 'monat'; since: string; lastPaid?: string };
  goal?: { title: string; cents: number };
  tx: MoneyTx[];
}
/** Elternteil, z. B. Mama oder Papa. Für Kalender und Anzeige, wer gerade am Pad ist. */
/** Erwachsene in der Familie. admin=false: z. B. Oma/Opa, eigene PIN, keine Einstellungen, kein Geld, keine Punkte-Freigabe. */
export interface Parent { id: string; name: string; color: string; admin?: boolean; pin?: string; photo?: string; /** z. B. Papa, Mama, Oma */ title?: string }
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
export interface LedgerEntry { id: string; childId: string; points: number; reason: string; at: string; /** Einzahlung in einen Gemeinschaftstopf */ potId?: string }
/** Gemeinsames Ziel aller Kinder, z. B. Freizeitpark. Kinder zahlen eigene Punkte ein, Eltern können dazulegen. */
export interface Pot { id: string; title: string; icon?: string; target: number; bonus?: number; createdAt: string; doneAt?: string }
/** childId gesetzt = nur für dieses Kind (z. B. aus einem eigenen Wunsch) */
export interface Reward { id: string; title: string; cost: number; childId?: string }
/** Eigener Wunsch eines Kindes, Eltern legen den Punktepreis fest und schalten frei. */
export interface Idea { id: string; childId: string; title: string; at: string }
export interface RewardRequest { id: string; childId: string; rewardId: string; at: string }
export interface Topic { id: string; childId: string; subject: string; text: string; photo?: string; photos?: string[]; date: string; /** Wer das Thema angelegt hat (Person-ID) */ by?: string }

/** Vokabeltrainer: Karteikasten nach Leitner. box 0 = neu, 5 = sitzt. */
export interface VocabCard { id: string; front: string; back: string; box: number; due: string; right: number; wrong: number }
export interface VocabDeck { id: string; childId: string; title: string; lang: string; cards: VocabCard[]; createdAt: string; by?: string }
export interface VocabStats { streak: number; last?: string; best: number; total: number }

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
  end?: string; // HH:MM, optional
  who: string[]; // leer = ganze Familie, sonst IDs von Kindern oder Eltern
  weekly?: boolean;
  icon?: string;
  /** Wer fährt hin, wer holt ab (Person-IDs von Erwachsenen) */
  bring?: string;
  pick?: string;
  /** z. B. "Mitbringen: 5 €, Turnbeutel" (aus Elternbrief) */
  note?: string;
  /** Erinnerung: Minuten vorher, -1 = Vorabend 19 Uhr. Fehlt = keine. */
  remind?: number;
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
  pots?: Pot[];
  money?: Record<string, MoneyAccount>;
  meals?: Meal[];
  recipes?: Recipe[];
  shopping?: ShopItem[];
  /** Jahr, in dem der Geburtstagsbonus vergeben wurde, je Kind */
  birthdayBonus?: Record<string, number>;
  topics?: Topic[];
  vocab?: VocabDeck[];
  vocabStats?: Record<string, VocabStats>;
  worksheets?: Worksheet[];
  events?: CalEvent[];
  settings?: { googleCalendarId?: string; googleCalendarName?: string; holiday?: { on: boolean; until?: string };
    /** Automatische Ferien und Feiertage nach Bundesland */
    /** Eingebundene fremde Kalender (iCal-Links von iCloud, Google, Outlook, WebUntis) */
    feeds?: Feed[];
    autoHoliday?: { on: boolean; state: string; ranges: { name: string; from: string; to: string; kind: 'ferien' | 'feiertag' }[]; validTo: string } };
}

// Punkte pro Note (1 bis 6). Keine Minuspunkte.
export const EXAM_POINTS: Record<number, number> = { 1: 40, 2: 30, 3: 15, 4: 5, 5: 0, 6: 0 };

// Punkte fürs Üben. Es zählt, dass geübt wird, nicht wie viel richtig ist.
export const PRACTICE_POINTS = 10;

export type MealSlot = 'fruehstueck' | 'mittag' | 'abend';
export interface Meal { id: string; date: string; slot: MealSlot; title: string }
/** Gericht mit Zutaten, wird aus dem Essensplan gemerkt */
export interface Recipe { id: string; title: string; ingredients: string[] }
export interface ShopItem {
  id: string; title: string; done: boolean; at: string; by?: string;
  /** Für wen (Personen-ID) */ forWho?: string;
  /** Bis wann gebraucht (YYYY-MM-DD) */ until?: string;
  /** Laden, z. B. Lidl */ store?: string;
  /** z. B. „Angebot 1,99 €“ */ note?: string;
}

export interface Feed { id: string; name: string; url: string; color: string; who?: string; icon?: string }
