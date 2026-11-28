import { ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, s } from './theme';
import { Icon, IconName } from './Icon';

/** Eingeklappter Abschnitt: eine ruhige Zeile mit Icon-Kachel, Details erst nach dem Antippen. */
export function Fold({ title, sub, icon, children }: { title: string; sub?: string; icon: IconName; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(o => !o)}
        style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }]}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={C.accent} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.text, { fontWeight: '800' }]} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{sub}</Text>}
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chev" size={18} color={C.muted} /></View>
      </Pressable>
      {open && children}
    </View>
  );
}
