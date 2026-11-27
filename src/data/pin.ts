import { useEffect, useRef, useState } from 'react';
import { sb } from './cloud';
import { useFamily } from './FamilyContext';
import { isAdmin, parentsOf } from './logic';
import { FamilyData } from './types';

/**
 * Eltern-PIN und eigene PINs (Oma, Opa …) prüfen und ändern.
 *
 * Seit fix-16 liegen die PINs nur noch als Hash auf dem Server (Tabelle family_pins), nie mehr im
 * Familienstand. Geprüft wird ausschließlich auf dem Server, mit Sperre gegen Raten.
 * Ohne Verbindung lässt sich die PIN deshalb nicht prüfen (absichtlich: sonst müsste etwas
 * Prüfbares auf jedem Kindergerät liegen, und vier Ziffern sind in Sekunden durchprobiert).
 *
 * Übergang: Solange fix-16 noch nicht eingespielt ist (Funktion fehlt) oder die Familie nur auf
 * diesem Gerät liegt, wird wie bisher mit der PIN im Familienstand verglichen.
 */

/** 'admin' = nur Eltern-PIN, 'any' = Eltern-PIN oder PIN eines anderen Erwachsenen, sonst Person-ID */
export type PinTarget = 'admin' | 'any' | string;
export type PinFail = 'wrong' | 'locked' | 'offline' | 'unset';
export type PinResult = { ok: true; who: string } | { ok: false; reason: PinFail; wait?: number; left?: number };

let fid: string | null = null;
/** Familie dieses Geräts (Cloud). null = Familie liegt nur auf diesem Gerät. */
export function setPinFamily(f: string | null) { fid = f; }

const missing = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === 'PGRST202' || /Could not find the function|function .*pin_\w+.* does not exist/i.test(e.message ?? ''));

/** Alter Weg: PIN steht noch im Familienstand. */
function legacy(d: FamilyData, pin: string, target: PinTarget): PinResult {
  const admin = d.family.parentPin;
  if (!admin) return { ok: false, reason: 'unset' };
  if (pin.length !== 4) return { ok: false, reason: 'wrong' };
  if (target !== 'admin') {
    const own = parentsOf(d).find(p => !isAdmin(p) && !!p.pin && p.pin === pin && (target === 'any' || p.id === target));
    if (own) return { ok: true, who: own.id };
  }
  return pin === admin ? { ok: true, who: 'admin' } : { ok: false, reason: 'wrong' };
}

