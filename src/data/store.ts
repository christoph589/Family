import AsyncStorage from '@react-native-async-storage/async-storage';
import { FamilyData } from './types';

/** Ein anderes Gerät hat inzwischen gespeichert. Neu laden und Änderung erneut anwenden. */
export class ConflictError extends Error { constructor() { super('conflict'); } }

/**
 * Speicher-Schnittstelle. Lokal (nur dieses Gerät) oder Supabase (alle Geräte der Familie).
 * version zählt jede Speicherung hoch; save schlägt mit ConflictError fehl,
 * wenn expected nicht mehr der aktuelle Stand ist.
 */
export interface DataStore {
  cloud: boolean;
  load(): Promise<{ data: FamilyData | null; version: number }>;
  save(data: FamilyData, expected: number): Promise<number>;
  subscribe?(cb: (data: FamilyData, version: number) => void): () => void;
  clear(): Promise<void>;
  /** Letzter bekannter Stand auf diesem Gerät, damit die App sofort startet und im Hintergrund aktualisiert. */
  peek?(): Promise<{ data: FamilyData; version: number } | null>;
}

const KEY = 'familienplaner:v1';

export const localStore: DataStore = {
  cloud: false,
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    return { data: raw ? (JSON.parse(raw) as FamilyData) : null, version: 0 };
  },
  async save(data, expected) { await AsyncStorage.setItem(KEY, JSON.stringify(data)); return expected + 1; },
  async clear() { await AsyncStorage.removeItem(KEY); },
};
