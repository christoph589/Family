// Familienplaner: Kalender-Abos und KI
//
// GET  /familie?ics=<token>          Familienkalender als iCal-Abo (für iPhone, Mac, Google, Outlook)
// POST /familie {action:'import', url} Fremden Kalender (iCal-Link) einlesen, nur für angemeldete Geräte
// POST /familie {action:'push_key' | 'push_sub' | 'push_test'}  Erinnerungen aufs Handy (Web-Push), braucht fix-05-erinnerungen.sql
// POST /familie {action:'icloud_calendars' | 'icloud_events' | 'icloud_save' | 'icloud_delete'} iCloud-Kalender lesen und schreiben (Secrets ICLOUD_USER, ICLOUD_APP_PASSWORD)
// POST /familie {action:'tick', token}  kommt alle 5 Minuten vom Zeitplan aus fix-05 und verschickt fällige Erinnerungen
// POST /familie {action:'ai', prompt, images} KI-Test und Vokabel-Foto, nur für Mitglieder einer Familie,
//      höchstens AI_DAILY Aufrufe pro Familie und Tag. Braucht das Secret ANTHROPIC_API_KEY und fix-03-ki.sql.
//      Zusätzlich Obergrenze für alle Familien zusammen: Secret AI_GLOBAL_DAILY_USD (Standard 10 US-Dollar pro Tag).
//
// Einspielen: Supabase Dashboard > Edge Functions > Deploy a new function > Via Editor,
// Name "familie", diesen Code einfügen, Deploy. Danach bei der Funktion
// "Enforce JWT Verification" ausschalten (Kalender-Apps schicken keinen Login mit).
// Die Funktion prüft den Login für den Import selbst.

import ICAL from 'npm:ical.js@1.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0';
import webpush from 'npm:web-push@3.6.7';
import { AsyncLocalStorage } from 'node:async_hooks';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const TZ = 'Europe/Berlin';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

// Nur bekannte Kalenderdienste, damit die Funktion nicht als offener Proxy taugt
// Jeder öffentliche Kalender-Link ist erlaubt (Apple, Google, Outlook, WebUntis, Müllkalender der Stadt, Verein …).
// Gesperrt sind nur Adressen, die ins interne Netz zeigen könnten: IP-Adressen, localhost, Namen ohne Punkt.
function publicHost(host: string) {
  if (!host.includes('.') || host === 'localhost' || /\.(local|internal|localhost|lan|home|intranet)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return false;
  return true;
}
async function fetchPublic(raw: string) {
  let url = raw;
  for (let i = 0; i < 4; i++) {
    const p = new URL(url);
    if (!['https:', 'http:'].includes(p.protocol) || !publicHost(p.hostname.toLowerCase())) throw new Error('host_not_allowed');
    const r = await fetch(url, { headers: { accept: 'text/calendar, */*' }, redirect: 'manual' });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
    return r;
  }
  throw new Error('fetch_failed');
}

// ---------- Rezept per Link übernehmen (ohne KI) ----------
// Liest das schema.org-Rezept (JSON-LD), das fast alle Rezeptseiten mitliefern: Name, Zutaten, Schritte, Bild.
// Das Bild wird nur für die eigene Familie gespeichert (Privatgebrauch), die Quelle bleibt am Rezept vermerkt.

async function fetchPage(raw: string, accept: string, max: number): Promise<{ bytes: Uint8Array; type: string; url: string }> {
  let url = raw;
  for (let i = 0; i < 5; i++) {
    const p = new URL(url);
    if (!['https:', 'http:'].includes(p.protocol) || !publicHost(p.hostname.toLowerCase())) throw new Error('host_not_allowed');
    const r = await fetch(url, { headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; Famelio-Rezeptimport)', 'accept-language': 'de-DE,de;q=0.9' }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
    if (!r.ok) throw new Error('fetch_failed');
    const len = Number(r.headers.get('content-length') ?? 0);
    if (len > max) throw new Error('too_big');
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > max) throw new Error('too_big');
    return { bytes, type: r.headers.get('content-type') ?? '', url };
  }
  throw new Error('fetch_failed');
}

const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const unHtml = (t: string) => t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();

const isRecipeType = (t: unknown) => (Array.isArray(t) ? t : [t]).some(x => typeof x === 'string' && /(^|[/#])Recipe$/i.test(x));
function findRecipe(node: any, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x, depth + 1); if (r) return r; } return null; }
  if (isRecipeType(node['@type'])) return node;
  return findRecipe(node['@graph'], depth + 1) ?? findRecipe(node.mainEntity, depth + 1) ?? findRecipe(node.mainEntityOfPage, depth + 1) ?? findRecipe(node.itemListElement, depth + 1) ?? findRecipe(node.item, depth + 1) ?? null;
}
/** HTML-Text mit Zeilenumbrüchen an Absätzen und Listen, Entities aufgelöst */
const lineHtml = (t: string) => t.replace(/<\/?(br|p|li|div|ol|ul)\b[^>]*>/gi, '\n');
const unEnt = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function stepsOf(x: any): string[] {
  if (!x) return [];
  if (typeof x === 'string') return lineHtml(x).split(/\n+/).map(unHtml).filter(Boolean);
  if (Array.isArray(x)) return x.flatMap(stepsOf);
  if (x.itemListElement) return stepsOf(x.itemListElement);
  if (x.text) return stepsOf(String(x.text));
  if (x.name && typeof x.name === 'string' && /HowToStep/i.test(String(x['@type']))) return [unHtml(x.name)];
  return [];
}
function imageOf(x: any): string | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) {
    // das größte Bild bevorzugen, wenn Maße angegeben sind
    const withW = x.map(imageOf).filter(Boolean) as string[];
    const sized = x.filter((i: any) => i && typeof i === 'object' && Number(i.width) > 0).sort((a: any, b: any) => Number(b.width) - Number(a.width))[0];
    return (sized && imageOf(sized)) || withW[0];
  }
  return x.url ?? x.contentUrl;
}
/** Zutaten: neues (recipeIngredient) und altes Schema (ingredients), Text oder Liste */
function ingredientsOf(rec: any): string[] {
  const raw = rec?.recipeIngredient ?? rec?.ingredients ?? [];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? lineHtml(raw).split(/\n+/) : [];
  return list.flatMap((x: any) => (typeof x === 'string' ? [x] : typeof x?.text === 'string' ? [x.text] : typeof x?.name === 'string' ? [x.name] : []))
    .map((x: string) => unHtml(x).slice(0, 120)).filter(Boolean).slice(0, 60);
}
/** ISO-Dauer wie PT1H30M als „1 Std. 30 Min.“ */
function durationOf(x: unknown): string | undefined {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(x ?? ''));
  if (!m || (!m[1] && !m[2])) return undefined;
  return [m[1] && `${m[1]} Std.`, m[2] && `${m[2]} Min.`].filter(Boolean).join(' ');
}
/** Reservewege, wenn die Seite kein JSON-LD hat: Microdata (itemprop) und Standard-Überschriften */
function microdataRecipe(html: string): any | null {
  const props = (name: string) => [...html.matchAll(new RegExp(`<[^>]+itemprop=["']${name}["'][^>]*>([\\s\\S]*?)</(?:li|span|p|div|h\\d)>`, 'gi'))].map(m => unHtml(m[1])).filter(Boolean);
  const ing = props('recipeIngredient').length ? props('recipeIngredient') : props('ingredients');
  if (!ing.length) return null;
  const steps = props('recipeInstructions');
  return { '@type': 'Recipe', name: props('name')[0], recipeIngredient: ing, recipeInstructions: steps };
}
/** JSON-LD tolerant lesen: kaputte Zeilenumbrüche in Texten, HTML-Kommentare und CDATA drumherum */
function parseLd(raw: string): unknown {
  const t = raw.trim().replace(/^<!--|-->$/g, '').replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, '').trim();
  try { return JSON.parse(t); } catch { /* nächster Versuch */ }
  return JSON.parse(t.replace(/[\u0000-\u001f]+/g, ' '));
}

async function recipeImport(body: any) {
  let url = String(body.url ?? '').trim();
  try { url = new URL(url).toString(); } catch { return json({ error: 'bad_url' }, 400); }
  let page;
  try { page = await fetchPage(url, 'text/html,application/xhtml+xml', 4_000_000); }
  catch (e) { return json({ error: (e as Error).message === 'host_not_allowed' ? 'host_not_allowed' : 'fetch_failed' }, 400); }
  const charset = /charset=["']?([\w-]+)/i.exec(page.type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(page.bytes.subarray(0, 4000)))?.[1] ?? 'utf-8';
  let html: string;
  try { html = new TextDecoder(charset).decode(page.bytes); } catch { html = new TextDecoder().decode(page.bytes); }
  let rec: any = null;
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { rec = findRecipe(parseLd(m[1])); } catch { /* nächster Block */ }
    if (rec) break;
  }
  if (!rec) rec = microdataRecipe(html);
  const meta = (prop: string) => { const v = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i').exec(html)?.[1]
    ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1]; return v ? unEnt(v) : undefined; };
  const title = unHtml(String(rec?.name ?? meta('og:title') ?? '')).replace(/\s*[|–-]\s*(Chefkoch|Rezept).*$/i, '').slice(0, 80);
  const ingredients = ingredientsOf(rec);
  const steps = stepsOf(rec?.recipeInstructions).slice(0, 30).map((x, i) => `${i + 1}. ${x}`).join('\n').slice(0, 4000);
  const yieldTxt = unHtml(String(Array.isArray(rec?.recipeYield) ? rec.recipeYield[0] : rec?.recipeYield ?? '')).slice(0, 40);
  const time = durationOf(rec?.totalTime) ?? durationOf(rec?.cookTime) ?? durationOf(rec?.prepTime);
  let image: string | undefined;
  const imgUrl = imageOf(rec?.image) ?? meta('og:image') ?? meta('twitter:image');
  if (imgUrl && body.withImage !== false) {
    try {
      const img = await fetchPage(new URL(unEnt(imgUrl), page.url).toString(), 'image/jpeg,image/webp,image/png,image/*', 3_000_000);
      const type = img.type.split(';')[0].trim();
      if (/^image\/(jpeg|png|webp|gif)$/.test(type)) image = `data:${type};base64,${toB64(img.bytes)}`;
    } catch { /* ohne Bild weiter */ }
  }
  if (!title && !ingredients.length) return json({ error: 'no_recipe' }, 422);
  return json({ title, ingredients, steps, image, servings: yieldTxt || undefined, time, source: new URL(page.url).hostname.replace(/^www\./, ''), structured: !!rec });
}

