import { createElement } from 'react';
import { Platform, TextInput } from 'react-native';
import { C } from './theme';

/**
 * Datum (YYYY-MM-DD) oder Uhrzeit (HH:MM). Im Browser die eingebaute Auswahl
 * (Kalender bzw. Uhr), in der App ein Textfeld.
 */
export function DateField({ value, onChange, type = 'date', label, width, min, max }: {
  value: string; onChange: (v: string) => void; type?: 'date' | 'time'; label: string; width?: number; min?: string; max?: string;
}) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type, value, min, max, 'aria-label': label,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 10px', fontSize: 16, color: C.fg, background: C.bg,
        fontFamily: 'inherit', width: width ?? (type === 'date' ? 170 : 124), boxSizing: 'border-box', minHeight: 44,
      },
    });
  }
  return (
    <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={type === 'date' ? 'JJJJ-MM-TT' : 'HH:MM'}
      style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.fg, backgroundColor: C.bg, width: width ?? 140 }} />
  );
}
