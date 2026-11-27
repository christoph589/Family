import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { moneyRules } from '../data/logic';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';

const num = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/** Einstellungen › Geld: Aufteilung auf die drei Töpfe und Eltern-Zins. */
export function MoneySettings() {
  const { data, update } = useFamily();
  const r = data ? moneyRules(data) : { spar: 30, invest: 20, rate: 1 };
  const [spar, setSpar] = useState(String(r.spar));
  const [invest, setInvest] = useState(String(r.invest));
  const [rate, setRate] = useState(String(r.rate).replace('.', ','));
  const [saved, setSaved] = useState(false);
  if (!data) return null;
  const sp = num(spar), inv = num(invest), rt = num(rate);
  const aus = 100 - sp - inv;
  const bad = [sp, inv, rt].some(Number.isNaN) || sp < 0 || inv < 0 || aus < 0 || rt < 0 || rt > 10;
  const changed = sp !== r.spar || inv !== r.invest || rt !== r.rate;
  const field = (label: string, v: string, set: (v: string) => void, unit: string) => (
    <View style={{ minWidth: 96, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput style={[s.input, { width: 70 }]} value={v} onChangeText={x => { set(x); setSaved(false); }} keyboardType="decimal-pad" />
        <Text style={s.muted}>{unit}</Text>
      </View>
    </View>
  );
  return (
    <View style={[s.card, { gap: 10 }]}>
      <Text style={s.h2}>Taschengeld aufteilen</Text>
      <Text style={s.muted}>Jedes Taschengeld und jedes „Geld dazu“ mit „Aufteilen“ wird so auf die drei Töpfe verteilt. Ausgeben ist echtes Bargeld. Sparen und Investieren verwahrt ihr als Eltern („Bank Mama und Papa“).</Text>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <View style={{ minWidth: 96, gap: 4 }}>
          <Text style={s.label}>Ausgeben</Text>
          <Text style={[s.text, { fontSize: 20, fontWeight: '800', paddingVertical: 8, color: aus < 0 ? C.danger : C.fg }]}>{Number.isNaN(aus) ? '?' : aus} %</Text>
        </View>
        {field('Sparen', spar, setSpar, '%')}
        {field('Investieren', invest, setInvest, '%')}
      </View>
      <Text style={s.h2}>Eltern-Zins</Text>
      <Text style={s.muted}>Am Monatsersten bekommt der Topf Investieren Zinsen auf den Stand vom Monatsende. Echte Banken zahlen deutlich weniger, aber Kinder sollen den Effekt sehen. 1 % pro Monat macht aus 100 € nach einem Jahr etwa 112,68 €.</Text>
      {field('Zins pro Monat', rate, setRate, '%')}
      {bad && <Text style={{ color: C.danger }}>Sparen und Investieren dürfen zusammen höchstens 100 % sein, der Zins zwischen 0 und 10 %.</Text>}
      <Button title={saved ? 'Gespeichert ✓' : 'Speichern'} disabled={bad || !changed} onPress={() => { update(d => ({ ...d, settings: { ...d.settings, money: { spar: sp, invest: inv, rate: rt } } })); setSaved(true); }} />
      <Text style={[s.muted, { fontSize: 12 }]}>Gilt für alle Kinder und ab der nächsten Zahlung. Bereits gebuchtes Geld bleibt, wo es ist.</Text>
    </View>
  );
}
