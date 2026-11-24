// Familienplaner: Kalender-Abos und KI
//
// GET  /familie?ics=<token>          Familienkalender als iCal-Abo (für iPhone, Mac, Google, Outlook)
// POST /familie {action:'import', url} Fremden Kalender (iCal-Link) einlesen, nur für angemeldete Geräte
// POST /familie {action:'ai', prompt, images} KI-Test und Vokabel-Foto, nur für Mitglieder einer Familie,
//      höchstens AI_DAILY Aufrufe pro Familie und Tag. Braucht das Secret ANTHROPIC_API_KEY und fix-03-ki.sql.
//
// Einspielen: Supabase Dashboard > Edge Functions > Deploy a new function > Via Editor,
// Name "familie", diesen Code einfügen, Deploy. Danach bei der Funktion
// "Enforce JWT Verification" ausschalten (Kalender-Apps schicken keinen Login mit).
// Die Funktion prüft den Login für den Import selbst.

import ICAL from 'npm:ical.js@1.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0';

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

export type Out = { uid: string; title: string; date: string; time?: string; end?: string; allDay: boolean };

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
  const push = (uid: string, title: string, s: any, e: any) => {
    if (s.isDate) {
      const last = e ? (() => { const x = e.clone(); x.adjust(-1, 0, 0, 0); return x; })() : s;
      // mehrtägig: für jeden Tag ein Eintrag (max. 31)
      const cur = s.clone();
      for (let i = 0; i < 31 && cur.compare(last) <= 0; i++) { out.push({ uid: uid + ':' + isoOf(cur), title, date: isoOf(cur), allDay: true }); cur.adjust(1, 0, 0, 0); }
    } else {
      const a = local(s.toJSDate()), b = e ? local(e.toJSDate()) : undefined;
      out.push({ uid, title, date: a.date, time: a.time, end: b && b.date === a.date ? b.time : undefined, allDay: false });
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
      push(ev.uid + ':' + n.toString(), String(det.item.summary ?? title), det.startDate, det.endDate);
    }
  }
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

// ---------- KI ----------

const AI_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const AI_MODEL = 'claude-opus-5-5';
const AI_DAILY = 30;
const IMG = /^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;
const berlinDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

async function runAi(body: any, userId: string, admin: any) {
  if (!AI_KEY) return json({ error: 'no_key' }, 503);
  const prompt = String(body.prompt ?? '');
  if (!prompt || prompt.length > 20000) return json({ error: 'bad_request' }, 400);
  const images: any[] = [];
  for (const raw of (Array.isArray(body.images) ? body.images : []).slice(0, 8)) {
    const m = IMG.exec(String(raw));
    if (!m || m[2].length > 6_000_000) return json({ error: 'image_rejected' }, 400);
    images.push(m[1] === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: m[1], data: m[2] } }
      : { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }

  // Nur Mitglieder einer Familie, mit Tageslimit pro Familie (schützt vor hohen Kosten)
  const { data: mem } = await admin.from('members').select('family_id').eq('user_id', userId).limit(1);
  if (!mem?.length) return json({ error: 'not_member' }, 403);
  const fid = mem[0].family_id;
  const { data: fam, error: famErr } = await admin.from('families').select('ai_day, ai_count').eq('id', fid).single();
  if (famErr) return json({ error: 'no_sql' }, 500);
  const day = berlinDay();
  const used = fam.ai_day === day ? fam.ai_count : 0;
  if (used >= AI_DAILY) return json({ error: 'daily_limit' }, 429);
  await admin.from('families').update({ ai_day: day, ai_count: used + 1 }).eq('id', fid);

  const client = new Anthropic({ apiKey: AI_KEY });
  try {
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
    return json({ text, left: AI_DAILY - used - 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json({ error: 'bad_key' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: /credit|billing/i.test(e.message) ? 'no_credit' : 'image_rejected', message: e.message }, 400);
    if (e instanceof Anthropic.APIError) return json({ error: 'ai_down', status: e.status }, 502);
    throw e;
  }
}

// ---------- Server ----------

if (typeof Deno !== 'undefined' && (Deno as any).serve) Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const u = new URL(req.url);
    const token = u.searchParams.get('ics');
    if (req.method === 'GET' && token) {
      if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response('Not found', { status: 404 });
      const { data: fam } = await admin.from('families').select('id, name').eq('ics_token', token).maybeSingle();
      if (!fam) return new Response('Not found', { status: 404 });
      const { data: st } = await admin.from('family_state').select('data').eq('family_id', fam.id).single();
      const d = st!.data as any;
      const people: Person[] = [...(d.parents ?? [{ id: 'mama', name: 'Mama' }, { id: 'papa', name: 'Papa' }]), ...(d.children ?? [])];
      const ics = buildIcs(fam.name, d.events ?? [], people, d.children ?? []);
      return new Response(ics, { headers: { ...cors, 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'max-age=300' } });
    }

    if (req.method === 'POST') {
      const auth = req.headers.get('Authorization') ?? '';
      const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: user } = await userClient.auth.getUser();
      if (!user?.user) return json({ error: 'not_signed_in' }, 401);
      const body = await req.json();
      if (body.action === 'ai') return await runAi(body, user.user.id, admin);
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
    return json({ error: 'server', message: String((e as Error)?.message ?? e) }, 500);
  }
});