// ---------- Export: Familientermine als iCal ----------

type Ev = { id: string; title: string; date: string; time?: string; end?: string; who: string[]; weekly?: boolean; icon?: string };
type Person = { id: string; name: string };

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
};
const d8 = (iso: string) => iso.replace(/-/g, '');
const t6 = (hm: string) => hm.replace(':', '') + '00';
const addMin = (hm: string, m: number) => { const [h, mi] = hm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + mi + m); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const nextDay = (iso: string) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

const VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

export function buildIcs(name: string, events: Ev[], people: Person[], children: { id: string; name: string; birthday?: string }[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Familienplaner//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT30M', 'X-PUBLISHED-TTL:PT30M', ...VTZ];
  for (const e of events) {
    const who = e.who.map(w => people.find(p => p.id === w)?.name).filter(Boolean).join(', ');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@familienplaner`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(`${e.icon ? e.icon + ' ' : ''}${e.title}${who ? ` (${who})` : ''}`)}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=${TZ}:${d8(e.date)}T${t6(e.time)}`, `DTEND;TZID=${TZ}:${d8(e.date)}T${t6(e.end ?? addMin(e.time, 60))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(nextDay(e.date))}`);
    }
    if (e.weekly) lines.push('RRULE:FREQ=WEEKLY');
    lines.push('END:VEVENT');
  }
  for (const c of children) {
    if (!c.birthday) continue;
    lines.push('BEGIN:VEVENT', `UID:geburtstag-${c.id}@familienplaner`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(`🎂 ${c.name} hat Geburtstag`)}`,
      `DTSTART;VALUE=DATE:${d8(c.birthday)}`, `DTEND;VALUE=DATE:${d8(nextDay(c.birthday))}`, 'RRULE:FREQ=YEARLY', 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------- Import: fremden iCal-Kalender lesen ----------

export type Out = { uid: string; title: string; date: string; time?: string; end?: string; allDay: boolean; rid?: string };

const fmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function local(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const isoOf = (t: any) => `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;

export function parseIcs(text: string, fromIso: string, toIso: string): Out[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents('vtimezone')) { try { ICAL.TimezoneService.register(tz); } catch { /* schon bekannt */ } }
  const from = new Date(fromIso + 'T00:00:00Z'), to = new Date(toIso + 'T23:59:59Z');
  const out: Out[] = [];
  const push = (uid: string, title: string, s: any, e: any, rid?: string) => {
    if (s.isDate) {
      const last = e ? (() => { const x = e.clone(); x.adjust(-1, 0, 0, 0); return x; })() : s;
      // mehrtägig: für jeden Tag ein Eintrag (max. 31)
      const cur = s.clone();
      for (let i = 0; i < 31 && cur.compare(last) <= 0; i++) { out.push({ uid: uid + ':' + isoOf(cur), title, date: isoOf(cur), allDay: true, rid }); cur.adjust(1, 0, 0, 0); }
    } else {
      const a = local(s.toJSDate()), b = e ? local(e.toJSDate()) : undefined;
      out.push({ uid, title, date: a.date, time: a.time, end: b && b.date === a.date ? b.time : undefined, allDay: false, rid });
    }
  };
  // Ausnahmen wiederkehrender Termine (RECURRENCE-ID) werden von ical.js über relateException verknüpft
  const vevents = comp.getAllSubcomponents('vevent');
  const masters = new Map<string, any>();
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) continue;
    masters.set(ev.uid, ev);
  }
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException() && masters.has(ev.uid)) masters.get(ev.uid).relateException(v);
  }
  for (const ev of masters.values()) {
    if ((ev.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const title = String(ev.summary ?? 'Termin');
    if (!ev.isRecurring()) {
      const s = ev.startDate;
      if (!s) continue;
      const js = s.toJSDate();
      if (js > to || (ev.endDate ?? s).toJSDate() < from) continue;
      push(ev.uid, title, s, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    let n: any, guard = 0;
    while ((n = it.next()) && guard++ < 5000) {
      const js = n.toJSDate();
      if (js > to) break;
      const det = ev.getOccurrenceDetails(n);
      if (det.endDate.toJSDate() < from) continue;
      const st = (det.item.component.getFirstPropertyValue('status') ?? '').toUpperCase();
      if (st === 'CANCELLED') continue;
      push(ev.uid + ':' + n.toString(), String(det.item.summary ?? title), det.startDate, det.endDate, n.toString());
    }
  }
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

// ---------- KI ----------

const AI_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const AI_MODEL = 'claude-opus-5-5';
/** Günstiges Modell für einfache Textaufgaben (Rezeptvorschläge), per body.fast */
const FAST_MODEL = 'claude-haiku-5-5';
const AI_DAILY = 30;
const IMG = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;
const berlinDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

/** Familie des angemeldeten Geräts. Abgelaufene Support-Zugänge zählen nicht; die eigene Familie geht vor. */
async function memberOf(admin: any, userId: string): Promise<{ family_id: string; role: string } | null> {
  const { data } = await admin.from('members').select('family_id, role, until').eq('user_id', userId);
  const ok = (data ?? []).filter((m: any) => !m.until || new Date(m.until).getTime() > Date.now());
  return ok.find((m: any) => !m.until) ?? ok[0] ?? null;
}

/** Obergrenze für alle Familien zusammen pro Tag (US-Dollar). Schützt vor einer Kostenexplosion, falls jemand das Familienlimit umgeht. */
const AI_GLOBAL_USD = Number(Deno.env.get('AI_GLOBAL_DAILY_USD') ?? '10');
async function globalBudgetLeft(admin: any) {
  const { data, error } = await admin.from('ai_usage').select('micro').eq('day', berlinDay());
  if (error) return true; // fix-11 fehlt: nur Familienlimit
  const usd = (data ?? []).reduce((a: number, r: any) => a + Number(r.micro ?? 0), 0) / 1e6;
  return usd < AI_GLOBAL_USD;
}

async function runAi(body: any, userId: string, admin: any) {
  if (!AI_KEY) return json({ error: 'no_key' }, 503);
  const prompt = String(body.prompt ?? '');
  if (!prompt || prompt.length > 20000) return json({ error: 'bad_request' }, 400);
  const images: any[] = [];
  for (const raw of (Array.isArray(body.images) ? body.images : []).slice(0, 20)) {
    const m = IMG.exec(String(raw));
    if (!m || m[2].length > 6_000_000) return json({ error: 'image_rejected' }, 400);
    images.push(m[1] === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: m[1], data: m[2] } }
      : { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }

  // Nur Mitglieder einer Familie, mit Tageslimit pro Familie (schützt vor hohen Kosten)
  const mem = await memberOf(admin, userId);
  if (!mem) return json({ error: 'not_member' }, 403);
  const fid = mem.family_id;
  const fam = await famFlags(admin, fid);
  if (!fam) return json({ error: 'no_sql' }, 500);
  if (fam.features?.ki === false) return json({ error: 'disabled' }, 403);
  if (!await globalBudgetLeft(admin)) return json({ error: 'daily_limit' }, 429);
  const limit = fam.ai_limit ?? AI_DAILY;
  const day = berlinDay();
  let used: number;
  // fix-13: Zähler in einem Schritt hochsetzen, damit viele gleichzeitige Aufrufe das Limit nicht umgehen
  const take = await admin.rpc('ai_take', { fid, lim: limit });
  if (!take.error) {
    if (take.data == null) return json({ error: 'daily_limit' }, 429);
    used = Number(take.data) - 1;
  } else {
    used = fam.ai_day === day ? fam.ai_count : 0;
    if (used >= limit) return json({ error: 'daily_limit' }, 429);
    await admin.from('families').update({ ai_day: day, ai_count: used + 1 }).eq('id', fid);
  }

  const client = new Anthropic({ apiKey: AI_KEY });
  try {
    if (body.fast === true && !images.length) {
      const q = await client.messages.create({
        model: FAST_MODEL, max_tokens: 6000,
        system: 'Du hilfst einer Familie. Antworte ausschließlich mit gültigem JSON, ohne Markdown-Codeblock und ohne weiteren Text.',
        messages: [{ role: 'user', content: prompt }],
      } as any);
      if (q.stop_reason === 'max_tokens') return json({ error: 'invalid_json' }, 502);
      await track(admin, fid, q.model ?? FAST_MODEL, q.usage);
      return json({ text: q.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), left: limit - used - 1 });
    }
    const msg = await client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: 'Du hilfst einer Familie beim Lernen. Antworte ausschließlich mit gültigem JSON, ohne Markdown-Codeblock und ohne weiteren Text.',
      messages: [{ role: 'user', content: [...images, { type: 'text', text: prompt }] }],
    } as any).finalMessage();
    if (msg.stop_reason === 'refusal') return json({ error: 'refused' }, 422);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'invalid_json' }, 502);
    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    await track(admin, fid, msg.model ?? AI_MODEL, msg.usage);
    return json({ text, left: limit - used - 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json({ error: 'bad_key' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: /credit|billing/i.test(e.message) ? 'no_credit' : 'image_rejected', message: e.message }, 400);
    if (e instanceof Anthropic.APIError) return json({ error: 'ai_down', status: e.status }, 502);
    throw e;
  }
}

// Preise in US-Dollar pro Million Tokens (Stand Nov. 2026), für die Kostenanzeige in der Operator-Ansicht
const PRICES: [RegExp, number, number][] = [[/haiku/, 0.1, 0.5], [/sonnet/, 2, 10], [/opus/, 4, 20], [/fable|mythos/, 8, 40]];
/** Schalter und KI-Limit der Familie. Fällt auf die alten Spalten zurück, solange fix-11 fehlt. */
async function famFlags(admin: any, fid: string) {
  const r = await admin.from('families').select('ai_day, ai_count, features, ai_limit').eq('id', fid).single();
  if (!r.error) return r.data as { ai_day: string; ai_count: number; features?: Record<string, boolean>; ai_limit?: number | null };
  const o = await admin.from('families').select('ai_day, ai_count').eq('id', fid).single();
  return o.error ? null : o.data as { ai_day: string; ai_count: number; features?: Record<string, boolean>; ai_limit?: number | null };
}
/** Verbrauch pro Familie und Tag mitschreiben (Aufrufe, Tokens, Kosten in Mikro-Dollar). Fehler sind egal. */
async function track(admin: any, fid: string, model: string, usage: any) {
  try {
    const i = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0), o = usage?.output_tokens ?? 0;
    const p = PRICES.find(([re]) => re.test(model)) ?? PRICES[2];
    await admin.rpc('ai_track', { fid, d: berlinDay(), tin: i, tout: o, micro: Math.round(i * p[1] + o * p[2]) });
  } catch { /* egal */ }
}

