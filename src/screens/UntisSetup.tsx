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
  const [open, setOpen] = useState<number | null>(null); // slot, für den das Formular offen ist
  const [found, setFound] = useState<Record<number, { id: number; name: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const cfg = data.settings?.untis;
  const kids = data.children;
  const links = cfg?.links ?? [];
  const slotOf = (l: { slot?: number }) => l.slot ?? 0;
  const accounts: Record<number, string> = { ...(cfg?.at ? ({ 0: cfg.who ?? '' } as Record<number, string>) : {}), ...(cfg?.accounts ?? {}) };
  const slots = Object.keys(accounts).map(Number).sort();
  const freeSlot = [0, 1, 2, 3].find(x => !slots.includes(x)) ?? null;
  const save = (fn: (u: NonNullable<typeof cfg>) => NonNullable<typeof cfg> | undefined) =>
    update(d => ({ ...d, settings: { ...d.settings, untis: fn(d.settings?.untis ?? { links: [] }) } }));
  const f = (k: keyof typeof form) => (v: string) => setForm(x => ({ ...x, [k]: v }));

  async function connect(slot: number) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const host = form.host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const r = await untisConnect({ ...form, host, school: form.school.trim() || host.split('.')[0] }, slot);
      setFound(x => ({ ...x, [slot]: r.students }));
      // Namen automatisch zuordnen, wenn der Vorname passt (Kinder, die schon einen Zugang haben, bleiben)
      save(u => {
        const keep = u.links.filter(l => slotOf(l) !== slot);
        const auto = r.students.flatMap(st => {
          const kid = kids.find(k => st.name.toLowerCase().includes(k.name.toLowerCase()) && !keep.some(l => l.child === k.id));
          return kid ? [{ child: kid.id, id: st.id, name: st.name, slot }] : [];
        });
        return slot === 0 ? { ...u, who: r.who, at: today(), links: [...keep, ...auto], checkedAt: undefined }
          : { ...u, accounts: { ...(u.accounts ?? {}), [slot]: r.who }, links: [...keep, ...auto], checkedAt: undefined };
      });
      setOpen(null); setForm({ host: '', school: '', user: '', key: '' });
      if (!r.students.length) setErr('Verbunden, aber WebUntis zeigt mit diesem Zugang keinen Schüler. Bitte mir einen Screenshot schicken.');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function disconnect(slot: number) {
    try { await untisDisconnect(slot); } catch { /* egal */ }
    save(u => {
      const rest = { ...u, links: u.links.filter(l => slotOf(l) !== slot) };
      if (slot === 0) { rest.who = undefined; rest.at = undefined; } else { const a = { ...(u.accounts ?? {}) }; delete a[slot]; rest.accounts = a; }
      return slot === 0 && !Object.keys(rest.accounts ?? {}).length ? undefined : rest;
    });
    setFound(x => { const n = { ...x }; delete n[slot]; return n; });
  }

  async function takeOver(childId: string, id: number, slot: number) {
    setBusy(true); setErr(''); setMsg('');
    try {
      // Zwei Wochen ab Montag holen, damit Ausfälle einzelner Tage nicht stören
      const t = today(), mon = addDaysIso(t, -((new Date(t + 'T12:00:00').getDay() + 6) % 7));
      const ls = (await untisWeeks([id], mon, addDaysIso(mon, 13), slot))[id] ?? [];
      if (!ls.length) throw new Error('WebUntis liefert für die nächsten zwei Wochen keine Stunden.');
      const tt = timetableFrom(ls);
      update(d => ({ ...d, children: d.children.map(c => (c.id === childId ? { ...c, timetable: tt } : c)) }));
      setMsg(`Stundenplan für ${kids.find(k => k.id === childId)?.name} übernommen (${ls.length} Stunden gelesen).`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const form_ = (slot: number) => (
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
        <Button title={busy ? 'Prüft …' : 'Verbinden'} disabled={busy || !form.host.trim() || !form.user.trim() || !form.key.trim()} onPress={() => connect(slot)} />
        <Button ghost title="Abbrechen" onPress={() => setOpen(null)} />
      </View>
    </View>
  );

  return (
    <View style={s.card}>
      <Text style={s.h2}>WebUntis (Stundenplan und Ausfälle)</Text>
      <Text style={s.muted}>Holt den Stundenplan und trägt zwischen 6 und 20 Uhr alle 3 Stunden ausfallende Stunden automatisch als „früher aus“ oder „frei“ ein. Eigene Einträge der Familie haben Vorrang.</Text>
      {slots.map((slot, i) => {
        const students = found[slot] ?? links.filter(l => slotOf(l) === slot).map(l => ({ id: l.id, name: l.name }));
        return (
          <View key={slot} style={{ gap: 6, paddingTop: 10, borderTopWidth: 2, borderTopColor: C.line }}>
            <Text style={[s.text, { fontWeight: '800' }]}>{slots.length > 1 ? `Zugang ${i + 1}: ` : ''}verbunden{accounts[slot] ? ` als ${accounts[slot]}` : ''}</Text>
            {students.map(st => {
              const link = links.find(l => l.id === st.id && slotOf(l) === slot);
              return (
                <View key={st.id} style={{ gap: 6, paddingVertical: 6 }}>
                  <Text style={s.text}>{st.name} gehört zu:</Text>
                  <View style={[s.row, { gap: 8 }]}>
                    {kids.map(k => {
                      const on = link?.child === k.id;
                      return (
                        <Pressable key={k.id} onPress={() => save(u => ({ ...u, links: [...u.links.filter(l => !(l.id === st.id && slotOf(l) === slot) && l.child !== k.id), ...(on ? [] : [{ child: k.id, id: st.id, name: st.name, slot }])] }))}
                          accessibilityRole="radio" accessibilityState={{ checked: on }}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: k.color, backgroundColor: on ? k.color : C.surface }}>
                          <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{k.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {link && <Button ghost title={busy ? 'Lädt …' : `Stundenplan von ${kids.find(k => k.id === link.child)?.name} übernehmen`} disabled={busy} onPress={() => takeOver(link.child, st.id, slot)} />}
                </View>
              );
            })}
            {open === slot ? form_(slot) : (
              <View style={s.row}>
                <Button ghost title="Neu verbinden" onPress={() => setOpen(slot)} />
                <Button ghost title="Trennen" onPress={() => disconnect(slot)} />
              </View>
            )}
          </View>
        );
      })}
      {freeSlot !== null && open !== freeSlot && (
        <View style={{ gap: 4, paddingTop: slots.length ? 10 : 0, borderTopWidth: slots.length ? 2 : 0, borderTopColor: C.line }}>
          <Button title={slots.length ? '+ Weiteren WebUntis-Zugang' : 'WebUntis verbinden'} ghost={!!slots.length} onPress={() => setOpen(freeSlot)} />
          {!!slots.length && <Text style={[s.muted, { fontSize: 12 }]}>Für ein Kind an einer anderen Schule oder mit eigenem Zugang. Geschwister an derselben Schule erscheinen meist schon oben beim Eltern-Zugang.</Text>}
        </View>
      )}
      {freeSlot !== null && open === freeSlot && form_(freeSlot)}
      {msg ? <Text style={{ color: C.ok ?? C.accent, fontWeight: '700' }}>{msg}</Text> : null}
      {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
    </View>
  );
}
