import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { sb } from '../data/cloud';
import { Button } from './Button';
import { C, s, SHADOW } from './theme';

/**
 * Auf der Profilauswahl: Zugang zur Operator-Ansicht, nur für Operator-Konten sichtbar
 * und erst nach erneuter Eingabe des Konto-Passworts.
 */
export function OperatorEntry() {
  const [isOp, setIsOp] = useState(false);
  const [email, setEmail] = useState('');
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let on = true;
    (async () => {
      const { data } = await sb().auth.getUser();
      if (!data.user?.email) return;
      const { data: ok } = await sb().rpc('is_operator');
      if (on && ok) { setIsOp(true); setEmail(data.user.email); }
    })().catch(() => {});
    return () => { on = false; };
  }, []);
  if (!isOp) return null;

  async function go() {
    if (!pw) return;
    setBusy(true); setErr('');
    const { error } = await sb().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr('Passwort stimmt nicht.'); setPw(''); return; }
    location.href = location.pathname + '?operator';
  }

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => { setOpen(true); setPw(''); setErr(''); }} style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 16 }}>
        <Text style={{ color: '#ffffffaa', fontWeight: '700', fontSize: 13 }}>🛠 Operator-Ansicht</Text>
      </Pressable>
      {open && (
        <View style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1530aa', paddingTop: 70, paddingHorizontal: 16, zIndex: 20 }}>
          <View style={[s.card, { maxWidth: 380, alignSelf: 'center', width: '100%', ...SHADOW.lg }]}>
            <Text style={s.h2}>Operator-Ansicht</Text>
            <Text style={s.muted}>Zur Sicherheit das Passwort von {email} eingeben.</Text>
            <TextInput autoFocus style={s.input} value={pw} onChangeText={t => { setPw(t); setErr(''); }} secureTextEntry placeholder="Passwort"
              autoComplete="current-password" onSubmitEditing={go} accessibilityLabel="Passwort" />
            {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
            <View style={s.row}>
              <Button ghost title="Abbrechen" onPress={() => setOpen(false)} style={{ flex: 1 }} />
              <Button title={busy ? 'Prüfe …' : 'Öffnen'} disabled={!pw || busy} onPress={go} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      )}
    </>
  );
}
