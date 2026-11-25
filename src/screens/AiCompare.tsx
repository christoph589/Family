import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { AI_ERROR, AI_PROVIDERS, AiProvider, generateCards, generateQuiz, setForcedProvider } from '../ai/generate';
import { useFamily } from '../data/FamilyContext';
import { Topic } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';
import { shrink } from './Learn';

const MAX = 4;
type Task = 'test' | 'karten';
type Out = { ms: number; items: { q: string; a: string }[]; error?: string };

/**
 * KI-Vergleich für Eltern: dasselbe Arbeitsblatt geht nacheinander an Claude und an Mistral,
 * die Ergebnisse stehen nebeneinander. Die Eltern wählen, was besser ist. So lässt sich mit
 * ca. 10 echten Blättern entscheiden, ob "Nur EU" gut genug ist.
 */
export function AiCompare() {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task>('test');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [res, setRes] = useState<Partial<Record<AiProvider, Out>> | null>(null);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const log = data.settings?.aiCompare ?? [];
  const tally = { claude: 0, mistral: 0, gleich: 0 };
  log.forEach(l => { tally[l.win]++; });

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: MAX - photos.length });
    if (r.canceled || !r.assets.length) return;
    try { const small = await Promise.all(r.assets.slice(0, MAX - photos.length).map(shrink)); setPhotos(p => [...p, ...small]); }
    catch { setMsg('Foto konnte nicht geladen werden.'); }
  }

  async function run() {
    setMsg(''); setRes({});
    const out: Partial<Record<AiProvider, Out>> = {};
    // Nacheinander, weil der erzwungene Anbieter für den ganzen Aufruf gilt
    for (const p of AI_PROVIDERS) {
      setBusy(`${p.short} arbeitet …`);
      setForcedProvider(p.id);
      const t0 = Date.now();
      try {
        if (task === 'test') {
          const q = await generateQuiz({ subject: subject || 'Schule', text: topic || 'Arbeitsblatt' } as Topic, photos, 'das Kind', grade || undefined);
          out[p.id] = { ms: Date.now() - t0, items: q.questions.map(x => ({ q: x.q + (x.table ? ' [Tabelle]' : '') + (x.figure ? ' [Zeichnung]' : ''), a: x.solution })) };
        } else {
          const c = await generateCards({ subject: subject || 'Schule', title: topic || 'Arbeitsblatt' }, photos, { name: 'das Kind', grade: grade || undefined });
          out[p.id] = { ms: Date.now() - t0, items: c.map(x => ({ q: x.front, a: x.back })) };
        }
      } catch (e: any) {
        out[p.id] = { ms: Date.now() - t0, items: [], error: AI_ERROR[e?.code] ?? 'Fehler' };
      } finally { setForcedProvider(null); }
      setRes({ ...out });
    }
    setBusy('');
  }

  function vote(win: 'claude' | 'mistral' | 'gleich') {
    const ms = Object.fromEntries(Object.entries(res ?? {}).map(([k, v]) => [k, v!.ms]));
    update(d => ({ ...d, settings: { ...d.settings, aiCompare: [...(d.settings?.aiCompare ?? []), { at: new Date().toISOString(), task: `${task}: ${subject} ${topic}`.slice(0, 80), win, ms }].slice(-50) } }));
    setRes(null); setPhotos([]); setTopic(''); setMsg('Gespeichert. Nächstes Blatt?');
  }

  if (!open) return (
    <View style={s.row}>
      <Button ghost title="🔬 KI-Anbieter vergleichen" onPress={() => setOpen(true)} />
      {log.length > 0 && <Text style={s.muted}>{log.length} verglichen: Claude {tally.claude}, Mistral {tally.mistral}, gleich {tally.gleich}</Text>}
    </View>
  );

  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: C.line, paddingTop: 10 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>🔬 KI-Vergleich</Text>
      <Text style={s.muted}>Dasselbe Arbeitsblatt geht an Claude (USA) und an Mistral (EU), unabhängig von eurer Einstellung. Zählt 2 Aufrufe vom Tageslimit. Am besten 10 echte Blätter testen, gemischt aus Handschrift, Tabellen und Mathe.</Text>
      <Segmented value={task} onChange={setTask} options={[{ value: 'test', label: 'Tagestest' }, { value: 'karten', label: 'Lernkarten' }]} />
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Fach" value={subject} onChangeText={setSubject} />
        <TextInput style={[s.input, { flex: 2 }]} placeholder="Thema" value={topic} onChangeText={setTopic} />
        <TextInput style={[s.input, { width: 70 }]} placeholder="Kl." value={grade} onChangeText={t => setGrade(t.replace(/\D/g, '').slice(0, 2))} />
      </View>
      <View style={s.row}>
        {photos.map((ph, i) => (
          <Pressable key={i} onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}><Image source={{ uri: ph }} style={{ width: 56, height: 56, borderRadius: 8 }} /></Pressable>
        ))}
        {photos.length < MAX && <Button ghost title={photos.length ? '+ Seite' : 'Foto wählen'} onPress={pick} />}
      </View>
      <Button title={busy || 'An Claude und Mistral schicken'} disabled={!!busy || !photos.length} onPress={run} />
      {res && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AI_PROVIDERS.map(p => {
            const r = res[p.id];
            return (
              <View key={p.id} style={{ flexGrow: 1, flexBasis: 260, gap: 4, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ fontWeight: '800', color: C.fg }}>{p.name}{r ? `  ·  ${Math.round(r.ms / 1000)} s  ·  ${r.items.length}` : ''}</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>{p.where}</Text>
                {!r && <Text style={s.muted}>wartet …</Text>}
                {r?.error && <Text style={{ color: C.danger }}>{r.error}</Text>}
                {r?.items.map((x, i) => <Text key={i} style={{ fontSize: 13, color: C.fg }}>{i + 1}. {x.q}{'\n'}   ➜ <Text style={{ fontWeight: '700' }}>{x.a}</Text></Text>)}
              </View>
            );
          })}
        </View>
      )}
      {res && !busy && (
        <View style={s.row}>
          <Text style={s.text}>Was ist besser?</Text>
          <Button ghost title="Claude" onPress={() => vote('claude')} />
          <Button ghost title="Mistral" onPress={() => vote('mistral')} />
          <Button ghost title="Gleich gut" onPress={() => vote('gleich')} />
        </View>
      )}
      {!!msg && <Text style={{ color: C.accent, fontWeight: '700' }}>{msg}</Text>}
      {log.length > 0 && <Text style={s.muted}>Bisher {log.length}: Claude {tally.claude}, Mistral {tally.mistral}, gleich gut {tally.gleich}</Text>}
      <Button ghost title="Schließen" onPress={() => { setOpen(false); setRes(null); }} />
    </View>
  );
}
