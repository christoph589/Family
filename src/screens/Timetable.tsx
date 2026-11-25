import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { Avatar, PersonHead } from '../ui/Avatar';
import { Child, SchoolDay, Timetable as TT } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, grad, s } from '../ui/theme';
import { AI_ERROR, readTimetable } from '../ai/generate';

/** Foto oder PDF wählen. Fotos werden auf höchstens 1800 px verkleinert. */
function pickPlanFile(): Promise<{ src?: string; error?: string } | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve({ error: 'Hochladen geht bisher nur im Browser.' });
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.style.position = 'fixed'; input.style.left = '-9999px'; input.style.opacity = '0';
    document.body.appendChild(input);
    const done = (v: { src?: string; error?: string } | null) => { input.remove(); resolve(v); };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      if (file.size > 4_000_000 && file.type === 'application/pdf') return done({ error: 'Das PDF ist zu groß (über 4 MB). Bitte ein Foto oder Bildschirmfoto nehmen.' });
      const r = new FileReader();
      r.onerror = () => done({ error: 'Datei konnte nicht gelesen werden.' });
      r.onload = () => {
        const src = String(r.result);
        if (file.type === 'application/pdf') return done({ src });
        const img = new window.Image();
        img.onload = () => {
          const k = Math.min(1, 1800 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
          done({ src: c.toDataURL('image/jpeg', 0.8) });
        };
        img.onerror = () => done({ error: /heic|heif/i.test(file.type + file.name) ? 'Dieses Foto ist im iPhone-Format HEIC. Bitte ein Bildschirmfoto davon nehmen.' : 'Dieses Bild konnte nicht geöffnet werden.' });
        img.src = src;
      };
      r.readAsDataURL(file);
    });
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

const DAYS = [['1', 'Mo'], ['2', 'Di'], ['3', 'Mi'], ['4', 'Do'], ['5', 'Fr']] as const;
const ROWS = 8;
const COL = 96;
const timeOk = (t?: string) => !t || /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
const fixTime = (t?: string) => (t && timeOk(t) ? t.padStart(5, '0') : undefined);

