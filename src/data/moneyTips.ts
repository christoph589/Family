/** Kurze Geld-Tipps je Alter. Jeden Tag ein anderer. Ziel: verstehen, nicht belehren. */
const TIPS: { min: number; max: number; text: string }[] = [
  { min: 0, max: 8, text: 'Geld ist begrenzt. Was du heute ausgibst, ist morgen nicht mehr da.' },
  { min: 0, max: 8, text: 'Teil dein Geld in zwei Gläser: eins zum Ausgeben, eins zum Sparen.' },
  { min: 0, max: 8, text: 'Bevor du etwas kaufst: Schlaf eine Nacht drüber. Willst du es morgen noch?' },
  { min: 0, max: 8, text: 'Zähl dein Geld einmal pro Woche. Dann weißt du immer, wie viel du hast.' },
  { min: 0, max: 8, text: 'Sparen heißt: Jetzt warten, später etwas Größeres kaufen können.' },
  { min: 9, max: 12, text: 'Unterscheide zwischen „brauche ich“ und „will ich“. Beides ist okay, aber nicht gleich wichtig.' },
  { min: 9, max: 12, text: 'Probier die Drittel-Regel: ein Drittel sparen, ein Drittel ausgeben, ein Drittel für später.' },
  { min: 9, max: 12, text: 'Vergleich Preise. Das gleiche Spiel kostet in verschiedenen Läden oft unterschiedlich viel.' },
  { min: 9, max: 12, text: 'In Spielen echtes Geld auszugeben geht schnell. Rechne vorher aus, wie viele Wochen Taschengeld das sind.' },
  { min: 9, max: 12, text: 'Schreib auf, wofür du Geld ausgibst. Nach einem Monat siehst du, wo es hingeht.' },
  { min: 9, max: 12, text: 'Ein Sparziel mit Bild und Betrag macht das Warten leichter.' },
  { min: 13, max: 99, text: 'Ein Abo kostet jeden Monat. 5 € im Monat sind 60 € im Jahr.' },
  { min: 13, max: 99, text: 'Zinsen: Wenn Geld auf einem Sparkonto liegt, bekommst du etwas dazu. Bei Schulden zahlst du drauf.' },
  { min: 13, max: 99, text: 'Ratenkauf klingt billig, kostet am Ende aber oft mehr als der Preis im Laden.' },
  { min: 13, max: 99, text: 'Plan dein Monatsbudget am Anfang des Monats, nicht am Ende.' },
  { min: 13, max: 99, text: 'Ein Notgroschen ist Geld, das du nicht anfasst, damit du bei Überraschungen nicht pleite bist.' },
  { min: 13, max: 99, text: 'Gib nie Bank- oder Zugangsdaten weiter, auch nicht an Freunde oder in Spielen.' },
];

export function tipFor(age: number | undefined, date: string): string {
  const a = age ?? 9;
  const list = TIPS.filter(t => a >= t.min && a <= t.max);
  const day = Math.floor(new Date(date + 'T12:00:00').getTime() / 86400000);
  return list[day % list.length].text;
}
