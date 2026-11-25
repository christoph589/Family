import { useState } from 'react';
import { Text, TextInput, View, ViewStyle } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { isAdmin, parentsOf } from '../data/logic';
import { Button } from './Button';
import { C, s } from './theme';

/** Stimmt die PIN von Mama, Papa oder einem anderen Erwachsenen? */
export function parentPinOk(d: ReturnType<typeof useFamily>['data'], pin: string) {
  if (!d || pin.length !== 4) return false;
  return parentsOf(d).some(p => (isAdmin(p) ? pin === d.family.parentPin : !!p.pin && pin === p.pin));
}

/** Löschen mit Rückfrage. Kinder und die Wandansicht brauchen dafür die PIN eines Elternteils. */
export function DeleteButton({ parent, onDelete, title = 'Löschen', confirm = 'Wirklich löschen', style }: { parent: boolean; onDelete: () => void; title?: string; confirm?: string; style?: ViewStyle }) {
  const { data } = useFamily();
  const [ask, setAsk] = useState(false);
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const close = () => { setAsk(false); setPin(''); setBad(false); };
  if (!ask) return <Button ghost title={title} style={style} onPress={() => setAsk(true)} />;
  if (parent) return (
    <View style={[s.row, { gap: 6 }]}>
      <Button color={C.danger} title={confirm} style={style} onPress={() => { close(); onDelete(); }} />
      <Button ghost title="Abbrechen" style={style} onPress={close} />
    </View>
  );
  const tryPin = (v: string) => {
    setPin(v); setBad(false);
    if (v.length === 4) { if (parentPinOk(data, v)) { close(); onDelete(); } else setBad(true); }
  };
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.row, { gap: 6, flexWrap: 'nowrap' }]}>
        <TextInput autoFocus style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6, paddingVertical: 8 }]} value={pin} secureTextEntry keyboardType="number-pad" placeholder="PIN"
          accessibilityLabel="Eltern-PIN zum Löschen" onChangeText={t => tryPin(t.replace(/\D/g, '').slice(0, 4))} />
        <Button ghost title="Abbrechen" style={style} onPress={close} />
      </View>
      <Text style={{ fontSize: 12, color: bad ? C.danger : C.muted, fontWeight: '700' }}>{bad ? 'PIN stimmt nicht.' : 'Löschen geht nur mit der PIN von Mama oder Papa.'}</Text>
    </View>
  );
}
