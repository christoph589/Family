import { Question, Topic } from '../data/types';
import { cloudEnabled, getLink, sb } from '../data/cloud';
import { loadPhotos } from '../ui/PhotoImg';

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
/** KI-Zugang: im claude.ai-Testlink über die eingebaute Schnittstelle, sonst über die Server-Funktion "familie" (braucht Familien-Verbindung). */
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const c = (globalThis as any).claude;
    samplePromise = c?.use
      ? Promise.resolve(c.use('sample')).catch(() => null)
      : cloudEnabled ? getLink().then(l => (l ? serverSample() : null)).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

const blobToDataUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(b); });

/** Liest JSON auch dann, wenn die Antwort in einem Codeblock steckt. */
function parseJsonLoose<T>(text: string): T {
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(t); } catch { /* weiter */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* weiter */ } }
  throw { code: 'invalid_json' };
}

/** Vor dem ersten Foto-Upload an die KI fragt die App einmal die Eltern (siehe AiConsent in App.tsx). */
let consentAsker: (() => Promise<boolean>) | null = null;
export const setAiConsentAsker = (f: (() => Promise<boolean>) | null) => { consentAsker = f; };

function serverSample(): SampleFn {
  const call = async (input: string, opts?: any): Promise<string> => {
    if (((opts?.images ?? []) as Blob[]).length && consentAsker && !(await consentAsker())) throw { code: 'no_consent' };
    const images = await Promise.all(((opts?.images ?? []) as Blob[]).map(blobToDataUrl));
    const signal: AbortSignal | undefined = opts?.signal;
    if (signal?.aborted) throw { code: 'cancelled' };
    const req = sb().functions.invoke('familie', { body: { action: 'ai', prompt: input, images, ...(opts?.fast ? { fast: true } : {}) } }).then(async ({ data, error }) => {
      if (error) {
        let code = '';
        try { code = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* egal */ }
        if (!code && /not found|404|Failed to send/i.test(String(error.message))) code = 'no_function';
        throw { code: code || 'server' };
      }
      return String((data as { text: string }).text ?? '');
    });
    const cancel = new Promise<never>((_, fail) => signal?.addEventListener('abort', () => fail({ code: 'cancelled' })));
    return Promise.race([req, cancel]);
  };
  const fn = (async (input: string, opts?: object) => ({ text: await call(input, opts) })) as SampleFn;
  fn.json = async <T,>(input: string, opts?: object) => parseJsonLoose<T>(await call(input, opts));
  fn.limits = async () => ({ images: { maxCount: 20 } });
  return fn;
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
  no_consent: 'Ohne Zustimmung der Eltern schickt Famelio keine Fotos an die KI.',
  sampling_disabled: 'Für dieses Konto ist die KI nicht verfügbar.',
  rate_limited: 'Gerade zu viele Anfragen. Bitte in ein paar Minuten nochmal.',
  image_rejected: 'Ein Foto konnte nicht gelesen werden. Bitte ein anderes nehmen.',
  invalid_json: 'Die KI hat keine brauchbaren Fragen geliefert. Bitte nochmal versuchen.',
  refused: 'Die KI hat das abgelehnt. Bitte Thema oder Fotos anpassen.',
  no_key: 'Die KI ist auf dem Server noch nicht eingerichtet: Der API-Schlüssel fehlt (Secret ANTHROPIC_API_KEY).',
  no_sql: 'Bitte zuerst das SQL „fix-03-ki“ im Supabase SQL Editor ausführen.',
  no_function: 'Die Server-Funktion „familie“ ist noch nicht neu eingespielt.',
  bad_key: 'Der API-Schlüssel wird nicht akzeptiert. Bitte in Supabase prüfen.',
  no_credit: 'Das Anthropic-Konto hat kein Guthaben mehr. Bitte unter console.anthropic.com aufladen.',
  daily_limit: 'Für heute ist das KI-Limit der Familie erreicht. Morgen geht es weiter.',
  disabled: 'Die KI-Funktionen sind für eure Familie gerade ausgeschaltet.',
  not_member: 'Dieses Gerät ist mit keiner Familie verbunden.',
  not_signed_in: 'Dieses Gerät ist nicht angemeldet.',
  ai_down: 'Die KI ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.',
  no_timetable: 'Auf dem Bild war kein Stundenplan zu erkennen. Bitte ein schärferes Foto nehmen.',
  unavailable: 'Die KI ist auf diesem Gerät nicht verfügbar. Bitte das Gerät mit der Familie verbinden.',
};

export interface QA { q: string; a: string }
/** Kind fragt zum Unterrichtsstoff nach. Die KI erklärt kindgerecht mit Blick auf die Fotos, löst aber keine Hausaufgaben vor. */
export async function askTopic(topic: Topic, photos: string[], childName: string, grade: string | undefined, history: QA[], question: string, signal?: AbortSignal): Promise<string> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  const prompt = `Du bist eine freundliche, geduldige Nachhilfelehrkraft. ${childName}${grade ? ` (Klasse ${grade})` : ''} hat eine Frage zum heutigen Unterricht.
Fach: ${topic.subject}. Thema: ${topic.text}.${images.length ? ' Die Fotos zeigen das Heft, die Tafel oder das Arbeitsblatt von heute.' : ''}

Regeln:
- Erkläre in einfacher Sprache, passend zum Alter, höchstens 120 Wörter. Kurze Sätze, gern ein kleines Beispiel.
- Wenn die Frage eine Hausaufgabe ist: nicht die Lösung verraten, sondern den Weg zeigen und mit einer Rückfrage zum Selberdenken enden.
- Bleib beim Schulstoff. Bei anderen Themen freundlich zurück zum Thema lenken.
- Keine Markdown-Überschriften, keine Tabellen. Rechnungen schlicht, z. B. 3/4 + 1/4 = 1.
${history.length ? `\nBisheriges Gespräch:\n${history.map(h => `Kind: ${h.q}\nDu: ${h.a}`).join('\n')}\n` : ''}
Frage von ${childName}: ${question.trim().slice(0, 500)}`;
  const res = await sample(prompt, { images: images.length ? images : undefined, signal, cache: false });
  return String(res?.text ?? '').replace(/^#+\s*/gm, '').trim();
}

export async function generateQuiz(topic: Topic, photos: string[], childName: string, grade: string | undefined, signal?: AbortSignal): Promise<GeneratedQuiz> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const max = limits.images?.maxCount ?? 0;
  const images = (await loadPhotos(photos.slice(0, max))).map(dataUrlToBlob).filter((b): b is Blob => !!b);

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
- Im Fragetext keine Hinweise, die die Lösung verraten.