// ---------- Vokabel-Schiedsrichter: kleines, schnelles Modell, eigenes Kontingent ----------
const JUDGE_MODEL = 'claude-haiku-5-5';
const JUDGE_DAILY = 300;
const judgeCount = new Map<string, number>(); // grob pro Instanz und Tag, schützt vor Ausreißern

async function runJudge(body: any, userId: string, admin: any) {
  if (!AI_KEY) return json({ error: 'no_key' }, 503);
  const word = String(body.word ?? '').slice(0, 200), solution = String(body.solution ?? '').slice(0, 300), answer = String(body.answer ?? '').slice(0, 200);
  const lang = String(body.lang ?? 'Englisch').slice(0, 30), dir = body.dir === 'to_foreign' ? 'to_foreign' : 'to_german';
  if (!word || !solution || !answer) return json({ error: 'bad_request' }, 400);
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  const mem = [m0];
  if (!await globalBudgetLeft(admin)) return json({ error: 'daily_limit' }, 429);
  const fam = await famFlags(admin, mem[0].family_id);
  if (fam?.features?.ki === false || fam?.features?.vokabeln === false) return json({ error: 'disabled' }, 403);
  const key = mem[0].family_id + '|' + berlinDay();
  const n = judgeCount.get(key) ?? 0;
  if (n >= JUDGE_DAILY) return json({ error: 'daily_limit' }, 429);
  judgeCount.set(key, n + 1);
  const target = dir === 'to_foreign' ? lang : 'Deutsch';
  const prompt = `Vokabelabfrage eines Schulkinds (Klasse 5 bis 7). Gefragt: "${word}". Lösung laut Buch: "${solution}". Antwort des Kindes auf ${target}: "${answer}".
Ist die Antwort inhaltlich richtig? Richtig heißt: Sie trifft eine der Bedeutungen. Fehlende Artikel, Platzhalter (jdm., etw., sb., sth.), Klammerteile, Groß-/Kleinschreibung und kleine Tippfehler sind egal. Ein gleichwertiges Synonym zählt als richtig. Eine andere Bedeutung, ein anderes Wort oder eine falsche Wortart ist falsch.
Antworte nur mit JSON: {"ok": true|false, "note": "höchstens 12 Wörter, freundlich, auf Deutsch, nur wenn ok=false oder fast falsch"}`;
  const client = new Anthropic({ apiKey: AI_KEY });
  try {
    const msg = await client.messages.create({ model: JUDGE_MODEL, max_tokens: 200, messages: [{ role: 'user', content: prompt }] } as any);
    await track(admin, mem[0].family_id, msg.model ?? JUDGE_MODEL, msg.usage);
    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.APIError) return json({ error: 'ai_down', status: e.status }, 502);
    throw e;
  }
}

// ---------- Erinnerungen (Web-Push) ----------

async function vapid(admin: any) {
  const { data: cfg, error } = await admin.from('push_config').select('public_key, private_key, tick_token').eq('id', 1).single();
  if (error || !cfg) throw new Error('no_sql');
  if (!cfg.public_key) {
    const k = webpush.generateVAPIDKeys();
    await admin.from('push_config').update({ public_key: k.publicKey, private_key: k.privateKey }).eq('id', 1);
    cfg.public_key = k.publicKey; cfg.private_key = k.privateKey;
  }
  webpush.setVapidDetails('https://famelio.de/', cfg.public_key, cfg.private_key);
  return cfg as { public_key: string; private_key: string; tick_token: string };
}

/** Berliner Ortszeit als "Minuten seit 1970", damit sich Zeiten einfach vergleichen lassen. */
function berlinNowMin() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) / 60000;
}
const dayMin = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 60000;
const hm = (t?: string) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
const minIso = (min: number) => new Date(min * 60000).toISOString().slice(0, 10);

type RemEv = Ev & { remind?: number; bring?: string; pick?: string; note?: string };
/** Fällige Erinnerungen: remind = Minuten vorher, -1 = Vorabend 19 Uhr. Ganztägige Termine gelten ab 8 Uhr. */
function dueReminders(events: RemEv[], now: number) {
  const out: { ev: RemEv; date: string }[] = [];
  const today = Math.floor(now / 1440) * 1440;
  for (const e of events) {
    if (e.remind === undefined || e.remind === null || !e.date) continue;
    const base = dayMin(e.date);
    for (let d = today - 1440; d <= today + 2 * 1440; d += 1440) {
      if (d < base || (d !== base && !(e.weekly && (d - base) % (7 * 1440) === 0))) continue;
      const start = d + (hm(e.time) ?? 8 * 60);
      const fire = e.remind === -1 ? d - 1440 + 19 * 60 : start - e.remind;
      if (fire <= now && fire > now - 30) out.push({ ev: e, date: minIso(d) });
    }
  }
  return out;
}

function recipients(e: RemEv, d: any): Set<string> | null {
  if (!e.who?.length) return null; // ganze Familie
  const kids = new Set((d.children ?? []).map((c: any) => c.id));
  const to = new Set<string>([...e.who, ...[e.bring, e.pick].filter(Boolean) as string[]]);
  // Fährt niemand aus der Familie (leer oder Freitext wie „Oma“), bekommen Mama und Papa die Erinnerung
  const member = (x?: string) => !!x && (d.parents ?? []).some((p: any) => p.id === x);
  if (e.who.some(w => kids.has(w)) && !member(e.bring) && !member(e.pick)) for (const p of d.parents ?? []) if (p.admin !== false) to.add(p.id);
  return to;
}

async function sendTo(admin: any, rows: any[], payload: object) {
  let sent = 0;
  for (const r of rows) {
    try { await webpush.sendNotification(r.sub, JSON.stringify(payload), { TTL: 3600 }); sent++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', r.endpoint); }
  }
  return sent;
}

async function tick(body: any, admin: any) {
  const cfg = await vapid(admin);
  if (String(body.token ?? '') !== cfg.tick_token) return json({ error: 'forbidden' }, 403);
  const now = berlinNowMin();
  const { data: subs } = await admin.from('push_subs').select('endpoint, family_id, person_id, sub');
  const byFam = new Map<string, any[]>();
  for (const s of subs ?? []) byFam.set(s.family_id, [...(byFam.get(s.family_id) ?? []), s]);
  let total = 0;
  for (const [fid, rows] of byFam) {
    const { data: st } = await admin.from('family_state').select('data').eq('family_id', fid).single();
    const d = st?.data as any;
    if (!d) continue;
    const people = [...(d.parents ?? []), ...(d.children ?? [])];
    const name = (id?: string) => (id ? people.find((p: any) => p.id === id)?.name ?? id : undefined);
    for (const { ev, date } of dueReminders(d.events ?? [], now)) {
      const key = `${ev.id}|${date}|${ev.remind}`;
      const { error } = await admin.from('push_sent').insert({ family_id: fid, key });
      if (error) continue; // schon verschickt
      const to = (ev as any).priv ? new Set<string>([(ev as any).priv]) : recipients(ev, d);
      const target = rows.filter(r => !to || (r.person_id ? to.has(r.person_id) : !(ev as any).priv));
      const when = ev.remind === -1 || ev.remind >= 1440 ? (ev.time ? `Morgen ${ev.time} Uhr` : 'Morgen') : ev.time ? `Heute ${ev.time} Uhr` : 'Heute';
      const lines = [ev.who?.length ? ev.who.map(name).filter(Boolean).join(', ') : '', ev.bring || ev.pick ? [name(ev.bring) && `🚗 ${name(ev.bring)}`, name(ev.pick) && `🏠 ${name(ev.pick)}`].filter(Boolean).join(' · ') : '', ev.note ?? ''].filter(Boolean);
      total += await sendTo(admin, target, { title: `${ev.icon ? ev.icon + ' ' : ''}${ev.title}`, body: [when, ...lines].join('\n'), tag: key });
    }
  }
  await admin.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 14 * 864e5).toISOString());
  try { total += await trainTick(admin, now); } catch (e) { console.error('trainTick', (e as Error).message ?? e); }
  return json({ ok: true, sent: total });
}

async function pushAction(body: any, userId: string, admin: any) {
  let cfg;
  try { cfg = await vapid(admin); } catch { return json({ error: 'no_sql' }, 500); }
  if (body.action === 'push_key') return json({ key: cfg.public_key });
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  const mem = [m0];
  const sub = body.sub;
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: 'bad_request' }, 400);
  if (body.action === 'push_sub') {
    if (body.off) { await admin.from('push_subs').delete().eq('endpoint', sub.endpoint).eq('user_id', userId); return json({ ok: true }); }
    await admin.from('push_subs').upsert({ endpoint: sub.endpoint, family_id: mem[0].family_id, user_id: userId, person_id: body.person ? String(body.person).slice(0, 40) : null, sub });
    return json({ ok: true });
  }
  if (body.action === 'push_test') {
    const n = await sendTo(admin, [{ endpoint: sub.endpoint, sub }], { title: '🔔 Familienplaner', body: 'So sehen Erinnerungen an Termine aus.', tag: 'test' });
    return json({ ok: n > 0 });
  }
  return json({ error: 'unknown_action' }, 400);
}

// ---------- Zugprüfung (Schulweg) ----------
// Quelle: inoffizielle Abfahrtstafel von bahnhof.de (ohne Schlüssel, ohne Vertrag). Nur für den Familientest gedacht.
// Das Antwortformat ist NICHT gegen die echte Schnittstelle geprüft: parseBoard() sucht deshalb mehrere übliche Feldnamen.
// Zum Austauschen der Quelle nur fetchBoard() und parseBoard() ersetzen, der Rest arbeitet mit Dep.
type Dep = { line: string; dest: string; planned: number | null; actual: number | null; plat?: string; platPlanned?: string; cancelled: boolean };
const TRAIN_URL = Deno.env.get('TRAIN_BOARD_URL') ?? 'https://www.bahnhof.de/api/boards/departures';

const dig = (o: any, ...keys: string[]) => {
  for (const k of keys) { const v = k.split('.').reduce((a: any, p) => (a == null ? undefined : a[p]), o); if (v !== undefined && v !== null && v !== '') return v; }
  return undefined;
};
const ms = (v: any) => { if (v == null) return null; const t = typeof v === 'number' ? v : Date.parse(String(v)); return Number.isFinite(t) ? t : null; };

