import { useEffect, useRef } from 'react';
import { cloudEnabled, sb } from './cloud';
import { addDaysIso, setSchoolChange, today } from './logic';
import { FamilyData, Timetable } from './types';

/** WebUntis über die Server-Funktion. Zugang = App-Schlüssel aus „Freigaben › Zugriff über Untis Mobile“. */
export interface UntisLesson { date: string; from: string; to: string; subject: string; long: string; cancelled: boolean; changed: boolean; info: string }

const ERR: Record<string, string> = {
  untis_bad_input: 'Bitte Adresse (…webuntis.com), Schule, Benutzer und Schlüssel genau so eintragen, wie WebUntis sie anzeigt.',
  untis_auth: 'WebUntis lehnt den Zugang ab. Stimmen Benutzer und Schlüssel? Nach „Geräte abmelden“ gibt es einen neuen Schlüssel.',
  untis_sql: 'Auf dem Server fehlt noch die Tabelle. Bitte das SQL „fix-06-webuntis“ einspielen.',
  untis_not_set: 'WebUntis ist noch nicht verbunden.',
  untis_failed: 'WebUntis hat nicht wie erwartet geantwortet.',
  parents_only: 'Das dürfen nur Eltern.',
};

async function call<T>(body: object): Promise<T> {
  if (!cloudEnabled) throw new Error('WebUntis geht nur mit Server-Verbindung.');
  const { data, error } = await sb().functions.invoke('familie', { body });
  if (error) {
    let j: any = {};
    try { j = (await (error as any).context?.json?.()) ?? {}; } catch { /* egal */ }
    if (!j.error && /not found|404|Failed to send/i.test(String(error.message))) throw new Error('Die Server-Funktion „familie“ ist noch nicht neu eingespielt.');
    if (j.error === 'unknown_action') throw new Error('Die Server-Funktion „familie“ ist noch nicht neu eingespielt.');
    const msg = ERR[j.error] ?? 'WebUntis ist gerade nicht erreichbar.';
    throw new Error(j.detail && j.error !== 'untis_bad_input' ? `${msg} (${j.detail})` : msg);
  }
  return data as T;
}

export const untisConnect = (c: { host: string; school: string; user: string; key: string }) =>
  call<{ students: { id: number; name: string }[]; who: string; type: string }>({ action: 'untis_connect', ...c });
export const untisDisconnect = () => call<{ ok: boolean }>({ action: 'untis_disconnect' });
export async function untisWeeks(ids: number[], from: string, to: string) {
  const r = await call<{ weeks: Record<string, { lessons: UntisLesson[] }> }>({ action: 'untis_week', students: ids, from, to });
  const out: Record<number, UntisLesson[]> = {};
  for (const [k, v] of Object.entries(r.weeks)) out[Number(k)] = fixTimes(v.lessons);
  return out;
}

/** Falls WebUntis UTC liefert (erste Stunde vor 6 Uhr), auf deutsche Zeit umrechnen. */
function fixTimes(ls: UntisLesson[]): UntisLesson[] {
  if (!ls.length || ls.some(l => l.from >= '06:00')) return ls;
  const conv = (date: string, hm: string) => new Date(`${date}T${hm}:00Z`).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return ls.map(l => ({ ...l, from: conv(l.date, l.from), to: conv(l.date, l.to) }));
}

const wd = (iso: string) => new Date(iso + 'T12:00:00').getDay();

/** Regulärer Wochenplan aus echten Stunden: je Wochentag der erste Tag mit Unterricht. */
export function timetableFrom(ls: UntisLesson[]): Timetable {
  const tt: Timetable = {};
  for (const k of ['1', '2', '3', '4', '5'] as const) {
    const dates = [...new Set(ls.filter(l => String(wd(l.date)) === k).map(l => l.date))].sort();
    if (!dates.length) continue;
    // Tag mit den meisten Stunden nehmen (Feiertage und Ausfalltage überspringen)
    const best = dates.map(d => ls.filter(l => l.date === d)).sort((a, b) => b.length - a.length)[0];
    const byTime = new Map<string, UntisLesson>();
    best.sort((a, b) => a.from.localeCompare(b.from)).forEach(l => { if (!byTime.has(l.from)) byTime.set(l.from, l); });
    const day = [...byTime.values()];
    tt[k] = { from: day[0].from, to: day.reduce((m, l) => (l.to > m ? l.to : m), day[0].to), lessons: day.map(l => l.subject || l.long || '?') };
  }
  return tt;
}

/** Ausfälle als „früher aus“ / „frei“ eintragen. Eigene Einträge der Familie haben Vorrang. */
export function applyUntis(d: FamilyData, childId: string, ls: UntisLesson[], from: string, to: string): FamilyData {
  let next = d;
  const child = d.children.find(c => c.id === childId);
  if (!child) return d;
  for (let date = from; date <= to; date = addDaysIso(date, 1)) {
    const cur = child.schoolChange?.[date];
    if (cur && cur.by !== 'untis') continue;
    const day = ls.filter(l => l.date === date);
    let want: { to?: string; off?: boolean } | null = null;
    if (day.length) {
      const held = day.filter(l => !l.cancelled);
      const end = day.reduce((m, l) => (l.to > m ? l.to : m), '');
      const heldEnd = held.reduce((m, l) => (l.to > m ? l.to : m), '');
      if (!held.length) want = { off: true };
      else if (heldEnd < end) want = { to: heldEnd };
    }
    const same = (!want && !cur) || (want && cur && !!want.off === !!cur.off && (want.to ?? '') === (cur.to ?? ''));
    if (!same) next = setSchoolChange(next, childId, date, want ? { ...want, by: 'untis' } : null);
  }
  return next;
}

const lessonCache = new Map<string, UntisLesson[]>();
export const untisLessons = (childId: string, date: string) => (lessonCache.get(childId) ?? []).filter(l => l.date === date);
const EVERY = 3 * 3600_000;
let tried = 0;

/** Läuft im Hintergrund: zwischen 6 und 20 Uhr alle 3 Stunden die nächsten zwei Wochen holen und Ausfälle eintragen.
 *  Der Zeitpunkt der letzten Prüfung steht in den Familiendaten, damit nicht jedes Gerät einzeln fragt. */
export function useUntisSync(data: FamilyData | null, update: (fn: (d: FamilyData) => FamilyData) => void) {
  const links = data?.settings?.untis?.links ?? [];
  const key = links.map(l => l.child + ':' + l.id).join('|');
  const ref = useRef(data);
  ref.current = data;
  useEffect(() => {
    if (!cloudEnabled || !links.length) return;
    let alive = true;
    const run = async () => {
      const h = new Date().getHours();
      const lastCheck = Date.parse(ref.current?.settings?.untis?.checkedAt ?? '') || 0;
      if (h < 6 || h >= 20 || Date.now() - lastCheck < EVERY || Date.now() - tried < 15 * 60_000) return;
      tried = Date.now();
      const from = today(), to = addDaysIso(from, 13);
      try {
        const weeks = await untisWeeks(links.map(l => l.id), from, to);
        if (!alive) return;
        links.forEach(l => lessonCache.set(l.child, weeks[l.id] ?? []));
        const stamp = new Date().toISOString();
        update(d => {
          const next = links.reduce((acc, l) => applyUntis(acc, l.child, weeks[l.id] ?? [], from, to), d);
          return next.settings?.untis ? { ...next, settings: { ...next.settings, untis: { ...next.settings.untis, checkedAt: stamp } } } : next;
        });
      } catch { /* nächster Versuch in 15 Minuten */ }
    };
    run();
    const t = setInterval(run, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
}
