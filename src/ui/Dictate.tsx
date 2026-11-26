import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { C } from './theme';

/** Spracheingabe im Browser (Chrome, Edge, Safari). Kostenlos, läuft über die Spracherkennung des Geräts/Browsers. */
const Rec = () => (Platform.OS === 'web' ? (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition : undefined);
export const canDictate = () => !!Rec();

export function DictateButton({ onText, onLive, label = 'Sprechen' }: { onText: (t: string) => void; onLive?: (t: string) => void; label?: string }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const rec = useRef<any>(null);
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* egal */ } }, []);
  if (!canDictate()) return null;
  const start = () => {
    setErr('');
    if (on) { rec.current?.stop(); return; }
    const R = Rec();
    const r = new R();
    r.lang = 'de-DE'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final ? ', ' : '') + t; else live += t;
      }
      onLive?.([final, live].filter(Boolean).join(', '));
    };
    r.onerror = (e: any) => setErr(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'Mikrofon nicht erlaubt' : e?.error === 'no-speech' ? 'Nichts gehört' : 'Hat nicht geklappt');
    r.onend = () => { setOn(false); if (final.trim()) onText(final.trim()); };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setErr('Hat nicht geklappt'); }
  };
  return (
    <Pressable onPress={start} accessibilityRole="button" accessibilityLabel={on ? 'Aufnahme beenden' : label}
      style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.danger : C.surface2 }}>
      <Text style={{ fontSize: 20, color: on ? '#fff' : C.fg }}>{on ? '⏹' : '🎤'}</Text>
      {!!err && <Text style={{ fontSize: 10, color: C.danger, fontWeight: '700' }}>{err}</Text>}
    </Pressable>
  );
}
