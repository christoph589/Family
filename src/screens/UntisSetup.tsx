import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { timetableFrom, untisConnect, untisDisconnect, untisWeeks } from '../data/untis';
import { addDaysIso, today } from '../data/logic';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Einstellungen › Kalender: WebUntis über den Zugang für Untis Mobile verbinden. */
export function UntisSetup() {
  const { data, update } = useFamily();
  const [form, setForm] = useState({ host: '', school: '', user: '', key: '' });
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ id: number; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const cfg = data.settings?.untis;
  const kids = data.children;
  const setLinks = (links: NonNullable<typeof cfg>['links'], who?: string) => update(d => ({ ...d, settings: { ...d.settings, untis: { who: who ?? d.settings?.untis?.who, at: today(), links } } }));
  const f = (k: keyof typeof form) => (v: string) => setForm(x => ({ ...x, [k]: v }));

  async function connect() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const host = form.host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const r = await untisConnect({ ...form, host, school: form.school.trim() || host.split('.')[0] });
      setFound(r.students);
      // Namen automatisch zuordnen, wenn der Vorname passt
      const links = r.students.flatMap(st => {
        const kid = kids.find(k => st.name.toLowerCase().includes(k.name.toLowerCase()));
        return kid ? [{ child: kid.id, id: st.id, name: st.name }] : [];
      });
      setLinks(links, r.who);
      setOpen(false); setForm({ host: '', school: '', user: '', key: '' });
      if (!r.students.length) setErr('Verbunden, aber WebUntis zeigt mit diesem Zugang keinen Schüler. Bitte mir einen Screenshot schicken.');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function takeOver(childId: string, id: number) {
    setBusy(true); setErr(''); setMsg('');
    try {
      // Zwei Wochen ab Montag holen, damit Ausfälle einzelner Tage nicht stören
      const t = today(), mon = addDaysIso(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7));
      const ls = (await untisWeeks([id], mon, addDaysIso(mon, 13)))[id] ?? [];
      if (!ls.length) throw new Error('WebUntis liefert für die nächsten zwei Wochen keine Stunden.');
      const tt = timetableFrom(ls);
      update(d => ({ ...d, children: d.children.map(c => (c.id === childId ? { ...c, timetable: tt } : c)) }));
      setMsg(`Stundenplan für ${kids.find(k => k.id === childId)?.name} übernommen (${ls.length} Stunden gelesen).`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const students = found ?? cfg?.links.map(l => ({ id: l.id, name: l.name })) ?? [];
  return (
    <View style={s.card}>
      <Text style={s.h2}>🏫 WebUntis (Stundenplan und Ausfälle)</Text>
      <Text style={s.muted}>Holt den Stundenplan und trägt ausfallende Stunden automatisch als „früher aus“ oder „frei“ ein. Eigene Einträge der Familie haben Vorrang.</Text>
      {cfg ? (
        <>
          <Text style={s.text}>Verbunden{cfg.who ? ` als ${cfg.who}` : ''}.</Text>
          {students.map(st => {
            const link = cfg.links.find(l => l.id === st.id);
            return (
              <View key={st.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={[s.text, { fontWeight: '700' }]}>{st.name} gehört zu:</Text>
                <View style={[s.row, { gap: 8 }]}>
                  {kids.map(k => {
                    const on = link?.child === k.id;
                    return (
                      <Pressable key={k.id} onPress={() => setLinks([...cfg.links.filter(l => l.id !== st.id && l.child !== k.id), ...(on ? [] : [{ child: k.id, id: st.id, name: st.name }])])}
                        accessibilityRole="radio" accessibilityState={{ checked: on }}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: k.color, backgroundColor: on ? k.color : C.surface }}>
                        <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{k.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {link && <Button ghost title={busy ? 'Lädt …' : `📚 Stundenplan von ${kids.find(k => k.id === link.child)?.name} aus WebUntis übernehmen`} disabled={busy} onPress={() => takeOver(link.child, st.id)} />}
              </View>
            );
          })}
          <View style={s.row}>
            <Button ghost title="Neu verbinden" onPress={() => setOpen(true)} />
            <Button ghost title="Trennen" onPress={async () => { try { await untisDisconnect(); } catch { /* egal */ } update(d => ({ ...d, settings: { ...d.settings, untis: undefined } })); setFound(null); }} />
          </View>
        </>
      ) : !open && <Button title="WebUntis verbinden" onPress={() => setOpen(true)} />}
      {open && (
        <View style={{ gap: 8 }}>
          <Text style={s.muted}>In WebUntis (als Elternteil oder Kind angemeldet): unten links auf den Namen › Reiter „Freigaben“ › bei „Zugriff über Untis Mobile“ auf „Anzeigen“. Die Angaben unter dem QR-Code hier abtippen.</Text>
          <Text style={s.label}>Url</Text>
          <TextInput style={s.input} value={form.host} onChangeText={f('host')} placeholder="schulname.webuntis.com" autoCapitalize="none" accessibilityLabel="Url" />
          <Text style={s.label}>Schule</Text>
          <TextInput style={s.input} value={form.school} onChangeText={f('school')} placeholder="wie unter „Schule:“ angezeigt" autoCapitalize="none" accessibilityLabel="Schule" />
          <Text style={s.label}>Benutzer</Text>
          <TextInput style={s.input} value={form.user} onChangeText={f('user')} autoCapitalize="none" accessibilityLabel="Benutzer" />
          <Text style={s.label}>Schlüssel</Text>
          <TextInput style={s.input} value={form.key} onChangeText={f('key')} autoCapitalize="characters" placeholder="16 Zeichen, z. B. ABCD…" accessibilityLabel="Schlüssel" />
          <Text style={s.muted}>Gespeichert wird nur dieser App-Schlüssel, verschlüsselt auf dem Server, nicht euer Passwort. Ungültig machen: in WebUntis „Geräte abmelden“.</Text>
          <View style={s.row}>
            <Button title={busy ? 'Prüft …' : 'Verbinden'} disabled={busy || !form.host.trim() || !form.user.trim() || !form.key.trim()} onPress={connect} />
            <Button ghost title="Abbrechen" onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
      {msg ? <Text style={{ color: C.ok ?? C.accent, fontWeight: '700' }}>{msg}</Text> : null}
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
    </View>
  );
}