export async function checkPin(d: FamilyData, pin: string, target: PinTarget): Promise<PinResult> {
  if (!fid) return legacy(d, pin, target);
  try {
    const { data, error } = await sb().rpc('pin_check', { fid, pin, target });
    if (error) return missing(error) ? legacy(d, pin, target) : { ok: false, reason: 'offline' };
    const r = data as { res: string; who?: string; wait?: number; left?: number };
    if (r.res === 'ok') return { ok: true, who: r.who ?? 'admin' };
    // Familie ohne Hash auf dem Server, aber PIN noch im Stand (sollte nach fix-16 nicht vorkommen)
    if (r.res === 'unset' && d.family.parentPin) return legacy(d, pin, target);
    return { ok: false, reason: (['wrong', 'locked', 'unset'].includes(r.res) ? r.res : 'offline') as PinFail, wait: r.wait, left: r.left };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export function pinMessage(r: PinResult): string {
  if (r.ok) return '';
  if (r.reason === 'wrong') return r.left === undefined || r.left > 2 ? 'PIN stimmt nicht.'
    : r.left === 0 ? 'PIN stimmt nicht. Jetzt ist 15 Minuten Pause.'
    : `PIN stimmt nicht. Noch ${r.left} ${r.left === 1 ? 'Versuch' : 'Versuche'}, dann ist eine Pause.`;
  if (r.reason === 'locked') {
    const min = Math.max(1, Math.ceil((r.wait ?? 900) / 60));
    return `Zu viele falsche Versuche. Bitte ${min > 90 ? `in ${Math.ceil(min / 60)} Stunden` : `in ${min} ${min === 1 ? 'Minute' : 'Minuten'}`} noch einmal.`;
  }
  if (r.reason === 'unset') return 'Es gibt noch keine Eltern-PIN. Bitte unter ⚙️ › Familie festlegen.';
  return 'Keine Verbindung. Die PIN wird auf dem Server geprüft, bitte gleich noch einmal versuchen.';
}

/** Eltern-PIN ändern. Gibt es noch keine, reicht ein Eltern-Konto (old wird ignoriert). */
export async function changeAdminPin(d: FamilyData, update: (fn: (d: FamilyData) => FamilyData) => void, old: string, next: string): Promise<PinResult> {
  const viaState = (): PinResult => {
    if (d.family.parentPin && old !== d.family.parentPin) return { ok: false, reason: 'wrong' };
    update(x => ({ ...x, family: { ...x.family, parentPin: next } }));
    return { ok: true, who: 'admin' };
  };
  if (!fid) return viaState();
  try {
    const { data, error } = await sb().rpc('pin_set', { fid, old_pin: old, new_pin: next });
    if (error) return missing(error) ? viaState() : { ok: false, reason: 'offline' };
    const r = data as { res: string; wait?: number; left?: number };
    return r.res === 'ok' ? { ok: true, who: 'admin' } : { ok: false, reason: (r.res === 'locked' ? 'locked' : 'wrong'), wait: r.wait, left: r.left };
  } catch { return { ok: false, reason: 'offline' }; }
}

/** Eigene PIN einer Person ohne Admin-Rechte setzen (next leer = löschen). Braucht die Eltern-PIN. */
export async function setPersonPin(d: FamilyData, update: (fn: (d: FamilyData) => FamilyData) => void, adminPin: string, person: string, next: string): Promise<PinResult> {
  const viaState = (): PinResult => {
    if (adminPin !== d.family.parentPin) return { ok: false, reason: 'wrong' };
    update(x => ({ ...x, parents: parentsOf(x).map(p => p.id === person ? { ...p, pin: next || undefined } : p) }));
    return { ok: true, who: 'admin' };
  };
  if (!fid) return viaState();
  try {
    const { data, error } = await sb().rpc('pin_set_person', { fid, admin_pin: adminPin, person, new_pin: next });
    if (error) return missing(error) ? viaState() : { ok: false, reason: 'offline' };
    const r = data as { res: string; wait?: number; left?: number };
    return r.res === 'ok' ? { ok: true, who: 'admin' } : { ok: false, reason: (r.res === 'locked' ? 'locked' : 'wrong'), wait: r.wait, left: r.left };
  } catch { return { ok: false, reason: 'offline' }; }
}

/** Wer hat eine PIN? null = noch unbekannt (lädt oder keine Verbindung). */
export function usePinStatus(tick = 0): { admin: boolean; people: string[] } | null {
  const { data } = useFamily();
  const [st, setSt] = useState<{ admin: boolean; people: string[] } | null>(null);
  const fromState = data ? { admin: !!data.family.parentPin, people: parentsOf(data).filter(p => !!p.pin).map(p => p.id) } : null;
  const [server, setServer] = useState<boolean | null>(fid ? null : false);
  useEffect(() => {
    if (!fid) { setServer(false); return; }
    let alive = true;
    sb().rpc('pin_status', { fid }).then(({ data: r, error }) => {
      if (!alive) return;
      if (error) { setServer(missing(error) ? false : null); return; }
      setServer(true); setSt(r as { admin: boolean; people: string[] });
    }, () => {});
    return () => { alive = false; };
  }, [tick]);
  return server === false ? fromState : st;
}

/**
 * Eingabefeld-Logik für eine 4-stellige PIN: prüft beim 4. Zeichen auf dem Server.
 * onOk bekommt, wessen PIN es war ('admin' oder Person-ID).
 */
export function usePinEntry(target: PinTarget, onOk: (who: string) => void) {
  const { data } = useFamily();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const cur = useRef({ target, onOk });
  cur.current = { target, onOk };
  const onChange = (t: string) => {
    if (busy) return;
    const v = t.replace(/\D/g, '').slice(0, 4);
    setPin(v); setMsg('');
    if (v.length !== 4 || !data) return;
    setBusy(true);
    checkPin(data, v, cur.current.target).then(r => {
      setBusy(false); setPin('');
      if (r.ok) cur.current.onOk(r.who); else setMsg(pinMessage(r));
    });
  };
  const reset = () => { setPin(''); setMsg(''); };
  return { pin, msg, busy, onChange, reset };
}
