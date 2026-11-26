export type TaskKind = 'routine' | 'hausaufgabe' | 'pflicht'; // pflicht = Haushalt
export type DayTime = 'morgens' | 'mittags' | 'abends';
/** vorSchultag = abends vor einem Schultag (So bis Do) */
export type Repeat = 'einmal' | 'taeglich' | 'werktags' | 'vorSchultag' | 'vorFach';

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
  /** Fächer, für die schon automatisch eine „Sachen richten“-Aufgabe angelegt wurde (nicht erneut anlegen, wenn gelöscht) */
  packAuto?: string[];
  /** Stundenraster: Ende jeder Stunde (HH:MM), Index 0 = 1. Stunde. Damit passt sich das Schulende an. */
  bells?: string[];
  /** Abweichung vom Stundenplan an einem Tag (YYYY-MM-DD): früher aus oder ganz frei */
  schoolChange?: Record<string, { to?: string; off?: boolean; by?: string }>;
  /** Notfall-Karte: nur das Nötigste, sieht jeder Erwachsene der Familie */
  emergency?: Emergency;
  /** Begleiter-Tier, das mit Punkten wächst */
  buddy?: { kind: string; name?: string; since: string };
  /** Abzeichen, die das Kind schon gesehen hat (für "Neu!") */
  seenBadges?: string[];
  /** Woche (Montag YYYY-MM-DD), deren Überraschungskiste geöffnet wurde */
  surpriseWeek?: string;
  /** Schulform, z. B. Gymnasium. Für Probe-Klassenarbeiten auf dem richtigen Niveau. */
  schoolType?: string;
  /** Bundesland der Schule, falls anders als das der Familie (z. B. BW). Bestimmt Ferien und Lehrplan. */
  state?: string;
}

export interface Emergency { doctor?: string; doctorPhone?: string; allergies?: string; meds?: string; blood?: string; insurance?: string; school?: string; schoolPhone?: string; contacts?: string; notes?: string }

/** Taschengeld, bewusst getrennt von Punkten. Beträge in Cent. */
/** Drei Töpfe: aus = Ausgeben (Bargeld), spar = Sparen, invest = Investieren. Alte Buchungen ohne Topf zählen als Ausgeben. */
export type MoneyPot = 'aus' | 'spar' | 'invest';
export interface MoneyTx { id: string; date: string; cents: number; note: string; kind: 'taschengeld' | 'geschenk' | 'verdient' | 'ausgabe' | 'korrektur' | 'umbuchung' | 'zins'; pot?: MoneyPot }
export interface MoneyAccount {
  allowance?: { cents: number; every: 'woche' | 'monat'; since: string; lastPaid?: string };
  goal?: { title: string; cents: number };
  tx: MoneyTx[];
  /** Letzter Monat (YYYY-MM), für den Eltern-Zins gutgeschrieben wurde */
  lastInterest?: string;
  /** Wunsch des Kindes, Geld aus Sparen/Investieren zurückzuholen. Eltern bestätigen. */
  requests?: { id: string; cents: number; from: MoneyPot; to: MoneyPot; note: string; at: string }[];
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
  /** Nur bei repeat 'vorFach': Abend vor einem Schultag mit diesem Fach (Suchwort, z. B. 'sport', 'schwimm') */
  subject?: string;
  /** Nur in geraden oder ungeraden Kalenderwochen (z. B. Schwimmen abwechselnd Mädchen/Jungs) */
  weeks?: 'gerade' | 'ungerade';
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
export interface VocabCard { id: string; front: string; back: string; box: number; due: string; right: number; wrong: number;
  /** Merkhilfe der KI, einmal erzeugt: Beispielsatz, Übersetzung, Eselsbrücke */ hint?: { ex: string; de: string; memo?: string };
  /** Von der KI als richtig erkannte Antworten (nach Richtung), werden danach ohne KI akzeptiert */ ok?: { de?: string[]; fx?: string[] } }
export interface VocabDeck { id: string; childId: string; title: string; lang: string; cards: VocabCard[]; createdAt: string; by?: string; /** Lernkarten zu einer Klassenarbeit, nicht im Vokabeltrainer */ prepId?: string }
/** Ganzes Vokabelverzeichnis eines Schulbuchs, zu Schuljahresbeginn importiert. Kinder wählen daraus einen Bereich zum Lernen. */
export interface VocabBook { id: string; childId: string; title: string; lang: string; units: string[]; entries: { front: string; back: string; unit: string }[]; createdAt: string; by?: string }
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
  /** Druckversion: Platz zum Rechnen oder Zeichnen (Linien, Kästchen, frei) und wie groß (1 bis 12) */
  space?: 'lines' | 'grid' | 'blank'; size?: number;
  /** Nur auf Papier lösbar, z. B. konstruieren mit Geodreieck und Zirkel */
  paper?: boolean;
}
export interface Worksheet {
  id: string; childId: string; topicId?: string; title: string; date: string;
  questions: Question[];
  answers?: string[];
  results?: boolean[];
  status: 'offen' | 'abgegeben' | 'geprueft';
  understanding?: Understanding;
  retryOf?: string;
  /** Probe-Klassenarbeit: Punkte und Teilkompetenz je Aufgabe, Bearbeitungszeit */
  exam?: { prepId: string; minutes: number; points: number[]; skills: string[] };
  /** Auf Papier geschrieben: von den Eltern eingetragene Punkte je Aufgabe */
  paperScore?: number[];
  /** Auf Papier geschrieben und abfotografiert: KI macht eine Vorkorrektur, Eltern bestätigen */
  /** KI-Abgleich digitaler Antworten mit der Lösung (Vorschlag für die Eltern) */
  aiCheck?: { ok: boolean[]; notes: string[]; pts?: number[] };
  scan?: { photos: string[]; at: string; by?: string; ai?: { pts: number[]; notes: string[]; unsure: boolean[]; summary?: string }; error?: string };
}