Aufgabentypen:
1. "text": freie Antwort. {"type":"text","q":"Frage","solution":"3/4"}
2. "choice": Auswahl, 3 bis 4 Möglichkeiten, solution ist exakt eine davon. {"type":"choice","q":"...","options":["1/2","2/3","3/4"],"solution":"3/4"}
3. "table": Tabelle zum Ausfüllen. In rows steht "?" für jedes leere Feld. solution nennt die Werte der "?"-Felder zeilenweise von links nach rechts, getrennt mit " | ". Ankreuz-Tabellen: Lösung "x" für ankreuzen, "-" für nicht ankreuzen. Das Kind tippt dort nur Kästchen an. Im Fragetext NICHT "(x oder -)" schreiben, sondern nur "Kreuze an, ...".
   {"type":"table","q":"Kreuze an, wodurch die Zahl teilbar ist.","table":{"header":["Zahl","durch 2","durch 3"],"rows":[["12","?","?"],["15","?","?"]]},"solution":"x | x | - | x"}

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

/** Lernkarten zur Klassenarbeit: Frage vorn, kurze Antwort hinten. */
export async function generateCards(e: { subject: string; title: string }, photos: string[], who: { name: string; grade?: string; schoolType?: string }, signal?: AbortSignal): Promise<{ front: string; back: string }[]> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  const prompt = `Du bist eine geduldige Lehrkraft. Erstelle LERNKARTEN zur Vorbereitung auf eine Klassenarbeit für ${who.name}${who.grade ? `, Klasse ${who.grade}` : ''}${who.schoolType ? `, ${who.schoolType}` : ''}.
Fach: ${e.subject}. Thema: ${e.title}.
${images.length ? `Dazu ${images.length} Foto(s) mit den Unterlagen. Die Karten decken genau diesen Stoff ab, verteilt über alle Seiten.` : ''}

Regeln:
- 15 bis 25 Karten, vom Grundwissen zum Anwenden.
- Vorderseite "front": eine klare Frage oder kleine Aufgabe, höchstens 120 Zeichen. Mischung aus Begriffen, Regeln, Merksätzen und kurzen Rechen- oder Beispielaufgaben mit neuen Zahlen.
- Rückseite "back": die Antwort, kurz und eindeutig, höchstens 80 Zeichen. Bei Rechenaufgaben nur das Ergebnis, Brüche als 3/4.
- Kindgerechte Sprache passend zur Klassenstufe. Keine Namen echter Personen aus den Fotos.
- Keine zwei Karten mit derselben Antwort.

Antworte nur mit JSON: {"cards":[{"front":"...","back":"..."}]}`;
  const res = await sample.json<any>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const cards = (Array.isArray(res?.cards) ? res.cards : [])
    .map((c: any) => ({ front: str(c?.front, 160), back: str(c?.back, 100) }))
    .filter((c: { front: string; back: string }) => c.front && c.back).slice(0, 30);
  if (cards.length < 5) throw { code: 'invalid_json' };
  return cards;
}

export interface GeneratedPack { intro: string; parts: { title: string; points: string[]; example?: { task: string; steps: string[] }; cards: { front: string; back: string }[]; /** Indizes (ab 0) vorhandener Karten */ use: number[] }[]; pitfalls: string[]; memo: string }
/** Lernpaket zur Klassenarbeit in EINEM Aufruf: Merkzettel in Abschnitten, Beispiel mit Lösungsweg, Lernkarten je Abschnitt. */
export async function generateStudyPack(e: { subject: string; title: string }, photos: string[], who: { name: string; grade?: string; schoolType?: string }, signal?: AbortSignal, existing: { front: string; back: string }[] = []): Promise<GeneratedPack> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  const prompt = `Du bist eine geduldige Lehrkraft und Lerncoach. ${who.name}${who.grade ? ` (Klasse ${who.grade}${who.schoolType ? `, ${who.schoolType}` : ''})` : ''} schreibt bald eine Klassenarbeit und muss den Stoff ERST LERNEN. Erstelle ein Lernpaket.
Fach: ${e.subject}. Thema: ${e.title}.
${images.length ? `Dazu ${images.length} Foto(s) mit den Unterlagen (Heft, Arbeitsblätter, Buchseiten). Das Lernpaket deckt genau diesen Stoff ab, verteilt über alle Seiten. Nichts erfinden, was nicht dazugehört.` : 'Es gibt keine Fotos. Halte dich an den üblichen Stoff zu diesem Thema in dieser Klassenstufe.'}

Aufbau:
- "intro": ein Satz, worum es in der Arbeit geht, direkt an das Kind (du).
- "parts": 3 bis 5 Lernabschnitte in sinnvoller Lernreihenfolge (Grundlagen zuerst). Jeder Abschnitt ist eine Tagesportion von etwa 15 Minuten.
  - "title": 2 bis 5 Wörter, z. B. "Brüche kürzen".
  - "points": 2 bis 5 Merksätze, das Wichtigste in einfacher Sprache, je höchstens 140 Zeichen. Regeln, Begriffe, Formeln.
  - "example": eine Beispielaufgabe mit neuen Zahlen ("task") und dem Lösungsweg in 2 bis 5 kurzen Schritten ("steps"). Weglassen, wenn es im Abschnitt nichts zu rechnen oder anzuwenden gibt.
${existing.length ? `  - "use": Nummern der VORHANDENEN Karten (siehe unten), die zu diesem Abschnitt gehören. Jede vorhandene Karte genau einem Abschnitt zuordnen.
  - "cards": nur NEUE Karten für Lücken, höchstens 2 pro Abschnitt, oft keine. Keine Doppelungen mit vorhandenen Karten.` : '  - "cards": 4 bis 7 Lernkarten.'} "front" ist eine klare Frage oder kleine Aufgabe (höchstens 120 Zeichen), "back" die kurze eindeutige Antwort (höchstens 80 Zeichen, Brüche als 3/4). Vom Wissen zum Anwenden. Keine zwei Karten mit derselben Antwort.
- "pitfalls": 2 bis 4 typische Fehler in dieser Arbeit, je ein kurzer Satz ("Aufpassen: ...").
- "memo": eine Eselsbrücke oder ein Merkspruch zum Thema, wenn es einen guten gibt, sonst leer.

Sprache: kindgerecht für diese Klassenstufe, kurze Sätze, du-Form, ermutigend, ohne Babysprache. Keine Namen echter Personen aus den Fotos.

${existing.length ? `\nDiese Lernkarten gibt es schon, das Kind hat damit schon geübt. Sie bleiben erhalten:\n${existing.map((c, i) => `${i + 1}. ${c.front} → ${c.back}`).join('\n')}\n` : ''}
Antworte nur mit JSON: {"intro":"...","parts":[{"title":"...","points":["..."],"example":{"task":"...","steps":["..."]},${existing.length ? '"use":[1,2],' : ''}"cards":[{"front":"...","back":"..."}]}],"pitfalls":["..."],"memo":"..."}`;
  const res = await sample.json<any>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map(x => str(x, max)).filter(Boolean).slice(0, n);
  const seen = new Set<string>(existing.map(c => c.back.toLowerCase()));
  const used = new Set<number>();
  const parts = (Array.isArray(res?.parts) ? res.parts : []).slice(0, 6).map((p: any) => {
    const ex = p?.example && str(p.example.task, 300) ? { task: str(p.example.task, 300), steps: list(p.example.steps, 6, 200) } : undefined;
    const cards = (Array.isArray(p?.cards) ? p.cards : []).map((c: any) => ({ front: str(c?.front, 160), back: str(c?.back, 100) }))
      .filter((c: { front: string; back: string }) => c.front && c.back && !seen.has(c.back.toLowerCase()) && (seen.add(c.back.toLowerCase()), true)).slice(0, existing.length ? 3 : 8);
    const use = (Array.isArray(p?.use) ? p.use : []).map((n: unknown) => Math.round(Number(n)) - 1).filter((n: number) => n >= 0 && n < existing.length && !used.has(n) && (used.add(n), true));
    return { title: str(p?.title, 60), points: list(p?.points, 6, 200), example: ex?.steps.length ? ex : undefined, cards, use };
  }).filter((p: { title: string; points: string[]; cards: unknown[] }) => p.title && (p.points.length || p.cards.length));
  if (!parts.length || existing.length + parts.reduce((a: number, p: { cards: unknown[] }) => a + p.cards.length, 0) < 5) throw { code: 'invalid_json' };
  // Vorhandene Karten, die die KI keinem Abschnitt zugeordnet hat, kommen zum letzten Abschnitt
  existing.forEach((_, i) => { if (!used.has(i)) parts[parts.length - 1].use.push(i); });
  return { intro: str(res?.intro, 240), parts, pitfalls: list(res?.pitfalls, 5, 200), memo: str(res?.memo, 200) };
}

