import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Device, DeviceLink, familyDevices, joinCode, removeDevice, rotateJoinCode } from '../data/cloud';
import { useFamily } from '../data/FamilyContext';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Familiencode anzeigen, damit Kindergeräte beitreten können. */
export function Devices({ link, onSignOut }: { link: DeviceLink; onSignOut: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { joinCode(link.familyId).then(setCode, () => setErr('Code konnte nicht geladen werden.')); }, [link.familyId]);
  const [copied, setCopied] = useState(false);
  const invite = code && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?partner=${code}` : '';
  async function share() {
    const text = `Ich habe uns bei Famelio angemeldet, unserem Familienplaner. Hier kommst du mit deinem eigenen Konto in unsere Familie: ${invite}`;
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: 'Famelio-Einladung', text });
      else { await navigator.clipboard.writeText(text); setCopied(true); }
    } catch { /* abgebrochen */ }
  }
  return (<>
    {link.role === 'eltern' && (
      <View style={s.card}>
        <Text style={s.h2}>👫 Partner einladen</Text>
        <Text style={s.muted}>Dein Partner bekommt ein eigenes Konto (E-Mail, Google oder Apple) und sieht alles, was du siehst.</Text>
        <View style={s.row}>
          <Button title="Einladung senden" disabled={!invite} onPress={share} />
          {copied && <Text style={{ color: C.accent, fontWeight: '700' }}>Kopiert. Jetzt per WhatsApp oder Mail schicken.</Text>}
        </View>
        <Text style={[s.muted, { fontSize: 12 }]} selectable>{invite}</Text>
      </View>
    )}
    <View style={s.card}>
      <Text style={s.label}>Geräte</Text>
      <Text style={s.text}>Kindergerät verbinden: App öffnen, „Gerät eines Kindes“ wählen und diesen Code eingeben.</Text>
      <Text selectable style={{ fontSize: 32, fontWeight: '800', letterSpacing: 6, color: C.fg }}>{code ?? '…'}</Text>
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
      <View style={s.row}>
        <Button ghost title="Neuen Code erzeugen" onPress={() => rotateJoinCode(link.familyId).then(setCode, e => setErr(e.message))} />
        {!confirm ? <Button ghost title="Dieses Gerät abmelden" onPress={() => setConfirm(true)} /> : <>
          <Text style={s.text}>Abmelden? Die Familiendaten bleiben auf dem Server.</Text>
          <Button title="Ja, abmelden" color={C.danger} onPress={onSignOut} />
          <Button ghost title="Abbrechen" onPress={() => setConfirm(false)} />
        </>}
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>Ein neuer Code macht den alten ungültig (auch die Partner-Einladung). Schon verbundene Geräte bleiben verbunden. Einzelne Geräte entfernst du unten.</Text>
    </View>
    {link.role === 'eltern' && <DeviceList fid={link.familyId} />}
  </>);
}

const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Verbundene Geräte und Konten. Ein entferntes Gerät kommt nur mit dem aktuellen Familiencode wieder rein. */
function DeviceList({ fid }: { fid: string }) {
  const { data } = useFamily();
  const [list, setList] = useState<Device[] | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<string | null>(null);
  const load = () => familyDevices(fid).then(setList, e => setErr(e.message));
  useEffect(() => { load(); }, [fid]);
  if (list === undefined) return null;
  if (list === null) return (
    <View style={s.card}>
      <Text style={s.label}>Verbundene Geräte</Text>
      <Text style={s.muted}>Die Liste erscheint, sobald das Sicherheits-Update (fix-13) in der Datenbank eingespielt ist.</Text>
    </View>
  );
  const kidName = (id: string | null) => data?.children.find(c => c.id === id)?.name;
  const label = (d: Device) => {
    if (d.me) return 'Dieses Konto';
    if (d.until) return 'Support-Zugang';
    if (d.role === 'eltern') return d.email ?? 'Eltern-Konto';
    return kidName(d.child_id) ? `Gerät von ${kidName(d.child_id)}` : 'Kindergerät oder Wandansicht';
  };
  return (
    <View style={s.card}>
      <Text style={s.label}>Verbundene Geräte ({list.length})</Text>
      <Text style={s.muted}>Unbekanntes Gerät oder verlorenes Handy? Entfernen und danach oben einen neuen Code erzeugen. Ein entferntes Gerät kommt nur mit dem aktuellen Code wieder rein.</Text>
      {list.map(d => (
        <View key={d.user_id} style={[s.row, { justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: C.line }]}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[s.text, { fontWeight: '700' }]}>{d.role === 'eltern' ? '👤 ' : '📱 '}{label(d)}</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>
              seit {when(d.created_at)}{d.last_seen ? ` · zuletzt aktiv ${when(d.last_seen)}` : ''}{d.until ? ` · bis ${when(d.until)}` : ''}
            </Text>
          </View>
          {!d.me && (ask === d.user_id
            ? <View style={[s.row, { gap: 6 }]}>
                <Button color={C.danger} title="Ja, entfernen" onPress={() => { setAsk(null); removeDevice(fid, d.user_id).then(load, e => setErr(e.message)); }} />
                <Button ghost title="Abbrechen" onPress={() => setAsk(null)} />
              </View>
            : <Button ghost title="Entfernen" onPress={() => setAsk(d.user_id)} />)}
        </View>
      ))}
      {!!err && <Text style={{ color: C.danger }}>{err}</Text>}
    </View>
  );
}
