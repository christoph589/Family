import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { DataStore, localStore } from './store';
import { FamilyData } from './types';

interface Ctx { data: FamilyData | null; loading: boolean; saveError: boolean; update: (fn: (d: FamilyData) => FamilyData) => void; replace: (d: FamilyData | null) => void }
const FamilyCtx = createContext<Ctx | null>(null);

export function FamilyProvider({ children, store = localStore }: { children: ReactNode; store?: DataStore }) {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const persist = useCallback((d: FamilyData) => { store.save(d).then(() => setSaveError(false), () => setSaveError(true)); }, [store]);
  useEffect(() => { store.load().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false)); }, [store]);
  const update = useCallback((fn: (d: FamilyData) => FamilyData) => {
    setData(prev => { if (!prev) return prev; const next = fn(prev); persist(next); return next; });
  }, [persist]);
  const replace = useCallback((d: FamilyData | null) => { setData(d); d ? persist(d) : store.clear(); }, [store, persist]);
  return <FamilyCtx.Provider value={{ data, loading, saveError, update, replace }}>{children}</FamilyCtx.Provider>;
}
export function useFamily() { const c = useContext(FamilyCtx); if (!c) throw new Error('FamilyProvider fehlt'); return c; }