function parseBoard(j: any): Dep[] {
  const list: any[] = Array.isArray(j) ? j : (dig(j, 'entries', 'departures', 'items', 'journeys') ?? []);
  return list.map((e: any): Dep => {
    const cat = dig(e, 'transport.category', 'transport.type', 'category', 'train.category');
    const num = dig(e, 'transport.number', 'transport.line', 'number', 'line', 'train.number');
    const label = dig(e, 'transport.label', 'transport.name', 'lineName', 'name', 'train.name');
    const planned = ms(dig(e, 'timeSchedule', 'timeScheduled', 'scheduledTime', 'plannedWhen', 'time.planned', 'departure.timeSchedule', 'time'));
    const actual = ms(dig(e, 'timePredicted', 'timeExpected', 'predictedTime', 'when', 'time.predicted', 'departure.timePredicted'));
    return {
      line: String(label ?? [cat, num].filter(x => x != null).join(' ')).trim(),
      dest: String(dig(e, 'transport.destination.name', 'transport.destination', 'destination.name', 'destination', 'direction') ?? ''),
      planned,
      actual: actual ?? null,
      plat: dig(e, 'platformPredicted', 'platform', 'platform.actual', 'platformActual') != null ? String(dig(e, 'platformPredicted', 'platform', 'platform.actual', 'platformActual')) : undefined,
      platPlanned: dig(e, 'platformSchedule', 'platformScheduled', 'plannedPlatform', 'platform.planned') != null ? String(dig(e, 'platformSchedule', 'platformScheduled', 'plannedPlatform', 'platform.planned')) : undefined,
      cancelled: !!dig(e, 'canceled', 'cancelled', 'isCancelled', 'departureCancelled'),
    };
  }).filter(d => d.planned !== null || d.actual !== null);
}

async function fetchBoard(eva: string): Promise<{ deps: Dep[]; status: number; raw?: string; station?: string }> {
  const r = await fetch(`${TRAIN_URL}?evaNumbers=${encodeURIComponent(eva)}&duration=120&locale=de`, { headers: { Accept: 'application/json', 'User-Agent': 'Famelio/1.0' } });
  const text = await r.text();
  let j: any; try { j = JSON.parse(text); } catch { return { deps: [], status: r.status, raw: text.slice(0, 300) }; }
  const deps = r.ok ? parseBoard(j) : [];
  const first = (Array.isArray(j) ? j : dig(j, 'entries', 'departures', 'items') ?? [])[0];
  const station = dig(first, 'venue.name', 'station.name', 'stationName') as string | undefined;
  return { deps, status: r.status, raw: deps.length || r.ok && Object.keys(j ?? {}).length === 0 ? undefined : text.slice(0, 300), station };
}

const normLine = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
const berlinHm = (t: number) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
const berlinMinOf = (t: number) => { const [h, m] = berlinHm(t).split(':').map(Number); return (h % 24) * 60 + m; };

/** Den Zug zur geplanten Abfahrt finden: gleiche Minute (±1) und, falls angegeben, passende Linie. */
function findTrain(deps: Dep[], depart: string, line?: string) {
  const want = hm(depart)!;
  const near = deps.filter(d => d.planned !== null && Math.abs(berlinMinOf(d.planned) - want) <= 1);
  if (!near.length) return undefined;
  const l = line ? normLine(line) : '';
  return (l && near.find(d => { const x = normLine(d.line); return x.includes(l) || l.includes(x); })) ?? (l ? undefined : near[0]);
}

type TStatus = { state: string; planned?: string; actual?: string; delay?: number; platform?: string; platformPlanned?: string; line?: string; dest?: string; checkedAt: string; notified?: { state: string; delay: number; plat?: string } };

function evalTrain(d: Dep | undefined, boardNonEmpty: boolean, minsToDep: number): TStatus {
  const checkedAt = new Date().toISOString();
  if (!d) return { state: boardNonEmpty ? 'missing' : 'unknown', checkedAt };
  const planned = d.planned ?? d.actual!, actual = d.actual ?? planned;
  const delay = Math.round((actual - planned) / 60000);
  const platChanged = !!d.plat && !!d.platPlanned && d.plat !== d.platPlanned;
  const state = d.cancelled ? 'cancelled' : delay >= 3 ? 'delay' : platChanged ? 'platform' : 'ok';
  return { state, planned: berlinHm(planned), actual: berlinHm(actual), delay: Math.max(0, delay), platform: d.plat, platformPlanned: d.platPlanned, line: d.line, dest: d.dest, checkedAt };
}

const TRAIN_NAME = (c: any) => `${c.line ? c.line + ' ' : ''}${c.depart} ab ${c.from}`;

/** Wird von tick() aufgerufen: prüft alle Züge im Fenster und schickt bei Änderungen Push an Kind und Eltern. */
async function trainTick(admin: any, nowMin: number) {
  const date = minIso(nowMin), wd = new Date(date + 'T12:00:00Z').getUTCDay() || 7, mNow = nowMin - dayMin(date);
  if (mNow < 4 * 60 || mNow > 20 * 60) return 0;
  const { data: states } = await admin.from('family_state').select('family_id, data');
  const boards = new Map<string, Promise<{ deps: Dep[] }>>();
  let pushed = 0;
  for (const st of states ?? []) {
    const d = st.data as any;
    if (!d?.children || d.settings?.holiday?.on) continue;
    const jobs: { child: any; c: any }[] = [];
    for (const child of d.children) {
      if (child.schoolChange?.[date]?.off) continue;
      for (const c of child.commutes ?? []) {
        const m = hm(c.depart);
        if (c.off || m === null || !Array.isArray(c.days) || !c.days.includes(wd) || !/^\d{6,8}$/.test(String(c.fromEva))) continue;
        if (mNow >= m - 45 && mNow <= m + 5) jobs.push({ child, c });
      }
    }
    if (!jobs.length) continue;
    const { data: subs } = await admin.from('push_subs').select('endpoint, person_id, sub').eq('family_id', st.family_id);
    const parentIds = new Set<string>((d.parents ?? []).map((p: any) => p.id));
    for (const { child, c } of jobs) {
      try {
        if (!boards.has(c.fromEva)) boards.set(c.fromEva, fetchBoard(String(c.fromEva)));
        const { deps } = await boards.get(c.fromEva)!;
        const res = evalTrain(findTrain(deps, c.depart, c.line), deps.length > 0, hm(c.depart)! - mNow);
        const { data: prev } = await admin.from('train_status').select('data').eq('family_id', st.family_id).eq('route_id', c.id).eq('date', date).maybeSingle();
        const last = (prev?.data as TStatus | undefined)?.notified;
        const lastState = last?.state ?? 'ok', lastDelay = last?.delay ?? 0, lastPlat = last?.plat;
        // Nur bei echter Änderung melden. 'unknown' (keine Daten) und 'missing' nur kurz vor Abfahrt.
        let msg: string | null = null;
        if (res.state === 'cancelled' && lastState !== 'cancelled') msg = `❌ ${TRAIN_NAME(c)} fällt aus.`;
        else if (res.state === 'delay' && (lastState !== 'delay' || Math.abs((res.delay ?? 0) - lastDelay) >= 3)) msg = `⚠️ ${TRAIN_NAME(c)}: ${res.delay} Min später, ab ${res.actual}.`;
        else if (res.state === 'platform' && res.platform !== lastPlat && lastState !== 'platform') msg = `🔀 ${TRAIN_NAME(c)}: Gleis ${res.platform} statt ${res.platformPlanned}.`;
        else if (res.state === 'ok' && ['delay', 'cancelled', 'platform'].includes(lastState)) msg = `✅ ${TRAIN_NAME(c)} ist wieder pünktlich.`;
        else if (res.state === 'missing' && lastState !== 'missing' && hm(c.depart)! - mNow <= 20) msg = `❓ ${TRAIN_NAME(c)} steht nicht in der Abfahrtstafel. Bitte in der DB-App prüfen.`;
        const notified = msg ? { state: res.state, delay: res.delay ?? 0, plat: res.platform } : last;
        const row: TStatus = { ...res, notified };
        const { error } = await admin.from('train_status').upsert({ family_id: st.family_id, route_id: c.id, date, data: row, updated_at: new Date().toISOString() });
        if (error) throw error;
        if (msg) {
          const target = (subs ?? []).filter((r: any) => !r.person_id || r.person_id === child.id || parentIds.has(r.person_id));
          pushed += await sendTo(admin, target, { title: `🚆 ${child.name}`, body: msg, tag: `train|${c.id}|${date}` });
        }
      } catch (e) { console.error('trainTick', (e as Error).message ?? e); }
    }
  }
  await admin.from('train_status').delete().lt('date', minIso(nowMin - 3 * 1440));
  return pushed;
}

async function trainAction(body: any, userId: string, admin: any) {
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  if (body.action === 'train_status') {
    const date = minIso(berlinNowMin());
    const { data, error } = await admin.from('train_status').select('route_id, data').eq('family_id', m0.family_id).eq('date', date);
    if (error) return json({ error: 'train_sql', detail: error.message }, 500);
    const statuses: Record<string, unknown> = {};
    for (const r of data ?? []) { const { notified: _n, ...pub } = r.data ?? {}; statuses[r.route_id] = pub; }
    return json({ statuses });
  }
  if (body.action === 'train_test') {
    if (m0.role !== 'eltern') return json({ error: 'parents_only' }, 403);
    const eva = String(body.eva ?? '').trim();
    if (!/^\d{6,8}$/.test(eva)) return json({ error: 'train_bad_input' }, 400);
    try {
      const b = await fetchBoard(eva);
      const sample = b.deps.slice(0, 5).map(d => ({ line: d.line, dest: d.dest, planned: d.planned ? berlinHm(d.planned) : '?', actual: d.actual ? berlinHm(d.actual) : undefined, platform: d.plat }));
      const hit = /^\d\d:\d\d$/.test(String(body.depart ?? '')) ? findTrain(b.deps, String(body.depart), body.line ? String(body.line) : undefined) : undefined;
      return json({ ok: b.status >= 200 && b.status < 300 && b.deps.length > 0, status: b.status, raw: b.raw, count: b.deps.length, stationName: b.station, sample,
        match: hit ? { line: hit.line, planned: berlinHm(hit.planned ?? hit.actual!), actual: hit.actual ? berlinHm(hit.actual) : undefined, platform: hit.plat, cancelled: hit.cancelled } : undefined });
    } catch (e) { return json({ error: 'train_failed', detail: (e as Error).message }, 502); }
  }
  return json({ error: 'unknown_action' }, 400);
}

