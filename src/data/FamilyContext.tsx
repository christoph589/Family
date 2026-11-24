import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ConflictError, DataStore, localStore } from './store';
import { FamilyData } from './types';

type Fn = (d: FamilyData) => FamilyData;
interface Ctx {
  data: FamilyData | null;
  loading: boolean;
  /** null = alles gespeichert */
  saveError: string | null;
  cloud: boolean;
  update: (fn: Fn) => void;
  replace: (d: FamilyData | null) => void;
}
const FamilyCtx = createContext<Ctx | null>(null);

/**
 * Hält den bestätigten Stand (base) und noch nicht gespeicherte Änderungen (pending).
 * Angezeigt wird base + pending. Bei Konflikt (anderes Gerät war schneller) wird der
 * neue Stand geladen und die Änderungen werden darauf erneut angewendet.
 */
export function FamilyProvider({ children, store = localStore }: { children: ReactNode; store?: DataStore }) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const base = useRef<{ data: FamilyData | null; version: number }>({ data: null, version: 0 });
  const pending = useRef<Fn[]>([]);
  const busy = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    const b = base.current.data;
    setData(b ? pending.current.reduce((d, f) => f(d), b) : null);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let conflicts = 0;
    try {
      while (pending.current.length && base.current.data) {
        const batch = pending.current.slice();
        const b = base.current;
        const next = batch.reduce((d, f) => f(d), b.data!);
        try {
          const v = await store.save(next, b.version);
          base.current = { data: next, version: v };
          pending.current = pending.current.slice(batch.length);
          setSaveError(null);
        } catch (e) {
          if (e instanceof ConflictError && conflicts++ < 5) {
            base.current = await store.load();
            show();
            continue;
          }
          setSaveError(store.cloud
            ? 'Keine Verbindung. Änderungen sind auf diesem Gerät und werden nachgeholt.'
            : 'Speicher auf diesem Gerät ist voll. Bitte alte Themen mit Fotos löschen.');
          if (store.cloud && !retry.current) retry.current = setTimeout(() => { retry.current = null; flush(); }, 10000);
          break;
        }
      }
    } finally { busy.current = false; }
  }, [store, show]);

  useEffect(() => {
    let alive = true;
    store.load()
      .then(s => { if (alive) { base.current = s; show(); } })
      .catch(() => alive && setSaveError('Daten konnten nicht geladen werden.'))
      .finally(() => alive && setLoading(false));
    const off = store.subscribe?.((d, v) => {
      if (v <= base.current.version) return;
      base.current = { data: d, version: v };
      show();
    });
    return () => { alive = false; off?.(); if (retry.current) clearTimeout(retry.current); };
  }, [store, show]);

  const update = useCallback((fn: Fn) => {
    if (!base.current.data) return;
    pending.current.push(fn);
    show();
    flush();
  }, [show, flush]);

  const replace = useCallback((d: FamilyData | null) => {
    pending.current = [];
    if (!d) { base.current = { data: null, version: 0 }; show(); store.clear(); return; }
    base.current = { data: d, version: base.current.version };
    show();
    store.save(d, base.current.version).then(v => { base.current = { data: d, version: v }; }, () => {});
  }, [store, show]);

  return <FamilyCtx.Provider value={{ data, loading, saveError, cloud: store.cloud, update, replace }}>{children}</FamilyCtx.Provider>;
}
export function useFamily() { const c = useContext(FamilyCtx); if (!c) throw new Error('FamilyProvider fehlt'); return c; }