/** Stundenplan je Kind: Schulbeginn, Schulende und Fächer pro Stunde. */
export function Timetable({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data, update } = useFamily();
  const kids = data?.children.filter(c => childIds.includes(c.id)) ?? [];
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [edit, setEdit] = useState<TT | null>(null);
  const [w, setW] = useState(0);
  const [reading, setReading] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  if (!data || !kids.length) return null;
  const child = kids.find(k => k.id === childId) ?? kids[0];
  const tt = edit ?? child.timetable ?? {};
  const todayWd = String(new Date().getDay());
  const setDay = (k: string, patch: Partial<SchoolDay>) => setEdit(e => ({ ...(e ?? {}), [k]: { ...(e ?? {})[k as '1'], ...patch } }));
  const setLesson = (k: string, i: number, v: string) => setEdit(e => {
    const day = (e ?? {})[k as '1'] ?? {};
    const lessons = [...(day.lessons ?? [])];
    while (lessons.length < ROWS) lessons.push('');
    lessons[i] = v;
    return { ...(e ?? {}), [k]: { ...day, lessons } };
  });
  const editRows = Math.max(ROWS, ...DAYS.map(([k]) => tt[k]?.lessons?.length ?? 0));
  async function upload() {
    setAiMsg('');
    const f = await pickPlanFile();
    if (!f) return;
    if (f.error || !f.src) { setAiMsg(f.error ?? 'Datei konnte nicht gelesen werden.'); return; }
    setReading(true);
    try {
      const plan = await readTimetable(f.src, child.name, child.grade);
      setEdit(plan);
      setAiMsg('✅ Eingelesen. Bitte kurz prüfen, Zeiten ergänzen und dann speichern.');
    } catch (e: any) {
      setAiMsg(AI_ERROR[e?.code] ?? 'Das Einlesen hat nicht geklappt. Bitte nochmal versuchen.');
    } finally { setReading(false); }
  }
  const valid = DAYS.every(([k]) => timeOk(tt[k]?.from) && timeOk(tt[k]?.to));
  const save = () => {
    const clean: TT = {};
    DAYS.forEach(([k]) => {
      const d = tt[k];
      if (!d) return;
      const lessons = (d.lessons ?? []).map(l => l.trim());
      while (lessons.length && !lessons[lessons.length - 1]) lessons.pop();
      clean[k] = { from: fixTime(d.from), to: fixTime(d.to), lessons: lessons.length ? lessons : undefined };
    });
    update(d => ({ ...d, children: d.children.map((c: Child) => (c.id === child.id ? { ...c, timetable: clean } : c)) }));
    setEdit(null);
  };
  const rows = Math.max(1, ...DAYS.map(([k]) => (tt[k]?.lessons ?? []).filter(Boolean).length ? (tt[k]?.lessons ?? []).length : 0));
  const empty = !DAYS.some(([k]) => tt[k]?.from || tt[k]?.lessons?.some(Boolean));

  return (
    <View style={s.card}>
      {kids.length > 1 && !edit ? (
        <View style={[{ margin: -20, marginBottom: 2, padding: 14, paddingHorizontal: 20, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, grad(child.color, child.color + 'c0')]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>📚 Stundenplan</Text>
            {parent && <Pressable onPress={() => setEdit(child.timetable ?? {})} style={{ backgroundColor: '#ffffff33', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }}><Text style={{ color: '#fff', fontWeight: '800' }}>{empty ? 'Eintragen' : '✏️ Bearbeiten'}</Text></Pressable>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {kids.map(k => {
              const on = k.id === child.id;
              return (
                <Pressable key={k.id} onPress={() => setChildId(k.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Stundenplan ${k.name}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14, paddingVertical: 4, borderRadius: 99, backgroundColor: on ? '#fff' : '#ffffff2e' }}>
                  <Avatar name={k.name} color={k.color} photo={k.photo} size={34} />
                  <Text style={{ fontWeight: '800', fontSize: 15, color: on ? k.color : '#fff' }}>{k.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <>
          <PersonHead name={child.name} color={child.color} photo={child.photo} sub="Stundenplan" />
          {parent && !edit && <View style={[s.row, { justifyContent: 'flex-end' }]}><Button ghost title={empty ? 'Eintragen' : 'Bearbeiten'} onPress={() => setEdit(child.timetable ?? {})} /></View>}
        </>
      )}
      {parent && (edit || empty) && (
        <View style={{ gap: 6, backgroundColor: C.bg, borderRadius: 12, padding: 12 }}>
          <View style={[s.row, { gap: 10 }]}>
            <Button ghost title="📷 Foto oder PDF einlesen" disabled={reading} onPress={upload} style={{ paddingVertical: 8 }} />
            {reading && <ActivityIndicator color={child.color} />}
          </View>
          <Text style={[s.muted, { fontSize: 13 }]}>{reading ? 'Die KI liest den Stundenplan, das dauert etwa 20 Sekunden …' : aiMsg || 'Foto vom Stundenplan, Bildschirmfoto oder PDF. Die KI trägt die Fächer ein, du prüfst vor dem Speichern.'}</Text>
        </View>
      )}
      {empty && !edit ? (
        <Text style={s.muted}>{parent ? 'Noch leer. Trag Schulbeginn und Schulende ein, dann zeigt „Heute“ und der Kalender, wann Schule ist. Fächer sind optional.' : 'Noch kein Stundenplan eingetragen.'}</Text>
      ) : (
        <ScrollView horizontal onLayout={e => setW(e.nativeEvent.layout.width)} contentContainerStyle={{ gap: 6, flexDirection: 'row' }}>
          <View style={{ gap: 6, paddingTop: 30, width: 30 }}>
            <Text style={[s.muted, { height: edit ? 84 : 40, fontSize: 12 }]}>Zeit</Text>
            {Array.from({ length: edit ? editRows : rows }, (_, i) => <Text key={i} style={[s.muted, { height: edit ? 40 : 30, fontSize: 12 }]}>{i + 1}.</Text>)}
          </View>
          {DAYS.map(([k, label]) => {
            const d = tt[k] ?? {};
            const isToday = k === todayWd;
            return (
              <View key={k} style={{ width: Math.max(COL, Math.floor((w - 30 - 6 * 5 - 2) / 5)), gap: 6 }}>
                <Text style={{ fontWeight: '800', textAlign: 'center', color: isToday ? child.color : C.fg, height: 24 }}>{label}</Text>
                {edit ? (
                  <>
                    <TextInput style={[s.input, { paddingHorizontal: 6, fontSize: 14 }, !timeOk(d.from) && { borderColor: C.danger }]} value={d.from ?? ''} placeholder="7:55" accessibilityLabel={`${label} Beginn`} onChangeText={t => setDay(k, { from: t })} />
                    <TextInput style={[s.input, { paddingHorizontal: 6, fontSize: 14 }, !timeOk(d.to) && { borderColor: C.danger }]} value={d.to ?? ''} placeholder="13:10" accessibilityLabel={`${label} Ende`} onChangeText={t => setDay(k, { to: t })} />
                    {Array.from({ length: editRows }, (_, i) => (
                      <TextInput key={i} style={[s.input, { paddingHorizontal: 6, fontSize: 14, height: 40 }]} value={d.lessons?.[i] ?? ''} placeholder="Fach" accessibilityLabel={`${label} ${i + 1}. Stunde`} onChangeText={t => setLesson(k, i, t)} />
                    ))}
                  </>
                ) : (
                  <>
                    <View style={{ height: 40, borderRadius: 8, backgroundColor: isToday ? child.color + '22' : C.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontWeight: '700', color: C.fg, fontSize: 13 }}>{d.from || d.to ? `${d.from ?? '?'}–${d.to ?? '?'}` : 'frei'}</Text>
                    </View>
                    {Array.from({ length: rows }, (_, i) => (
                      <View key={i} style={{ height: 30, borderRadius: 8, backgroundColor: d.lessons?.[i] ? (isToday ? child.color + '22' : C.bg) : 'transparent', justifyContent: 'center', paddingHorizontal: 6 }}>
                        <Text style={{ fontSize: (d.lessons?.[i] ?? '').length > 8 ? 10.5 : 13, lineHeight: (d.lessons?.[i] ?? '').length > 8 ? 12 : 16, color: C.fg }} numberOfLines={2}>{d.lessons?.[i] ?? ''}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      {edit && (
        <>
          {!valid && <Text style={{ color: C.danger }}>Zeiten bitte so: 7:55</Text>}
          <View style={s.row}>
            <Button title="Speichern" disabled={!valid} onPress={save} />
            <Button ghost title="Abbrechen" onPress={() => setEdit(null)} />
          </View>
        </>
      )}
    </View>
  );
}