// ---------- Server ----------


// ---------- iCloud-Kalender (CalDAV, lesen und schreiben) ----------
// Zugang pro Familie: Apple-ID + app-spezifisches Passwort, in der App eingegeben, verschlüsselt in family_secrets (kind 'icloud').
// Bewusst kein globaler Zugang mehr: sonst sähe jede Familie denselben Apple-Kalender.
type IcCred = { u: string; p: string };
const icCtx = new AsyncLocalStorage<IcCred>();
const IC_ROOT = 'https://caldav.icloud.com';

async function dav(url: string, method: string, body?: string, headers: Record<string, string> = {}) {
  return await fetch(url, {
    method, body,
    headers: { Authorization: 'Basic ' + btoa(`${icCtx.getStore()?.u}:${icCtx.getStore()?.p}`), 'Content-Type': 'application/xml; charset=utf-8', ...headers },
  });
}
const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;|&#x[dD];/g, '\r').replace(/&#10;|&#x[aA];/g, '\n').replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => { const m = new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml); return m ? m[1] : undefined; };
const responses = (xml: string) => xml.match(/<(?:[\w-]+:)?response[\s>][\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
const abs = (base: string, href: string) => new URL(href.trim(), base).toString();

const icHomes = new Map<string, string>();
async function icloudHome(): Promise<string> {
  const who = icCtx.getStore()?.u ?? '';
  if (icHomes.has(who)) return icHomes.get(who)!;
  const p1 = await dav(IC_ROOT + '/', 'PROPFIND', '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { Depth: '0' });
  if (p1.status === 401) throw new Error('icloud_auth');
  const x1 = await p1.text();
  const principal = tag(tag(x1, 'current-user-principal') ?? '', 'href');
  if (!principal) throw new Error('icloud_discovery');
  const purl = abs(p1.url || IC_ROOT, principal);
  const p2 = await dav(purl, 'PROPFIND', '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', { Depth: '0' });
  const x2 = await p2.text();
  const home = tag(tag(x2, 'calendar-home-set') ?? '', 'href');
  if (!home) throw new Error('icloud_discovery');
  icHomes.set(who, abs(purl, home));
  return icHomes.get(who)!;
}

async function icloudCalendars() {
  const home = await icloudHome();
  const r = await dav(home, 'PROPFIND', '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><c:supported-calendar-component-set/><d:current-user-privilege-set/></d:prop></d:propfind>', { Depth: '1' });
  const xml = await r.text();
  return responses(xml).filter(x => /<(?:[\w-]+:)?calendar[\s/>]/i.test(tag(x, 'resourcetype') ?? '') && /VEVENT/i.test(tag(x, 'supported-calendar-component-set') ?? 'VEVENT'))
    .map(x => ({ href: abs(home, tag(x, 'href')!), name: unxml(tag(x, 'displayname') ?? 'Kalender'), color: (tag(x, 'calendar-color') ?? '#4285f4').slice(0, 7), readOnly: !/<(?:[\w-]+:)?write[\s/>]/i.test(tag(x, 'current-user-privilege-set') ?? '<write/>') }));
}

const caldate = (iso: string) => iso.replace(/-/g, '') + 'T000000Z';
async function icloudEvents(cal: string, from: string, to: string) {
  if (!cal.startsWith('https://') || !new URL(cal).hostname.endsWith('icloud.com')) throw new Error('bad_calendar');
  const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${caldate(from)}" end="${caldate(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const r = await dav(cal, 'REPORT', body, { Depth: '1' });
  if (r.status === 401) throw new Error('icloud_auth');
  const xml = await r.text();
  const out: any[] = [];
  for (const x of responses(xml)) {
    const href = tag(x, 'href'), data = tag(x, 'calendar-data');
    if (!href || !data) continue;
    const ics = unxml(data);
    // Nur im VEVENT suchen: Die Zeitzone (VTIMEZONE) enthält immer eine RRULE für die Sommerzeit
    const vevents = (ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []).join('\n');
    const recurring = /(^|\n)(RRULE|RDATE|RECURRENCE-ID)[;:]/i.test(vevents);
    let notes = '';
    try { notes = String(new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')).description ?? ''); } catch { /* egal */ }
    for (const e of parseIcs(ics, from, to)) {
      const multi = e.uid.includes(':') && !recurring; // mehrtägiger Ganztagstermin
      out.push({ ...e, href: abs(cal, href), etag: unxml(tag(x, 'getetag') ?? ''), cal, recurring, editable: !multi, note: notes.slice(0, 500) || undefined });
    }
  }
  return out;
}

// Berliner Ortszeit -> UTC im iCal-Format
function berlinUtc(date: string, time: string) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t -= shown - Date.UTC(y, mo - 1, d, h, mi);
  }
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icNextDay = (iso: string) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ''); };

function eventLines(ev: { title: string; date: string; time?: string; end?: string; note?: string }) {
  const lines = [`SUMMARY:${icsText(ev.title)}`];
  if (ev.time) {
    lines.push(`DTSTART:${berlinUtc(ev.date, ev.time)}`);
    const end = ev.end && ev.end > ev.time ? ev.end : `${String(Math.min(23, +ev.time.slice(0, 2) + 1)).padStart(2, '0')}:${ev.time.slice(3)}`;
    lines.push(`DTEND:${berlinUtc(ev.date, end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${icNextDay(ev.date)}`);
  }
  if (ev.note) lines.push(`DESCRIPTION:${icsText(ev.note)}`);
  return lines;
}

async function icloudSave(b: any) {
  const ev = { title: String(b.title ?? '').slice(0, 200), date: String(b.date ?? ''), time: b.time ? String(b.time) : undefined, end: b.end ? String(b.end) : undefined, note: b.note ? String(b.note).slice(0, 2000) : undefined };
  if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || (ev.time && !/^\d{2}:\d{2}$/.test(ev.time)) || (ev.end && !/^\d{2}:\d{2}$/.test(ev.end))) return json({ error: 'bad_request' }, 400);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  if (b.href) {
    // Bestehenden Termin ändern: Original holen, nur Titel, Zeit und Notiz ersetzen, Rest (Erinnerungen, Ort) bleibt
    const href = String(b.href);
    if (!new URL(href).hostname.endsWith('icloud.com')) return json({ error: 'bad_calendar' }, 400);
    const g = await dav(href, 'GET', undefined, { 'Content-Type': 'text/calendar' });
    if (!g.ok) return json({ error: 'not_found' }, 404);
    const text = await g.text();
    if (/(^|\n)(RRULE|RDATE|RECURRENCE-ID)[;:]/i.test((text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []).join('\n'))) return json({ error: 'recurring' }, 400);
    const keep = (l: string) => !/^(SUMMARY|DTSTART|DTEND|DURATION|DESCRIPTION|DTSTAMP|LAST-MODIFIED)[;:]/i.test(l);
    const unfolded = text.replace(/\r?\n[ \t]/g, '');
    // Nur Eigenschaften direkt im VEVENT ersetzen, Unterteile wie VALARM bleiben unangetastet
    const lines: string[] = [];
    let depth = 0;
    for (const l of unfolded.split(/\r?\n/)) {
      if (!l) continue;
      if (/^BEGIN:VEVENT/i.test(l)) { depth = 1; lines.push(l, ...eventLines(ev), `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`); continue; }
      if (depth >= 1 && /^BEGIN:/i.test(l)) depth++;
      if (depth >= 1 && /^END:/i.test(l)) depth--;
      if (depth === 1 && !keep(l)) continue;
      lines.push(l);
    }
    const out = lines.map(fold).join('\r\n') + '\r\n';
    const r = await dav(href, 'PUT', out, { 'Content-Type': 'text/calendar; charset=utf-8', ...(b.etag ? { 'If-Match': String(b.etag) } : {}) });
    if (r.status === 412) return json({ error: 'changed' }, 409);
    if (!r.ok) return json({ error: 'save_failed', status: r.status }, 502);
    return json({ ok: true, href });
  }
  const cal = String(b.cal ?? '');
  if (!cal.startsWith('https://') || !new URL(cal).hostname.endsWith('icloud.com')) return json({ error: 'bad_calendar' }, 400);
  const uid = crypto.randomUUID();
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Familienplaner//DE', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, ...eventLines(ev), 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  const href = cal.replace(/\/?$/, '/') + uid + '.ics';
  const r = await dav(href, 'PUT', ics, { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' });
  if (!r.ok) return json({ error: 'save_failed', status: r.status }, 502);
  return json({ ok: true, href });
}

/** Serientermine: einen einzelnen Termin oder die ganze Serie ändern bzw. löschen (wie am iPhone).
 *  rid = ursprünglicher Beginn dieses Termins in der Serie (RECURRENCE-ID). */
async function icloudSeries(b: any, op: 'save' | 'delete') {
  const href = String(b.href ?? ''), rid = String(b.rid ?? ''), scope = b.scope === 'all' ? 'all' : 'one';
  if (!href.startsWith('https://') || !new URL(href).hostname.endsWith('icloud.com') || !rid) return json({ error: 'bad_request' }, 400);
  const etag = b.etag ? { 'If-Match': String(b.etag) } : {};
  if (op === 'delete' && scope === 'all') {
    const r = await dav(href, 'DELETE', undefined, etag);
    if (r.status === 412) return json({ error: 'changed' }, 409);
    if (!r.ok && r.status !== 404) return json({ error: 'delete_failed', status: r.status }, 502);
    return json({ ok: true });
  }
  const g = await dav(href, 'GET', undefined, { 'Content-Type': 'text/calendar' });
  if (!g.ok) return json({ error: 'not_found' }, 404);
  const comp = new ICAL.Component(ICAL.parse(await g.text()));
  for (const tz of comp.getAllSubcomponents('vtimezone')) { try { ICAL.TimezoneService.register(tz); } catch { /* schon bekannt */ } }
  const vevents = comp.getAllSubcomponents('vevent');
  const master = vevents.find((v: any) => !v.hasProperty('recurrence-id'));
  if (!master) return json({ error: 'not_found' }, 404);
  const mStart = master.getFirstProperty('dtstart');
  const tzid: string | null = mStart.getParameter('tzid') ?? null;
  const zone = tzid ? ICAL.TimezoneService.get(tzid) : null;
  const allDayMaster = mStart.getFirstValue().isDate;
  // Ursprünglichen Beginn als Zeit in derselben Zeitzone wie die Serie
  const ridTime = ICAL.Time.fromString(rid);
  if (zone && !ridTime.isDate && !/Z$/.test(rid)) ridTime.zone = zone;
  const sameRid = (v: any) => { const x = v.getFirstPropertyValue('recurrence-id'); return x && x.toString() === ridTime.toString(); };
  const setTimeProp = (comp_: any, name: string, value: any) => {
    comp_.removeAllProperties(name);
    const p = new ICAL.Property(name);
    p.setValue(value);
    if (tzid && !value.isDate && value.zone !== ICAL.Timezone.utcTimezone) p.setParameter('tzid', tzid);
    comp_.addProperty(p);
  };
  const timeFor = (date: string, hm?: string) => {
    const [y, mo, d] = date.split('-').map(Number);
    if (!hm) return ICAL.Time.fromData({ year: y, month: mo, day: d, isDate: true });
    const [h, mi] = hm.split(':').map(Number);
    if (zone) return ICAL.Time.fromData({ year: y, month: mo, day: d, hour: h, minute: mi, second: 0 }, zone);
    const u = berlinUtc(date, hm);
    return ICAL.Time.fromData({ year: +u.slice(0, 4), month: +u.slice(4, 6), day: +u.slice(6, 8), hour: +u.slice(9, 11), minute: +u.slice(11, 13), second: 0 }, ICAL.Timezone.utcTimezone);
  };
  const stamp = ICAL.Time.fromJSDate(new Date(), true);
  const bump = (v: any) => { const s = Number(v.getFirstPropertyValue('sequence') ?? 0); v.updatePropertyWithValue('sequence', s + 1); v.updatePropertyWithValue('dtstamp', stamp); v.updatePropertyWithValue('last-modified', stamp); };

  if (op === 'delete') {
    // Nur diesen Termin: als Ausnahme (EXDATE) in der Serie vermerken, eine evtl. geänderte Einzelfassung entfernen
    for (const v of vevents) if (v !== master && sameRid(v)) comp.removeSubcomponent(v);
    const p = new ICAL.Property('exdate');
    p.setValue(ridTime);
    if (tzid && !ridTime.isDate && !/Z$/.test(rid)) p.setParameter('tzid', tzid);
    master.addProperty(p);
    bump(master);
  } else {
    const title = String(b.title ?? '').slice(0, 200), date = String(b.date ?? ''), note = b.note ? String(b.note).slice(0, 2000) : '';
    const time = b.time ? String(b.time) : undefined, end = b.end ? String(b.end) : undefined;
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !/^\d{2}:\d{2}$/.test(time)) || (end && !/^\d{2}:\d{2}$/.test(end))) return json({ error: 'bad_request' }, 400);
    const apply = (v: any, day: string) => {
      v.updatePropertyWithValue('summary', title);
      if (note) v.updatePropertyWithValue('description', note); else v.removeAllProperties('description');
      if (!(allDayMaster && !time)) {
        setTimeProp(v, 'dtstart', timeFor(day, time));
        v.removeAllProperties('duration');
        if (time) setTimeProp(v, 'dtend', timeFor(day, end ?? time));
        else { const n = new Date(day + 'T12:00:00Z'); n.setUTCDate(n.getUTCDate() + 1); setTimeProp(v, 'dtend', timeFor(n.toISOString().slice(0, 10))); }
      }
      bump(v);
    };
    if (scope === 'all') {
      // Ganze Serie: Titel, Notiz und Uhrzeit ändern, der Starttag der Serie bleibt
      const startDay = mStart.getFirstValue().toString().slice(0, 10);
      if (time && allDayMaster) return json({ error: 'bad_request' }, 400);
      const old = mStart.getFirstValue().clone();
      apply(master, startDay);
      // Uhrzeit verschoben: Ausnahmen (gelöschte und einzeln geänderte Termine) mitverschieben, sonst passen sie nicht mehr
      const delta = master.getFirstPropertyValue('dtstart').subtractDate(old);
      if (delta.toSeconds() !== 0) {
        for (const p of master.getAllProperties('exdate')) p.setValues(p.getValues().map((x: any) => { const y = x.clone(); if (!y.isDate) y.addDuration(delta); return y; }));
        for (const v of vevents) if (v !== master) { const p = v.getFirstProperty('recurrence-id'); if (p) { const y = p.getFirstValue().clone(); if (!y.isDate) y.addDuration(delta); p.setValue(y); } }
      }
    } else {
      let ov = vevents.find((v: any) => v !== master && sameRid(v));
      if (!ov) {
        ov = new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())));
        for (const n of ['rrule', 'rdate', 'exdate', 'recurrence-id']) ov.removeAllProperties(n);
        const p = new ICAL.Property('recurrence-id');
        p.setValue(ridTime);
        if (tzid && !ridTime.isDate && !/Z$/.test(rid)) p.setParameter('tzid', tzid);
        ov.addProperty(p);
        comp.addSubcomponent(ov);
      }
      apply(ov, date);
    }
  }
  const r = await dav(href, 'PUT', comp.toString(), { 'Content-Type': 'text/calendar; charset=utf-8', ...etag });
  if (r.status === 412) return json({ error: 'changed' }, 409);
  if (!r.ok) return json({ error: op === 'delete' ? 'delete_failed' : 'save_failed', status: r.status }, 502);
  return json({ ok: true, href });
}

