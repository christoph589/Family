import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { ConflictError, DataStore } from './store';
import { FamilyData } from './types';

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!cloudEnabled) throw new Error('Supabase nicht eingerichtet');
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** Welche Familie dieses Gerät nutzt. Liegt nur auf dem Gerät. */
export interface DeviceLink { familyId: string; role: 'eltern' | 'kind'; childId?: string }
const LINK_KEY = 'familienplaner:link';
export async function getLink(): Promise<DeviceLink | null> {
  const raw = await AsyncStorage.getItem(LINK_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function setLink(l: DeviceLink | null) {
  if (l) await AsyncStorage.setItem(LINK_KEY, JSON.stringify(l)); else await AsyncStorage.removeItem(LINK_KEY);
}

function friendly(e: { message?: string } | null): Error {
  const m = e?.message ?? '';
  if (m.includes('unknown_code')) return new Error('Diesen Familiencode gibt es nicht.');
  if (m.includes('Invalid login')) return new Error('E-Mail oder Passwort stimmt nicht.');
  if (m.includes('Email not confirmed')) return new Error('Bitte zuerst den Link in der Bestätigungs-Mail öffnen.');
  if (m.includes('already registered')) return new Error('Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.');
  if (m.includes('Anonymous sign-ins are disabled')) return new Error('Kindergeräte sind im Server noch nicht freigeschaltet (Anonymous sign-ins).');
  if (m.includes('parent_needs_account')) return new Error('Eltern brauchen ein Konto mit E-Mail.');
  return new Error(m || 'Keine Verbindung zum Server.');
}

export async function parentSignIn(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
}
/** Gibt true zurück, wenn eine Bestätigungs-Mail nötig ist. */
export async function parentSignUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw friendly(error);
  return !data.session;
}
export async function signOut() { await sb().auth.signOut(); await setLink(null); }

/** Familie, in der dieses Eltern-Konto schon Mitglied ist. */
export async function myParentFamily(): Promise<string | null> {
  const { data: u } = await sb().auth.getUser();
  if (!u.user) return null;
  // Support-Mitgliedschaften (mit Ablaufzeit) zählen nicht als eigene Familie
  const { data, error } = await sb().from('members').select('*').eq('user_id', u.user.id).eq('role', 'eltern');
  if (error) throw friendly(error);
  return (data ?? []).find((m: any) => !m.until)?.family_id ?? null;
}

export async function createFamily(d: FamilyData): Promise<string> {
  const { data, error } = await sb().rpc('create_family', { fname: d.family.name, initial: d });
  if (error) throw friendly(error);
  return (data as { family_id: string }[])[0].family_id;
}

async function ensureSession() {
  const { data } = await sb().auth.getSession();
  if (data.session) return;
  const { error } = await sb().auth.signInAnonymously();
  if (error) throw friendly(error);
}

export async function joinFamily(code: string, role: 'eltern' | 'kind', childId?: string): Promise<string> {
  if (role === 'kind') await ensureSession();
  const { data, error } = await sb().rpc('join_family', { code, as_role: role, child: childId ?? null });
  if (error) throw friendly(error);
  return data as string;
}

export async function joinCode(fid: string): Promise<string | null> {
  const { data } = await sb().from('families').select('join_code').eq('id', fid).single();
  return data?.join_code ?? null;
}
export async function rotateJoinCode(fid: string): Promise<string> {
  const { data, error } = await sb().rpc('rotate_join_code', { fid });
  if (error) throw friendly(error);
  return data as string;
}

async function fetchState(fid: string) {
  const { data, error } = await sb().from('family_state').select('data, version').eq('family_id', fid).single();
  if (error) throw friendly(error);
  return { data: data.data as FamilyData, version: data.version as number };
}

export function cloudStore(fid: string): DataStore {
  return {
    cloud: true,
    load: () => fetchState(fid),
    async save(d, expected) {
      const { data, error } = await sb().rpc('save_state', { fid, expected, new_data: d });
      if (error) { if (error.message.includes('conflict')) throw new ConflictError(); throw friendly(error); }
      return data as number;
    },
    subscribe(cb) {
      const ch = sb().channel(`family:${fid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'family_state', filter: `family_id=eq.${fid}` },
          p => { const n = p.new as { data: FamilyData; version: number }; if (n?.data) cb(n.data, n.version); })
        .subscribe();
      // Fallback, falls Realtime getrennt war (Tablet im Standby): beim Zurückkehren neu laden
      const poll = setInterval(() => { fetchState(fid).then(s => cb(s.data, s.version), () => {}); }, 30000);
      return () => { clearInterval(poll); sb().removeChannel(ch); };
    },
    async clear() { await setLink(null); },
  };
}

// Operator-Ansicht und Support-Zugang ------------------------------------------

export interface OpFamily { id: string; name: string; created_at: string; parents: number; kids: number; children: number; updated_at: string | null; ai_today: number; support_until: string | null; mine: boolean; done7: number; features: string[] | null }
const rpcErr = (e: { message?: string } | null) => {
  const m = e?.message ?? '';
  if (/not_operator/.test(m)) return new Error('Dieses Konto ist kein Operator.');
  if (/no_support_access/.test(m)) return new Error('Diese Familie hat den Support-Zugang nicht freigegeben.');
  if (/not_parent/.test(m)) return new Error('Nur Eltern können den Support-Zugang ändern.');
  if (/function .* does not exist|Could not find the function/i.test(m)) return new Error('Bitte zuerst das SQL „fix-07-operator“ in Supabase ausführen.');
  return friendly(e);
};
export async function opFamilies(): Promise<OpFamily[]> {
  const { data, error } = await sb().rpc('op_families');
  if (error) throw rpcErr(error);
  return (data ?? []) as OpFamily[];
}
const BACK_KEY = 'familienplaner:supportBack';
/** Operator geht in eine Familie. Die eigene Verbindung wird gemerkt und kann mit leaveSupport() zurückgeholt werden. */
export async function opEnter(fid: string): Promise<void> {
  const { error } = await sb().rpc('op_enter', { fid });
  if (error) throw rpcErr(error);
  const cur = await getLink();
  if (cur && !(await AsyncStorage.getItem(BACK_KEY))) await AsyncStorage.setItem(BACK_KEY, JSON.stringify(cur));
  await setLink({ familyId: fid, role: 'eltern' });
}
export async function supportBack(): Promise<DeviceLink | null> {
  const raw = await AsyncStorage.getItem(BACK_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function leaveSupport(): Promise<void> {
  const back = await supportBack();
  await setLink(back);
  await AsyncStorage.removeItem(BACK_KEY);
}
export async function setSupport(fid: string, hours: number): Promise<string | null> {
  const { data, error } = await sb().rpc('set_support', { fid, hours });
  if (error) throw rpcErr(error);
  return (data as string | null) ?? null;
}
export async function supportStatus(fid: string): Promise<{ until: string | null; visits: string[] } | null> {
  const { data, error } = await sb().rpc('support_status', { fid });
  if (error) throw rpcErr(error);
  return (data as { until: string | null; visits: string[] } | null) ?? null;
}
