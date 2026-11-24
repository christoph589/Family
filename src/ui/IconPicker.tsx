import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { C, s, SHADOW } from './theme';

const GROUPS: { label: string; icons: string[] }[] = [
  { label: 'Termine', icons: ['📌', '🎂', '🎉', '🩺', '🦷', '💉', '👓', '💇', '🚗', '✈️', '🧳', '🏥', '🏛️', '💼', '📞', '💻'] },
  { label: 'Schule', icons: ['🏫', '📚', '✏️', '📝', '🧮', '🔬', '🎨', '🎒', '📖', '🗣️', '🌍', '🧪'] },
  { label: 'Sport & Hobby', icons: ['⚽', '🏀', '🎾', '🏊', '🚴', '🤸', '🥋', '⛸️', '🏇', '🎹', '🎸', '🥁', '🎻', '🎤', '🩰', '🎭'] },
  { label: 'Familie & Freizeit', icons: ['👪', '👵', '👴', '🧒', '🍰', '🍕', '🎬', '🎮', '🏕️', '🏖️', '🎄', '🐣', '⛪', '🎁', '🐶', '🐱'] },
  { label: 'Zuhause', icons: ['🪥', '🛏️', '🧸', '🧹', '🧺', '🍽️', '🗑️', '🌱', '🛁', '🚿', '👕', '🧦', '🐾', '🛒', '🔧', '💡'] },
];

/** Symbol zum Antippen statt Emoji tippen. */
export function IconPicker({ value, onChange, label = 'Symbol' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)}
        style={({ pressed }) => ({ width: 52, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.line : C.surface2 })}>
        <Text style={{ fontSize: value ? 24 : 15, color: C.muted }}>{value || '＋🙂'}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,20,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={[{ backgroundColor: C.surface, borderRadius: 24, padding: 18, width: '100%', maxWidth: 440, maxHeight: '85%', gap: 10 }, SHADOW.lg]}>
            <Text style={s.h2}>Symbol wählen</Text>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {GROUPS.map(g => (
                <View key={g.label} style={{ gap: 6 }}>
                  <Text style={s.label}>{g.label}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {g.icons.map(i => (
                      <Pressable key={i} accessibilityLabel={`Symbol ${i}`} onPress={() => { onChange(i); setOpen(false); }}
                        style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: i === value ? C.accentSoft : pressed ? C.surface2 : C.bg, borderWidth: i === value ? 2 : 0, borderColor: C.accent })}>
                        <Text style={{ fontSize: 26 }}>{i}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={[s.row, { justifyContent: 'flex-end' }]}>
              {!!value && <Pressable onPress={() => { onChange(''); setOpen(false); }} style={{ padding: 10 }}><Text style={{ color: C.danger, fontWeight: '700' }}>Ohne Symbol</Text></Pressable>}
              <Pressable onPress={() => setOpen(false)} style={{ padding: 10 }}><Text style={{ color: C.accent, fontWeight: '700' }}>Schließen</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Passendes Symbol zum Titel raten, z. B. „Zahnarzt“ -> 🦷. */
const GUESS: [RegExp, string][] = [
  [/zahn/i, '🦷'], [/arzt|kinderarzt|praxis/i, '🩺'], [/impf/i, '💉'], [/geburtstag/i, '🎂'], [/fu(ss|ß)ball/i, '⚽'], [/basket/i, '🏀'],
  [/tennis/i, '🎾'], [/schwimm/i, '🏊'], [/turn/i, '🤸'], [/judo|karate|kampf/i, '🥋'], [/reit/i, '🏇'], [/klavier/i, '🎹'], [/gitarre/i, '🎸'],
  [/schlagzeug/i, '🥁'], [/geige/i, '🎻'], [/chor|sing/i, '🎤'], [/ballett|tanz/i, '🩰'], [/theater/i, '🎭'], [/schule|elternabend|lehrer/i, '🏫'],
  [/friseur/i, '💇'], [/urlaub|flug/i, '✈️'], [/oma|opa/i, '👵'], [/kino|film/i, '🎬'], [/party|feier/i, '🎉'], [/kirche|gottesdienst/i, '⛪'],
  [/einkauf/i, '🛒'], [/müll|tonne/i, '🗑️'], [/tierarzt|hund/i, '🐶'],
];
export const guessIcon = (title: string) => GUESS.find(([r]) => r.test(title))?.[1] ?? '';
