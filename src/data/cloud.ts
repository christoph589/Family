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
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
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
  if (m.includes('same_password') || m.includes('different from the old')) return new Error('Das neue Passwort muss anders sein als das alte.');
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit')) return new Error('Zu viele Mails. Bitte in einer Minute noch einmal versuchen.');
  if (m.includes('already registered')) return new Error('Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.');
  if (m.includes('Anonymous sign-ins are disabled')) return new Error('Kindergeräte sind im Server noch nicht freigeschaltet (Anonymous sign-ins).');
  if (m.includes('parent_needs_account')) return new Error('Eltern brauchen ein Konto mit E-Mail.');
  if (m.includes('too_many_attempts')) return new Error('Zu viele falsche Codes. Bitte in einer Stunde noch einmal versuchen.');
  if (m.includes('too_many_families')) return new Error('Mit diesem Konto gibt es schon zu viele Familien.');
  if (m.includes('too_big')) return new Error('Zu viele Daten auf einmal. Bitte große Fotos entfernen.');
  if (m.includes('not_parent')) return new Error('Das dürfen nur Eltern.');
  return new Error(m || 'Keine Verbindung zum Server.');
}

export async function parentSignIn(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
}
/** Gibt true zurück, wenn eine Bestätigungs-Mail nötig ist. */
export async function parentSignUp(email: string, password: string): Promise<boolean> {
  const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  const { data, error } = await sb().auth.signUp({ email, password, options: { emailRedirectTo } });
  if (error) throw friendly(error);
  return !data.session;
}
const RESET_KEY = 'famelio:reset';
/** „Passwort vergessen“: schickt eine Mail mit Link zurück auf diese Seite. */
export async function requestPasswordReset(email: string) {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  try { localStorage.setItem(RESET_KEY, '1'); } catch { /* egal */ }
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw friendly(error);
}
/** true, wenn die Rückkehr per ?code=… von einer Reset-Mail kommt (gleiches Gerät, gleicher Browser). */
export function recoveryPending(): boolean {
  try { return localStorage.getItem(RESET_KEY) === '1'; } catch { return false; }
}
export async function setNewPassword(password: string) {
  const { error } = await sb().auth.updateUser({ password });
  if (error) throw friendly(error);
  try { localStorage.removeItem(RESET_KEY); } catch { /* egal */ }
}
/** Welche Anmeldewege im Server eingeschaltet sind (Supabase › Authentication › Providers). */
export async function oauthProviders(): Promise<{ google: boolean; apple: boolean }> {
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_ANON_KEY } });
    const j = await r.json();
    return { google: !!j.external?.google, apple: !!j.external?.apple };
  } catch { return { google: false, apple: false }; }
}
/** Anmelden mit Google oder Apple. Die Seite wird verlassen und kommt mit ?code=… zurück. */
export async function parentOAuth(provider: 'google' | 'apple') {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb().auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) throw friendly(error);
}
/** Nach der Rückkehr von Google/Apple: Code gegen Sitzung tauschen. true = angemeldet. */
export async function finishOAuth(): Promise<boolean> {
  if (!cloudEnabled || typeof window === 'undefined' || !window.location?.search) return false;
  const q = new URLSearchParams(window.location.search);
  const code = q.get('code'), err = q.get('error_description');
  if (!code && !err) return false;
  q.delete('code'); q.delete('error'); q.delete('error_code'); q.delete('error_description');
  window.history.replaceState(null, '', window.location.pathname + (q.toString() ? '?' + q : '') + window.location.hash);
  if (err) throw new Error('Anmeldung abgebrochen: ' + err);
  const { error } = await sb().auth.exchangeCodeForSession(code!);
  if (error) throw friendly(error);
  return true;
}
export async function signOut() { await sb().auth.signOut(); await setLink(null); }

/** Konto endgültig löschen. Letztes Eltern-Konto: die ganze Familie wird mit gelöscht (fix-15). */
export async function deleteMyAccount() {
  const { error } = await sb().rpc('delete_my_account', { confirm: 'LÖSCHEN' });
  if (error) {
    if (/delete_my_account/.test(error.message) && /does not exist|Could not find/i.test(error.message)) throw new Error('Bitte zuerst das SQL „fix-15-konto-loeschen“ ausführen.');
    throw friendly(error);
  }
  try { await sb().auth.signOut({ scope: 'local' }); } catch { /* Konto ist schon weg */ }
  await setLink(null);
  try { await AsyncStorage.clear(); } catch { /* egal */ }
}

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
  // Seit fix-13 liefert der Server bei falschem Code null (damit der Fehlversuch gezählt bleibt)
  if (!data) throw friendly({ message: 'unknown_code' });
  return data as string;
}

export async function joinCode(fid: string): Promise<string | null> {
  const r = await sb().rpc('family_join_code', { fid });
  if (!r.error) return (r.data as string | null) ?? null;
  // Vor fix-13: direkt aus der Tabelle
  const { data } = await sb().from('families').select('join_code').eq('id', fid).single();
  return data?.join_code ?? null;
}

/** Alle Geräte und Konten der Familie (nur Eltern, braucht fix-13). null = Server noch nicht umgestellt. */
export interface Device { user_id: string; role: 'eltern' | 'kind'; child_id: string | null; email: string | null; created_at: string; last_seen: string | null; until: string | null; me: boolean }
export async function familyDevices(fid: string): Promise<Device[] | null> {
  const { data, error } = await sb().rpc('family_devices', { fid });
  if (error) { if (/family_devices|function/i.test(error.message)) return null; throw friendly(error); }
  return data as Device[];
}
export async function removeDevice(fid: string, uid: string) {
  const { error } = await sb().rpc('remove_device', { fid, uid });
  if (error) throw friendly(error);
}
export async function rotateJoinCode(fid: string): Promise<string> {
  const { data, error } = await sb().rpc('rotate_join_code', { fid });
  if (error) throw friendly(error);
  return data as string;
}

