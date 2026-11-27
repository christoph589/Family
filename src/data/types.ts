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
  /** Regelmäßiger Schulweg mit dem Zug (Echtzeitprüfung auf Heute und Wand) */
  commutes?: Commute[];
}

/** Ein Zug auf dem Schulweg. Der Server prüft ab 45 Min vor Abfahrt Verspätung, Ausfall und Gleiswechsel. */
export interface Commute {
  id: string;
  /** Einstiegs-Halt (Anzeigename) und seine EVA-Nummer (Bahnhofsnummer der DB) */
  from: string; fromEva: string;
  /** Ziel-Halt (nur Anzeige) */
  to: string;
  /** Geplante Abfahrt HH:MM */
  depart: string;
  /** Linie wie "S3" (zum sicheren Finden des Zuges) */
  line?: string;
  /** Wochentage 1 = Mo … 5 = Fr (7 = So) */
  days: number[];
  /** Link der bahn.de-Verbindung, nur als Verweis (Antippen öffnet ihn) */
  link?: string;
  off?: boolean;
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
export interface Parent { id: string; name: string; color: string; admin?: boolean; /** Nur Altbestand bzw. lokal, seit fix-16 serverseitig */ pin?: string; photo?: string; /** z. B. Papa, Mama, Oma */ title?: string }
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
  /** Sonderaufgabe: einmalig, Extra-Punkte, bleibt ab date stehen, bis sie erledigt ist. until = optionale Frist. */
  special?: { until?: string };
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
  /** Von der KI als richtig erkannte Antworten (nach Richtung), werden danach ohne KI akzeptiert */ ok?: { de?: string[]; fx?: string[] };
  /** Zuletzt geübt (YYYY-MM-DD) */ seen?: string }
export interface VocabClaim { id: string; childId: string; deckId: string; cardId: string; dir: 'de' | 'fx'; ask: string; solution: string; answer: string; at: string; /** Begründung der KI, warum falsch */ note?: string }
export interface VocabDeck { id: string; childId: string; title: string; lang: string; cards: VocabCard[]; createdAt: string; by?: string; /** Lernkarten zu einer Klassenarbeit, nicht im Vokabeltrainer */ prepId?: string }
/** Ganzes Vokabelverzeichnis eines Schulbuchs, zu Schuljahresbeginn importiert. Kinder wählen daraus einen Bereich zum Lernen. */
export interface VocabBook { id: string; childId: string; title: string; lang: string; units: string[]; entries: { front: string; back: string; unit: string }[]; createdAt: string; by?: string }
export interface VocabStats { streak: number; last?: string; best: number; total: number;
  /** abgefragte Wörter pro Tag (letzte 14 Tage) */ days?: Record<string, number>; /** Tage mit Vokabeln insgesamt */ learnDays?: number; /** an diesem Tag haben Eltern über das Tageslimit hinaus freigegeben */ unlock?: string }

/** Was ein Kind an einem Tag gelernt hat. Nur, was das Kind selbst gemacht hat. */
export interface LearnDay {
  /** aktive Lernzeit in Sekunden */ s?: number;
  /** Vokabeln/Lernkarten abgefragt, davon beim ersten Versuch richtig, Runden */ w?: number; ok?: number; r?: number;
  /** Lernkarten zu Klassenarbeiten: abgefragt, davon richtig */ kw?: number; kok?: number;
  /** Wörter, die an diesem Tag neu „sitzen“ (Fach 3 erreicht) */ m?: number;
  /** Tests und Probe-Arbeiten abgegeben */ t?: number;
  /** Lernzeit in Sekunden je Fach (z. B. Englisch, Mathe) */ subj?: Record<string, number>;
}

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
  aiCheck?: { ok: boolean[]; notes: string[]; pts?: number[]; /** Tabellen: Urteil der KI je ausgefülltem Feld (null = keine Tabelle) */ cells?: (boolean[] | null)[] };
  /** Tag, an dem das Kind abgegeben hat (YYYY-MM-DD) */
  doneAt?: string;
  scan?: { photos: string[]; at: string; by?: string; ai?: { pts: number[]; notes: string[]; unsure: boolean[]; summary?: string }; error?: string };
}

/** Klassenarbeit-Vorbereitung: alle Inhalte zum Thema, daraus macht die KI eine Probe-Arbeit. */
export interface ExamPrep { id: string; childId: string; subject: string; title: string; date?: string; photos: string[]; createdAt: string; by?: string; eventId?: string;
  /** Lernkarten-Stapel (VocabDeck mit prepId) */ deckId?: string; /** Eltern geben die Probe-Arbeit vor dem Lernen frei */ unlocked?: boolean; /** echte Note aus der Schule */ grade?: number;
  /** KI-Rechtschreibhinweis zu Fach/Thema: fix = Vorschlag, done = vom Kind/Eltern entschieden */ spell?: { fix?: { subject: string; title: string }; done?: boolean };
  /** Lernpaket der KI: Merkzettel in Abschnitten, Karten dazu, daraus der Lernplan */ pack?: StudyPack;
  /** Lernpaket wird gerade erstellt (at) oder ist fehlgeschlagen (error). Läuft auf dem Gerät, das hochgeladen hat. */ packJob?: { at: string; error?: string } }
