import { ReactNode, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

/** Hilfen für Wandgeräte (Tablet, Raspberry Pi, alter Laptop) im Browser:
 *  Bildschirm wach halten, nachts abdunkeln, sich selbst neu laden. Nur im Web aktiv. */
const NIGHT_FROM = 21, NIGHT_TO = 6;
const isNight = (d = new Date()) => d.getHours() >= NIGHT_FROM || d.getHours() < NIGHT_TO;

export function Kiosk({ children }: { children: ReactNode }) {
  const [night, setNight] = useState(isNight());
  const [wakeUntil, setWakeUntil] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Bildschirm wach halten (Wake Lock), nach Tab-Wechsel erneut anfordern
    let lock: any = null;
    const want = async () => { try { if (!isNight() && document.visibilityState === 'visible') lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* nicht unterstützt */ } };
    const onVis = () => { if (document.visibilityState === 'visible') want(); };
    want();
    document.addEventListener('visibilitychange', onVis);
    // Nach WLAN-Ausfall frisch laden, damit nichts hängen bleibt
    let wasOffline = false;
    const off = () => { wasOffline = true; };
    const on = () => { if (wasOffline) setTimeout(() => location.reload(), 3000); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    // Jede Minute: Nachtmodus prüfen; um 3:30 Uhr einmal neu laden (holt auch App-Updates)
    const started = Date.now();
    const t = setInterval(() => {
      const n = isNight();
      setNight(n);
      tick(x => x + 1);
      if (n) { try { lock?.release?.(); lock = null; } catch { /* egal */ } } else if (!lock) want();
      const d = new Date();
      if (d.getHours() === 3 && d.getMinutes() === 30 && Date.now() - started > 5 * 60_000) location.reload();
    }, 60_000);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('offline', off); window.removeEventListener('online', on); try { lock?.release?.(); } catch { /* egal */ } };
  }, []);

  useEffect(() => {
    if (!wakeUntil) return;
    const t = setTimeout(() => setWakeUntil(0), Math.max(0, wakeUntil - Date.now()));
    return () => clearTimeout(t);
  }, [wakeUntil]);

  const dark = night && Date.now() > wakeUntil;
  return (
    <View style={{ flex: 1 }}>
      {children}
      {dark && (
        <Pressable onPress={() => setWakeUntil(Date.now() + 2 * 60_000)} accessibilityLabel="Nachtmodus, zum Aufwecken tippen"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#333', fontSize: 64, fontWeight: '800' }}>{new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Text>
          <Text style={{ color: '#2a2a2a', fontSize: 16, marginTop: 8 }}>Tippen zum Aufwecken</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Steht ?wand in der Adresse, startet das Gerät direkt in der Wandansicht. */
export const wantsWall = () => Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]wand\b/.test(location.search);
