import { Question, Topic } from '../data/types';
import { cloudEnabled, getLink, sb } from '../data/cloud';

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

function serverSample(): SampleFn {
  const call = async (input: string, opts?: any): Promise<string> => {
    const images = await Promise.all(((opts?.images ?? []) as Blob[]).map(blobToDataUrl));
    const signal: AbortSignal | undefined = opts?.signal;
    if (signal?.aborted) throw { code: 'cancelled' };
    const req = sb().functions.invoke('familie', { body: { action: 'ai', prompt: input, images } }).then(async ({ data, error }) => {
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
  daily_limit: 'Für heute ist das KI-Limit der Familie erreicht (30 Aufrufe). Morgen geht es weiter.',
  not_member: 'Dieses Gerät ist mit keiner Familie verbunden.',
  not_signed_in: 'Dieses Gerät ist nicht angemeldet.',
  ai_down: 'Die KI ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.',
};

export interface QA { q: string; a: string }
/** Kind fragt zum Unterrichtsstoff nach. Die KI erklärt kindgerecht mit Blick auf die Fotos, löst aber keine Hausaufgaben vor. */
export async function askTopic(topic: Topic, photos: string[], childName: string, grade: string | undefined, history: QA[], question: string, signal?: AbortSignal): Promise<string> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = photos.slice(0, limits.images?.maxCount ?? 0).map(dataUrlToBlob).filter((b): b is Blob => !!b);
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

export interface GeneratedExam { title: string; minutes: number; questions: Question[]; points: number[]; skills: string[] }
/** Probe-Klassenarbeit aus allen Unterlagen, passend zu Klasse, Schulform und Bundesland. */
export async function generateExam(e: { subject: string; title: string }, photos: string[], who: { name: string; grade?: string; schoolType?: string; state?: string }, signal?: AbortSignal): Promise<GeneratedExam> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = photos.slice(0, limits.images?.maxCount ?? 0).map(dataUrlToBlob).filter((b): b is Blob => !!b);
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
  const images = photos.slice(0, limits.images?.maxCount ?? 0).map(dataUrlToBlob).filter((b): b is Blob => !!b);
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

export async function extractVocab(photos: string[], langHint: string, signal?: AbortSignal): Promise<ExtractedVocab> {
  const sample = await getSample();
  if (!sample) throw { code: 'unavailable' };
  const limits = await sample.limits().catch(() => ({} as { images?: { maxCount: number } }));
  const images = photos.slice(0, limits.images?.maxCount ?? 0).map(dataUrlToBlob).filter((b): b is Blob => !!b);
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
  const images = files.slice(0, limits.images?.maxCount ?? 0).map(dataUrlToBlob).filter((b): b is Blob => !!b);
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
