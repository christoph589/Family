import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { eventTarget, icloudCalendars, icloudStatus, IcloudCal, reloadIcloud } from '../data/icloud';
import { peopleOf } from '../data/logic';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Einstellungen › Kalender: iCloud-Kalender auswählen, die in der App lesbar und bearbeitbar sind. */
export function IcloudSetup() {
  const { data, update } = useFamily();
  const [list, setList] = useState<IcloudCal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data) return null;
  const chosen = data.settings?.icloud ?? [];
  const people = peopleOf(data);
  const st = icloudStatus();
  const setCals = (next: typeof chosen) => update(d => ({ ...d, settings: { ...d.settings, icloud: next } }));
  async function load() {
    setBusy(true); setErr('');
    try { setList(await icloudCalendars()); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const all = list ?? chosen.map(c => ({ ...c, readOnly: false }));
  return (
    <View style={s.card}>
      <Text style={s.h2}>🍎 iCloud-Kalender (lesen und bearbeiten)</Text>
      <Text style={s.muted}>Termine aus euren iPhone-Kalendern direkt in der App ändern, anlegen und löschen. Änderungen landen sofort auf dem iPhone. Serientermine bleiben nur lesbar.</Text>
      {!!st?.error && chosen.length > 0 && <Text style={{ color: C.danger, fontWeight: '700' }}>{st.error}</Text>}
      {all.map(c => {
        const on = chosen.find(x => x.href === c.href);
        return (
          <View key={c.href} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Pressable onPress={() => setCals(on ? chosen.filter(x => x.href !== c.href) : [...chosen, { href: c.href, name: c.name, color: c.color }])}
              accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} style={[s.row, { flexWrap: 'nowrap' }]}>
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.color, backgroundColor: on ? c.color : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                {on && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={[s.text, { fontWeight: '700', flex: 1 }]}>{c.name}{c.readOnly ? ' (nur lesen)' : ''}</Text>
            </Pressable>
            {on && (
              <View style={[s.row, { gap: 6, paddingLeft: 34 }]}>
                <Text style={[s.muted, { fontSize: 13 }]}>Gehört zu:</Text>
                <Pressable onPress={() => setCals(chosen.map(x => (x.href === c.href ? { ...x, who: undefined } : x)))} style={[s.chip, { backgroundColor: !on.who ? C.accent : C.surface2 }]}><Text style={{ color: !on.who ? '#fff' : C.fg, fontWeight: '700' }}>Ganze Familie</Text></Pressable>
                {people.map(p => (
                  <Pressable key={p.id} onPress={() => setCals(chosen.map(x => (x.href === c.href ? { ...x, who: p.id } : x)))} style={[s.chip, { backgroundColor: on.who === p.id ? p.color : C.surface2 }]}>
                    <Text style={{ color: on.who === p.id ? '#fff' : C.fg, fontWeight: '700' }}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
      {chosen.length > 0 && (
        <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={[s.text, { fontWeight: '800' }]}>Neue Termine eintragen in</Text>
          <Segmented value={eventTarget(data.settings)} onChange={v => update(d => ({ ...d, settings: { ...d.settings, newEvents: v } }))}
            options={[{ value: 'icloud', label: '🍎 iCloud' }, { value: 'app', label: '🏠 Familienplaner' }, { value: 'both', label: 'Beides zur Wahl' }]} />
          <Text style={[s.muted, { fontSize: 13 }]}>
            {eventTarget(data.settings) === 'icloud' ? 'Alle neuen Termine landen in eurem Apple-Kalender und damit auf allen iPhones. Am einfachsten, wenn ihr sowieso mit dem iPhone-Kalender plant.'
              : eventTarget(data.settings) === 'app' ? 'Neue Termine bleiben im Familienplaner. Auf dem iPhone erscheinen sie nur über das Familienkalender-Abo (nur lesen).'
              : 'Beim Anlegen gibt es zwei Knöpfe: „+ Termin“ für den Familienplaner und „🍎 + iCloud“ für den Apple-Kalender.'}
          </Text>
        </View>
      )}
      {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
      <View style={s.row}>
        <Button title={busy ? 'Verbinde …' : list ? 'Liste neu laden' : chosen.length ? 'Weitere Kalender wählen' : 'iCloud verbinden'} disabled={busy} onPress={load} />
        {chosen.length > 0 && <Button ghost title="Termine neu laden" onPress={() => reloadIcloud(chosen.map(c => c.href))} />}
      </View>
      <Text style={[s.muted, { fontSize: 12 }]}>Tipp: Kalender, die du hier wählst, unter „Fremde Kalender“ entfernen, sonst erscheinen die Termine doppelt.</Text>
    </View>
  );
}
