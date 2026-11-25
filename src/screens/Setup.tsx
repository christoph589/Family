import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { newFamily } from '../data/logic';
import { KidDraft, KidFields, kidDraftValid } from '../ui/KidFields';
import { useFamily } from '../data/FamilyContext';
import { FamilyData } from '../data/types';

export function Setup({ onCreate, note }: { onCreate?: (d: FamilyData) => Promise<void>; note?: string } = {}) {
  const { replace } = useFamily();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [kids, setKids] = useState<({ name: string } & KidDraft)[]>([{ name: '', grade: '', birthday: '' }]);
  const [parents, setParents] = useState(['Mama', 'Papa']);
  const named = kids.filter(k => k.name.trim());
  const valid = name.trim() && /^\d{4}$/.test(pin) && named.length > 0 && named.every(kidDraftValid);
  const setKid = (i: number, k: Partial<{ name: string } & KidDraft>) => setKids(ks => ks.map((x, j) => (j === i ? { ...x, ...k } : x)));

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { maxWidth: 560 }]}>
      <Text style={s.h1}>Familie anlegen</Text>
      <Text style={s.muted}>{note ?? 'Testversion. Die Daten bleiben vorerst nur auf diesem Gerät.'}</Text>
      <View style={s.card}>
        <Text style={s.label}>Familienname</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="z. B. Familie Krüger" />
        <Text style={s.label}>Eltern-PIN (4 Ziffern)</Text>
        <TextInput style={s.input} value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry placeholder="••••" />
        <Text style={[s.muted, { fontSize: 13 }]}>Mit der PIN bestätigst du erledigte Aufgaben und trägst Noten ein. Kinder sehen nur ihre eigene Ansicht.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Eltern</Text>
        <View style={s.row}>
          {parents.map((p, i) => (
            <TextInput key={i} style={[s.input, { flex: 1, minWidth: 120 }]} value={p} placeholder="Name" selectTextOnFocus accessibilityLabel={`Elternteil ${i + 1}`}
              onChangeText={t => setParents(ps => ps.map((x, j) => (j === i ? t : x)))} />
          ))}
        </View>
        <Text style={[s.muted, { fontSize: 13 }]}>Ein Feld leer lassen, wenn es nur ein Elternteil gibt.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Kinder</Text>
        {kids.map((k, i) => (
          <View key={i} style={{ gap: 8, paddingBottom: 8, borderBottomWidth: i < kids.length - 1 ? 1 : 0, borderBottomColor: C.line }}>
            <TextInput style={s.input} value={k.name} onChangeText={t => setKid(i, { name: t })} placeholder="Name" />
            <KidFields value={k} name={k.name} onChange={v => setKid(i, v)} />
          </View>
        ))}
        <Button ghost title="Weiteres Kind" onPress={() => setKids(ks => [...ks, { name: '', grade: '', birthday: '' }])} />
      </View>
      {named.length > 0 && !named.every(kidDraftValid) && <Text style={s.muted}>Für jedes Kind bitte Geburtstag, Geschlecht und Klasse angeben. Daraus richte ich Alter, Geburtstag und Geld-Tipps aus. Die Klasse zählt jedes Schuljahr automatisch hoch.</Text>}
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      <Button title={busy ? 'Moment …' : 'Loslegen'} disabled={!valid || busy} onPress={() => {
        const d = newFamily(name.trim(), pin, kids.filter(k => k.name.trim()).map(k => ({ name: k.name.trim(), grade: k.grade.trim() || undefined, birthday: k.birthday || undefined, gender: k.gender, schoolType: k.schoolType })), parents);
        if (!onCreate) return replace(d);
        setBusy(true); setErr('');
        onCreate(d).catch(e => { setErr(e.message); setBusy(false); });
      }} />
      <Text style={[s.muted, { fontSize: 13, color: C.muted }]}>Für jedes Kind lege ich ein paar Startaufgaben an, zum Beispiel Zähne putzen. Unter „Aufgaben“ findest du viele Vorlagen.</Text>
    </ScrollView>
  );
}
