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
- 5 Fragen, vom Leichten zum Schweren, in kindgerechter Sprache passend zur Klassenstufe.
- Keine Fragen, die man aus dem Foto einfach abschreiben kann. Neue Zahlen und Beispiele verwenden.
- Jede Frage hat eine kurze, eindeutige Lösung (Zahl, Wort oder kurzer Satz), damit Eltern sie leicht abgleichen können.
- Bei Rechenaufgaben die Lösung als Zahl oder Bruch, ohne Rechenweg.
- Keine Namen von echten Personen aus den Fotos übernehmen.

Antworte nur mit JSON in genau dieser Form:
{"title": "kurzer Titel des Themas", "questions": [{"q": "Frage", "solution": "Lösung"}]}`;

  const res = await sample.json<GeneratedQuiz>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const questions = (Array.isArray(res?.questions) ? res.questions : [])
    .map(x => ({ q: String(x?.q ?? '').trim(), solution: String(x?.solution ?? '').trim() }))
    .filter(x => x.q && x.solution)
    .slice(0, 10);
  if (!questions.length) throw { code: 'invalid_json' };
  return { title: String(res.title || topic.text).slice(0, 80), questions };
}