/** Klassenarbeit-Vorbereitung: alle Inhalte zum Thema, daraus macht die KI eine Probe-Arbeit. */
export interface ExamPrep { id: string; childId: string; subject: string; title: string; date?: string; photos: string[]; createdAt: string; by?: string; eventId?: string;
  /** Lernkarten-Stapel (VocabDeck mit prepId) */ deckId?: string; /** Eltern geben die Probe-Arbeit vor dem Lernen frei */ unlocked?: boolean; /** echte Note aus der Schule */ grade?: number;
  /** KI-Rechtschreibhinweis zu Fach/Thema: fix = Vorschlag, done = vom Kind/Eltern entschieden */ spell?: { fix?: { subject: string; title: string }; done?: boolean } }
export const SCHOOL_TYPES = ['Grundschule', 'Gymnasium', 'Realschule', 'Gesamtschule', 'Mittelschule', 'Oberschule', 'Förderschule', 'Andere'] as const;

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
  /** Privat: Person-ID. Nur diese Person sieht Titel und Details. */
  priv?: string;
}

/** Geschenke: Idee oder gekauft, gehört zu einem Anlass in einem bestimmten Jahr. Beträge in Cent. */
export interface Gift { id: string; occ: string; year: number; forId?: string; title: string; cents?: number; status: 'idee' | 'gekauft'; by?: string; at: string }
/** Eigener jährlicher Anlass, z. B. Geburtstag Oma (md = MM-DD) */
export interface GiftOccasion { id: string; title: string; md: string; forId?: string; icon?: string }

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
  vocabBooks?: VocabBook[];
  vocabStats?: Record<string, VocabStats>;
  worksheets?: Worksheet[];
  exams?: ExamPrep[];
  events?: CalEvent[];
  gifts?: Gift[];
  giftOccasions?: GiftOccasion[];
  settings?: { /** Einwilligung der Eltern zur KI-Verarbeitung von Fotos */ aiConsent?: { at: string; by?: string }; /** Bundesland, z. B. DE-NW (wenn keine automatischen Ferien gesetzt sind) */ region?: string; googleCalendarId?: string; googleCalendarName?: string; holiday?: { on: boolean; until?: string };
    /** Automatische Ferien und Feiertage nach Bundesland */
    /** Eingebundene fremde Kalender (iCal-Links von iCloud, Google, Outlook, WebUntis) */
    feeds?: Feed[];
    /** Aus einem Abo übernommene Termine ("key|datum"), das Original wird ausgeblendet */
    hiddenFeed?: string[];
    /** Verbundene iCloud-Kalender (lesen und schreiben über den Server) */
    icloud?: { href: string; name: string; color: string; who?: string }[];
    /** Wohin neue Termine gehen: nur Familienplaner, nur iCloud oder beides zur Auswahl */
    newEvents?: 'app' | 'icloud' | 'both';
    /** Aufteilung des Taschengelds in Prozent (Rest = Ausgeben) und Eltern-Zins pro Monat */
    money?: { spar: number; invest: number; rate: number };
    /** WebUntis: welcher Untis-Schüler zu welchem Kind gehört. Der Schlüssel liegt nur auf dem Server. */
    untis?: { who?: string; at?: string; checkedAt?: string; links: { child: string; id: number; name: string; /** welcher Zugang (0 = erster) */ slot?: number }[]; /** weitere Zugänge: Anzeigename je slot */ accounts?: Record<number, string> };
    autoHoliday?: { on: boolean; state: string; ranges: { name: string; from: string; to: string; kind: 'ferien' | 'feiertag' }[]; validTo: string;
      /** Ferien weiterer Bundesländer für Kinder mit eigenem Bundesland */
      extra?: Record<string, { ranges: { name: string; from: string; to: string; kind: 'ferien' | 'feiertag' }[]; validTo: string }> } };
}

// Punkte pro Note (1 bis 6). Keine Minuspunkte.
export const EXAM_POINTS: Record<number, number> = { 1: 40, 2: 30, 3: 15, 4: 5, 5: 0, 6: 0 };

// Punkte fürs Üben. Es zählt, dass geübt wird, nicht wie viel richtig ist.
export const PRACTICE_POINTS = 5;

export type MealSlot = 'fruehstueck' | 'mittag' | 'abend';
export interface Meal { id: string; date: string; slot: MealSlot; title: string }
/** Gericht mit Zutaten, wird aus dem Essensplan gemerkt */
export interface Recipe {
  id: string; title: string; ingredients: string[];
  /** Bewertung je Person: 2 = Lieblingsessen, 1 = mag ich, -1 = lieber nicht */
  votes?: Record<string, number>;
  /** Wer das Gericht vorgeschlagen hat (Person-ID) und wann */ by?: string; at?: string;
  /** Zubereitung als Text und Link zum Originalrezept */ steps?: string; link?: string;
  /** Foto des Gerichts, klein gerechnet (data-URL). Erscheint im Essensplan und an der Wand. */ photo?: string;
}
export interface ShopItem {
  id: string; title: string; done: boolean; at: string; by?: string;
  /** Für wen (Personen-ID) */ forWho?: string;
  /** Bis wann gebraucht (YYYY-MM-DD) */ until?: string;
  /** Laden, z. B. Lidl */ store?: string;
  /** z. B. „Angebot 1,99 €“ */ note?: string;
}

export interface Feed { id: string; name: string; url: string; color: string; who?: string; icon?: string }