export interface GeneratedExam { title: string; minutes: number; questions: Question[]; points: number[]; skills: string[] }
/** Probe-Klassenarbeit aus allen Unterlagen, passend zu Klasse, Schulform und Bundesland. */
export async function generateExam(e: { subject: string; title: string }, photos: string[], who: { name: string; grade?: string; schoolType?: string; state?: string }, signal?: AbortSignal): Promise<GeneratedExam> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  const g = parseInt(who.grade ?? '', 10);
  const prompt = `Du bist eine erfahrene Lehrkraft${who.state ? ` in ${who.state}` : ' in Deutschland'}${who.schoolType ? ` an einem/einer ${who.schoolType}` : ''}.
Erstelle eine realistische PROBE-KLASSENARBEIT zur Vorbereitung für ${who.name}${who.grade ? `, Klasse ${who.grade}` : ''}.
Fach: ${e.subject}. Thema der Klassenarbeit: ${e.title}.
${images.length ? `Dazu ${images.length} Foto(s) mit allen Unterlagen (Heft, Arbeitsblätter, Buchseiten, Tafel). Die Arbeit deckt genau diesen Stoff ab, verteilt über alle Seiten.` : ''}

So soll sie sein:
- Niveau und Aufgabenformate wie in einer echten Klassenarbeit dieser Klassenstufe und Schulform${who.state ? `, nach dem Lehrplan von ${who.state}` : ''}.
- 8 bis 12 Aufgaben, vom Leichten zum Schweren: etwa 40 % Wiedergeben, 40 % Anwenden, 20 % Transfer und Begründen.
- Jede Aufgabe hat "pts" (Punkte, ganze Zahl 1 bis 8, schwerere Aufgaben mehr) und "skill" (Teilkompetenz in 2 bis 5 Wörtern, z. B. "Brüche erweitern").
- "minutes": Bearbeitungszeit wie in der Schule (${g && g <= 4 ? '30 bis 45' : '45, bei viel Stoff 90'}).
- Übernimm die Aufgabenarten aus den Fotos mit neuen Zahlen und Beispielen. Nichts abschreibbar.
- Lösungen kurz und eindeutig, damit Eltern abgleichen können. Brüche als 3/4, gekürzt.
- Keine Namen echter Personen aus den Fotos.

Aufgabentypen wie bei einem Test:
"text": {"type":"text","q":"...","solution":"...","pts":2,"skill":"..."}
"choice": {"type":"choice","q":"...","options":["...","..."],"solution":"...","pts":1,"skill":"..."}
"table": {"type":"table","q":"...","table":{"header":["..."],"rows":[["12","?"]]},"solution":"Wert1 | Wert2","pts":3,"skill":"..."} ("?" = leeres Feld, solution zeilenweise mit " | ")
Optional "figure" als einfache SVG (viewBox 0 0 400 220, nur rect, circle, line, path, polygon, polyline, text, g, Schrift Arial 14 bis 18), nur wenn das Thema Bilder braucht.

Die Arbeit wird auch ausgedruckt und auf Papier geschrieben. Gib deshalb jeder Aufgabe:
- "space": Platz auf dem Blatt: "lines" (Linien zum Schreiben), "grid" (Kästchen zum Rechnen), "blank" (frei zum Zeichnen)
- "size": wie viel Platz, 1 bis 12 (eine Zeile oder ein Zentimeter je Stufe)
${/geometr|mathe/i.test(e.subject + ' ' + e.title) ? `- Bei Geometrie gehören 2 bis 4 Aufgaben zum Zeichnen, Messen oder Konstruieren dazu (Geodreieck, Zirkel), wie in der echten Arbeit. Diese bekommen "paper":true, "space":"blank" und genaue Maße (z. B. "Zeichne ein Dreieck mit a = 5 cm, b = 4 cm, γ = 60°. Miss c."). Am Ende steht immer etwas Messbares, damit es auch digital geht: "solution" ist das Messergebnis mit Einheit (z. B. "c ≈ 4,6 cm").
` : ''}
Antworte nur mit JSON: {"title":"...","minutes":45,"questions":[...]}`;
  const res = await sample.json<any>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const raw: any[] = Array.isArray(res?.questions) ? res.questions : [];
  const out = raw.map(x => ({ q: cleanQuestion(x), pts: Math.min(10, Math.max(1, Math.round(Number(x?.pts) || 2))), skill: str(x?.skill, 40) || e.title })).filter(x => !!x.q).slice(0, 14);
  if (out.length < 3) throw { code: 'invalid_json' };
  const minutes = Math.min(120, Math.max(20, Math.round(Number(res?.minutes) || 45)));
  return { title: str(res?.title, 80) || e.title, minutes, questions: out.map(x => x.q!), points: out.map(x => x.pts), skills: out.map(x => x.skill) };
}

