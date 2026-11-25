import { FamilyData } from './types';
import { peopleOf, today } from './logic';

export interface Occ { key: string; title: string; icon: string; date: string; forIds: string[]; custom?: boolean }

const pad = (n: number) => String(n).padStart(2, '0');
/** Ostersonntag (Gauß) */
export function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
const days = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);

/** Alle Anlässe der nächsten 12 Monate, nach Datum sortiert. Heute zählt mit. */
export function occasionsAhead(d: FamilyData, from = today()): Occ[] {
  const y = +from.slice(0, 4);
  const kids = d.children.map(c => c.id), all = peopleOf(d).map(p => p.id);
  const next = (md: string) => { const a = `${y}-${md}`; return a >= from ? a : `${y + 1}-${md}`; };
  const out: Occ[] = [
    ...d.children.filter(c => c.birthday).map(c => ({ key: 'geb:' + c.id, title: `Geburtstag ${c.name}`, icon: '🎂', date: next(c.birthday!.slice(5)), forIds: [c.id] })),
    { key: 'weihnachten', title: 'Weihnachten', icon: '🎄', date: next('12-24'), forIds: all },
    { key: 'nikolaus', title: 'Nikolaus', icon: '🎅', date: next('12-06'), forIds: kids },
    { key: 'ostern', title: 'Ostern', icon: '🐣', date: easter(y) >= from ? easter(y) : easter(y + 1), forIds: kids },
    ...(d.giftOccasions ?? []).map(o => ({ key: o.id, title: o.title, icon: o.icon || '🎁', date: next(o.md), forIds: o.forId ? [o.forId] : [], custom: true })),
  ];
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const daysUntil = (date: string, from = today()) => days(from, date);
export const monthsUntil = (date: string, from = today()) => Math.max(1, Math.ceil(days(from, date) / 30.4));

/** Geschenke, die dieser Mensch sehen darf: nie die eigenen (Überraschung). */
export const visibleGifts = (d: FamilyData, meId?: string) => (d.gifts ?? []).filter(g => !meId || g.forId !== meId);
export const giftsOf = (d: FamilyData, o: Occ, meId?: string) => visibleGifts(d, meId).filter(g => g.occ === o.key && g.year === +o.date.slice(0, 4));

export function yearPlan(d: FamilyData, meId?: string, from = today()) {
  const occ = occasionsAhead(d, from);
  let planned = 0, bought = 0, perMonth = 0;
  const months = Array.from({ length: 12 }, (_, i) => { const x = new Date(from + 'T12:00:00'); x.setDate(1); x.setMonth(x.getMonth() + i); return { ym: `${x.getFullYear()}-${pad(x.getMonth() + 1)}`, label: x.toLocaleDateString('de-DE', { month: 'narrow' }), cents: 0 }; });
  for (const o of occ) {
    const gs = giftsOf(d, o, meId);
    const sum = gs.reduce((s, g) => s + (g.cents ?? 0), 0), got = gs.filter(g => g.status === 'gekauft').reduce((s, g) => s + (g.cents ?? 0), 0);
    planned += sum; bought += got;
    perMonth += (sum - got) / monthsUntil(o.date, from);
    const m = months.find(x => x.ym === o.date.slice(0, 7)); if (m) m.cents += sum;
  }
  return { occ, planned, bought, open: planned - bought, perMonth: Math.ceil(perMonth / 100) * 100, months };
}

/** "12,50" oder "12" zu Cent */
export function parseEuro(t: string): number | undefined {
  const v = Number(t.replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return t.trim() && isFinite(v) && v >= 0 ? Math.round(v * 100) : undefined;
}
