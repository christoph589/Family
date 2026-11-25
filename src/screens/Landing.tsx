import { useState } from 'react';
import { Image, ImageSourcePropType, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { BRAND } from '../brand';
import { LogoMark } from '../ui/Logo';
import { C, grad, SHADOW } from '../ui/theme';

const IMG = {
  wand: require('../../assets/landing/wand.jpg') as ImageSourcePropType,
  kind: require('../../assets/landing/kind.jpg') as ImageSourcePropType,
  kal: require('../../assets/landing/kal.jpg') as ImageSourcePropType,
  geld: require('../../assets/landing/geld.jpg') as ImageSourcePropType,
};
const INK = '#16132b';
const SOFT = '#5d5a75';
const MAX = 1120;
const webOnly = (style: object) => (Platform.OS === 'web' ? (style as any) : null);

const STORIES: { kicker: string; title: string; text: string; points: string[]; img: ImageSourcePropType; tint: string }[] = [
  {
    kicker: 'Für die Kinder', title: 'Jedes Kind sieht, was heute dran ist.', img: IMG.kind, tint: '#ffe9e4',
    text: 'Morgens Zähne putzen, mittags Hausaufgaben, abends den Ranzen packen. Kinder haken selbst ab und sammeln Sterne für eigene Wünsche und ein gemeinsames Familienziel.',
    points: ['Schul- und Ferienmodus schaltet automatisch um', 'Eltern bestätigen mit PIN, Kinder können nichts löschen', 'Stundenplan aus WebUntis oder einem Foto'],
  },
  {
    kicker: 'Für die Eltern', title: 'Ein Kalender, den alle verstehen.', img: IMG.kal, tint: '#e8e6ff',
    text: 'Schule, Training, Arzt und Elternabend in einer Ansicht, jede Person in ihrer Farbe. Wer bringt, wer holt ab, steht direkt am Termin.',
    points: ['iCloud, Google und Outlook in beide Richtungen', 'Elternbrief abfotografieren, Termine landen im Kalender', 'Ferien und Feiertage nach Bundesland'],
  },
  {
    kicker: 'Für später', title: 'Taschengeld, das Geld erklärt.', img: IMG.geld, tint: '#e3f6ec',
    text: 'Jedes Taschengeld wird auf drei Töpfe verteilt: Ausgeben, Sparen und Investieren. Der Eltern-Zins macht sichtbar, wie Geld wächst, wenn man es liegen lässt.',
    points: ['Aufteilung und Zins stellt ihr selbst ein', 'Sparziel mit Fortschritt und Restzeit', 'Rausnehmen aus Sparen nur mit Eltern-OK'],
  },
];
const MORE: [string, string, string][] = [
  ['📚', 'Lernen mit KI', 'Heftfoto hochladen, die KI macht daraus einen Übungstest. Kein Benoten, nur prüfen, ob es sitzt.'],
  ['🗣️', 'Vokabeltrainer', 'Karteikasten mit Wiederholung im richtigen Abstand.'],
  ['🍽️', 'Essen und Einkauf', 'Wochenplan, Rezepte und eine Einkaufsliste für alle.'],
  ['👵', 'Großeltern dabei', 'Eigener Zugang ohne Einstellungen, ideal zum Abholen.'],
  ['🎁', 'Geschenke', 'Ideen für Geburtstage und Weihnachten, geheim vor den Kindern.'],
  ['🆘', 'Notfallkarte', 'Arzt, Allergien, Medikamente und Kontakte für den Babysitter.'],
];
const FAQ: [string, string][] = [
  ['Was kostet das?', `${BRAND.name} ist in der Testphase. Solange zahlt ihr nichts.`],
  ['Brauche ich neue Hardware?', 'Nein. Es läuft im Browser auf Handy, Tablet, Laptop oder einem Bildschirm an der Wand. Ein altes Tablet reicht völlig.'],
  ['Brauchen Kinder ein eigenes Konto?', 'Nein. Kindergeräte werden mit einem Familiencode verbunden, ohne E-Mail und ohne Passwort.'],
  ['Wo liegen unsere Daten?', 'Auf Servern in der EU. Kalenderzugänge und Schlüssel werden verschlüsselt gespeichert, Fotos für die KI werden nicht zum Training verwendet. Schaut unser Support zur Hilfe in eure Familie, seht ihr jeden Besuch mit Uhrzeit.'],
  ['Funktioniert es auch ohne Kinder in der Schule?', 'Ja. Routinen, Haushalt, Kalender, Essen und Taschengeld funktionieren für jedes Alter.'],
];

function Btn({ title, onPress, kind = 'solid', big }: { title: string; onPress: () => void; kind?: 'solid' | 'light' | 'outline' | 'ghost'; big?: boolean }) {
  const [hover, setHover] = useState(false);
  const bg = { solid: C.accent, light: '#fff', outline: 'transparent', ghost: 'transparent' }[kind];
  const fg = { solid: '#fff', light: C.accent, outline: '#fff', ghost: INK }[kind];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      style={[{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: big ? 28 : 18, paddingVertical: big ? 16 : 10, borderWidth: kind === 'outline' ? 2 : 0, borderColor: '#ffffffa0', opacity: hover ? 0.9 : 1 },
        kind === 'solid' || kind === 'light' ? SHADOW.md : null, webOnly({ transition: 'transform .15s', transform: hover ? 'translateY(-1px)' : 'none' })]}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: big ? 17 : 15 }}>{title}</Text>
    </Pressable>
  );
}