export interface PaperGrade { pts: number[]; notes: string[]; unsure: boolean[]; summary: string }
/** Vorkorrektur einer auf Papier geschriebenen Probe-Arbeit aus Fotos. Nur ein Vorschlag, die Eltern bestätigen. */
export async function gradePaper(sheet: { title: string; questions: Question[]; exam?: { points: number[] } }, photos: string[], who: { name: string; grade?: string }, signal?: AbortSignal): Promise<PaperGrade> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  if (!images.length) throw { code: 'unavailable' };
  const pts = sheet.exam?.points ?? sheet.questions.map(() => 1);
  const list = sheet.questions.map((q, i) => `Aufgabe ${i + 1} (${pts[i]} P.): ${q.q}${q.type === 'table' && q.table ? ` [Tabelle: ${q.table.header.join(' | ')}]` : ''}${q.options ? ` [Auswahl: ${q.options.join(' / ')}]` : ''}\n  Erwartete Lösung: ${q.solution}${q.paper ? '\n  (Zeichnung: Maße und Messergebnis prüfen, 1 bis 2 mm oder 1 bis 2 Grad Abweichung sind ok)' : ''}`).join('\n');
  const prompt = `Du bist eine faire, freundliche Lehrkraft und korrigierst eine Probe-Klassenarbeit von ${who.name}${who.grade ? ` (Klasse ${who.grade})` : ''}: ${sheet.title}.
Auf den ${images.length} Foto(s) ist das handschriftlich ausgefüllte Blatt.

Die Aufgaben mit Musterlösung:
${list}

So korrigierst du:
- Vergib je Aufgabe Punkte von 0 bis zur Höchstpunktzahl, halbe Punkte erlaubt. Richtiger Weg mit kleinem Rechenfehler gibt Teilpunkte.
- Andere richtige Schreibweisen zählen (z. B. 0,75 statt 3/4, wenn nicht ausdrücklich gekürzt verlangt).
- "note": ein kurzer Satz, was richtig oder falsch ist, an die Eltern gerichtet. Ohne Namen von anderen Personen.
- "unsure": true, wenn die Schrift schwer lesbar ist, die Aufgabe nicht auf dem Foto zu sehen ist oder du die Zeichnung nicht sicher prüfen kannst.
- Nicht lesbar oder fehlend: 0 Punkte, unsure true.

Antworte nur mit JSON: {"tasks":[{"pts":2,"note":"...","unsure":false}],"summary":"ein bis zwei Sätze zum Gesamteindruck"} mit genau ${sheet.questions.length} Einträgen in der Reihenfolge der Aufgaben.`;
  const res = await sample.json<any>(prompt, { images, signal, cache: false });
  const tasks: any[] = Array.isArray(res?.tasks) ? res.tasks : [];
  if (!tasks.length) throw { code: 'invalid_json' };
  return {
    pts: pts.map((max, i) => Math.min(max, Math.max(0, Math.round((Number(tasks[i]?.pts) || 0) * 2) / 2))),
    notes: pts.map((_, i) => str(tasks[i]?.note, 200)),
    unsure: pts.map((_, i) => !tasks[i] || tasks[i]?.unsure === true),
    summary: str(res?.summary, 300),
  };
}

/** Prüft am Gerät getippte Antworten gegen die Musterlösung, nach Sinn statt Wortlaut. Bei Probe-Arbeiten mit Teilpunkten. */
export async function checkAnswers(sheet: { title: string; questions: Question[]; exam?: { points: number[] } }, answers: string[], signal?: AbortSignal): Promise<{ ok: boolean[]; notes: string[]; pts?: number[] }> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const max = sheet.exam?.points;
  const list = sheet.questions.map((q, i) => `### Aufgabe ${i + 1}${max ? ` (${max[i]} Punkte)` : ''}
Frage: ${q.q}${q.options ? `\nAuswahl: ${q.options.join(' / ')}` : ''}${q.type === 'table' ? '\n(Tabelle, Werte zeilenweise mit | getrennt)' : ''}
Musterlösung: ${q.solution}
Antwort des Kindes: ${answers[i] || '(leer)'}`).join('\n\n');
  const prompt = `Du bist eine erfahrene, faire Grundschul- und Unterstufenlehrkraft. Du korrigierst die getippten Antworten eines Kindes: ${sheet.title}.
Die Musterlösung ist nur EIN Beispiel für eine richtige Antwort. Bewerte nach Inhalt und Verständnis, nicht nach Wortlaut.

${list}

So bewertest du:
- Richtig ist, was fachlich dasselbe aussagt: andere Worte, Kindersprache, Umschreibungen, Synonyme ("vor den 2 schwarzen" = "links neben den zwei schwarzen Tasten"), andere Reihenfolge, Rechtschreib- und Tippfehler, Groß/Klein, fehlende Einheit wenn eindeutig, 0,75 = 3/4.
- Eine ausführlichere oder knappere Antwort ist richtig, solange der Kern stimmt. Zusätzliche richtige Angaben schaden nicht.
- Bei mehreren Teilen (a, b, ... oder "nenne zwei") jeden Teil einzeln prüfen.
- Bei offenen Fragen ("Wo kann ...", "Nenne ein Beispiel") zählt jede fachlich passende Antwort, auch wenn sie nicht in der Musterlösung steht.
- Falsch ist nur, was fachlich nicht stimmt, fehlt oder die Frage verfehlt.
${max ? `- "pts": Punkte von 0 bis zur Höchstpunktzahl, halbe Punkte erlaubt. Jeder richtige Teil gibt seinen Anteil. Ganz richtig = volle Punkte.
` : ''}- "ok": true, wenn die Antwort im Kern richtig ist${max ? ' (mindestens die Hälfte der Punkte)' : ''}.
- "note": ein kurzer Satz an die Eltern: was stimmt, was fehlt.

Denke jede Aufgabe kurz durch, antworte dann nur mit JSON: {"tasks":[{"ok":true,${max ? '"pts":2,' : ''}"note":"..."}]} mit genau ${sheet.questions.length} Einträgen in der Reihenfolge der Aufgaben.`;
  const res = await sample.json<any>(prompt, { signal, cache: false });
  const tasks: any[] = Array.isArray(res?.tasks) ? res.tasks : [];
  if (tasks.length !== sheet.questions.length) throw { code: 'invalid_json' };
  const pts = max ? max.map((m, i) => Math.min(m, Math.max(0, Math.round((Number(tasks[i]?.pts) || 0) * 2) / 2))) : undefined;
  return { ok: tasks.map((x, i) => (pts ? pts[i] >= max![i] / 2 : x?.ok === true)), notes: tasks.map(x => str(x?.note, 200)), ...(pts ? { pts } : {}) };
}

