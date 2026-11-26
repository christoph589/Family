import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C } from '../ui/theme';

/**
 * Automatisch aufnehmen wie ein Dokumentenscanner (nur Web/PWA):
 * Kamera bleibt offen. Liegt eine NEUE Seite ruhig im Bild, löst sie von selbst aus.
 * Neu = Bild unterscheidet sich deutlich von der letzten Aufnahme (umgeblättert).
 * Ruhig = zwischen zwei Bildern kaum Bewegung, etwa eine Sekunde lang.
 */
const W = 32, H = 24; // grob, damit Wackeln und Bildrauschen kaum zählen
const STILL = 9;      // mittlere Helligkeitsänderung pro Pixel zwischen zwei Bildern
const CHANGED = 12;     // Abstand zur letzten Aufnahme, ab dem es eine neue Seite ist
const HOLD_MS = 700;    // so lange ruhig halten

export const autoCamSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function AutoCam({ count, max, onShot, onClose }: { count: number; max: number; onShot: (dataUrl: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [hint, setHint] = useState('Kamera startet …');
  const [still, setStill] = useState(0);
  const [flash, setFlash] = useState(false);
  const [dbg, setDbg] = useState('');
  const autoRef = useRef(true); autoRef.current = auto;
  const shootRef = useRef<() => void>(() => {});
  const full = count >= max;

  useEffect(() => {
    let stream: MediaStream | null = null, timer: any, dead = false;
    const small = document.createElement('canvas'); small.width = W; small.height = H;
    const sctx = small.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    let motionAvg = 99, prev: Uint8ClampedArray | null = null, last: Uint8ClampedArray | null = null, stillSince = 0, armed = true;
    const gray = () => {
      const v = video.current!; sctx.drawImage(v, 0, 0, W, H);
      const d = sctx.getImageData(0, 0, W, H).data, g = new Uint8ClampedArray(W * H);
      for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
      return g;
    };
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
    const mean = (a: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
    function shoot() {
      const v = video.current; if (!v || !v.videoWidth) return;
      const scale = Math.min(1, 1400 / v.videoWidth);
      const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      onShot(c.toDataURL('image/jpeg', 0.6));
      last = gray(); armed = false; stillSince = 0; setStill(0);
      setFlash(true); setTimeout(() => setFlash(false), 180);
      try { navigator.vibrate?.(60); } catch { /* egal */ }
    }
    shootRef.current = shoot;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (dead) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!; v.srcObject = stream; await v.play().catch(() => {});
        timer = setInterval(() => {
          const v = video.current; if (!v || !v.videoWidth) return;
          const g = gray();
          const raw = prev ? diff(g, prev) : 99; prev = g;
          motionAvg = motionAvg * 0.5 + raw * 0.5; const motion = motionAvg;
          setDbg(`Bewegung ${raw.toFixed(1)} · Abstand ${last ? diff(g, last).toFixed(1) : '-'}`);
          if (!armed && last && diff(g, last) > CHANGED) armed = true;
          if (!autoRef.current) { setHint('Zum Aufnehmen den Auslöser tippen.'); return; }
          if (mean(g) < 35) { setHint('Zu dunkel. Bitte mehr Licht.'); stillSince = 0; setStill(0); return; }
          if (!armed) { setHint('✓ Aufgenommen. Jetzt umblättern.'); return; }
          if (motion > STILL) { stillSince = 0; setStill(0); setHint('Seite ins Bild halten und ruhig halten …'); return; }
          if (!stillSince) stillSince = Date.now();
          const p = Math.min(1, (Date.now() - stillSince) / HOLD_MS); setStill(p); setHint('Ruhig halten …');
          if (p >= 1) shoot();
        }, 120);
      } catch (e: any) {
        setErr(e?.name === 'NotAllowedError' ? 'Kamera nicht erlaubt. Bitte in den Einstellungen des Browsers freigeben.' : 'Kamera konnte nicht gestartet werden.');
      }
    })();
    return () => { dead = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  useEffect(() => { if (full) onClose(); }, [full]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 50 }}>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <video ref={video} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' } as any} />
      {/* Rahmen: Seite hier hinein. Wird grün, während sie ruhig liegt. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '17%', bottom: '19%', left: '7%', right: '7%', borderWidth: 3, borderRadius: 18, borderColor: err ? 'transparent' : still > 0 ? C.ok : 'rgba(255,255,255,0.85)', borderStyle: still > 0 ? 'solid' : 'dashed' }} />
      {flash && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', opacity: 0.7 }} />}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 16, paddingTop: 50, backgroundColor: 'rgba(0,0,0,0.45)', gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>📄 {count} {count === 1 ? 'Seite' : 'Seiten'}</Text>
          <Pressable onPress={() => setAuto(a => !a)} accessibilityRole="switch" accessibilityState={{ checked: auto }}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: auto ? C.ok : 'rgba(255,255,255,0.25)' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{auto ? 'Automatisch an' : 'Automatisch aus'}</Text>
          </Pressable>
        </View>
        <Text style={{ color: '#fff', fontSize: 15 }}>{err || hint}</Text>
        {!!dbg && <Text style={{ color: '#ffffff99', fontSize: 11 }}>{dbg}</Text>}
        {auto && !err && <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}><View style={{ height: 5, width: `${Math.round(still * 100)}%`, backgroundColor: C.ok }} /></View>}
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 40, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ width: 90 }} />
        <Pressable accessibilityLabel="Auslösen" onPress={() => shootRef.current()} disabled={!!err}
          style={({ pressed }) => ({ width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: '#fff', backgroundColor: pressed ? '#ddd' : 'rgba(255,255,255,0.35)' })} />
        <Pressable onPress={onClose} accessibilityRole="button" style={{ width: 90, paddingVertical: 12, borderRadius: 14, backgroundColor: C.ok, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Fertig</Text>
        </Pressable>
      </View>
    </View>
  );
}
