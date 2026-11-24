import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { useState } from 'react';
import { Image, Platform, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, topicUnderstanding, uid } from '../data/logic';
import { Topic } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { KidSheets, ReviewSheets, SheetEditor, UnderstandingChip } from './Sheets';
import { C, s } from '../ui/theme';

const MAX_TOPICS = 30; // Fotos liegen vorerst lokal, deshalb begrenzt.

export function Learn({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  const [childId, setChildId] = useState(childIds[0] ?? '');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<Topic | null>(null);
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const topics = (data.topics ?? []).filter(t => childIds.includes(t.childId));

  async function pick(camera: boolean) {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.35, base64: true };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setMsg('Kamera nicht erlaubt. Bitte in den Einstellungen freigeben.'); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPhoto(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
  }

  function save() {
    const t: Topic = { id: uid(), childId, subject: subject.trim(), text: text.trim(), photo, date: today() };
    update(d => ({ ...d, topics: [t, ...(d.topics ?? [])].slice(0, MAX_TOPICS) }));
    setSubject(''); setText(''); setPhoto(undefined); setMsg('Thema gespeichert.');
  }

  return (
    <View style={{ gap: 16 }}>
    {parent ? <ReviewSheets childIds={childIds} /> : <KidSheets childId={childIds[0]} />}
    {editing && <SheetEditor topic={editing} onDone={() => setEditing(null)} />}
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.h2}>Was kam heute dran?</Text>
        <Text style={s.muted}>Thema eintragen und ein Foto vom Heft oder der Tafel machen. Daraus entsteht eine kurze Übung, mit der ihr seht, ob das Thema verstanden wurde.</Text>
        {kids.length > 1 && <Segmented value={childId} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name }))} />}
        <Text style={s.label}>Fach</Text>
        <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="z. B. Mathe" />
        <Text style={s.label}>Thema</Text>
        <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={text} onChangeText={setText} placeholder="z. B. Brüche mit gleichem Nenner addieren" />
        <View style={s.row}>
          {Platform.OS !== 'web' && <Button ghost title="Foto machen" onPress={() => pick(true)} />}
          <Button ghost title={Platform.OS === 'web' ? 'Foto oder Screenshot hochladen' : 'Aus Fotos wählen'} onPress={() => pick(false)} />
        </View>
        {photo && (
          <View style={{ gap: 6 }}>
            <Image source={{ uri: photo }} style={{ width: '100%', height: 200, borderRadius: 10, backgroundColor: C.surface2 }} resizeMode="contain" />
            <Button ghost title="Foto entfernen" onPress={() => setPhoto(undefined)} />
          </View>
        )}
        <Button title="Thema speichern" disabled={!subject.trim() || !text.trim() || !childId} onPress={save} />
        {msg ? <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text> : null}
      </View>
      <View style={[s.card, { flexGrow: 1, flexBasis: 320 }]}>
        <Text style={s.label}>Gespeicherte Themen</Text>
        {topics.length === 0 && <Text style={s.muted}>Noch keine Themen.</Text>}
        {topics.map(t => <TopicRow key={t.id} topic={t} childName={data.children.find(c => c.id === t.childId)?.name ?? ''} onMsg={setMsg} onCreate={parent ? () => setEditing(t) : undefined} />)}
        <Text style={[s.muted, { fontSize: 13 }]}>Fragen und Aufgaben schreibt die KI, sobald sie angebunden ist. Bis dahin druckt „Drucken“ ein Blatt mit Kopf, Thema und Platz zum Üben.</Text>
      </View>
    </View>
    </View>
  );
}

function TopicRow({ topic, childName, onMsg, onCreate }: { topic: Topic; childName: string; onMsg: (m: string) => void; onCreate?: () => void }) {
  const { data, update } = useFamily();
  const u = data ? topicUnderstanding(data, topic.id) : undefined;
  const date = new Date(topic.date + 'T12:00:00').toLocaleDateString('de-DE');
  async function print() {
    try { await Print.printAsync({ html: worksheetHtml(topic, childName, date) }); }
    catch { onMsg('Drucken geht in dieser Vorschau nicht. In der App oder im normalen Browser klappt es.'); }
  }
  return (
    <View style={[s.row, { backgroundColor: C.bg, padding: 12, borderRadius: 12, flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
      {topic.photo ? <Image source={{ uri: topic.photo }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.text, { fontWeight: '700' }]}>{topic.subject}: {topic.text}</Text>
        <View style={[s.row, { gap: 8 }]}>
          <Text style={[s.muted, { fontSize: 12 }]}>{childName} · {date}</Text>
          {u && <UnderstandingChip u={u} />}
        </View>
        <View style={[s.row, { marginTop: 6 }]}>
          {onCreate && <Button title="Übung am Handy" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={onCreate} />}
          <Button ghost title="Drucken" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={print} />
          <Button ghost title="Löschen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => update(d => ({ ...d, topics: (d.topics ?? []).filter(x => x.id !== topic.id) }))} />
        </View>
      </View>
    </View>
  );
}

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Arbeitsblatt als HTML. Die Aufgaben füllt später die KI. */
export function worksheetHtml(t: Topic, name: string, date: string, tasks: string[] = []) {
  const lines = Array.from({ length: 14 }, () => '<div class="line"></div>').join('');
  return `<html><head><meta charset="utf-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;margin:32px;color:#111}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px}
    h1{font-size:22px;margin:16px 0 4px} .sub{color:#555}
    ol{font-size:16px;line-height:1.6} .line{border-bottom:1px solid #999;height:34px}
  </style></head><body>
    <div class="head"><b>Name: ${esc(name)}</b><span>Datum: ${date}</span></div>
    <h1>${esc(t.subject)}: ${esc(t.text)}</h1>
    <div class="sub">Tages-Übung</div>
    ${tasks.length ? `<ol>${tasks.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p>Schreibe auf, was du heute zu diesem Thema gelernt hast, und rechne oder schreibe ein eigenes Beispiel.</p>'}
    ${lines}
  </body></html>`;
}
