import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { deleteMyAccount } from '../data/cloud';
import { useFamily } from '../data/FamilyContext';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Konto löschen direkt in der App (App Store 5.1.1(v), DSGVO Art. 17). Mit Eltern-PIN und dem Wort LÖSCHEN. */
export function DeleteAccount({ onDone }: { onDone: () => void }) {
  const { data } = useFamily();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data) return null;
  const ready = pin.length === 4 && word.trim().toUpperCase() === 'LÖSCHEN';
  async function go() {
    if (pin !== data!.family.parentPin) { setErr('Die Eltern-PIN stimmt nicht.'); setPin(''); return; }
    setBusy(true); setErr('');
    try {
      await deleteMyAccount();
      if (typeof window !== 'undefined' && window.location) window.location.replace(window.location.pathname);
      else onDone();
    } catch (e: any) { setErr(e?.message ?? 'Löschen hat nicht geklappt.'); setBusy(false); }
  }
  if (!open) return (
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ paddingVertical: 10, paddingHorizontal: 18 }}>
      <Text style={{ color: C.muted, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' }}>Konto löschen</Text>
    </Pressable>
  );
  return (
    <View style={[s.card, { maxWidth: 520, width: '100%', borderColor: C.danger, borderWidth: 1 }]}>
      <Text style={s.h2}>Konto endgültig löschen</Text>
      <Text style={s.text}>Dein Konto wird sofort gelöscht. Bist du das letzte Eltern-Konto in „{data.family.name}“, löschen wir die ganze Familie mit: Termine, Aufgaben, Punkte, Geld, Lernkarten, Fotos, Kalender-Zugänge und alle Kindergeräte.</Text>
      <Text style={s.text}>Gibt es noch ein zweites Eltern-Konto, bleibt die Familie bestehen und nur dein Zugang verschwindet.</Text>
      <Text style={s.muted}>Das lässt sich nicht rückgängig machen. Sicherungskopien beim Hosting-Anbieter werden spätestens nach 30 Tagen überschrieben.</Text>
      <Text style={s.label}>Eltern-PIN</Text>
      <TextInput style={[s.input, { width: 140, letterSpacing: 8, textAlign: 'center' }]} value={pin} secureTextEntry keyboardType="number-pad" placeholder="••••"
        onChangeText={t => { setPin(t.replace(/\D/g, '').slice(0, 4)); setErr(''); }} />
      <Text style={s.label}>Zur Sicherheit LÖSCHEN eintippen</Text>
      <TextInput style={s.input} value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} placeholder="LÖSCHEN" />
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={() => { setOpen(false); setPin(''); setWord(''); setErr(''); }} />
        <Button title={busy ? 'Lösche …' : 'Endgültig löschen'} color={C.danger} disabled={!ready || busy} onPress={go} />
      </View>
    </View>
  );
}