async function icloudAction(body: any, userId: string, admin: any) {
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  const fid = m0.family_id, parent = m0.role === 'eltern';
  if (body.action === 'icloud_connect') {
    if (!parent) return json({ error: 'parents_only' }, 403);
    const c = { u: String(body.user ?? '').trim(), p: String(body.pass ?? '').replace(/\s|-/g, '') };
    if (!/^\S+@\S+\.\S+$/.test(c.u) || c.p.length !== 16) return json({ error: 'icloud_bad_input' }, 400);
    try { await icCtx.run(c, () => icloudHome()); }
    catch (e) { const m = (e as Error).message; return json({ error: m === 'icloud_auth' ? 'icloud_auth' : m === 'icloud_discovery' ? 'icloud_discovery' : 'icloud_failed' }, 502); }
    const { error } = await admin.from('family_secrets').upsert({ family_id: fid, kind: 'icloud', value: await seal(c), updated_at: new Date().toISOString() });
    if (error) return json({ error: 'icloud_sql', detail: error.message }, 500);
    return json({ ok: true, user: c.u });
  }
  if (body.action === 'icloud_disconnect') {
    if (!parent) return json({ error: 'parents_only' }, 403);
    await admin.from('family_secrets').delete().eq('family_id', fid).eq('kind', 'icloud');
    return json({ ok: true });
  }
  const { data: sec } = await admin.from('family_secrets').select('value').eq('family_id', fid).eq('kind', 'icloud').maybeSingle();
  const cred: IcCred | null = sec ? await unseal(sec.value) : null;
  if (body.action === 'icloud_status') return json({ connected: !!cred, user: cred?.u });
  const g = await googleLoad(admin, fid);
  // Google-Kalender laufen über dieselben Aktionen; erkannt an der Adresse (googleapis.com)
  try {
    if (body.action === 'icloud_calendars') {
      if (!parent) return json({ error: 'parents_only' }, 403);
      if (!cred && !g) return json({ error: 'icloud_not_set' }, 503);
      const ic = cred ? await icCtx.run(cred, () => icloudCalendars()) : [];
      const gc = g ? await googleCalendars(g) : [];
      return json({ calendars: [...ic, ...gc] });
    }
    if (body.action === 'icloud_events') {
      const from = String(body.from ?? ''), to = String(body.to ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'bad_request' }, 400);
      const cals: string[] = (Array.isArray(body.cals) ? body.cals : []).slice(0, 16).map(String);
      const gcals = cals.filter(isGoogle), icals = cals.filter(c => !isGoogle(c));
      const ge = g ? (await Promise.all(gcals.map(c => googleEvents(g, c, from, to).catch(() => [])))).flat() : [];
      const ie = cred && icals.length ? await icCtx.run(cred, async () => (await Promise.all(icals.map(c => icloudEvents(c, from, to).catch(e => { if ((e as Error).message === 'icloud_auth') throw e; return []; })))).flat()) : [];
      return json({ events: [...ie, ...ge] });
    }
    if (isGoogle(String(body.href ?? body.cal ?? ''))) {
      if (!parent) return json({ error: 'parents_only' }, 403);
      if (!g) return json({ error: 'google_not_set' }, 503);
      if (body.action === 'icloud_save') return await googleSave(g, body);
      if (body.action === 'icloud_delete') return await googleDelete(g, body);
    }
  } catch (e) {
    const m = (e as Error).message;
    return json({ error: ['icloud_auth', 'icloud_discovery', 'google_auth'].includes(m) ? m : 'icloud_failed' }, 502);
  }
  if (!cred) return json({ error: 'icloud_not_set' }, 503);
  return await icCtx.run(cred, () => icloudInner(body, parent));
}

async function icloudInner(body: any, parent: boolean) {
  try {
    if (body.action === 'icloud_calendars') { if (!parent) return json({ error: 'parents_only' }, 403); return json({ calendars: await icloudCalendars() }); }
    if (body.action === 'icloud_events') {
      const from = String(body.from ?? ''), to = String(body.to ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'bad_request' }, 400);
      const cals: string[] = (Array.isArray(body.cals) ? body.cals : []).slice(0, 12).map(String);
      const all = await Promise.all(cals.map(c => icloudEvents(c, from, to).catch(e => { if ((e as Error).message === 'icloud_auth') throw e; return []; })));
      return json({ events: all.flat() });
    }
    if (!parent) return json({ error: 'parents_only' }, 403);
    if (body.action === 'icloud_save') return body.rid ? await icloudSeries(body, 'save') : await icloudSave(body);
    if (body.action === 'icloud_delete' && body.rid) return await icloudSeries(body, 'delete');
    if (body.action === 'icloud_delete') {
      const href = String(body.href ?? '');
      if (!href.startsWith('https://') || !new URL(href).hostname.endsWith('icloud.com')) return json({ error: 'bad_calendar' }, 400);
      const r = await dav(href, 'DELETE', undefined, body.etag ? { 'If-Match': String(body.etag) } : {});
      if (r.status === 412) return json({ error: 'changed' }, 409);
      if (!r.ok && r.status !== 404) return json({ error: 'delete_failed', status: r.status }, 502);
      return json({ ok: true });
    }
  } catch (e) {
    const m = (e as Error).message;
    return json({ error: m === 'icloud_auth' ? 'icloud_auth' : m === 'icloud_discovery' ? 'icloud_discovery' : 'icloud_failed' }, 502);
  }
  return json({ error: 'unknown_action' }, 400);
}


