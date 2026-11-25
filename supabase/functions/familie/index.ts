// Familienplaner: Kalender-Abos und KI
//
// GET  /familie?ics=<token>          Familienkalender als iCal-Abo (für iPhone, Mac, Google, Outlook)
// POST /familie {action:'import', url} Fremden Kalender (iCal-Link) einlesen, nur für angemeldete Geräte
// POST /familie {action:'push_key' | 'push_sub' | 'push_test'}  Erinnerungen aufs Handy (Web-Push), braucht fix-05-erinnerungen.sql
// POST /familie {action:'icloud_calendars' | 'icloud_events' | 'icloud_save' | 'icloud_delete'} iCloud-Kalender lesen und schreiben (Secrets ICLOUD_USER, ICLOUD_APP_PASSWORD)
// POST /familie {action:'tick', token}  kommt alle 5 Minuten vom Zeitplan aus fix-05 und verschickt fällige Erinnerungen
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
import webpush from 'npm:web-push@3.6.7';

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
  for (const raw of (Array.isArray(body.images) ? body.images : []).slice(0, 20)) {
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

// ---------- Erinnerungen (Web-Push) ----------

async function vapid(admin: any) {
  const { data: cfg, error } = await admin.from('push_config').select('public_key, private_key, tick_token').eq('id', 1).single();
  if (error || !cfg) throw new Error('no_sql');
  if (!cfg.public_key) {
    const k = webpush.generateVAPIDKeys();
    await admin.from('push_config').update({ public_key: k.publicKey, private_key: k.privateKey }).eq('id', 1);
    cfg.public_key = k.publicKey; cfg.private_key = k.privateKey;
  }
  webpush.setVapidDetails('https://christoph589.github.io/Family/', cfg.public_key, cfg.private_key);
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
      const to = recipients(ev, d);
      const target = rows.filter(r => !to || !r.person_id || to.has(r.person_id));
      const when = ev.remind === -1 || ev.remind >= 1440 ? (ev.time ? `Morgen ${ev.time} Uhr` : 'Morgen') : ev.time ? `Heute ${ev.time} Uhr` : 'Heute';
      const lines = [ev.who?.length ? ev.who.map(name).filter(Boolean).join(', ') : '', ev.bring || ev.pick ? [name(ev.bring) && `🚗 ${name(ev.bring)}`, name(ev.pick) && `🏠 ${name(ev.pick)}`].filter(Boolean).join(' · ') : '', ev.note ?? ''].filter(Boolean);
      total += await sendTo(admin, target, { title: `${ev.icon ? ev.icon + ' ' : ''}${ev.title}`, body: [when, ...lines].join('\n'), tag: key });
    }
  }
  await admin.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 14 * 864e5).toISOString());
  return json({ ok: true, sent: total });
}

async function pushAction(body: any, userId: string, admin: any) {
  let cfg;
  try { cfg = await vapid(admin); } catch { return json({ error: 'no_sql' }, 500); }
  if (body.action === 'push_key') return json({ key: cfg.public_key });
  const { data: mem } = await admin.from('members').select('family_id').eq('user_id', userId).limit(1);
  if (!mem?.length) return json({ error: 'not_member' }, 403);
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

// ---------- Server ----------


// ---------- iCloud-Kalender (CalDAV, lesen und schreiben) ----------
// Braucht zwei Geheimnisse in Supabase (Edge Functions > Secrets):
//   ICLOUD_USER          = Apple-ID (E-Mail)
//   ICLOUD_APP_PASSWORD  = app-spezifisches Passwort von appleid.apple.com (nicht das normale Apple-Passwort)
const IC_USER = Deno.env.get('ICLOUD_USER');
const IC_PASS = Deno.env.get('ICLOUD_APP_PASSWORD');
const IC_ROOT = 'https://caldav.icloud.com';

async function dav(url: string, method: string, body?: string, headers: Record<string, string> = {}) {
  return await fetch(url, {
    method, body,
    headers: { Authorization: 'Basic ' + btoa(`${IC_USER}:${IC_PASS}`), 'Content-Type': 'application/xml; charset=utf-8', ...headers },
  });
}
const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;|&#x[dD];/g, '\r').replace(/&#10;|&#x[aA];/g, '\n').replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => { const m = new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml); return m ? m[1] : undefined; };
const responses = (xml: string) => xml.match(/<(?:[\w-]+:)?response[\s>][\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
const abs = (base: string, href: string) => new URL(href.trim(), base).toString();

let icHome: string | null = null;
async function icloudHome(): Promise<string> {
  if (icHome) return icHome;
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
  icHome = abs(purl, home);
  return icHome;
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
    const recurring = /\nRRULE:/i.test(ics) || /\nRECURRENCE-ID/i.test(ics);
    let notes = '';
    try { notes = String(new ICAL.Event(new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')).description ?? ''); } catch { /* egal */ }
    for (const e of parseIcs(ics, from, to)) {
      const multi = e.uid.includes(':') && !recurring; // mehrtägiger Ganztagstermin
      out.push({ ...e, href: abs(cal, href), etag: unxml(tag(x, 'getetag') ?? ''), cal, recurring, editable: !recurring && !multi, note: notes.slice(0, 500) || undefined });
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
    if (/\nRRULE:/i.test(text)) return json({ error: 'recurring' }, 400);
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

async function icloudAction(body: any, userId: string, admin: any) {
  if (!IC_USER || !IC_PASS) return json({ error: 'icloud_not_set' }, 503);
  const { data: mem } = await admin.from('members').select('role').eq('user_id', userId).limit(1);
  if (!mem?.length) return json({ error: 'not_member' }, 403);
  const parent = mem[0].role === 'eltern';
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
    if (body.action === 'icloud_save') return await icloudSave(body);
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
      if (body.action === 'ai') return await runAi(body, user.user.id, admin);
      if (String(body.action).startsWith('push_')) return await pushAction(body, user.user.id, admin);
      if (String(body.action).startsWith('icloud_')) return await icloudAction(body, user.user.id, admin);
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
