import { useEffect, useState } from 'react';
import { cloudEnabled, sb } from './cloud';
import { today } from './logic';
import { Child, Commute, FamilyData } from './types';

/**
 * Schulzug in Echtzeit. Der Server prüft ab 45 Min vor Abfahrt alle 5 Minuten (Aktion "tick") und legt das Ergebnis
 * in die Tabelle train_status. Die App liest nur dieses Ergebnis. Es gibt keine Standortdaten.
 */
export type TrainState = 'ok' | 'delay' | 'cancelled' | 'platform' | 'missing' | 'unknown';
export interface TrainStatus {
  state: TrainState;
  /** Geplante und erwartete Abfahrt (HH:MM, Berliner Zeit) */
  planned?: string; actual?: string; delay?: number;
  platform?: string; platformPlanned?: string;
  line?: string; dest?: string; note?: string;
  /** ISO-Zeit der letzten Prüfung */
  checkedAt: string;
}

const ERR: Record<string, string> = {
  unknown_action: 'Die Server-Funktion „familie“ ist noch nicht neu eingespielt.',
  train_sql: 'Auf dem Server fehlt noch die Tabelle. Bitte das SQL „fix-14-zugpruefung“ einspielen.',
  parents_only: 'Das dürfen nur Eltern.',
  train_bad_input: 'Bitte Bahnhofsnummer (EVA) und Abfahrtszeit prüfen.',
  train_failed: 'Die Auskunft der Bahn hat nicht wie erwartet geantwortet.',
};

async function call<T>(body: object): Promise<T> {
  if (!cloudEnabled) throw new Error('Die Zugprüfung braucht die Server-Verbindung.');
  const { data, error } = await sb().functions.invoke('familie', { body });
  if (error) {
    let j: any = {};
    try { j = (await (error as any).context?.json?.()) ?? {}; } catch { /* egal */ }
    if (!j.error && /not found|404|Failed to send/i.test(String(error.message))) throw new Error(ERR.unknown_action);
    throw new Error(ERR[j.error] ?? 'Die Zugprüfung ist gerade nicht erreichbar.');
  }
  return data as T;
}

export interface TrainTest {
  ok: boolean; stationName?: string; count: number; match?: { line: string; planned: string; actual?: string; platform?: string; cancelled: boolean };
  /** Erste Zeilen der Abfahrtstafel zum Vergleichen */
  sample: { line: string; dest: string; planned: string; actual?: string; platform?: string }[];
  /** Nur bei Fehlern: Rohantwort gekürzt, damit man das Format sehen kann */
  raw?: string; status?: number;
}
export const trainTest = (c: Pick<Commute, 'fromEva' | 'depart' | 'line'>) => call<TrainTest>({ action: 'train_test', eva: c.fromEva, depart: c.depart, line: c.line });
export const trainStatus = () => call<{ statuses: Record<string, TrainStatus> }>({ action: 'train_status' });

const hm = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const weekday = () => { const w = new Date().getDay(); return w === 0 ? 7 : w; };

/** Heutige Züge, die im Anzeigefenster liegen (60 Min vor bis 10 Min nach Abfahrt). */
export function commutesNow(data: FamilyData | null | undefined, childIds?: string[]): { child: Child; c: Commute }[] {
  if (!data || data.settings?.holiday?.on) return [];
  const date = today(), n = nowMin(), wd = weekday();
  const out: { child: Child; c: Commute }[] = [];
  for (const child of data.children) {
    if (childIds && !childIds.includes(child.id)) continue;
    if (child.schoolChange?.[date]?.off) continue;
    for (const c of child.commutes ?? []) {
      if (c.off || !c.days.includes(wd) || !/^\d\d:\d\d$/.test(c.depart)) continue;
      const m = hm(c.depart);
      if (n >= m - 60 && n <= m + 10) out.push({ child, c });
    }
  }
  return out;
}

/** Status der Züge im Fenster, alle 2 Minuten neu. Ohne Züge im Fenster passiert nichts (kein Abruf). */
export function useTrains(data: FamilyData | null | undefined, childIds?: string[]) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(t); }, []);
  const list = commutesNow(data, childIds);
  const key = list.map(x => x.c.id).join(',');
  const [statuses, setStatuses] = useState<Record<string, TrainStatus>>({});
  useEffect(() => {
    if (!key || !cloudEnabled) return;
    let dead = false;
    const load = () => trainStatus().then(r => { if (!dead) setStatuses(r.statuses ?? {}); }).catch(() => { /* bleibt beim letzten Stand */ });
    load();
    const t = setInterval(load, 120000);
    return () => { dead = true; clearInterval(t); };
  }, [key]);
  return { list, statuses, tick };
}

/** Kurztext für den Zustand, z. B. "+8 Min, ab 07:07". */
export function trainLabel(st?: TrainStatus): { icon: string; text: string; tone: 'ok' | 'warn' | 'bad' | 'none' } {
  if (!st) return { icon: '🚆', text: 'Noch keine Prüfung', tone: 'none' };
  switch (st.state) {
    case 'ok': return { icon: '✅', text: 'pünktlich', tone: 'ok' };
    case 'delay': return { icon: '⚠️', text: `+${st.delay} Min${st.actual ? `, ab ${st.actual}` : ''}`, tone: 'warn' };
    case 'cancelled': return { icon: '❌', text: 'fällt aus', tone: 'bad' };
    case 'platform': return { icon: '🔀', text: `Gleis ${st.platform ?? '?'} statt ${st.platformPlanned ?? '?'}`, tone: 'warn' };
    case 'missing': return { icon: '❓', text: 'nicht in der Abfahrtstafel', tone: 'warn' };
    default: return { icon: '🚆', text: 'keine Auskunft', tone: 'none' };
  }
}