function Phone({ src, w }: { src: ImageSourcePropType; w: number }) {
  return (
    <View style={[{ width: w, padding: w * 0.035, borderRadius: w * 0.16, backgroundColor: INK }, SHADOW.lg]}>
      <Image source={src} accessibilityLabel="Ansicht der App auf dem Handy" style={{ width: w * 0.93, height: (w * 0.93) / 0.52, borderRadius: w * 0.13 }} resizeMode="cover" />
    </View>
  );
}

/** Breites Bild, das seine Höhe aus der gemessenen Breite berechnet (aspectRatio greift im Browser bei Bildern nicht zuverlässig). */
function Wide({ src, label, radius, flatBottom }: { src: ImageSourcePropType; label: string; radius: number; flatBottom?: boolean }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {w > 0 && <Image source={src} accessibilityLabel={label} resizeMode="cover" style={{ width: w, height: w / 1.6, borderRadius: radius, borderBottomLeftRadius: flatBottom ? 0 : radius, borderBottomRightRadius: flatBottom ? 0 : radius }} />}
    </View>
  );
}

/** Startseite für alle, die auf diesem Gerät noch keine Familie haben. */
export function Landing({ onNew, onLogin, onKid }: { onNew: () => void; onLogin: () => void; onKid: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const mid = width >= 640;
  const pad = wide ? 32 : 20;
  const wrap = { maxWidth: MAX, width: '100%' as const, alignSelf: 'center' as const, paddingHorizontal: pad };
  const h1 = wide ? 52 : mid ? 44 : 36;
  const h2 = wide ? 40 : 30;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fbfaff' }} contentContainerStyle={{ paddingBottom: 0 }}>
      {/* Kopf und Hero */}
      <View style={[{ paddingBottom: wide ? 0 : 36, overflow: 'hidden' }, grad('#5b4cf0', '#b05cf0', 160)]}>
        <View style={[wrap, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[{ borderRadius: 12, overflow: 'hidden' }, webOnly({ boxShadow: '0 0 0 2px #ffffff55' })]}><LogoMark size={38} /></View>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22, letterSpacing: -0.5 }}>{BRAND.name}</Text>
          </View>
          <Btn title="Anmelden" kind="outline" onPress={onLogin} />
        </View>

        <View style={[wrap, { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-end' : 'stretch', gap: wide ? 24 : 34, paddingTop: wide ? 40 : 24 }]}>
          <View style={{ flex: wide ? 0.95 : undefined, gap: 20, paddingBottom: wide ? 90 : 0 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: '#ffffff26', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✨ Jetzt in der Testphase</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: h1, lineHeight: h1 * 1.05, fontWeight: '800', letterSpacing: -h1 * 0.035 }}>Der Familienalltag auf einem Bildschirm.</Text>
            <Text style={{ color: '#ffffffdd', fontSize: wide ? 20 : 17, lineHeight: wide ? 30 : 26, maxWidth: 520 }}>
              Termine, Aufgaben, Taschengeld, Stundenplan und Essen. Für Eltern, Kinder und Großeltern, auf den Geräten, die ihr schon habt.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
              <Btn title="Familie anlegen" kind="light" big onPress={onNew} />
              <Btn title="Kindergerät verbinden" kind="outline" big onPress={onKid} />
            </View>
            <Text style={{ color: '#ffffffb0', fontSize: 14 }}>Zwei Minuten einrichten · Kinder ohne Konto · Server in der EU</Text>
          </View>

          <View style={{ flex: wide ? 1.25 : undefined, alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 680 }}>
              <View style={[{ backgroundColor: INK, padding: wide ? 12 : 8, borderRadius: wide ? 28 : 20, borderBottomLeftRadius: wide ? 0 : 20, borderBottomRightRadius: wide ? 0 : 20 }, SHADOW.lg]}>
                <Wide src={IMG.wand} label="Wandansicht mit Tagesplan der Familie" radius={wide ? 18 : 13} flatBottom={wide} />
              </View>
              {mid && (
                <View style={{ position: 'absolute', right: wide ? -26 : -6, bottom: wide ? -30 : -28 }}>
                  <Phone src={IMG.kind} w={wide ? 168 : 130} />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Leiste mit Kernaussagen */}
      <View style={[wrap, { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: wide ? 40 : 18, paddingVertical: wide ? 54 : 34 }]}>
        {[['🖥️', 'Läuft auf jedem Gerät'], ['🧒', 'Kinder ohne Konto'], ['🇪🇺', 'Daten in der EU'], ['🔓', 'Offen, keine Spezial-Hardware']].map(([i, t]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 20 }}>{i}</Text><Text style={{ color: SOFT, fontWeight: '700', fontSize: 15 }}>{t}</Text>
          </View>
        ))}
      </View>

      {/* Drei Geschichten mit echten Ansichten */}
      <View style={[wrap, { gap: wide ? 110 : 64, paddingBottom: wide ? 110 : 64 }]}>
        {STORIES.map((st, i) => (
          <View key={st.title} style={{ flexDirection: wide ? (i % 2 ? 'row-reverse' : 'row') : 'column', alignItems: 'center', gap: wide ? 80 : 32 }}>
            <View style={{ flex: wide ? 1 : undefined, gap: 16, maxWidth: 520 }}>
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase' }}>{st.kicker}</Text>
              <Text style={{ color: INK, fontSize: h2, lineHeight: h2 * 1.12, fontWeight: '800', letterSpacing: -h2 * 0.03 }}>{st.title}</Text>
              <Text style={{ color: SOFT, fontSize: 17, lineHeight: 27 }}>{st.text}</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {st.points.map(p => (
                  <View key={p} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Text style={{ color: C.accent, fontWeight: '900', fontSize: 12 }}>✓</Text>
                    </View>
                    <Text style={{ color: INK, fontSize: 16, lineHeight: 23, flex: 1 }}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ flex: wide ? 1 : undefined, alignItems: 'center', justifyContent: 'center', backgroundColor: st.tint, borderRadius: 36, paddingVertical: wide ? 48 : 32, width: wide ? undefined : '100%' }}>
              <Phone src={st.img} w={wide ? 250 : 220} />
            </View>
          </View>
        ))}
      </View>

      {/* Weitere Funktionen */}
      <View style={{ backgroundColor: '#f1effd', paddingVertical: wide ? 96 : 60 }}>
        <View style={[wrap, { gap: 36 }]}>
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Text style={{ color: INK, fontSize: h2, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }}>Und noch viel mehr.</Text>
            <Text style={{ color: SOFT, fontSize: 17, textAlign: 'center', maxWidth: 560 }}>Gebaut von einer großen Familie, für den echten Alltag.</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {MORE.map(([icon, title, text]) => (
              <View key={title} style={[{ flexGrow: 1, flexBasis: wide ? 300 : 260, backgroundColor: '#fff', borderRadius: 24, padding: 24, gap: 8 }, SHADOW.sm]}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24 }}>{icon}</Text></View>
                <Text style={{ color: INK, fontSize: 18, fontWeight: '800', marginTop: 4 }}>{title}</Text>
                <Text style={{ color: SOFT, fontSize: 15, lineHeight: 22 }}>{text}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Wand und offene Hardware */}
      <View style={[wrap, { paddingVertical: wide ? 110 : 64 }]}>
        <View style={[{ borderRadius: 36, padding: wide ? 56 : 28, flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 28, alignItems: 'center', overflow: 'hidden' }, grad(INK, '#2c2555', 135)]}>
          <View style={{ flex: wide ? 1 : undefined, gap: 16 }}>
            <Text style={{ color: '#b9b2ff', fontWeight: '800', fontSize: 13, letterSpacing: 1.4 }}>WANDANSICHT</Text>
            <Text style={{ color: '#fff', fontSize: h2, lineHeight: h2 * 1.12, fontWeight: '800', letterSpacing: -1 }}>Das alte Tablet wird zur Familienzentrale.</Text>
            <Text style={{ color: '#ffffffc0', fontSize: 17, lineHeight: 27 }}>
              Keine teure Spezial-Hardware. Ein altes Android-Tablet, ein Fire-Tablet, ein Surface oder ein Bildschirm mit Raspberry Pi reicht. Nachts dimmt die Ansicht ab, morgens ist sie wieder da.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['Android', 'iPad', 'Fire', 'Windows', 'Raspberry Pi'].map(t => (
                <View key={t} style={{ borderWidth: 1, borderColor: '#ffffff30', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t}</Text></View>
              ))}
            </View>
          </View>
          <View style={{ flex: wide ? 1.2 : undefined, width: wide ? undefined : '100%' }}>
            <View style={{ backgroundColor: '#000', padding: 10, borderRadius: 22, borderWidth: 1, borderColor: '#ffffff20' }}>
              <Wide src={IMG.wand} label="Wandansicht auf einem Tablet" radius={14} />
            </View>
          </View>
        </View>
      </View>

      {/* So startet ihr */}
      <View style={[wrap, { gap: 32, paddingBottom: wide ? 110 : 64 }]}>
        <Text style={{ color: INK, fontSize: h2, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }}>In drei Schritten startklar.</Text>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
          {[['Familie anlegen', 'Eltern legen ein Konto an und tragen die Kinder ein. Ein paar Startaufgaben sind gleich dabei.'],
            ['Geräte verbinden', 'Kinder-Handys und Tablets kommen mit dem Familiencode dazu. Ohne E-Mail, ohne Passwort.'],
            ['An die Wand', 'Ein Tablet zeigt den Tag für alle. Einfach die Wandansicht öffnen und fertig.']].map(([t, x], i) => (
            <View key={t} style={{ flex: 1, gap: 10, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#e6e3f5', backgroundColor: '#fff' }}>
              <Text style={{ fontSize: 44, fontWeight: '800', color: C.accent, opacity: 0.25, lineHeight: 46 }}>{i + 1}</Text>
              <Text style={{ color: INK, fontSize: 19, fontWeight: '800' }}>{t}</Text>
              <Text style={{ color: SOFT, fontSize: 15, lineHeight: 22 }}>{x}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Fragen */}
      <View style={[wrap, { maxWidth: 820, gap: 12, paddingBottom: wide ? 110 : 64 }]}>
        <Text style={{ color: INK, fontSize: h2, fontWeight: '800', letterSpacing: -1, textAlign: 'center', marginBottom: 12 }}>Häufige Fragen</Text>
        {FAQ.map(([q, a], i) => (
          <Pressable key={q} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}
            style={{ backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 22, paddingVertical: 18, borderWidth: 1, borderColor: '#ece9f7', gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: INK, fontSize: 17, fontWeight: '800', flex: 1 }}>{q}</Text>
              <Text style={{ color: C.accent, fontSize: 20, fontWeight: '800' }}>{open === i ? '−' : '+'}</Text>
            </View>
            {open === i && <Text style={{ color: SOFT, fontSize: 16, lineHeight: 24 }}>{a}</Text>}
          </Pressable>
        ))}
      </View>

      {/* Abschluss */}
      <View style={[{ paddingVertical: wide ? 90 : 60 }, grad('#5b4cf0', '#ff6a5c', 120)]}>
        <View style={[wrap, { alignItems: 'center', gap: 18 }]}>
          <LogoMark size={64} />
          <Text style={{ color: '#fff', fontSize: h2, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }}>Bereit für weniger Chaos?</Text>
          <Text style={{ color: '#ffffffd0', fontSize: 17, textAlign: 'center', maxWidth: 520 }}>Familie anlegen, Kinder eintragen, loslegen. Eure Rückmeldung macht {BRAND.name} besser.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Btn title="Familie anlegen" kind="light" big onPress={onNew} />
            <Btn title="Anmelden" kind="outline" big onPress={onLogin} />
          </View>
        </View>
      </View>
      <View style={[wrap, { paddingVertical: 24, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }]}>
        <Text style={{ color: SOFT, fontSize: 13 }}>© {new Date().getFullYear()} {BRAND.name}</Text>
        <Text style={{ color: SOFT, fontSize: 13 }}>Mit ❤️ für große und kleine Familien gebaut</Text>
      </View>
    </ScrollView>
  );
}