/** Ein Lernabschnitt: das Wichtigste in Kindersprache, ein Beispiel mit Lösungsweg, die Karten dazu. */
export interface StudyPart { title: string; points: string[]; example?: { task: string; steps: string[] }; cards: string[] }
export interface StudyPack { at: string; /** Anzahl Fotos beim Erstellen, für den Hinweis auf neue Fotos */ photos: number; intro?: string; parts: StudyPart[]; pitfalls: string[]; memo?: string }
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
/** Wunschzettel: Kind trägt ein, Eltern geben frei. Nur status 'frei' erscheint auf dem Teilen-Link. */
export interface Wish { id: string; childId: string; title: string; at: string;
  /** Link zum Produkt (nur http/https) */ link?: string;
  /** Foto vom Wunsch, nur in der App, nie auf dem Teilen-Link */ photo?: string;
  /** Wie wichtig: 1 bis 3 Sterne */ prio: 1 | 2 | 3;
  /** z. B. „Größe 140, in Blau“. Erscheint nach Freigabe auf dem Teilen-Link. */ note?: string;
  /** neu = wartet auf Eltern, frei = auf der Liste, nein = nicht freigegeben */ status: 'neu' | 'frei' | 'nein';
  /** ungefährer Preis in Cent (von den Eltern) */ cents?: number;
  /** Hat es bekommen. Verschwindet dann vom Teilen-Link. */ done?: boolean;
  /** Wer zuletzt entschieden hat (Person-ID) */ by?: string }
/** Eigener jährlicher Anlass, z. B. Geburtstag Oma (md = MM-DD) */
export interface GiftOccasion { id: string; title: string; md: string; forId?: string; icon?: string }

export interface FamilyData {
  version: 1;
  /** parentPin: nur noch beim Anlegen und für Familien, die nur auf einem Gerät liegen. Der Server (fix-16) übernimmt sie als Hash und entfernt sie aus dem Stand. */
  family: { id: string; name: string; parentPin?: string };
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
  /** Essen: Unverträglichkeiten, Ernährungsweise und Abneigungen je Person (ID) */
  diet?: Record<string, import('./food').Diet>;
  /** Letzter KI-Wochenvorschlag je Woche (Montag), damit ein erneutes Öffnen nichts kostet */
  mealIdeas?: { week: string; at: string; items: MealIdea[] };
  /** Gemerkte Rezeptvorschläge (Rezepte › Ideen), bis sie übernommen oder verworfen werden */
  dishIdeas?: { at: string; items: DishIdea[] };
  /** Jahr, in dem der Geburtstagsbonus vergeben wurde, je Kind */
  birthdayBonus?: Record<string, number>;
  topics?: Topic[];
  vocab?: VocabDeck[];
  vocabBooks?: VocabBook[];
  vocabStats?: Record<string, VocabStats>;
  /** Lern-Statistik je Kind und Tag (letzte 120 Tage), Schlüssel: Kind-ID, dann YYYY-MM-DD */
  learnLog?: Record<string, Record<string, LearnDay>>;
  /** Kind meint, seine Vokabel-Antwort stimmt doch. Eltern entscheiden. */
  vocabClaims?: VocabClaim[];
  /** Erledigte einmalige Datenbereinigungen */
  migrations?: string[];
  worksheets?: Worksheet[];
  exams?: ExamPrep[];
  events?: CalEvent[];
  gifts?: Gift[];
  giftOccasions?: GiftOccasion[];
  wishes?: Wish[];
  settings?: { /** Einwilligung der Eltern zur KI-Verarbeitung von Fotos */ aiConsent?: { at: string; by?: string }; /** Bundesland, z. B. DE-NW (wenn keine automatischen Ferien gesetzt sind) */ region?: string; googleCalendarId?: string; googleCalendarName?: string; holiday?: { on: boolean; until?: string };
    /** Wohnort fürs Wetter (nur Ort und grobe Koordinaten, kein Gerätestandort). off = Wetter ausgeblendet */
    weather?: { name: string; lat: number; lon: number; off?: boolean };
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
  /** Neue Idee aus dem KI-Wochenvorschlag */ ai?: boolean;
  /** Woher das Foto stammt, z. B. Website beim Import */ photoSrc?: string;
}
/** Ein Vorschlag der KI für einen Platz im Essensplan */
/** Ein neuer Gerichtvorschlag der KI für die Rezeptsammlung */
export interface DishIdea { id: string; title: string; why?: string; time?: string; ingredients: string[]; steps?: string }
export interface MealIdea { date: string; slot: MealSlot; title: string; isNew?: boolean; ingredients?: string[]; steps?: string; why?: string }
export interface ShopItem {
  id: string; title: string; done: boolean; at: string; by?: string;
  /** Für wen (Personen-ID) */ forWho?: string;
  /** Bis wann gebraucht (YYYY-MM-DD) */ until?: string;
  /** Laden, z. B. Lidl */ store?: string;
  /** z. B. „Angebot 1,99 €“ */ note?: string;
}

export interface Feed { id: string; name: string; url: string; color: string; who?: string; icon?: string }