// ---------- Google-Kalender (OAuth, lesen und schreiben) ----------
// Braucht Secrets GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET (Google Cloud › OAuth-Client „Webanwendung“).
// Weiterleitungs-URI dort: <SUPABASE_URL>/functions/v1/familie
// Gespeichert wird nur der Refresh-Token, verschlüsselt in family_secrets (kind 'google').
const G_ID = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
const G_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
const G_API = 'https://www.googleapis.com/calendar/v3';
const G_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events';
const G_BACK = /^https:\/\/(christoph589\.github\.io|(www\.)?famelio\.de)(\/|$)|^http:\/\/localhost(:\d+)?(\/|$)/;
type GCred = { rt: string; email?: string; fid: string };
const isGoogle = (u: string) => u.startsWith(G_API + '/');
const gRedirect = () => URL_.replace(/\/$/, '') + '/functions/v1/familie';
const gTokens = new Map<string, { at: string; exp: number }>();

async function googleLoad(admin: any, fid: string): Promise<GCred | null> {
  const { data } = await admin.from('family_secrets').select('value').eq('family_id', fid).eq('kind', 'google').maybeSingle();
  return data ? { ...(await unseal(data.value)), fid } : null;
}
async function gToken(c: GCred): Promise<string> {
  const t = gTokens.get(c.fid);
  if (t && t.exp > Date.now() + 60_000) return t.at;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: G_ID ?? '', client_secret: G_SECRET ?? '', refresh_token: c.rt, grant_type: 'refresh_token' }) });
  if (!r.ok) throw new Error('google_auth');
  const j = await r.json();
  gTokens.set(c.fid, { at: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}
async function gFetch(c: GCred, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + await gToken(c), 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 401) { gTokens.delete(c.fid); throw new Error('google_auth'); }
  return r;
}
async function googleCalendars(c: GCred) {
  const r = await gFetch(c, G_API + '/users/me/calendarList?minAccessRole=reader&maxResults=100');
  if (!r.ok) throw new Error('google_auth');
  const j = await r.json();
  return (j.items ?? []).map((x: any) => ({ href: G_API + '/calendars/' + encodeURIComponent(x.id), name: (x.summaryOverride ?? x.summary ?? 'Kalender') + ' (Google)', color: x.backgroundColor ?? '#4285f4', readOnly: !['owner', 'writer'].includes(x.accessRole) }));
}
const gLocal = (iso: string) => { // RFC3339 -> Berliner Datum + Uhrzeit
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const addDay = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
async function googleEvents(c: GCred, cal: string, from: string, to: string) {
  const out: any[] = [];
  let page = '';
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: from + 'T00:00:00Z', timeMax: to + 'T00:00:00Z', maxResults: '2500', timeZone: TZ, ...(page ? { pageToken: page } : {}) });
    const r = await gFetch(c, cal + '/events?' + q);
    if (!r.ok) throw new Error('google_failed');
    const j = await r.json();
    for (const e of j.items ?? []) {
      if (e.status === 'cancelled') continue;
      const base = { title: e.summary ?? '(ohne Titel)', href: cal + '/events/' + encodeURIComponent(e.id), etag: e.etag ?? '', cal, recurring: !!e.recurringEventId, rid: e.recurringEventId, note: e.description ? String(e.description).replace(/<[^>]+>/g, '').slice(0, 500) : undefined };
      if (e.start?.date) {
        const last = addDay(e.end?.date ?? addDay(e.start.date, 1), -1);
        const multi = last > e.start.date;
        for (let d = e.start.date, k = 0; d <= last && k < 31; d = addDay(d, 1), k++) out.push({ ...base, uid: e.id + (multi ? ':' + d : ''), date: d, allDay: true, editable: !multi });
      } else if (e.start?.dateTime) {
        const a = gLocal(e.start.dateTime), b = e.end?.dateTime ? gLocal(e.end.dateTime) : null;
        out.push({ ...base, uid: e.id, date: a.date, time: a.time, end: b && b.date === a.date ? b.time : undefined, allDay: false, editable: true });
      }
    }
    page = j.nextPageToken ?? '';
    if (!page) break;
  }
  return out;
}
const gTimes = (date: string, time?: string, end?: string) => {
  if (!time) return { start: { date }, end: { date: addDay(date, 1) } };
  const iso = (t: string) => { const u = berlinUtc(date, t); return `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:00Z`; };
  const e = end && end > time ? end : `${String(Math.min(23, +time.slice(0, 2) + 1)).padStart(2, '0')}:${time.slice(3)}`;
  return { start: { dateTime: iso(time), timeZone: TZ }, end: { dateTime: iso(e), timeZone: TZ } };
};
async function googleSave(c: GCred, b: any) {
  const ev = { title: String(b.title ?? '').slice(0, 200), date: String(b.date ?? ''), time: b.time ? String(b.time) : undefined, end: b.end ? String(b.end) : undefined, note: b.note ? String(b.note).slice(0, 2000) : undefined };
  if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) || (ev.time && !/^\d{2}:\d{2}$/.test(ev.time)) || (ev.end && !/^\d{2}:\d{2}$/.test(ev.end))) return json({ error: 'bad_request' }, 400);
  const body: any = { summary: ev.title, description: ev.note ?? '', ...gTimes(ev.date, ev.time, ev.end) };
  if (b.href) {
    let href = String(b.href);
    if (!isGoogle(href)) return json({ error: 'bad_calendar' }, 400);
    const ifm: Record<string, string> = b.etag ? { 'If-Match': String(b.etag) } : {};
    if (b.rid && b.scope === 'all') {
      // Ganze Serie: Titel, Notiz und Uhrzeit an der Serie ändern, Datum der Serie bleibt
      href = href.replace(/\/events\/[^/]+$/, '/events/' + encodeURIComponent(String(b.rid)));
      const m = await gFetch(c, href);
      if (!m.ok) return json({ error: 'not_found' }, 404);
      const master = await m.json();
      const d0 = master.start?.date ?? gLocal(master.start.dateTime).date;
      Object.assign(body, gTimes(d0, ev.time, ev.end));
      if (master.start?.timeZone && body.start.dateTime) { body.start.timeZone = master.start.timeZone; body.end.timeZone = master.start.timeZone; }
      const r = await gFetch(c, href, { method: 'PATCH', body: JSON.stringify(body) });
      if (!r.ok) return json({ error: 'save_failed', status: r.status }, 502);
      return json({ ok: true, href });
    }
    const r = await gFetch(c, href, { method: 'PATCH', body: JSON.stringify(body), headers: ifm });
    if (r.status === 412) return json({ error: 'changed' }, 409);
    if (!r.ok) return json({ error: 'save_failed', status: r.status }, 502);
    return json({ ok: true, href });
  }
  const cal = String(b.cal ?? '');
  if (!isGoogle(cal)) return json({ error: 'bad_calendar' }, 400);
  const r = await gFetch(c, cal + '/events', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return json({ error: 'save_failed', status: r.status }, 502);
  const j = await r.json();
  return json({ ok: true, href: cal + '/events/' + encodeURIComponent(j.id) });
}
async function googleDelete(c: GCred, b: any) {
  let href = String(b.href ?? '');
  if (!isGoogle(href)) return json({ error: 'bad_calendar' }, 400);
  const all = b.rid && b.scope === 'all';
  if (all) href = href.replace(/\/events\/[^/]+$/, '/events/' + encodeURIComponent(String(b.rid)));
  const r = await gFetch(c, href, { method: 'DELETE', headers: !all && b.etag ? { 'If-Match': String(b.etag) } : {} });
  if (r.status === 412) return json({ error: 'changed' }, 409);
  if (!r.ok && r.status !== 404 && r.status !== 410) return json({ error: 'delete_failed', status: r.status }, 502);
  return json({ ok: true });
}

async function googleAction(body: any, userId: string, admin: any) {
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  const fid = m0.family_id, parent = m0.role === 'eltern';
  if (body.action === 'google_status') { const g = await googleLoad(admin, fid); return json({ connected: !!g, email: g?.email, ready: !!(G_ID && G_SECRET) }); }
  if (!parent) return json({ error: 'parents_only' }, 403);
  if (body.action === 'google_auth_url') {
    if (!G_ID || !G_SECRET) return json({ error: 'google_not_ready' }, 503);
    const back = String(body.back ?? '');
    if (!G_BACK.test(back)) return json({ error: 'bad_request' }, 400);
    const state = await seal({ fid, back, t: Date.now() });
    const q = new URLSearchParams({ client_id: G_ID, redirect_uri: gRedirect(), response_type: 'code', scope: G_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, ...(body.hint ? { login_hint: String(body.hint) } : {}) });
    return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
  }
  if (body.action === 'google_disconnect') {
    const g = await googleLoad(admin, fid);
    if (g) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(g.rt), { method: 'POST' }).catch(() => {});
    await admin.from('family_secrets').delete().eq('family_id', fid).eq('kind', 'google');
    gTokens.delete(fid);
    return json({ ok: true });
  }
  return json({ error: 'unknown_action' }, 400);
}

/** Google leitet nach der Freigabe hierher zurück (GET ?code=…&state=…). */
async function googleCallback(u: URL, admin: any) {
  let st: { fid: string; back: string; t: number };
  try { st = await unseal(u.searchParams.get('state') ?? ''); } catch { return new Response('Ungültiger Link', { status: 400 }); }
  if (!G_BACK.test(st.back) || Date.now() - st.t > 30 * 60_000) return new Response('Link abgelaufen', { status: 400 });
  const go = (res: string) => Response.redirect(st.back + (st.back.includes('?') ? '&' : '?') + 'google=' + res, 302);
  const code = u.searchParams.get('code');
  if (!code) return go('abgebrochen');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: G_ID ?? '', client_secret: G_SECRET ?? '', redirect_uri: gRedirect(), grant_type: 'authorization_code' }) });
  if (!r.ok) return go('fehler');
  const j = await r.json();
  if (!j.refresh_token) return go('fehler');
  let email: string | undefined;
  try { email = JSON.parse(atob(String(j.id_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email; } catch { /* egal */ }
  const { error } = await admin.from('family_secrets').upsert({ family_id: st.fid, kind: 'google', value: await seal({ rt: j.refresh_token, email }), updated_at: new Date().toISOString() });
  if (error) return go('fehler');
  gTokens.set(st.fid, { at: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return go('ok');
}

// ---------- WebUntis über den Zugang aus „Freigaben › Zugriff über Untis Mobile“ ----------
// Gespeichert wird nur der App-Schlüssel (nicht das Passwort), verschlüsselt in family_secrets.
// Genutzt wird dieselbe Schnittstelle wie die Untis-Mobile-App (inoffiziell, kann sich ändern).
type UntisCred = { host: string; school: string; user: string; key: string };

async function aesKey() {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('familie-secrets:' + SERVICE));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function seal(obj: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(JSON.stringify(obj))));
  return b64(iv) + '.' + b64(ct);
}
async function unseal(s: string) {
  const [iv, ct] = s.split('.');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(), unb64(ct))));
}

