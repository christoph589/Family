import { Pressable, Text, ViewStyle } from 'react-native';
import { C, s } from './theme';
export function Button({ title, onPress, ghost, color, disabled, style }: { title: string; onPress: () => void; ghost?: boolean; color?: string; disabled?: boolean; style?: ViewStyle }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, ghost && s.ghost, color ? { backgroundColor: color } : null, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}>
      <Text style={[s.btnText, ghost && s.ghostText]}>{title}</Text>
    </Pressable>
  );
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Pressable style={[s.row, { backgroundColor: C.surface2, padding: 4, borderRadius: 12, gap: 4 }]}>
      {options.map(o => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: value === o.value }}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, backgroundColor: value === o.value ? C.surface : 'transparent' }}>
          <Text style={{ fontWeight: '700', color: C.fg }}>{o.label}</Text>
        </Pressable>
      ))}
    </Pressable>
  );
}
