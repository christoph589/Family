import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { DayTime, Repeat, TaskKind } from '../data/types';
import { KIND_LABEL, TaskTemplate, TEMPLATES, TIME_LABEL } from '../data/templates';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

export function Manage({ onReset }: { onReset: () => void }) {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(data?.children[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('hausaufgabe');
  const [repeat, setRepeat] = useState<Repeat>('einmal');
  const [points, setPoints] = useState('10');
  const [icon, setIcon] = useState('');
  const [time, setTime] = useState<DayTime | ''>('');
  const [selfCheck, setSelfCheck] = useState(false);
  const [added, setAdded] = useState('');
  const has = (t: TaskTemplate) => !!data?.tasks.some(x => x.active && x.childId === childId && x.title === t.title && x.time === t.time);
  const addTemplate = (t: TaskTemplate) => {
    update(d => ({ ...d, tasks: [...d.tasks, { ...t, id: uid(), childId, active: true, date: t.repeat === 'einmal' ? today() : undefined }] }));
    setAdded(`${t.icon} ${t.title} hinzugefügt.`);
  };
  const [confirmReset, setConfirmReset] = useState(false);
  if (!data) return null;
  const list = data.tasks.filter(t => t.childId === childId && t.active);
  return (
    <View style={{ gap: 16 }}>
      <View style={s.card}>
        <Text style={s.h2}>Vorlagen</Text>
        <Segmented value={childId} onChange={setChildId} options={data.children.map(c => ({ value: c.id, label: c.name }))} />
        <Text style={s.muted}>Antippen zum Hinzufügen. Grau heißt: hat {data.children.find(c => c.id === childId)?.name} schon.</Text>
        {(['routine', 'hausaufgabe', 'pflicht'] as TaskKind[]).map(k => (
          <View key={k} style={{ gap: 6 }}>
            <Text style={s.label}>{k === 'pflicht' ? 'Haushalt' : k === 'routine' ? 'Routinen' : 'Schule'}</Text>
            <View style={[s.row, { gap: 8 }]}>
              {TEMPLATES.filter(t => t.kind === k).map((t, i) => {
                const on = has(t);
                return (
                  <Pressable key={i} disabled={on} onPress={() => addTemplate(t)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: on ? C.line : C.accent, backgroundColor: on ? C.surface2 : C.surface, opacity: on ? 0.6 : 1 }}>
                    <Text style={{ color: C.fg, fontWeight: '600' }}>{t.icon} {t.title}{t.time ? ` (${t.time === 'mittags' ? 'nach der Schule' : t.time})` : ''} · {t.points} P</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {added ? <Text style={{ color: C.ok, fontWeight: '700' }}>{added}</Text> : null}
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Eigene Aufgabe</Text>
        <View style={[s.row, { flexWrap: 'nowrap' }]}>
          <TextInput style={[s.input, { width: 60, textAlign: 'center' }]} value={icon} onChangeText={t => setIcon(t.slice(0, 4))} placeholder="🙂" accessibilityLabel="Symbol" />
          <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder="z. B. Mathe: Arbeitsheft S. 34" />
        </View>
        <Segmented value={kind} onChange={setKind} options={(['routine', 'hausaufgabe', 'pflicht'] as TaskKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))} />
        <Segmented value={time} onChange={setTime} options={[{ value: '' as const, label: 'Egal wann' }, ...(['morgens', 'mittags', 'abends'] as DayTime[]).map(t => ({ value: t, label: TIME_LABEL[t] }))]} />
        <View style={s.row}>
          <Segmented value={repeat} onChange={setRepeat} options={[{ value: 'einmal', label: 'Nur heute' }, { value: 'werktags', label: 'Mo bis Fr' }, { value: 'taeglich', label: 'Täglich' }]} />
          <View style={[s.row, { gap: 6 }]}>
            <TextInput style={[s.input, { width: 70 }]} value={points} onChangeText={t => setPoints(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
            <Text style={s.muted}>Punkte</Text>
          </View>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selfCheck }} onPress={() => setSelfCheck(v => !v)} style={[s.row, { flexWrap: 'nowrap' }]}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: selfCheck ? C.accent : C.surface, alignItems: 'center', justifyContent: 'center' }}>
            {selfCheck && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
          </View>
          <Text style={[s.text, { flex: 1 }]}>Kind darf selbst abhaken, ohne dass ihr bestätigt (gut für Zähne putzen und Ähnliches)</Text>
        </Pressable>
        <Button title="Anlegen" disabled={!title.trim()} onPress={() => {
          update(d => ({ ...d, tasks: [...d.tasks, { id: uid(), childId, title: title.trim(), icon: icon.trim() || undefined, kind, time: time || undefined, selfCheck, repeat, points: Number(points) || 0, date: repeat === 'einmal' ? today() : undefined, active: true }] }));
          setAdded(`${icon} ${title.trim()} hinzugefügt.`); setTitle(''); setIcon('');
        }} />
      </View>
      <View style={s.card}>
        <Text style={s.label}>Aktive Aufgaben</Text>
        {list.length === 0 && <Text style={s.muted}>Keine Aufgaben.</Text>}
        {list.map(t => (
          <View key={t.id} style={[s.row, { flexWrap: 'nowrap', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>{t.icon ? t.icon + ' ' : ''}{t.title}</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>{KIND_LABEL[t.kind]}{t.time ? ` · ${t.time}` : ''}{t.selfCheck ? ' · ohne Bestätigung' : ''} · {t.repeat === 'einmal' ? t.date : t.repeat === 'taeglich' ? 'täglich' : 'Mo bis Fr'} · {t.points} P</Text>
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