function base32(s: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
/** Einmal-Code (TOTP, 30 s, 6 Ziffern) wie in der Untis-Mobile-App */
export async function totp(secret: string, now = Date.now()) {
  const counter = Math.floor(now / 30000);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, counter);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  const k = await crypto.subtle.importKey('raw', base32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

async function untisRpc(c: UntisCred, method: string, params: Record<string, unknown>) {
  const now = Date.now();
  const auth = { user: c.user, otp: await totp(c.key, now), clientTime: now };
  const r = await fetch(`https://${c.host}/WebUntis/jsonrpc_intern.do?m=${method}&school=${encodeURIComponent(c.school)}&v=i2.2`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Familienplaner/1.0' },
    body: JSON.stringify({ id: String(now), method, params: [{ ...params, auth }], jsonrpc: '2.0' }),
  });
  const text = await r.text();
  let j: any;
  try { j = JSON.parse(text); } catch { throw Object.assign(new Error('untis_failed'), { detail: `HTTP ${r.status}: ${text.slice(0, 160)}` }); }
  if (j.error) throw Object.assign(new Error(/auth|credential|otp|secret|-8504|-8998/i.test(JSON.stringify(j.error)) ? 'untis_auth' : 'untis_failed'), { detail: `${j.error.code ?? ''} ${j.error.message ?? ''}`.trim() });
  return j.result;
}

function untisCred(b: any): UntisCred | null {
  const host = String(b.host ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const school = String(b.school ?? '').trim();
  const user = String(b.user ?? '').trim();
  const key = String(b.key ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^[a-z0-9-]+\.webuntis\.com$/.test(host) || !school || !user || !/^[A-Z2-7]{8,64}$/.test(key)) return null;
  return { host, school, user, key };
}

/** Schüler, die dieser Zugang sehen darf: bei Eltern die Kinder, sonst man selbst */
async function untisStudents(c: UntisCred) {
  const r = await untisRpc(c, 'getUserData2017', { elementId: 0, deviceOs: 'AND', deviceOsVersion: '' });
  const u = r?.userData ?? {};
  const kids = (u.children ?? []).map((k: any) => ({ id: Number(k.id), name: String(k.displayName ?? k.name ?? k.id) }));
  if (!kids.length && u.elemType === 'STUDENT') kids.push({ id: Number(u.elemId), name: String(u.displayName ?? 'Ich') });
  return { students: kids, who: String(u.displayName ?? ''), type: String(u.elemType ?? ''), subjects: r?.masterData?.subjects ?? [] };
}

const hmOf = (s: string) => { const m = /T(\d{2}):(\d{2})/.exec(s); return m ? `${m[1]}:${m[2]}` : ''; };
async function untisWeek(c: UntisCred, id: number, from: string, to: string) {
  const r = await untisRpc(c, 'getTimetable2017', { id, type: 'STUDENT', startDate: from, endDate: to, masterDataTimestamp: 0, timetableTimestamp: 0, timetableTimestamps: [] });
  const subjects = new Map<number, any>();
  for (const s of r?.masterData?.subjects ?? []) subjects.set(Number(s.id), s);
  const periods: any[] = r?.timetable?.periods ?? [];
  const lessons = periods.map(p => {
    const flags: string[] = Array.isArray(p.is) ? p.is.map(String) : Object.keys(p.is ?? {}).filter(k => p.is[k]);
    const subj = (p.elements ?? []).find((e: any) => e.type === 'SUBJECT');
    const sm = subj ? subjects.get(Number(subj.id)) : null;
    return {
      date: String(p.startDateTime ?? '').slice(0, 10), from: hmOf(String(p.startDateTime ?? '')), to: hmOf(String(p.endDateTime ?? '')),
      subject: String(sm?.name ?? p.text?.lesson ?? ''), long: String(sm?.longName ?? ''), event: !sm,
      cancelled: flags.some(f => /cancel/i.test(f)), changed: flags.some(f => /irregular|substit|additional|shift/i.test(f)),
      info: [p.text?.substitution, p.text?.info].filter(Boolean).join(' · ').slice(0, 200),
    };
  }).filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.from);
  return { lessons, raw: periods.length ? { keys: Object.keys(periods[0]), start: periods[0].startDateTime, is: periods[0].is } : null };
}

async function untisAction(body: any, userId: string, admin: any) {
  const m0 = await memberOf(admin, userId);
  if (!m0) return json({ error: 'not_member' }, 403);
  const fid = m0.family_id, parent = m0.role === 'eltern';
  // Mehrere Zugänge (z. B. Kinder an verschiedenen Schulen): slot 0 = 'untis', slot 1 = 'untis2' …
  const slot = Math.max(0, Math.min(3, Number(body.slot) || 0));
  const kind = slot ? `untis${slot + 1}` : 'untis';
  const load = async (): Promise<UntisCred | null> => {
    const { data, error } = await admin.from('family_secrets').select('value').eq('family_id', fid).eq('kind', kind).maybeSingle();
    if (error) throw Object.assign(new Error('untis_sql'), { detail: error.message });
    return data ? await unseal(data.value) : null;
  };
  try {
    if (body.action === 'untis_connect') {
      if (!parent) return json({ error: 'parents_only' }, 403);
      const c = untisCred(body);
      if (!c) return json({ error: 'untis_bad_input' }, 400);
      const info = await untisStudents(c);
      const { error } = await admin.from('family_secrets').upsert({ family_id: fid, kind, value: await seal(c), updated_at: new Date().toISOString() });
      if (error) return json({ error: 'untis_sql', detail: error.message }, 500);
      return json({ students: info.students, who: info.who, type: info.type });
    }
    if (body.action === 'untis_disconnect') {
      if (!parent) return json({ error: 'parents_only' }, 403);
      await admin.from('family_secrets').delete().eq('family_id', fid).eq('kind', kind);
      return json({ ok: true });
    }
    if (body.action === 'untis_week') {
      const from = String(body.from ?? ''), to = String(body.to ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'bad_request' }, 400);
      const c = await load();
      if (!c) return json({ error: 'untis_not_set' }, 404);
      const ids: number[] = (Array.isArray(body.students) ? body.students : []).slice(0, 8).map(Number).filter((n: number) => n > 0);
      const out: Record<string, unknown> = {};
      for (const id of ids) out[id] = await untisWeek(c, id, from, to);
      return json({ weeks: out });
    }
  } catch (e) {
    const m = (e as Error).message;
    return json({ error: ['untis_auth', 'untis_sql'].includes(m) ? m : 'untis_failed', detail: (e as any).detail ?? m }, 502);
  }
  return json({ error: 'unknown_action' }, 400);
}

if (typeof Deno !== 'undefined' && (Deno as any).serve) Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const u = new URL(req.url);
    if (req.method === 'GET' && u.searchParams.has('state') && (u.searchParams.has('code') || u.searchParams.has('error'))) return await googleCallback(u, admin);
    const token = u.searchParams.get('ics');
    if (req.method === 'GET' && token) {
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response('Not found', { status: 404 });
      const { data: fam } = await admin.from('families').select('id, name').eq('ics_token', token).maybeSingle();
      if (!fam) return new Response('Not found', { status: 404 });
      const { data: st } = await admin.from('family_state').select('data').eq('family_id', fam.id).single();
      const d = st!.data as any;
      const people: Person[] = [...(d.parents ?? [{ id: 'mama', name: 'Mama' }, { id: 'papa', name: 'Papa' }]), ...(d.children ?? [])];
      const ics = buildIcs(fam.name, (d.events ?? []).filter((e: any) => !e.priv), people, d.children ?? []);
      return new Response(ics, { headers: { ...cors, 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'max-age=300' } });
    }

    if (req.method === 'POST' && req.headers.get('content-type')?.includes('json') && !req.headers.get('Authorization')) {
      const body = await req.clone().json().catch(() => ({}));
      if (body.action === 'tick') return await tick(body, admin);
    }

    if (req.method === 'POST') {
      const auth = req.headers.get('Authorization') ?? '';
      const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: user } = await userClient.auth.getUser();
      if (!user?.user) return json({ error: 'not_signed_in' }, 401);
      const body = await req.json();
      // Abruf fremder Adressen nur für Mitglieder einer Familie (sonst nutzbar als offener Abruf-Dienst)
      if ((body.action === 'import' || body.action === 'recipe_import') && !await memberOf(admin, user.user.id)) return json({ error: 'not_member' }, 403);
      if (body.action === 'ai') return await runAi(body, user.user.id, admin);
      if (body.action === 'judge') return await runJudge(body, user.user.id, admin);
      if (String(body.action).startsWith('train_')) return await trainAction(body, user.user.id, admin);
      if (String(body.action).startsWith('push_')) return await pushAction(body, user.user.id, admin);
      if (String(body.action).startsWith('icloud_')) return await icloudAction(body, user.user.id, admin);
      if (String(body.action).startsWith('google_')) return await googleAction(body, user.user.id, admin);
      if (String(body.action).startsWith('untis_')) return await untisAction(body, user.user.id, admin);
      if (body.action === 'recipe_import') return await recipeImport(body);
      if (body.action === 'import') {
        let url = String(body.url ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
        try { url = new URL(url).toString(); } catch { return json({ error: 'bad_url' }, 400); }
        let r: Response;
        try { r = await fetchPublic(url); }
        catch (e) { return json({ error: (e as Error).message === 'host_not_allowed' ? 'host_not_allowed' : 'fetch_failed' }, 400); }
        if (!r.ok) return json({ error: 'fetch_failed', status: r.status }, 502);
        const text = await r.text();
        if (text.length > 5_000_000 || !text.includes('BEGIN:VCALENDAR')) return json({ error: 'not_ical' }, 502);
        const today = new Date();
        const from = new Date(today.getTime() - 31 * 864e5).toISOString().slice(0, 10);
        const to = new Date(today.getTime() + 400 * 864e5).toISOString().slice(0, 10);
        return json({ events: parseIcs(text, from, to) });
      }
      return json({ error: 'unknown_action' }, 400);
    }
    return new Response('Not found', { status: 404, headers: cors });
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