const cacheKey = (fid: string) => `famelio:cache:${fid}`;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;
/** Stand lokal merken (gebündelt, damit schnelles Abhaken nicht ständig groß speichert). */
function remember(fid: string, s: { data: FamilyData; version: number }) {
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => { AsyncStorage.setItem(cacheKey(fid), JSON.stringify(s)).catch(() => {}); }, 1500);
}

async function fetchState(fid: string) {
  const { data, error } = await sb().from('family_state').select('data, version').eq('family_id', fid).single();
  if (error) throw friendly(error);
  const s = { data: data.data as FamilyData, version: data.version as number };
  remember(fid, s);
  return s;
}

export function cloudStore(fid: string): DataStore {
  return {
    cloud: true,
    load: () => fetchState(fid),
    async peek() {
      try { const raw = await AsyncStorage.getItem(cacheKey(fid)); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    async save(d, expected) {
      const { data, error } = await sb().rpc('save_state', { fid, expected, new_data: d });
      if (error) { if (error.message.includes('conflict')) throw new ConflictError(); throw friendly(error); }
      remember(fid, { data: d, version: data as number });
      return data as number;
    },
    subscribe(cb) {
      const ch = sb().channel(`family:${fid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'family_state', filter: `family_id=eq.${fid}` },
          p => { const n = p.new as { data: FamilyData; version: number }; if (n?.data) cb(n.data, n.version); })
        .subscribe();
      // Fallback, falls Realtime getrennt war (Tablet im Standby): erst nur die Versionsnummer fragen,
      // den ganzen Stand nur bei Änderung laden. Bei Fehlern seltener fragen, im Hintergrund gar nicht.
      let last = -1, wait = 30000, stop = false, timer: ReturnType<typeof setTimeout> | null = null;
      const tick = async () => {
        if (stop) return;
        const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        if (!hidden) {
          try {
            const { data, error } = await sb().from('family_state').select('version').eq('family_id', fid).single();
            if (error) throw error;
            const v = (data as { version: number }).version;
            if (v !== last) { const s = await fetchState(fid); last = s.version; cb(s.data, s.version); }
            wait = 30000;
          } catch { wait = Math.min(wait * 2, 300000); }
        }
        if (!stop) timer = setTimeout(tick, wait);
      };
      timer = setTimeout(tick, wait);
      return () => { stop = true; if (timer) clearTimeout(timer); sb().removeChannel(ch); };
    },
    async clear() { await AsyncStorage.removeItem(cacheKey(fid)).catch(() => {}); await setLink(null); },
  };
}

// Operator-Ansicht und Support-Zugang ------------------------------------------

export interface OpFamily { id: string; name: string; created_at: string; parents: number; kids: number; children: number; updated_at: string | null; ai_today: number; support_until: string | null; mine: boolean; done7: number; features: string[] | null;
  flags?: Record<string, boolean> | null; plan?: string; ai_limit?: number | null; ai7?: number; ai30?: number; usd7?: number; usd30?: number; usd_today?: number }
const rpcErr = (e: { message?: string } | null) => {
  const m = e?.message ?? '';
  if (/op_set_family/.test(m) || /Could not find the function|PGRST202|does not exist/i.test(m)) return new Error('Funktion fehlt in der Datenbank: bitte fix-11-operator-funktionen.sql im SQL Editor ausführen.');
  if (/not_operator/.test(m)) return new Error('Dieses Konto ist kein Operator.');
  if (/no_support_access/.test(m)) return new Error('Diese Familie hat den Support-Zugang nicht freigegeben.');
  if (/name_mismatch/.test(m)) return new Error('Der Name stimmt nicht genau.');
  if (/own_family/.test(m)) return new Error('Eigene Familie: bitte zuerst fix-09-eigene-familie-loeschen.sql im SQL Editor ausführen.');
  if (/op_rename|op_delete_family/.test(m) && /does not exist|Could not find/i.test(m)) return new Error('Bitte zuerst das SQL „fix-08-operator-verwalten“ ausführen.');
  if (/not_parent/.test(m)) return new Error('Nur Eltern können den Support-Zugang ändern.');
  if (/function .* does not exist|Could not find the function/i.test(m)) return new Error('Bitte zuerst das SQL „fix-07-operator“ in Supabase ausführen.');
  return friendly(e);
};
/** Schalter der Familie (vom Betreiber gesetzt). Leer, wenn die Spalte noch fehlt. */
export async function familyFlags(fid: string): Promise<Record<string, boolean>> {
  const { data, error } = await sb().from('families').select('features').eq('id', fid).single();
  return error ? {} : ((data as { features?: Record<string, boolean> }).features ?? {});
}
export async function opSetFamily(fid: string, feats: Record<string, boolean>, plan: string, limit: number | null) {
  const { error } = await sb().rpc('op_set_family', { fid, feats, new_plan: plan, new_limit: limit });
  if (error) throw rpcErr(error);
}
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
/** In eine andere Familie wechseln, in der man selbst Elternteil ist. */
export async function switchFamily(fid: string): Promise<void> { await setLink({ familyId: fid, role: 'eltern' }); }
export async function currentFamilyId(): Promise<string | null> { return (await getLink())?.familyId ?? null; }
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
export async function opRename(fid: string, name: string): Promise<void> {
  const { error } = await sb().rpc('op_rename', { fid, new_name: name });
  if (error) throw rpcErr(error);
}
export async function opDelete(fid: string, confirmName: string): Promise<void> {
  const { error } = await sb().rpc('op_delete_family', { fid, confirm_name: confirmName });
  if (error) throw rpcErr(error);
}
