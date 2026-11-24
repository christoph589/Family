import { Pressable, Text, TextInput, View } from 'react-native';
import { today } from '../data/logic';
import { DateField } from './DateField';
import { Gender } from '../data/types';
import { C, s } from './theme';

export interface KidDraft { birthday: string; gender?: Gender; grade: string }
export const kidDraftValid = (k: KidDraft) => /^\d{4}-\d{2}-\d{2}$/.test(k.birthday) && !!k.gender && !!k.grade.trim();
const GENDERS: { value: Gender; label: string }[] = [{ value: 'maedchen', label: 'Mädchen' }, { value: 'junge', label: 'Junge' }, { value: 'divers', label: 'Divers' }];

/** Geburtstag (Datumsauswahl), Geschlecht, Klasse */
export function KidFields({ value, onChange, name }: { value: KidDraft; onChange: (k: Partial<KidDraft>) => void; name?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <Text style={[s.muted, { fontSize: 13 }]}>Geburtstag</Text>
        <DateField value={value.birthday} onChange={v => onChange({ birthday: v })} label={`Geburtstag${name ? ' von ' + name : ''}`} min="1990-01-01" max={today()} />
        <TextInput style={[s.input, { width: 90 }]} value={value.grade} placeholder="Klasse" accessibilityLabel={`Klasse${name ? ' von ' + name : ''}`}
          onChangeText={t => onChange({ grade: t.slice(0, 6) })} />
      </View>
      <View style={[s.row, { gap: 6 }]}>
        {GENDERS.map(g => {
          const on = value.gender === g.value;
          return (
            <Pressable key={g.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange({ gender: g.value })}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: C.accent, backgroundColor: on ? C.accent : C.surface }}>
              <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{g.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
