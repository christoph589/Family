import { useEffect, useState } from 'react';
import { cloudEnabled, sb } from './cloud';
import { CalItem } from '../ui/CalViews';

/** iCloud-Kalender über die Server-Funktion (CalDAV). Lesen für alle, Schreiben nur Eltern. */
export interface IcloudCal { href: string; name: string; color: string; readOnly?: boolean }
export interface IcloudEvent { uid: string; title: string; date: string; time?: string; end?: string; allDay: boolean; href: string; etag: string; cal: string; recurring: boolean; editable: boolean; note?: string; rid?: string }

const ERR: Record<string, string> = {
  icloud_not_set: 'Auf dem Server fehlen noch Apple-ID und app-spezifisches Passwort (Supabase › Edge Functions › Secrets).',
  icloud_auth: 'iCloud lehnt die Anmeldung ab. Bitte das app-spezifische Passwort prüfen.',
  icloud_discovery: 'iCloud-Kalender wurden nicht gefunden.',
  icloud_failed: 'iCloud ist gerade nicht erreichbar.',
  parents_only: 'Das dürfen nur Eltern.',
  changed: 'Der Termin wurde inzwischen auf dem iPhone geändert. Bitte neu laden und nochmal versuchen.',
  recurring: 'Serientermine bitte am iPhone ändern.',
  save_failed: 'Speichern bei iCloud hat nicht geklappt.',
  delete_failed: 'Löschen bei iCloud hat nicht geklappt.',
};

async function call<T>(body: object): Promise<T> {
  if (!cloudEnabled) throw new Error('iCloud geht nur mit Server-Verbindung.');
  const { data, error } = await sb().functions.invoke('familie', { body });
  if (error) {
    let code = '';
    try { code = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* egal */ }
    if (!code && /not found|404|Failed to send/i.test(String(error.message))) throw new Error('Die Server-Funktion „familie“ ist noch nicht neu eingespielt.');
    if (code === 'unknown_action') throw new Error('Die Server-Funktion „familie“ ist noch nicht neu eingespielt.');
    throw new Error(ERR[code] ?? 'iCloud ist gerade nicht erreichbar.');
  }
  return data as T;
}

export const icloudCalendars = () => call<{ calendars: IcloudCal[] }>({ action: 'icloud_calendars' }).then(r => r.calendars);

// Gemeinsamer Zwischenspeicher: ein Zeitfenster um heute, alle 10 Minuten neu
let cache: { key: string; at: number; events: IcloudEvent[]; error?: string } | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function refresh(cals: string[], force = false) {
  const key = cals.join('|');
  if (!cals.length) { cache = null; listeners.forEach(l => l()); return; }
  if (!force && cache?.key === key && Date.now() - cache.at < 10 * 60_000) return;
  if (pending) return pending;
  const now = new Date();
  const from = iso(new Date(now.getTime() - 45 * 864e5)), to = iso(new Date(now.getTime() + 200 * 864e5));
  pending = call<{ events: IcloudEvent[] }>({ action: 'icloud_events', cals, from, to })
    .then(r => { cache = { key, at: Date.now(), events: r.events }; })
    .catch(e => { cache = { key, at: Date.now(), events: cache?.key === key ? cache.events : [], error: (e as Error).message }; })
    .finally(() => { pending = null; listeners.forEach(l => l()); });
  return pending;
}
export const icloudStatus = () => cache;
export const reloadIcloud = (cals: string[]) => refresh(cals, true);
export const icloudEvent = (key: string) => cache?.events.find(e => 'i' + e.href + '#' + e.date === key);

type Cfg = { href: string; name: string; color: string; who?: string }[] | undefined;
export function useIcloudItems(cals: Cfg, people: { id: string; name: string; color: string; photo?: string }[]) {
  const [, setTick] = useState(0);
  const hrefs = (cals ?? []).map(c => c.href);
  const key = hrefs.join('|');
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    refresh(hrefs);
    const t = setInterval(() => refresh(hrefs), 10 * 60_000);
    return () => { listeners.delete(l); clearInterval(t); };
  }, [key]);
  return (date: string): CalItem[] => (cache?.key === key ? cache.events : []).filter(e => e.date === date).map(e => {
    const c = (cals ?? []).find(x => e.cal.replace(':443', '') === x.href.replace(':443', '')) ?? (cals ?? [])[0];
    const person = people.find(p => p.id === c?.who);
    return {
      key: 'i' + e.href + '#' + e.date, time: e.allDay ? undefined : e.time, end: e.allDay ? undefined : e.end, title: e.title, color: person?.color ?? c?.color ?? '#4285f4',
      tag: person ? `${person.name} · ${c?.name ?? 'iCloud'}` : c?.name ?? 'iCloud', who: c?.who ? [c.who] : [],
      people: person ? [{ id: person.id, name: person.name, color: person.color, photo: person.photo }] : undefined, note: e.note,
    };
  });
}

export async function icloudSave(ev: { href?: string; etag?: string; cal?: string; title: string; date: string; time?: string; end?: string; note?: string; rid?: string; scope?: 'one' | 'all' }, cals: string[]) {
  await call({ action: 'icloud_save', ...ev });
  await refresh(cals, true);
}
export async function icloudDelete(href: string, etag: string, cals: string[], series?: { rid?: string; scope: 'one' | 'all' }) {
  await call({ action: 'icloud_delete', href, etag, ...(series?.rid ? series : {}) });
  await refresh(cals, true);
}
