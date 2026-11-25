import { useEffect, useState } from 'react';
import { cloudEnabled, sb } from './cloud';
import { Feed } from './types';
import type { CalItem } from '../ui/CalViews';

export type FeedEvent = { uid: string; title: string; date: string; time?: string; end?: string; allDay: boolean };

const ERR: Record<string, string> = {
  bad_url: 'Das ist kein gültiger Kalender-Link.',
  host_not_allowed: 'Dieser Link zeigt nicht auf eine öffentliche Internetadresse.',
  fetch_failed: 'Der Kalender war nicht erreichbar. Ist der Link öffentlich freigegeben?',
  not_ical: 'Unter dem Link liegt kein Kalender.',
  not_signed_in: 'Dieses Gerät ist nicht angemeldet.',
};

export async function loadFeed(url: string): Promise<FeedEvent[]> {
  if (!cloudEnabled) throw new Error('Kalender-Abos gehen nur mit Server-Verbindung.');
  const { data, error } = await sb().functions.invoke('familie', { body: { action: 'import', url } });
  if (error) {
    let code = '';
    try { code = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* egal */ }
    if (!code && /not found|404|Failed to send/i.test(String(error.message))) throw new Error('Die Server-Funktion „familie“ ist noch nicht eingespielt.');
    throw new Error(ERR[code] ?? 'Kalender konnte nicht geladen werden.');
  }
  return (data as { events: FeedEvent[] }).events;
}

export async function calendarToken(fid: string, renew = false): Promise<string> {
  const { data, error } = await sb().rpc('calendar_token', { fid, renew });
  if (error) throw new Error(error.message.includes('calendar_token') ? 'Bitte zuerst das SQL „fix-02-kalender“ einspielen.' : error.message);
  return data as string;
}
export const icsUrl = (token: string) => `${(process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://daxgmedegpauhzzfvygz.supabase.co')}/functions/v1/familie?ics=${token}`;

// Zwischenspeicher für alle Bildschirme, 15 Minuten
const cache = new Map<string, { at: number; events: FeedEvent[]; error?: string }>();
const listeners = new Set<() => void>();
const pending = new Set<string>();

async function refresh(url: string, force = false) {
  const c = cache.get(url);
  if (!force && c && Date.now() - c.at < 15 * 60_000) return;
  if (pending.has(url)) return;
  pending.add(url);
  try { cache.set(url, { at: Date.now(), events: await loadFeed(url) }); }
  catch (e: any) { cache.set(url, { at: Date.now(), events: c?.events ?? [], error: e?.message }); }
  finally { pending.delete(url); listeners.forEach(l => l()); }
}
export const feedStatus = (url: string) => cache.get(url);
export const reloadFeed = (url: string) => refresh(url, true);

/** Liefert eine Funktion Datum -> Kalendereinträge aller eingebundenen Kalender. */
/** hidden: übernommene Termine als "key|datum", die nicht mehr aus dem Abo angezeigt werden */
export function useFeedItems(feeds: Feed[] | undefined, people: { id: string; name: string; color: string; photo?: string }[], hidden: string[] = []) {
  const [, setTick] = useState(0);
  const key = (feeds ?? []).map(f => f.url).join('|');
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    const run = () => (feeds ?? []).forEach(f => refresh(f.url));
    run();
    const t = setInterval(run, 15 * 60_000);
    return () => { listeners.delete(l); clearInterval(t); };
  }, [key]);
  return (date: string): CalItem[] => (feeds ?? []).flatMap(f => {
    const person = people.find(p => p.id === f.who);
    return (cache.get(f.url)?.events ?? []).filter(e => e.date === date && !hidden.includes('x' + f.id + e.uid + '|' + date)).map(e => ({
      key: 'x' + f.id + e.uid, time: e.time, end: e.end, title: f.icon ? `${f.icon} ${e.title}` : e.title, color: f.color,
      tag: person ? `${person.name} · ${f.name}` : f.name, badge: person ? undefined : f.icon, who: f.who ? [f.who] : [], people: person ? [{ id: person.id, name: person.name, color: person.color, photo: person.photo }] : undefined,
    }));
  });
}