const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

/** Prüft eine Aufgabe der KI und wirft unbrauchbare Teile weg. */
function cleanQuestion(x: any): Question | null {
  const q = str(x?.q), solution = str(x?.solution);
  if (!q || !solution) return null;
  const figure = typeof x?.figure === 'string' && x.figure.trim().startsWith('<svg') ? x.figure.slice(0, 20000) : undefined;
  if (x?.type === 'choice' && Array.isArray(x.options)) {
    const options = x.options.map((o: unknown) => str(o, 120)).filter(Boolean).slice(0, 5);
    if (options.length >= 2 && options.includes(solution)) return { type: 'choice', q, solution, options, figure, ...paperOf(x) };
  }
  if (x?.type === 'table' && Array.isArray(x?.table?.rows)) {
    const header = (Array.isArray(x.table.header) ? x.table.header : []).map((h: unknown) => str(h, 40)).slice(0, 8);
    const rows: string[][] = x.table.rows.slice(0, 10).map((r: unknown) => (Array.isArray(r) ? r.map(c => str(c, 40)).slice(0, 8) : []));
    const blanks = rows.flat().filter(c => c === '?').length;
    if (blanks > 0 && solution.split('|').length === blanks) return { type: 'table', q, solution, table: { header, rows }, figure, ...paperOf(x) };
  }
  return { type: 'text', q, solution, figure, ...paperOf(x) };
}

/** Angaben für die Druckversion */
function paperOf(x: any): Pick<Question, 'space' | 'size' | 'paper'> {
  const space = ['lines', 'grid', 'blank'].includes(x?.space) ? x.space : undefined;
  const size = Number(x?.size) > 0 ? Math.min(12, Math.round(Number(x.size))) : undefined;
  return { ...(space ? { space } : {}), ...(size ? { size } : {}), ...(x?.paper === true ? { paper: true } : {}) };
}

export interface ExtractedVocab { title: string; lang: string; cards: { front: string; back: string }[] }

/** Liest Vokabeln von Fotos einer Buchseite oder eines Vokabelhefts. Nur wo die KI verfügbar ist. */
/** Vokabelverzeichnis eines Schulbuchs abschreiben, mit Unit-Zuordnung. lastUnit hilft, wenn eine Seite mitten in einer Unit beginnt. */
export async function extractVocabBook(photos: string[], langHint: string, lastUnit: string | undefined, signal?: AbortSignal): Promise<{ unit: string; front: string; back: string }[]> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  if (!images.length) throw { code: 'image_rejected' };
  const prompt = `Die Fotos zeigen Seiten aus dem Vokabelverzeichnis eines Schulbuchs (${langHint || 'Englisch'}), in der Reihenfolge der Seiten.
Lies ALLE Vokabeln vollständig ab und ordne jede ihrer Unit, Lektion oder ihrem Kapitel zu.
- "unit": die Überschrift so kurz wie möglich, z. B. "Unit 1", "Lektion 3", "Welcome". Beginnt eine Seite ohne Überschrift, gehört sie zur vorigen Unit${lastUnit ? ` (zuletzt war das "${lastUnit}")` : ''}.
- "front": Wort oder Wendung in der Fremdsprache, wie es dasteht, inklusive "to" bei Verben oder Artikel.
- "back": die deutsche Bedeutung, mehrere mit ", " getrennt.
- Lautschrift, Seitenzahlen und Beispielsätze weglassen. Nichts erfinden, Unleserliches weglassen.
Antworte nur mit JSON: {"cards":[{"unit":"Unit 1","front":"...","back":"..."}]}`;
  const res = await sample.json<{ cards: { unit: string; front: string; back: string }[] }>(prompt, { images, signal, cache: false });
  const cards = (Array.isArray(res?.cards) ? res.cards : [])
    .map(c => ({ unit: str(c?.unit, 40) || lastUnit || 'Ohne Unit', front: str(c?.front, 120), back: str(c?.back, 120) }))
    .filter(c => c.front && c.back)
    .slice(0, 800);
  if (!cards.length) throw { code: 'invalid_json' };
  return cards;
}

/** Rezept aus Fotos oder Screenshots (Kochbuch, Cookidoo, Webseite) abschreiben. */
export async function extractRecipe(photos: string[], signal?: AbortSignal): Promise<{ title: string; ingredients: string[]; steps: string; dish?: { img: number; box: [number, number, number, number] } }> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, Math.min(6, limits.images?.maxCount ?? 0)))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  if (!images.length) throw { code: 'image_rejected' };
  const prompt = `Auf den Bildern ist ein Kochrezept (Foto aus einem Kochbuch oder Screenshot einer App oder Webseite, z. B. Cookidoo/Thermomix).
Schreib es vollständig ab, nichts erfinden:
- "title": Name des Gerichts
- "ingredients": Zutaten mit Menge, eine pro Eintrag, z. B. "250 g Mehl"
- "steps": Zubereitung als nummerierte Schritte, je Schritt eine Zeile. Thermomix-Angaben (Zeit, Temperatur, Stufe) übernehmen.
- "dish": Falls auf einem Bild ein Foto des fertigen Gerichts zu sehen ist: {"img": Index des Bildes ab 0, "box": [links, oben, rechts, unten] als Anteile 0 bis 1}, eng um das Foto des Gerichts ohne Text und Ränder. Sonst null.
Antworte nur mit JSON: {"title":"...","ingredients":["..."],"steps":"1. ...\\n2. ...","dish":null}`;
  const res = await sample.json<any>(prompt, { images, signal, cache: false });
  const ingredients = (Array.isArray(res?.ingredients) ? res.ingredients : []).map((x: unknown) => str(x, 120)).filter(Boolean).slice(0, 60);
  const title = str(res?.title, 80);
  if (!title && !ingredients.length) throw { code: 'invalid_json' };
  const b = res?.dish?.box;
  const okBox = Array.isArray(b) && b.length === 4 && b.every((x: unknown) => typeof x === 'number' && x >= 0 && x <= 1) && b[2] - b[0] > 0.15 && b[3] - b[1] > 0.08;
  const img = Number(res?.dish?.img ?? 0);
  return { title, ingredients, steps: str(res?.steps, 4000), dish: okBox && img >= 0 && img < images.length ? { img, box: b as [number, number, number, number] } : undefined };
}

