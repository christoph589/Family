import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { Repeat, TaskKind } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

export function Manage({ onReset }: { onReset: () => void }) {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(data?.children[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('hausaufgabe');
  const [repeat, setRepeat] = useState<Repeat>('einmal');
  const [points, setPoints] = useState('10');
  const [confirmReset, setConfirmReset] = useState(false);
  if (!data) return null;
  const list = data.tasks.filter(t => t.childId === childId && t.active);
  return (
    <View style={{ gap: 16 }}>
      <View style={s.card}>
        <Text style={s.h2}>Aufgabe anlegen</Text>
        <Segmented value={childId} onChange={setChildId} options={data.children.map(c => ({ value: c.id, label: c.name }))} />
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Mathe: Arbeitsheft S. 34" />
        <View style={s.row}>
          <Segmented value={kind} onChange={setKind} options={[{ value: 'hausaufgabe', label: 'Hausaufgabe' }, { value: 'pflicht', label: 'Pflicht' }]} />
          <Segmented value={repeat} onChange={setRepeat} options={[{ value: 'einmal', label: 'Nur heute' }, { value: 'werktags', label: 'Mo bis Fr' }, { value: 'taeglich', label: 'Täglich' }]} />
          <View style={[s.row, { gap: 6 }]}>
            <TextInput style={[s.input, { width: 70 }]} value={points} onChangeText={t => setPoints(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            <Text style={s.muted}>Punkte</Text>
          </View>
        </View>
        <Button title="Anlegen" disabled={!title.trim()} onPress={() => {
          update(d => ({ ...d, tasks: [...d.tasks, { id: uid(), childId, title: title.trim(), kind, repeat, points: Number(points) || 0, date: repeat === 'einmal' ? today() : undefined, active: true }] }));
          setTitle('');
        }} />
      </View>
      <View style={s.card}>
        <Text style={s.label}>Aktive Aufgaben</Text>
        {list.length === 0 && <Text style={s.muted}>Keine Aufgaben.</Text>}
        {list.map(t => (
          <View key={t.id} style={[s.row, { flexWrap: 'nowrap', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{t.title}</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>{t.kind === 'hausaufgabe' ? 'Hausaufgabe' : 'Pflicht'} · {t.repeat === 'einmal' ? t.date : t.repeat === 'taeglich' ? 'täglich' : 'Mo bis Fr'} · {t.points} P</Text>
            </View>
            <Pressable onPress={() => update(d => ({ ...d, tasks: d.tasks.map(x => (x.id === t.id ? { ...x, active: false } : x)) }))}>
              <Text style={{ color: C.danger, fontWeight: '700' }}>Entfernen</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={[s.card, { borderWidth: 1, borderColor: C.line }]}>
        <Text style={s.label}>Testdaten</Text>
        {!confirmReset ? <Button ghost title="Alles löschen und neu anfangen" onPress={() => setConfirmReset(true)} /> : (
          <View style={s.row}>
            <Text style={s.text}>Wirklich alles löschen?</Text>
            <Button title="Ja, löschen" color={C.danger} onPress={onReset} />
            <Button ghost title="Abbrechen" onPress={() => setConfirmReset(false)} />
          </View>
        )}
      </View>
    </View>
  );
}
