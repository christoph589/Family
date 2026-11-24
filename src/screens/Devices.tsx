import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { DeviceLink, joinCode, rotateJoinCode } from '../data/cloud';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

/** Familiencode anzeigen, damit Kindergeräte beitreten können. */
export function Devices({ link, onSignOut }: { link: DeviceLink; onSignOut: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { joinCode(link.familyId).then(setCode, () => setErr('Code konnte nicht geladen werden.')); }, [link.familyId]);
  return (
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
      <Text style={[s.muted, { fontSize: 13 }]}>Ein neuer Code macht den alten ungültig. Schon verbundene Geräte bleiben verbunden.</Text>
    </View>
  );
}