export async function extractVocab(photos: string[], langHint: string, signal?: AbortSignal): Promise<ExtractedVocab> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(photos.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  if (!images.length) throw { code: 'image_rejected' };
  const prompt = `Auf den Fotos ist eine Vokabelliste aus einem Schulbuch oder Vokabelheft eines deutschen Schulkinds.
Lies ALLE Vokabeln vollständig ab, in der Reihenfolge der Seite.
- "front": das Wort oder die Wendung in der Fremdsprache (${langHint || 'meist Englisch'}), so wie es dasteht, inklusive Zusätzen wie "to" bei Verben oder Artikel.
- "back": die deutsche Bedeutung. Mehrere Bedeutungen mit ", " trennen.
- Lautschrift, Seitenzahlen, Beispielsätze und Unit-Überschriften weglassen.
- Nichts erfinden. Unleserliches weglassen.
- "lang": die Fremdsprache auf Deutsch, z. B. "Englisch", "Französisch", "Latein".
- "title": kurzer Titel, z. B. die Unit oder das Thema der Seite ("Unit 3: At school").
Antworte nur mit JSON: {"title":"...","lang":"...","cards":[{"front":"...","back":"..."}]}`;
  const res = await sample.json<ExtractedVocab>(prompt, { images, signal, cache: false });
  const cards = (Array.isArray(res?.cards) ? res.cards : [])
    .map(c => ({ front: str(c?.front, 120), back: str(c?.back, 120) }))
    .filter(c => c.front && c.back)
    .slice(0, 150);
  if (!cards.length) throw { code: 'invalid_json' };
  return { title: str(res?.title, 60), lang: str(res?.lang, 30), cards };
}

export interface LetterEvent { title: string; date: string; time?: string; end?: string; note?: string; child?: string; icon?: string }

/** Liest Termine aus Fotos eines Elternbriefs, einer Einladung oder eines Aushangs. */
export async function extractLetter(files: string[], kids: { name: string; grade?: string }[], todayIso: string, signal?: AbortSignal, text = ''): Promise<{ summary: string; events: LetterEvent[] }> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = (await loadPhotos(files.slice(0, limits.images?.maxCount ?? 0))).map(dataUrlToBlob).filter((b): b is Blob => !!b);
  const body = text.trim().slice(0, 15000);
  if (!images.length && !body) throw { code: 'image_rejected' };
  const prompt = `${images.length ? 'Anbei ein Elternbrief, eine Einladung oder ein Aushang (Schule, Kita, Verein) als Foto oder PDF.' : 'Unten steht der Text eines Elternbriefs, einer Einladung oder eines Aushangs (Schule, Kita, Verein).'}
Heute ist ${todayIso}. Kinder der Familie: ${kids.map(k => `${k.name}${k.grade ? ` (Klasse ${k.grade})` : ''}`).join(', ') || 'unbekannt'}.

Finde ALLE Termine mit Datum (Ausflug, Elternabend, Wandertag, Fotograf, Abgabefrist, Feier, unterrichtsfrei ...).
- "date": YYYY-MM-DD. Fehlt das Jahr, nimm das nächste passende Datum ab heute.
- "time"/"end": HH:MM, nur wenn angegeben.
- "title": kurz und klar, z. B. "Wandertag Klasse 4b".
- "note": was man mitbringen, bezahlen, unterschreiben oder beachten muss, kurz. Sonst weglassen.
- "child": Name des Kindes aus der Liste, wenn der Brief klar zu einer Klasse oder einem Namen passt. Sonst weglassen.
- "icon": ein passendes Emoji.
- Nichts erfinden. Keine Termine ohne Datum.
"summary": ein Satz, worum es im Brief geht.
Antworte nur mit JSON: {"summary":"...","events":[{"title":"...","date":"YYYY-MM-DD","time":"HH:MM","end":"HH:MM","note":"...","child":"...","icon":"..."}]}${body ? `\n\n--- Text des Briefs ---\n${body}` : ''}`;
  const res = await sample.json<{ summary: string; events: LetterEvent[] }>(prompt, { images: images.length ? images : undefined, signal, cache: false });
  const hm = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, '0') : undefined);
  const events = (Array.isArray(res?.events) ? res.events : [])
    .map(e => ({ title: str(e?.title, 80), date: str(e?.date, 10), time: hm(e?.time), end: hm(e?.end), note: str(e?.note, 200) || undefined, child: str(e?.child, 40) || undefined, icon: str(e?.icon, 8) || undefined }))
    .filter(e => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .slice(0, 20);
  return { summary: str(res?.summary, 200), events };
}

/** Stundenplan aus Foto oder PDF lesen. Ergebnis landet im Bearbeiten-Modus, die Eltern prüfen vor dem Speichern. */
export async function readTimetable(file: string, childName: string, grade?: string): Promise<{ plan: import('../data/types').Timetable; bells?: string[] }> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const blob = dataUrlToBlob(file);
  if (!blob) throw { code: 'image_rejected' };
  const prompt = `Das Bild oder PDF zeigt den Stundenplan von ${childName}${grade ? ` (Klasse ${grade})` : ''}.
Lies für Montag bis Freitag die Fächer in der Reihenfolge der Stunden aus.

Regeln:
- Fächer so kurz, wie sie im Plan stehen (z. B. "Mathe", "D", "Sport"). Bei Doppelstunden das Fach zweimal eintragen.
- Freistunden oder Pausen zwischen Fächern als "" eintragen, damit die Stundennummern stimmen. Pausen selbst nicht als Stunde zählen.
- Stehen in einer Zelle mehrere Fächer (Gruppen, A/B-Woche), schreib sie mit "/" zusammen, z. B. "Reli/Ethik".
- from = Beginn der ersten Stunde, to = Ende der letzten Stunde an diesem Tag, im Format HH:MM. Wenn keine Uhrzeiten zu sehen sind, lass from und to weg.
- Tage ohne Unterricht weglassen. Nichts erfinden, was nicht im Plan steht.
- "bells": Wenn der Plan Uhrzeiten je Stunde zeigt, das ENDE jeder Stunde der Reihe nach (1. Stunde zuerst), z. B. ["08:40","09:25"]. Sonst weglassen.
- Ist es erkennbar kein Stundenplan, antworte {"error":"kein_stundenplan"}.

Antwortformat:
{"days":{"1":{"from":"07:55","to":"13:10","lessons":["Mathe","Mathe","Deutsch","","Sport"]},"2":{...}},"bells":["08:40","09:25"]}
Schlüssel: 1 = Montag bis 5 = Freitag.`;
  const res = await sample.json<{ days?: Record<string, { from?: string; to?: string; lessons?: string[] }>; bells?: string[]; error?: string }>(prompt, { images: [blob], cache: false });
  if (res?.error || !res?.days) throw { code: 'no_timetable' };
  const time = (t?: string) => (t && /^\d{1,2}:\d{2}$/.test(t.trim()) ? t.trim().padStart(5, '0') : undefined);
  const out: import('../data/types').Timetable = {};
  for (const k of ['1', '2', '3', '4', '5'] as const) {
    const d = res.days[k];
    if (!d) continue;
    const lessons = (Array.isArray(d.lessons) ? d.lessons : []).slice(0, 12).map(l => String(l ?? '').trim().slice(0, 30));
    while (lessons.length && !lessons[lessons.length - 1]) lessons.pop();
    if (!lessons.length && !d.from) continue;
    out[k] = { from: time(d.from), to: time(d.to), lessons: lessons.length ? lessons : undefined };
  }
  if (!Object.keys(out).length) throw { code: 'no_timetable' };
  const bells = (Array.isArray(res.bells) ? res.bells : []).map(b => time(String(b ?? ''))).slice(0, 12);
  return { plan: out, bells: bells.length && bells.every(Boolean) ? (bells as string[]) : undefined };
}

