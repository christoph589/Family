import AsyncStorage from '@react-native-async-storage/async-storage';
import { FamilyData } from './types';

/**
 * Speicher-Schnittstelle. Version 0.1 speichert lokal auf dem Gerät.
 * Für mehrere Geräte pro Familie kommt ein Supabase-Adapter mit derselben
 * Schnittstelle (siehe supabase/schema.sql).
 */
export interface DataStore {
  load(): Promise<FamilyData | null>;
  save(data: FamilyData): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'familienplaner:v1';

export const localStore: DataStore = {
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FamilyData) : null;
  },
  async save(data) { await AsyncStorage.setItem(KEY, JSON.stringify(data)); },
  async clear() { await AsyncStorage.removeItem(KEY); },
};
