import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { cloudEnabled, getLink, sb } from '../data/cloud';
import { Button } from './Button';
import { C, s } from './theme';

const KEY = 'familienplaner:push';
const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: (v: string | null) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* egal */ } } };
const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
const standalone = () => (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function call(body: object) {
  const { data, error } = await sb().functions.invoke('familie', { body });
  if (error) {
    let code = '';
    try { code = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* egal */ }
    throw { code: code || ((error as any).name === 'FunctionsFetchError' ? 'no_function' : 'server') };
  }
  return data;
}
async function registration() {
  const base = (document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? '/Family/manifest.webmanifest').replace(/manifest\.webmanifest$/, '');
  return navigator.serviceWorker.register(base + 'sw.js', { scope: base });
}

const ERR: Record<string, string> = {
  no_sql: 'Auf dem Server fehlt noch die Einrichtung für Erinnerungen (fix-05-erinnerungen.sql).',
  unknown_action: 'Die Server-Funktion ist noch der alte Stand. Bitte einmal neu einspielen.',
  not_member: 'Dieses Gerät ist mit keiner Familie verbunden.',
  no_function: 'Der Familienserver ist gerade nicht erreichbar.',
};

/** Erinnerungen an Termine auf diesem Gerät ein- oder ausschalten. Nur im Browser mit Familien-Verbindung. */
export function PushSetup({ meId }: { meId?: string }) {
  const [linked, setLinked] = useState(false);
  const [on, setOn] = useState(() => (Platform.OS === 'web' ? !!store.get() : false));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (cloudEnabled) getLink().then(l => setLinked(!!l)).catch(() => {}); }, []);
  if (Platform.OS !== 'web' || !cloudEnabled || !linked) return null;

  if (!supported() && isIos() && !standalone()) {
    return (
      <View style={[s.card, { gap: 6, padding: 14 }]}>
        <Text style={[s.text, { fontWeight: '800' }]}>🔔 Erinnerungen aufs iPhone</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>Geht auf dem iPhone nur mit der App auf dem Home-Bildschirm: unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Die App von dort öffnen und hier einschalten.</Text>
      </View>
    );
  }
  if (!supported()) return null;

  async function enable() {
    setBusy(true); setMsg('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw { code: 'denied' };
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { key } = await call({ action: 'push_key' });
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
      await call({ action: 'push_sub', sub: sub.toJSON(), person: meId });
      store.set(sub.endpoint); setOn(true);
      setMsg('Eingeschaltet. Tipp auf „Test“, um es auszuprobieren.');
    } catch (e: any) {
      setMsg(e?.code === 'denied' ? 'Mitteilungen sind für diese Seite blockiert. In den Einstellungen des Handys erlauben.' : ERR[e?.code] ?? 'Hat nicht geklappt. Bitte später nochmal versuchen.');
    }
    setBusy(false);
  }
  async function current() { const reg = await navigator.serviceWorker.getRegistration(); return reg?.pushManager.getSubscription(); }
  async function test() {
    setMsg('');
    try { const sub = await current(); if (!sub) throw { code: 'gone' }; const r = await call({ action: 'push_test', sub: sub.toJSON() }); setMsg(r?.ok ? 'Test verschickt. Kommt in wenigen Sekunden.' : 'Test kam nicht an.'); }
    catch (e: any) { if (e?.code === 'gone') { store.set(null); setOn(false); } setMsg(ERR[e?.code] ?? 'Test hat nicht geklappt. Bitte neu einschalten.'); }
  }
  async function disable() {
    try { const sub = await current(); if (sub) { await call({ action: 'push_sub', off: true, sub: sub.toJSON() }).catch(() => {}); await sub.unsubscribe(); } } catch { /* egal */ }
    store.set(null); setOn(false); setMsg('');
  }

  return (
    <View style={[s.card, { gap: 8, padding: 14 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={[s.text, { fontWeight: '800', flexShrink: 1 }]}>🔔 Erinnerungen auf diesem Gerät: {on ? 'an' : 'aus'}</Text>
        <View style={[s.row, { gap: 8 }]}>
          {on ? (<><Button ghost title="Test" onPress={test} /><Button ghost title="Aus" onPress={disable} /></>) : <Button title={busy ? '…' : 'Einschalten'} disabled={busy} onPress={enable} />}
        </View>
      </View>
      {!on && !msg && <Text style={[s.muted, { fontSize: 13 }]}>Du bekommst eine Mitteilung vor deinen Terminen, und vor denen der Kinder, wenn noch niemand als Fahrer eingetragen ist.</Text>}
      {!!msg && <Text style={{ color: msg.startsWith('Eingeschaltet') || msg.startsWith('Test verschickt') ? C.ok : C.danger, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
    </View>
  );
}