/** Prüft Fach und Thema einer Klassenarbeit auf Rechtschreibfehler. Gibt null zurück, wenn alles stimmt. */
export async function spellCheckExam(subject: string, title: string): Promise<{ subject: string; title: string } | null> {
  const sample = await getSample();
  if (!sample?.json) return null;
  const r = await sample.json<{ subject: string; title: string }>(
    `Ein Schulkind hat Fach und Thema einer Klassenarbeit eingetippt. Korrigiere NUR Rechtschreibung, Getrennt-/Zusammenschreibung und Groß-/Kleinschreibung. Ändere keine Wörter inhaltlich, kürze nichts, ergänze nichts. Übliche Fach-Abkürzungen wie "Bio", "Mathe", "Reli", "Geo" bleiben so.\n\nFach: ${JSON.stringify(subject)}\nThema: ${JSON.stringify(title)}\n\nAntworte nur mit JSON: {"subject": "...", "title": "..."}`);
  const fs = String(r?.subject ?? subject).trim() || subject, ft = String(r?.title ?? title).trim() || title;
  return fs === subject && ft === title ? null : { subject: fs, title: ft };
}

/** Merkhilfen für mehrere Vokabeln in einem Aufruf: kurzer Beispielsatz, Übersetzung, Eselsbrücke. */
export async function generateHints(cards: { id: string; front: string; back: string }[], lang: string, signal?: AbortSignal): Promise<Record<string, { ex: string; de: string; memo?: string }>> {
  const sample = await getSample();
  if (!sample?.json) throw { code: 'unavailable' };
  const list = cards.map((c, i) => `${i + 1}. ${c.front} = ${c.back}`).join('\n');
  const prompt = `Du hilfst einem deutschen Schulkind (ca. 10 bis 13 Jahre), ${lang || 'Englisch'}-Vokabeln zu behalten.
Gib für jede Vokabel:
- "ex": einen kurzen, lustigen oder bildhaften Beispielsatz in der Fremdsprache (höchstens 10 Wörter, einfache Grammatik, Wort genau so verwenden),
- "de": die deutsche Übersetzung des Satzes,
- "memo": eine kurze Eselsbrücke auf Deutsch (Klang, Bild oder Ähnlichkeit zu einem deutschen Wort), höchstens 15 Wörter. Wenn dir keine gute einfällt, lass "memo" weg statt etwas Erzwungenes.
Keine Namen echter Personen, nichts Gruseliges.

${list}

Antworte nur mit JSON: {"hints":[{"n":1,"ex":"...","de":"...","memo":"..."}]}`;
  const res = await sample.json<{ hints: { n: number; ex: string; de: string; memo?: string }[] }>(prompt, { signal });
  const out: Record<string, { ex: string; de: string; memo?: string }> = {};
  for (const h of Array.isArray(res?.hints) ? res.hints : []) {
    const c = cards[(Number(h?.n) || 0) - 1];
    const ex = str(h?.ex, 160), de = str(h?.de, 160), memo = str(h?.memo, 160);
    if (c && ex && de) out[c.id] = memo ? { ex, de, memo } : { ex, de };
  }
  return out;
}

/** Schiedsrichter für Schreibantworten, die die App selbst als falsch werten würde. Kleines Modell, eigenes Kontingent. null = nicht erreichbar. */
export async function judgeAnswer(word: string, solution: string, answer: string, lang: string, toForeign: boolean): Promise<{ ok: boolean; note?: string } | null> {
  if (!cloudEnabled || !(await getLink().catch(() => null))) return null;
  const req = sb().functions.invoke('familie', { body: { action: 'judge', word, solution, answer, lang, dir: toForeign ? 'to_foreign' : 'to_german' } })
    .then(({ data, error }) => (error ? null : parseJsonLoose<{ ok: boolean; note?: string }>(String((data as any)?.text ?? ''))))
    .catch(() => null);
  const timeout = new Promise<null>(ok => setTimeout(() => ok(null), 8000));
  const r = await Promise.race([req, timeout]);
  return r && typeof r.ok === 'boolean' ? { ok: r.ok, note: r.note ? String(r.note).slice(0, 120) : undefined } : null;
}

/**
 * Wochenplan-Vorschlag: ein einziger KI-Aufruf für alle freien Plätze der Woche.
 * Schickt nur Gerichtsnamen, Bewertungen und anonyme Unverträglichkeiten (keine Namen).
 */
