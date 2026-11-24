import { Question, Topic } from '../data/types';

/**
 * KI-Anbindung, Stufe 1: Im Web-Test läuft die App als claude.ai-Artifact und
 * fragt Claude über die eingebaute "sample"-Schnittstelle (auf dem Konto der
 * Person, die die Seite öffnet). In der nativen App gibt es das nicht; dort
 * kommt später ein eigener Server (Supabase Edge Function) mit derselben
 * Funktion generateQuiz().
 */
type SampleFn = ((input: string, opts?: object) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: object) => Promise<T>;
  limits: () => Promise<{ images?: { maxCount: number } }>;
};

let samplePromise: Promise<SampleFn | null> | null = null;
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const c = (globalThis as any).claude;
    samplePromise = c?.use ? Promise.resolve(c.use('sample')).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export interface GeneratedQuiz { title: string; questions: Question[] }

export const AI_ERROR: Record<string, string> = {
  not_granted: 'Die KI wurde für diese Seite nicht erlaubt.',
  sampling_disabled: 'Für dieses Konto ist die KI nicht verfügbar.',
  rate_limited: 'Gerade zu viele Anfragen. Bitte in ein paar Minuten nochmal.',
  image_rejected: 'Ein Foto konnte nicht gelesen werden. Bitte ein anderes nehmen.',
  invalid_json: 'Die KI hat keine brauchbaren Fragen geliefert. Bitte nochmal versuchen.',
  refused: 'Die KI hat das abgelehnt. Bitte Thema oder Fotos anpassen.',
};

export async function generateQuiz(topic: Topic, photos: string[], childName: string, grade: string | undefined, signal?: AbortSignal): Promise<GeneratedQuiz> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const max = limits.images?.maxCount ?? 0;
  const images = photos.slice(0, max).map(dataUrlToBlob).filter((b): b is Blob => !!b);

  const prompt = `Du bist eine geduldige Nachhilfelehrkraft an einer deutschen Schule.
Erstelle einen kurzen Verständnis-Test (keine Note!) für ${childName}${grade ? `, Klasse ${grade}` : ''}.
Ziel: prüfen, ob das heutige Schulthema verstanden wurde, und es vertiefen.

Fach: ${topic.subject}
Thema laut Eingabe: ${topic.text}
${images.length ? `Dazu ${images.length} Foto(s) aus Heft, Tafel, Arbeitsblatt oder einer korrigierten Arbeit. Lies sie genau. Wenn Fehler oder Korrekturen zu sehen sind, konzentriere dich auf genau diese Stellen.` : ''}

Regeln:
- 5 bis 6 Aufgaben, vom Leichten zum Schweren, in kindgerechter Sprache passend zur Klassenstufe.
- Übernimm die AUFGABENARTEN aus den Fotos. Gibt es dort Brüche, Tabellen, Diagramme, Zahlenstrahle, Bruchkreise oder geometrische Figuren, dann muss der Test genau solche Aufgaben enthalten, mit neuen Zahlen.
- Keine Aufgaben, die man aus dem Foto abschreiben kann.
- Lösungen kurz und eindeutig (Zahl, Bruch, Wort), damit Eltern sie leicht abgleichen können. Brüche immer als 3/4 schreiben, gekürzt.
- Keine Namen von echten Personen aus den Fotos übernehmen.

Aufgabentypen:
1. "text": freie Antwort. {"type":"text","q":"Frage","solution":"3/4"}
2. "choice": Auswahl, 3 bis 4 Möglichkeiten, solution ist exakt eine davon. {"type":"choice","q":"...","options":["1/2","2/3","3/4"],"solution":"3/4"}
3. "table": Tabelle zum Ausfüllen. In rows steht "?" für jedes leere Feld. solution nennt die Werte der "?"-Felder zeilenweise von links nach rechts, getrennt mit " | ". Für Ankreuz-Tabellen trägt das Kind "x" oder "-" ein.
   {"type":"table","q":"Kreuze an, wodurch die Zahl teilbar ist (x oder -).","table":{"header":["Zahl","durch 2","durch 3"],"rows":[["12","?","?"],["15","?","?"]]},"solution":"x | x | - | x"}

Zeichnungen: Jede Aufgabe darf zusätzlich "figure" haben, eine einfache SVG-Zeichnung, wenn das Thema Bilder braucht (Bruchkreis oder Bruchstreifen mit gefärbten Teilen, Zahlenstrahl, Säulendiagramm, Koordinatensystem, Figur mit Maßen). SVG-Regeln: beginnt mit <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220">, nur rect, circle, line, path, polygon, polyline, text, g; Linien schwarz, Füllungen hell (#9ecae1, #fdd49e, #ffffff); Schrift font-family="Arial" font-size zwischen 14 und 18; keine Bilder, Links, Skripte oder Styles. Die Zeichnung darf die Lösung nicht direkt verraten. Zeichne genau und mathematisch korrekt (bei einem Bruchkreis gleich große Teile).

Antworte nur mit JSON in genau dieser Form:
{"title": "kurzer Titel des Themas", "questions": [ ...Aufgaben wie oben... ]}`;

  const res = await sample.json<GeneratedQuiz>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const questions = (Array.isArray(res?.questions) ? res.questions : [])
    .map(cleanQuestion)
    .filter((x): x is Question => !!x)
    .slice(0, 10);
  if (!questions.length) throw { code: 'invalid_json' };
  return { title: String(res.title || topic.text).slice(0, 80), questions };
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

/** Prüft eine Aufgabe der KI und wirft unbrauchbare Teile weg. */
function cleanQuestion(x: any): Question | null {
  const q = str(x?.q), solution = str(x?.solution);
  if (!q || !solution) return null;
  const figure = typeof x?.figure === 'string' && x.figure.trim().startsWith('<svg') ? x.figure.slice(0, 20000) : undefined;
  if (x?.type === 'choice' && Array.isArray(x.options)) {
    const options = x.options.map((o: unknown) => str(o, 120)).filter(Boolean).slice(0, 5);
    if (options.length >= 2 && options.includes(solution)) return { type: 'choice', q, solution, options, figure };
  }
  if (x?.type === 'table' && Array.isArray(x?.table?.rows)) {
    const header = (Array.isArray(x.table.header) ? x.table.header : []).map((h: unknown) => str(h, 40)).slice(0, 8);
    const rows: string[][] = x.table.rows.slice(0, 10).map((r: unknown) => (Array.isArray(r) ? r.map(c => str(c, 40)).slice(0, 8) : []));
    const blanks = rows.flat().filter(c => c === '?').length;
    if (blanks > 0 && solution.split('|').length === blanks) return { type: 'table', q, solution, table: { header, rows }, figure };
  }
  return { type: 'text', q, solution, figure };
}
