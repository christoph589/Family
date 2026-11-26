import { cloudEnabled, sb } from './cloud';
import { FamilyData, Wish } from './types';

/** Nur echte Web-Links (http/https), ohne Leerzeichen. Sonst undefined. */
export function cleanLink(t?: string): string | undefined {
  let v = (t ?? '').trim();
  if (!v) return undefined;
  // Geteilte Texte aus Apps enthalten oft „Schau mal: https://…“
  const m = v.match(/https?:\/\/\S+/i);
  if (m) v = m[0];
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) v = 'https://' + v;
  else return undefined;
  return v.length <= 500 ? v : undefined;
}
/** „amazon.de“ aus einem Link */
export function domainOf(link: string): string {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return 'Link'; }
}

export const wishesOf = (d: FamilyData, childId: string) => (d.wishes ?? []).filter(w => w.childId === childId);
export const pendingWishes = (d: FamilyData) => (d.wishes ?? []).filter(w => w.status === 'neu');
export const sortWishes = (ws: Wish[]) => [...ws].sort((a, b) => b.prio - a.prio || a.at.localeCompare(b.at));

const err = (e: { message?: string } | null) => {
  const m = e?.message ?? '';
  if (/Could not find the function|PGRST202|does not exist/i.test(m)) return new Error('Teilen-Link noch nicht eingerichtet: bitte fix-12-wunschzettel.sql im Supabase SQL Editor ausführen.');
  if (/not_parent/.test(m)) return new Error('Nur Eltern können den Link verwalten.');
  if (/taken/.test(m)) return new Error('Das hat gerade schon jemand reserviert.');
  if (/no_wish/.test(m)) return new Error('Diesen Wunsch gibt es nicht mehr.');
  if (/link_off/.test(m)) return new Error('Dieser Link ist abgeschaltet.');
  return new Error(m || 'Keine Verbindung zum Server.');
};

// Eltern ---------------------------------------------------------------------

/** Teilen-Links der Familie: Kind-ID → Token */
export async function wishShare(fid: string, child = '', mode: 'get' | 'on' | 'new' | 'off' = 'get'): Promise<Record<string, string>> {
  const { data, error } = await sb().rpc('wish_share', { fid, child, mode });
  if (error) throw err(error);
  return (data ?? {}) as Record<string, string>;
}
export interface Reservation { wish_id: string; child_id: string; name: string | null; by_parent: boolean; at: string }
export async function wishReserved(fid: string): Promise<Reservation[]> {
  const { data, error } = await sb().rpc('wish_reserved', { fid });
  if (error) throw err(error);
  return Array.isArray(data) ? (data as Reservation[]) : [];
}
export async function wishParentSet(fid: string, child: string, wid: string, reserve: boolean, who?: string) {
  const { error } = await sb().rpc('wish_parent_set', { fid, child, wid, reserve, who: who ?? null });
  if (error) throw err(error);
}
export const shareUrl = (token: string) =>
  typeof window !== 'undefined' && window.location ? `${window.location.origin}${window.location.pathname}?wunsch=${token}` : `?wunsch=${token}`;

// Öffentlich (ohne Anmeldung) -------------------------------------------------

export interface PublicWish { id: string; title: string; link?: string | null; cents?: number | null; prio: number; note?: string | null; reserved: boolean }
export async function publicList(tok: string): Promise<{ name: string; wishes: PublicWish[] } | null> {
  if (!cloudEnabled) return null;
  const { data, error } = await sb().rpc('wish_public', { tok });
  if (error) throw err(error);
  return (data as { name: string; wishes: PublicWish[] } | null) ?? null;
}
export async function publicReserve(tok: string, wid: string, who?: string): Promise<string> {
  const { data, error } = await sb().rpc('wish_reserve', { tok, wid, who: who ?? null });
  if (error) throw err(error);
  return data as string;
}
export async function publicRelease(tok: string, wid: string, k: string): Promise<boolean> {
  const { data, error } = await sb().rpc('wish_release', { tok, wid, k });
  if (error) throw err(error);
  return !!data;
}
