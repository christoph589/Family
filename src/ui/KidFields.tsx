import { Pressable, Text, TextInput, View } from 'react-native';
import { parseGermanDate } from '../data/logic';
import { Gender } from '../data/types';
import { C, s } from './theme';

export interface KidDraft { birthday: string; gender?: Gender; grade: string }
export const kidDraftValid = (k: KidDraft) => !!parseGermanDate(k.birthday) && !!k.gender && !!k.grade.trim();
const GENDERS: { value: Gender; label: string }[] = [{ value: 'maedchen', label: 'Mädchen' }, { value: 'junge', label: 'Junge' }, { value: 'divers', label: 'Divers' }];

/** Geburtstag (TT.MM.JJJJ), Geschlecht, Klasse */
export function KidFields({ value, onChange, name }: { value: KidDraft; onChange: (k: Partial<KidDraft>) => void; name?: string }) {
  const bdBad = value.birthday.length >= 8 && !parseGermanDate(value.birthday);
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { flex: 1, minWidth: 0 }, bdBad && { borderColor: C.danger }]} value={value.birthday} placeholder="Geburtstag TT.MM.JJJJ"
          accessibilityLabel={`Geburtstag${name ? ' von ' + name : ''}`} keyboardType="numbers-and-punctuation"
          onChangeText={t => onChange({ birthday: t.replace(/[^\d.]/g, '').slice(0, 10) })} />
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
      {bdBad && <Text style={{ color: C.danger, fontSize: 13 }}>Geburtstag bitte so: 14.03.2016</Text>}
    </View>
  );
}
