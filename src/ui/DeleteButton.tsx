import { useState } from 'react';
import { Text, TextInput, View, ViewStyle } from 'react-native';
import { usePinEntry } from '../data/pin';
import { Button } from './Button';
import { C, s } from './theme';

/** Löschen mit Rückfrage. Kinder und die Wandansicht brauchen dafür die PIN eines Elternteils. */
export function DeleteButton({ parent, onDelete, title = 'Löschen', confirm = 'Wirklich löschen', style }: { parent: boolean; onDelete: () => void; title?: string; confirm?: string; style?: ViewStyle }) {
  const [ask, setAsk] = useState(false);
  // PIN von Mama, Papa oder einem anderen Erwachsenen, geprüft auf dem Server
  const pin = usePinEntry('any', () => { close(); onDelete(); });
  const close = () => { setAsk(false); pin.reset(); };
  if (!ask) return <Button ghost title={title} style={style} onPress={() => setAsk(true)} />;
  if (parent) return (
    <View style={[s.row, { gap: 6 }]}>
      <Button color={C.danger} title={confirm} style={style} onPress={() => { close(); onDelete(); }} />
      <Button ghost title="Abbrechen" style={style} onPress={close} />
    </View>
  );
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.row, { gap: 6, flexWrap: 'nowrap' }]}>
        <TextInput autoFocus style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6, paddingVertical: 8 }]} value={pin.pin} editable={!pin.busy} secureTextEntry keyboardType="number-pad" placeholder="PIN"
          accessibilityLabel="Eltern-PIN zum Löschen" onChangeText={pin.onChange} />
        <Button ghost title="Abbrechen" style={style} onPress={close} />
      </View>
      <Text style={{ fontSize: 12, color: pin.msg ? C.danger : C.muted, fontWeight: '700' }}>{pin.busy ? 'Prüfe …' : pin.msg || 'Löschen geht nur mit der PIN von Mama oder Papa.'}</Text>
    </View>
  );
}
