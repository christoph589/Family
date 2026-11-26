import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Clip } from './Clip';
import { useFamily } from '../data/FamilyContext';
import { findPlace, useWeather, WeatherTip } from '../data/weather';
import { Button } from './Button';
import { C, s, SHADOW } from './theme';

const SOURCE = 'Wetterdaten: Deutscher Wetterdienst (über Bright Sky)';

/** Karte auf "Heute": Wetter und was die Kinder anziehen sollen. Eltern ohne Ort sehen einmal die Einrichtung. */
export function WeatherCard({ admin }: { admin?: boolean }) {
  const { data } = useFamily();
  const place = data?.settings?.weather;
  const { tip, error } = useWeather(place);
  if (!place) return admin ? <WeatherSetup intro /> : null;
  if (place.off) return null;
  if (!tip) return error ? <Text style={[s.muted, { fontSize: 12 }]}>🌦️ {error}</Text> : null;
  return (
    <View style={[s.card, { gap: 10 }]}>
      <View style={[s.row, { alignItems: 'center', gap: 14, flexWrap: 'nowrap' }]}>
        <Text style={{ fontSize: 44 }}>{tip.icon}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.label}>{tip.label} · {tip.place}</Text>
          <Text style={[s.text, { fontSize: 22, fontWeight: '800' }]}>{tip.temp}°<Text style={[s.muted, { fontSize: 15, fontWeight: '700' }]}>  {tip.min}° bis {tip.max}°</Text></Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[s.text, { fontWeight: '800' }]}>Das ziehst du an:</Text>
        {tip.lines.map(l => <Text key={l} style={[s.text, { fontSize: 17 }]}>{l}</Text>)}
      </View>
      <Text style={[s.muted, { fontSize: 11 }]}>{SOURCE}</Text>
    </View>
  );
}

/** Kleine Anzeige für die Wand: Symbol, Temperatur, Anziehtipp in einer Zeile. */
export function WeatherPill({ big }: { big?: boolean }) {
  const { data } = useFamily();
  const { tip } = useWeather(data?.settings?.weather);
  if (!tip) return null;
  return <WeatherPillView tip={tip} big={big} />;
}

function WeatherPillView({ tip, big }: { tip: WeatherTip; big?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%', flexShrink: 1 }, SHADOW.sm]}>
      <Text style={{ fontSize: big ? 38 : 30 }}>{tip.icon}</Text>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontSize: big ? 22 : 18, fontWeight: '800', color: C.fg }}>{tip.temp}° <Text style={{ fontSize: 13, color: C.muted, fontWeight: '700' }}>{tip.label} · {tip.min}° bis {tip.max}°</Text></Text>
        <Clip style={{ fontSize: big ? 17 : 15, fontWeight: '700', color: C.fg }} lines={2}>{tip.lines.map(l => l.split(' ')[0]).join(' ')} {tip.short}</Clip>
      </View>
    </View>
  );
}

/** Wohnort fürs Wetter eintragen (Einstellungen › Familie, beim ersten Mal auch auf "Heute"). */
export function WeatherSetup({ intro }: { intro?: boolean }) {
  const { data, update } = useFamily();
  const cur = data?.settings?.weather;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (w: typeof cur) => update(d => ({ ...d, settings: { ...d.settings, weather: w } }));
  const search = async () => {
    setBusy(true); setMsg('');
    try {
      const p = await findPlace(q);
      if (!p) setMsg('Nichts gefunden. Probier die Postleitzahl oder den Ortsnamen.');
      else { set(p); setQ(''); setMsg(`Gespeichert: ${p.name}`); }
    } catch (e: any) { setMsg(e?.message ?? 'Ortssuche gerade nicht erreichbar'); }
    setBusy(false);
  };
  return (
    <View style={s.card}>
      <Text style={s.h2}>🌦️ Wetter und Anziehtipp</Text>
      <Text style={s.muted}>
        {intro ? 'Zeigt auf Heute und an der Wand, was die Kinder anziehen sollen (Jacke, Mütze, Regenjacke). ' : ''}
        Ab 16 Uhr gilt der Tipp für morgen früh. Gespeichert wird nur euer Ort, kein Gerätestandort.
      </Text>
      {cur && !cur.off && <Text style={s.text}>📍 Ort: <Text style={{ fontWeight: '800' }}>{cur.name}</Text></Text>}
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={q} onChangeText={setQ} placeholder="Postleitzahl oder Ort" onSubmitEditing={search} returnKeyType="search" />
        <Button title={busy ? '…' : cur && !cur.off ? 'Ändern' : 'Speichern'} disabled={busy || !q.trim()} onPress={search} />
      </View>
      <View style={s.row}>
        {cur && !cur.off && <Button ghost title="Wetter ausblenden" onPress={() => set({ ...cur, off: true })} />}
        {cur?.off && !!cur.name && <Button ghost title={`Wieder anzeigen (${cur.name})`} onPress={() => set({ ...cur, off: false })} />}
        {intro && !cur && <Button ghost title="Kein Wetter" onPress={() => set({ name: '', lat: NaN, lon: NaN, off: true })} />}
      </View>
      {!!msg && <Text style={{ color: C.accent, fontWeight: '700' }}>{msg}</Text>}
      <Text style={[s.muted, { fontSize: 11 }]}>Ortssuche: OpenStreetMap. {SOURCE}.</Text>
    </View>
  );
}
