import { useEffect, useState } from 'react';

/** Funktionen, die der Betreiber pro Familie aus- und einschalten kann. Fehlt ein Eintrag, ist die Funktion an. */
export const FEATURES = [
  { key: 'kalender', icon: '📅', name: 'Kalender' },
  { key: 'sync', icon: '🔗', name: 'Kalender-Sync (iCloud, Google, WebUntis)' },
  { key: 'lernen', icon: '📚', name: 'Lernen' },
  { key: 'vokabeln', icon: '🔤', name: 'Vokabeltrainer' },
  { key: 'ki', icon: '🤖', name: 'KI (Tests, Scans, Merkhilfen)' },
  { key: 'punkte', icon: '⭐', name: 'Punkte und Wünsche' },
  { key: 'geld', icon: '💶', name: 'Geld' },
  { key: 'essen', icon: '🍽️', name: 'Essen und Einkauf' },
] as const;
export type Feature = typeof FEATURES[number]['key'];
export type Flags = Partial<Record<Feature, boolean>>;

let cur: Flags = {};
const subs = new Set<(f: Flags) => void>();
export function setFlags(f: Flags) { cur = f ?? {}; subs.forEach(fn => fn(cur)); }
export const isOn = (k: Feature, f: Flags = cur) => f[k] !== false;
export function useFlags() {
  const [f, set] = useState(cur);
  useEffect(() => { subs.add(set); set(cur); return () => { subs.delete(set); }; }, []);
  return f;
}
