import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { newFamily } from '../data/logic';
import { useFamily } from '../data/FamilyContext';

export function Setup() {
  const { replace } = useFamily();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [kids, setKids] = useState([{ name: '', grade: '' }]);
  const valid = name.trim() && /^\d{4}$/.test(pin) && kids.some(k => k.name.trim());
  const setKid = (i: number, k: Partial<{ name: string; grade: string }>) => setKids(ks => ks.map((x, j) => (j === i ? { ...x, ...k } : x)));

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { maxWidth: 560 }]}>
      <Text style={s.h1}>Familie anlegen</Text>
      <Text style={s.muted}>Testversion. Die Daten bleiben vorerst nur auf diesem Gerät.</Text>
      <View style={s.card}>
        <Text style={s.label}>Familienname</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="z. B. Familie Krüger" />
        <Text style={s.label}>Eltern-PIN (4 Ziffern)</Text>
        <TextInput style={s.input} value={pin} onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry placeholder="••••" />
        <Text style={[s.muted, { fontSize: 13 }]}>Mit der PIN bestätigst du erledigte Aufgaben und trägst Noten ein. Kinder sehen nur ihre eigene Ansicht.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>Kinder</Text>
        {kids.map((k, i) => (
          <View key={i} style={s.row}>
            <TextInput style={[s.input, { flex: 2, minWidth: 120 }]} value={k.name} onChangeText={t => setKid(i, { name: t })} placeholder="Name" />
            <TextInput style={[s.input, { flex: 1, minWidth: 90 }]} value={k.grade} onChangeText={t => setKid(i, { grade: t })} placeholder="Klasse" />
          </View>
        ))}
        <Button ghost title="Weiteres Kind" onPress={() => setKids(ks => [...ks, { name: '', grade: '' }])} />
      </View>
      <Button title="Loslegen" disabled={!valid} onPress={() => replace(newFamily(name.trim(), pin, kids.filter(k => k.name.trim()).map(k => ({ name: k.name.trim(), grade: k.grade.trim() || undefined }))))} />
      <Text style={[s.muted, { fontSize: 13, color: C.muted }]}>Für jedes Kind lege ich zwei Beispielaufgaben an. Du kannst sie unter „Aufgaben“ ändern.</Text>
    </ScrollView>
  );
}
