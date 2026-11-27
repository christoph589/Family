import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { setAiConsentAsker } from '../ai/generate';
import { useFamily } from '../data/FamilyContext';
import { LEGAL } from '../brand';
import { Button } from './Button';
import { openLegal } from './LegalLinks';
import { C, s } from './theme';

/** Fragt einmal pro Familie die Eltern, bevor Fotos an die KI gehen. Bestätigung mit Eltern-PIN, damit Kinder nicht selbst zustimmen. */
export function AiConsent() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const wait = useRef<((ok: boolean) => void) | null>(null);
  const given = !!data?.settings?.aiConsent;
  useEffect(() => {
    setAiConsentAsker(() => given ? Promise.resolve(true) : new Promise<boolean>(res => { wait.current = res; setPin(''); setErr(false); setOpen(true); }));
    return () => setAiConsentAsker(null);
  }, [given]);
  if (!open || !data) return null;
  const done = (ok: boolean) => { setOpen(false); wait.current?.(ok); wait.current = null; };
  const check = (p: string) => {
    if (p !== data.family.parentPin) { setErr(true); setPin(''); return; }
    update(d => ({ ...d, settings: { ...d.settings, aiConsent: { at: new Date().toISOString() } } }));
    done(true);
  };
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1530aa', paddingTop: 40, paddingHorizontal: 16 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[s.card, { maxWidth: 480, alignSelf: 'center', width: '100%' }]}>
          <Text style={s.h2}>🤖 Fotos an die KI schicken?</Text>
          <Text style={s.text}>Damit Famelio Lernkarten, Probe-Arbeiten oder Vokabeln erstellen kann, gehen die Fotos an die KI von Anthropic (Claude, Server in den USA). Die KI nutzt sie nur für diese eine Aufgabe und lernt nicht daraus.</Text>
          <Text style={[s.text, { fontWeight: '700' }]}>Bitte beachten:</Text>
          <Text style={s.text}>• Nur Unterlagen fotografieren, möglichst ohne Namen, Adressen oder Noten anderer.{'\n'}• Fotos und Lernkarten bleiben in eurer Familie und werden nie mit anderen geteilt.{'\n'}• Famelio löscht die Fotos automatisch, sobald die Klassenarbeit oder das Thema vorbei ist.{'\n'}• Die KI kann Fehler machen. Bitte erzeugte Karten kurz prüfen.</Text>
          <Pressable accessibilityRole="link" onPress={() => openLegal(LEGAL.datenschutz)}><Text style={{ color: C.accent, fontWeight: '700', textDecorationLine: 'underline' }}>Mehr dazu in der Datenschutzerklärung</Text></Pressable>
          <Text style={s.label}>Zustimmen mit Eltern-PIN</Text>
          <TextInput autoFocus style={[s.input, { fontSize: 24, letterSpacing: 12, textAlign: 'center', fontWeight: '800' }]} value={pin} secureTextEntry keyboardType="number-pad" placeholder="••••"
            onChangeText={t => { const v = t.replace(/\D/g, '').slice(0, 4); setPin(v); setErr(false); if (v.length === 4) check(v); }} />
          {err && <Text style={{ color: C.danger }}>PIN stimmt nicht. Ein Kind bittet am besten Mama oder Papa.</Text>}
          <View style={s.row}><Button ghost title="Nicht jetzt" onPress={() => done(false)} style={{ flex: 1 }} /></View>
          <Pressable onPress={() => done(false)}><Text style={[s.muted, { fontSize: 12 }]}>Die Zustimmung lässt sich jederzeit unter ⚙️ › Familie widerrufen.</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
