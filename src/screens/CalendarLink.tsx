import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { DeviceLink } from '../data/cloud';
import { useFamily } from '../data/FamilyContext';
import { calendarToken, feedStatus, icsUrl, loadFeed, reloadFeed } from '../data/feeds';
import { ALL_COLORS, peopleOf, uid } from '../data/logic';
import { Feed } from '../data/types';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

const KINDS: { icon?: string; label: string }[] = [
  { label: 'Person / Allgemein' }, { icon: '🗑️', label: 'Müll' }, { icon: '⚽', label: 'Verein' }, { icon: '🏫', label: 'Schule' },
  { icon: '⛪', label: 'Gemeinde' }, { icon: '🎉', label: 'Feiertage' },
];

async function copy(text: string) {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; }
  return false;
}

/** Familienkalender als Abo (Apple, Google, Outlook) und fremde Kalender einbinden. */
export function CalendarLink({ link }: { link: DeviceLink }) {
  const { data, update } = useFamily();
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [renew, setRenew] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [who, setWho] = useState<string | undefined>();
  const [icon, setIcon] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [, setTick] = useState(0);
  useEffect(() => { calendarToken(link.familyId).then(setToken, e => setErr(e.message)); }, [link.familyId]);
  if (!data) return null;
  const feeds = data.settings?.feeds ?? [];
  const people = peopleOf(data);
  const https = token ? icsUrl(token) : '';
  const webcal = https.replace(/^https:/, 'webcal:');
  const setFeeds = (fn: (f: Feed[]) => Feed[]) => update(d => ({ ...d, settings: { ...d.settings, feeds: fn(d.settings?.feeds ?? []) } }));

  async function add() {
    setAddErr(''); setBusy(true);
    try {
      const n = await loadFeed(url.trim());
      const f: Feed = { id: uid(), name: name.trim() || 'Kalender', url: url.trim(), color: who ? people.find(p => p.id === who)!.color : ALL_COLORS[feeds.length % ALL_COLORS.length], who, icon };
      setFeeds(fs => [...fs, f]);
      reloadFeed(f.url);
      setAdding(false); setName(''); setUrl(''); setWho(undefined); setIcon(undefined);
      setMsg(`${f.name} eingebunden, ${n.length} Termine gefunden.`);
    } catch (e: any) { setAddErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <View style={s.card}>
      <Text style={s.label}>Kalender verbinden</Text>
      <Text style={[s.h2, { fontSize: 17 }]}>Familienkalender im iPhone, Android oder Outlook anzeigen</Text>
      <Text style={s.muted}>Termine, Geburtstage und Ferien aus dieser App erscheinen dann in eurem normalen Kalender. Die Kalender-App holt Änderungen selbst ab, je nach Gerät alle 15 Minuten bis einige Stunden.</Text>
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      {token && <>
        <View style={s.row}>
          {Platform.OS !== 'web' || /iPhone|iPad|Mac/.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
            ? <Button title="Im Apple-Kalender abonnieren" onPress={() => Linking.openURL(webcal)} /> : null}
          <Button ghost title="Link kopieren" onPress={() => copy(https).then(ok => setMsg(ok ? 'Link kopiert.' : 'Bitte den Link unten markieren und kopieren.'))} />
        </View>
        <Text selectable style={[s.muted, { fontSize: 12 }]} numberOfLines={2}>{https}</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>
          Google: calendar.google.com am Computer › Weitere Kalender › Per URL › Link einfügen.{'\n'}
          Outlook: Kalender hinzufügen › Aus dem Internet abonnieren.{'\n'}
          Wer den Link hat, kann die Termine lesen. Nicht weitergeben.
        </Text>
        {!renew ? <Pressable onPress={() => setRenew(true)}><Text style={{ color: C.accent, fontWeight: '700' }}>Link ungültig machen und neu erzeugen</Text></Pressable> : (
          <View style={s.row}>
            <Text style={s.text}>Alte Abos hören dann auf zu laden.</Text>
            <Button title="Neu erzeugen" color={C.danger} onPress={() => calendarToken(link.familyId, true).then(t => { setToken(t); setRenew(false); setMsg('Neuer Link erzeugt. Bitte neu abonnieren.'); }, e => setErr(e.message))} />
            <Button ghost title="Abbrechen" onPress={() => setRenew(false)} />
          </View>
        )}
      </>}

      <View style={{ height: 1, backgroundColor: C.line }} />
      <Text style={[s.h2, { fontSize: 17 }]}>Andere Kalender hier anzeigen</Text>
      <Text style={s.muted}>Zum Beispiel Mamas iCloud-Kalender, den Müllkalender der Stadt, den Verein oder WebUntis. Nur lesen, Änderungen macht ihr im Original. Schul- und Feiertage zeigt die App schon selbst, wenn unter Ferien „Automatisch nach Bundesland“ an ist.</Text>
      {feeds.map(f => {
        const st = feedStatus(f.url);
        return (
          <View key={f.id} style={[s.row, { flexWrap: 'nowrap' }]}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: f.color }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.text, { fontWeight: '700' }]} numberOfLines={1}>{f.icon ? f.icon + ' ' : ''}{f.name}{f.who ? ` · ${people.find(p => p.id === f.who)?.name ?? ''}` : ''}</Text>
              <Text style={[s.muted, { fontSize: 12, color: st?.error ? C.danger : C.muted }]} numberOfLines={2}>{st?.error ?? (st ? `${st.events.length} Termine geladen` : 'lädt …')}</Text>
            </View>
            <Pressable onPress={() => { reloadFeed(f.url).then(() => setTick(t => t + 1)); }}><Text style={{ color: C.accent, fontWeight: '700' }}>Neu laden</Text></Pressable>
            <Pressable onPress={() => setFeeds(fs => fs.filter(x => x.id !== f.id))}><Text style={{ color: C.danger, fontWeight: '700' }}>Entfernen</Text></Pressable>
          </View>
        );
      })}
      {!adding ? <Button ghost title="+ Kalender einbinden" onPress={() => setAdding(true)} /> : (
        <View style={{ gap: 8 }}>
          <Text style={s.muted}>Was ist das?</Text>
          <View style={s.row}>
            {KINDS.map(k => (
              <Pressable key={k.label} onPress={() => { setIcon(k.icon); if (!name.trim() || KINDS.some(x => x.label === name)) setName(k.icon ? k.label : ''); if (k.icon) setWho(undefined); }}
                style={[s.chip, { paddingVertical: 8, backgroundColor: icon === k.icon ? C.accent : C.surface2 }]}>
                <Text style={{ color: icon === k.icon ? '#fff' : C.fg, fontWeight: '700' }}>{k.icon ? k.icon + ' ' : ''}{k.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Name, z. B. Mama Arbeit" autoFocus accessibilityLabel="Name des Kalenders" />
          <TextInput style={s.input} value={url} onChangeText={setUrl} placeholder="webcal://… oder https://…ics" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Kalender-Link" />
          <Text style={s.muted}>Gehört zu:</Text>
          <View style={s.row}>
            <Pressable onPress={() => setWho(undefined)} style={[s.chip, { backgroundColor: !who ? C.accent : C.surface2 }]}><Text style={{ color: !who ? '#fff' : C.fg, fontWeight: '700' }}>Ganze Familie</Text></Pressable>
            {people.map(p => (
              <Pressable key={p.id} onPress={() => setWho(p.id)} style={[s.chip, { backgroundColor: who === p.id ? p.color : C.surface2 }]}>
                <Text style={{ color: who === p.id ? '#fff' : C.fg, fontWeight: '700' }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
          {!!addErr && <Text style={{ color: C.danger }}>{addErr}</Text>}
          <View style={s.row}>
            <Button title={busy ? 'Prüfe …' : 'Einbinden'} disabled={busy || !/^(webcal|https?):\/\//i.test(url.trim())} onPress={add} />
            <Button ghost title="Abbrechen" onPress={() => { setAdding(false); setAddErr(''); }} />
          </View>
          <Text style={[s.muted, { fontSize: 13 }]}>
            iPhone-Kalender: In der Kalender-App auf „Kalender“ tippen, beim Kalender auf ⓘ, „Öffentlicher Kalender“ einschalten, „Link teilen“ › Kopieren.{'\n'}
            Google: Einstellungen des Kalenders › „Privatadresse im iCal-Format“.{'\n'}
            WebUntis: Profil › Freigaben › „Abonnement“ (wenn die Schule das freigeschaltet hat).{'\n'}
            Müllkalender: Auf der Seite eurer Stadt oder des Entsorgers nach „iCal“, „Kalender abonnieren“ oder „webcal“ suchen und den Link kopieren. Gibt es nur eine Datei zum Herunterladen, geht das noch nicht.
          </Text>
        </View>
      )}
      {!!msg && <Text style={{ color: C.ok, fontWeight: '700' }}>{msg}</Text>}
    </View>
  );
}