export async function suggestWeek(input: {
  slots: { date: string; slot: 'mittag' | 'abend' | 'fruehstueck'; weekday: string }[];
  planned: string[];
  recipes: { title: string; score: number; last?: string }[];
  diet: string;
  people: number;
  wish?: string;
}, signal?: AbortSignal): Promise<import('../data/types').MealIdea[]> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const fam = input.recipes.slice(0, 60).map(r => `- ${r.title}${r.score ? ` (Bewertung ${r.score > 0 ? '+' : ''}${r.score})` : ''}${r.last ? `, zuletzt ${r.last}` : ''}`).join('\n') || '(noch keine)';
  const prompt = `Plane abwechslungsreiche Familienessen für ${input.people} Personen (Kinder dabei).
Freie Plätze (nur diese füllen):
${input.slots.map(x => `- ${x.date} (${x.weekday}) ${x.slot}`).join('\n')}
Schon geplant diese Woche: ${input.planned.join(', ') || 'nichts'}

Lieblingsgerichte der Familie (positive Bewertung = beliebt, negative = eher meiden):
${fam}

Einschränkungen (unbedingt einhalten, auch versteckte Zutaten):
${input.diet || 'keine'}
${input.wish ? `Wunsch der Eltern: ${input.wish.slice(0, 300)}\n` : ''}
Regeln:
- Etwa zwei Drittel aus den Lieblingsgerichten, der Rest neue, kindertaugliche Ideen (unter 45 Minuten, normale Supermarkt-Zutaten).
- Abwechslung: nicht zweimal dieselbe Beilage hintereinander, höchstens 2× Nudeln, mindestens die Hälfte mit Gemüse, ein Fischgericht wenn die Einschränkungen es erlauben, mindestens ein vegetarischer Tag.
- Mittags eher schnell und leicht, abends darf es aufwendiger sein.
- Kein Gericht doppelt in der Woche. Lieblingsgerichte genau so schreiben wie in der Liste.
- Bei neuen Ideen: Zutaten mit Menge für die Personenzahl und kurze Zubereitung in 3 bis 6 nummerierten Schritten.
- "why": ein kurzer, freundlicher Grund (max. 8 Wörter), z. B. "Gemüse-Tag" oder "lange nicht gegessen".
Antworte nur mit JSON: {"items":[{"date":"YYYY-MM-DD","slot":"abend","title":"...","isNew":false,"why":"..."},{"date":"...","slot":"mittag","title":"...","isNew":true,"ingredients":["400 g ..."],"steps":"1. ...\\n2. ...","why":"..."}]}`;
  const res = await sample.json<any>(prompt, { signal, cache: false });
  const ok = new Set(input.slots.map(x => x.date + x.slot));
  const items = (Array.isArray(res?.items) ? res.items : []).map((x: any) => ({
    date: str(x?.date, 10), slot: (['mittag', 'abend', 'fruehstueck'].includes(x?.slot) ? x.slot : 'abend') as 'mittag' | 'abend' | 'fruehstueck',
    title: str(x?.title, 80), isNew: !!x?.isNew,
    ingredients: x?.isNew && Array.isArray(x?.ingredients) ? x.ingredients.map((y: unknown) => str(y, 120)).filter(Boolean).slice(0, 30) : undefined,
    steps: x?.isNew ? str(x?.steps, 2000) || undefined : undefined,
    why: str(x?.why, 80) || undefined,
  })).filter((x: { date: string; slot: string; title: string }) => x.title && ok.has(x.date + x.slot));
  if (!items.length) throw { code: 'invalid_json' };
  return items;
}

/**
 * Rezeptvorschläge: ein einziger Aufruf mit dem günstigen Modell (fast).
 * Schickt nur Gerichtsnamen, Bewertungen, Monat und anonyme Unverträglichkeiten (keine Namen, keine Fotos).
 */
export async function suggestDishes(input: {
  month: string; people: number; diet: string; liked: string[]; disliked: string[]; have: string[]; planned: string[]; wish?: string; n?: number;
}, signal?: AbortSignal): Promise<import('../data/types').DishIdea[]> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const n = input.n ?? 6;
  const prompt = `Schlage ${n} NEUE Gerichte für eine deutsche Familie mit ${input.people} Personen (Kinder dabei) vor.
Monat: ${input.month} (Saison in Deutschland beachten: Gemüse und Obst, das jetzt Saison hat, passende Jahreszeit-Küche).
Einschränkungen (unbedingt einhalten, auch versteckte Zutaten wie Butter, Sahne, Ei, Mehl, Sojasauce):
${input.diet || 'keine'}
Das mag die Familie besonders (Geschmack treffen, aber nicht kopieren): ${input.liked.slice(0, 15).join(', ') || 'noch unbekannt'}
Das mag sie eher nicht: ${input.disliked.slice(0, 10).join(', ') || 'nichts bekannt'}
Diese Woche schon geplant (Abwechslung dazu, keine gleiche Hauptzutat oder Beilage): ${input.planned.slice(0, 14).join(', ') || 'nichts'}
Gibt es schon, NICHT wieder vorschlagen: ${input.have.slice(0, 80).join(', ') || 'nichts'}
${input.wish ? `Wunsch oder vorhandene Zutaten der Eltern: ${input.wish.slice(0, 200)}\n(Passt ein Wunsch nicht zu den Einschränkungen, ersetze die Zutat, z. B. laktosefreie Sahne oder Pflanzensahne, und schreibe das in die Zutatenliste.)\n` : ''}Regeln:
- Alltagstauglich: unter 45 Minuten Arbeit, normale Supermarkt-Zutaten, kindertauglich.
- Bunt gemischt: höchstens ein Nudel- und ein Reisgericht, mindestens ein vegetarisches, möglichst ein Gemüse- oder Ofengericht.
- Deutsche Gerichtsnamen, kurz (max. 5 Wörter).
- Zutaten mit Menge für ${input.people} Personen, kurze Zubereitung in 3 bis 6 nummerierten Schritten.
- "why": kurzer freundlicher Grund (max. 8 Wörter), z. B. "Saisonal: Kürbis" oder "Ofen, wenig Arbeit".
- "time": Gesamtdauer, z. B. "30 Min.".
Antworte nur mit JSON: {"items":[{"title":"...","why":"...","time":"30 Min.","ingredients":["400 g ..."],"steps":"1. ...\\n2. ..."}]}`;
  const res = await sample.json<any>(prompt, { signal, cache: false, fast: true });
  const have = new Set(input.have.map(x => x.trim().toLowerCase()));
  const items = (Array.isArray(res?.items) ? res.items : []).map((x: any, i: number) => ({
    id: `${Date.now().toString(36)}${i}`, title: str(x?.title, 80), why: str(x?.why, 80) || undefined, time: str(x?.time, 20) || undefined,
    ingredients: (Array.isArray(x?.ingredients) ? x.ingredients : []).map((y: unknown) => str(y, 120)).filter(Boolean).slice(0, 30),
    steps: str(x?.steps, 2000) || undefined,
  })).filter((x: { title: string; ingredients: string[] }) => x.title && x.ingredients.length && !have.has(x.title.toLowerCase())).slice(0, n);
  if (!items.length) throw { code: 'invalid_json' };
  return items;
}
