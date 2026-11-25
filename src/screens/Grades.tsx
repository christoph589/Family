import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { addPoints } from '../data/logic';
import { EXAM_POINTS } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

export function Grades() {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(data?.children[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('2');
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const g = Number(grade);
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.h2}>Note aus der Schule eintragen</Text>
        <Text style={s.muted}>Wenn die echte Klassenarbeit zurück ist. Punkte gibt es nach Note.</Text>
        <Text style={s.label}>Kind</Text>
        <Segmented value={childId} onChange={setChildId} options={data.children.map(c => ({ value: c.id, label: c.name }))} />
        <Text style={s.label}>Fach</Text>
        <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="z. B. Mathe" />
        <Text style={s.label}>Note</Text>
        <Segmented value={grade} onChange={setGrade} options={['1', '2', '3', '4', '5', '6'].map(v => ({ value: v, label: v }))} />
        <Button title={`Eintragen (+${EXAM_POINTS[g]} P)`} disabled={!subject.trim() || !childId} onPress={() => {
          update(d => addPoints(d, childId, EXAM_POINTS[g], `${subject.trim()}: Note ${g}`));
          setMsg(`${data.children.find(c => c.id === childId)?.name}: ${subject.trim()} Note ${g} eingetragen.`); setSubject('');
        }} />
        {msg ? <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text> : null}
      </View>
      <View style={[s.card, { flexGrow: 1, flexBasis: 260 }]}>
        <Text style={s.label}>Punkte pro Note</Text>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <View key={n} style={[s.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 6 }]}>
            <Text style={s.text}>Note {n}</Text><Text style={[s.text, { fontWeight: '700' }]}>+{EXAM_POINTS[n]} P</Text>
          </View>
        ))}
        <Text style={[s.muted, { fontSize: 13 }]}>Keine Minuspunkte bei 5 oder 6, damit schlechte Noten nicht versteckt werden.</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>Übungen zu den Tagesthemen findest du unter „Lernen“. Die werden nicht benotet.</Text>
      </View>
    </View>
  );
}
