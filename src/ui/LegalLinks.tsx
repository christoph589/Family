import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { LEGAL } from '../brand';
import { C } from './theme';

/** Impressum, Datenschutz, AGB. Muss von überall erreichbar sein (TMG/DDG, DSGVO, App Store). */
export function openLegal(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url);
}

export function LegalLinks({ color = C.muted, center = true }: { color?: string; center?: boolean }) {
  const items: [string, string][] = [['Impressum', LEGAL.impressum], ['Datenschutz', LEGAL.datenschutz], ['AGB', LEGAL.agb]];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', gap: 4 }}>
      {items.map(([t, u]) => (
        <Pressable key={t} accessibilityRole="link" onPress={() => openLegal(u)} style={{ paddingVertical: 8, paddingHorizontal: 8 }}>
          <Text style={{ color, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}
