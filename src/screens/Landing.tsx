import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { C, grad, s, SHADOW } from '../ui/theme';

const FEATURES: [string, string, string][] = [
  ['📅', 'Ein Kalender für alle', 'Termine, Schule, Ferien und Feiertage. Holt iCloud- und Google-Kalender dazu.'],
  ['✅', 'Aufgaben und Routinen', 'Morgenroutine, Hausaufgaben, Haushalt. Mit Schul- und Ferienmodus.'],
  ['⭐', 'Punkte und Wünsche', 'Kinder sammeln für eigene Wünsche und ein gemeinsames Familienziel.'],
  ['💶', 'Taschengeld mit drei Töpfen', 'Ausgeben, Sparen, Investieren. Mit Eltern-Zins, damit Kinder Zinseszins sehen.'],
  ['📚', 'Stundenplan und Lernen', 'Aus WebUntis oder einem Foto. Übungstests aus Heftfotos prüfen, ob der Stoff sitzt.'],
  ['🍽️', 'Essen und Einkauf', 'Wochenplan, Rezepte und eine gemeinsame Einkaufsliste.'],
];
const STEPS: [string, string][] = [
  ['Familie anlegen', 'Eltern legen ein Konto an und tragen die Kinder ein. Dauert zwei Minuten.'],
  ['Geräte verbinden', 'Kinder-Handys und Tablets kommen mit einem Familiencode dazu, ohne eigenes Konto.'],
  ['An die Wand', 'Ein altes Tablet oder ein Bildschirm zeigt den Tag für alle. Läuft im Browser.'],
];

/** Startseite für alle, die auf diesem Gerät noch keine Familie haben. */
export function Landing({ onNew, onLogin, onKid }: { onNew: () => void; onLogin: () => void; onKid: () => void }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[{ paddingHorizontal: 20, paddingTop: 48, paddingBottom: 40 }, grad(C.accent, '#8b5cf6')]}>
        <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center', gap: 16 }}>
          <Text style={{ color: '#ffffffcc', fontWeight: '800', letterSpacing: 1.2, fontSize: 12 }}>FAMILIENPLANER · TESTPHASE</Text>
          <Text style={{ color: '#fff', fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8, maxWidth: 640 }}>Der Familienalltag auf einem Bildschirm.</Text>
          <Text style={{ color: '#ffffffe6', fontSize: 17, lineHeight: 25, maxWidth: 600 }}>Termine, Aufgaben, Taschengeld, Stundenplan und Essen. Für Eltern, Kinder und Großeltern. Auf den Geräten, die ihr schon habt.</Text>
          <View style={[s.row, { gap: 10, marginTop: 6 }]}>
            <Pressable onPress={onNew} accessibilityRole="button" style={[{ backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 }, SHADOW.md]}>
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>Familie anlegen</Text>
            </Pressable>
            <Pressable onPress={onLogin} accessibilityRole="button" style={{ borderWidth: 2, borderColor: '#ffffff99', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Anmelden</Text>
            </Pressable>
          </View>
          <Pressable onPress={onKid} accessibilityRole="link"><Text style={{ color: '#fff', fontWeight: '700', textDecorationLine: 'underline' }}>Gerät eines Kindes mit Familiencode verbinden</Text></Pressable>
        </View>
      </View>

      <View style={[s.pad, { maxWidth: 920, paddingTop: 28 }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {FEATURES.map(([icon, title, text]) => (
            <View key={title} style={[s.card, { flexGrow: 1, flexBasis: 260, gap: 6 }]}>
              <Text style={{ fontSize: 28 }}>{icon}</Text>
              <Text style={[s.h2, { fontSize: 18 }]}>{title}</Text>
              <Text style={s.muted}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.h2, { marginTop: 10 }]}>So startet ihr</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {STEPS.map(([title, text], i) => (
            <View key={title} style={{ flexGrow: 1, flexBasis: 240, flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.accent, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.text, { fontWeight: '800' }]}>{title}</Text>
                <Text style={s.muted}>{text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[s.card, { backgroundColor: C.accentSoft, gap: 8, marginTop: 6 }]}>
          <Text style={[s.h2, { fontSize: 18 }]}>Offen statt eigene Hardware</Text>
          <Text style={s.text}>Ihr braucht kein spezielles Gerät. Der Planer läuft im Browser auf Handy, Tablet, Laptop, einem alten Android-Tablet oder einem Raspberry Pi am Bildschirm.</Text>
          <Text style={s.muted}>Kinder brauchen kein eigenes Konto und keine E-Mail. Gespeichert wird auf Servern in der EU.</Text>
        </View>

        <View style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Button title="Jetzt Familie anlegen" onPress={onNew} />
          <Text style={[s.muted, { textAlign: 'center' }]}>Der Planer ist in der Testphase. Feedback hilft uns sehr.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
