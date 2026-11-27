import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { ageOf, gradeLabel } from '../data/logic';
import { Child, Emergency } from '../data/types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { C, SHADOW, s } from '../ui/theme';

const FIELDS: { key: keyof Emergency; label: string; placeholder: string; phone?: boolean; multi?: boolean }[] = [
  { key: 'allergies', label: 'Allergien / Unverträglichkeiten', placeholder: 'z. B. Erdnüsse, Penicillin' },
  { key: 'meds', label: 'Medikamente / Erkrankungen', placeholder: 'z. B. Asthmaspray, Epilepsie' },
  { key: 'blood', label: 'Blutgruppe', placeholder: 'z. B. A+' },
  { key: 'doctor', label: 'Kinderarzt / Kinderärztin', placeholder: 'Name, Praxis' },
  { key: 'doctorPhone', label: 'Telefon Kinderarzt', placeholder: '0…', phone: true },
  { key: 'insurance', label: 'Krankenkasse', placeholder: 'z. B. AOK' },
  { key: 'school', label: 'Schule / Kita', placeholder: 'Name, Klasse, Lehrkraft' },
  { key: 'schoolPhone', label: 'Telefon Schule / Kita', placeholder: '0…', phone: true },
  { key: 'contacts', label: 'Weitere Notfallkontakte', placeholder: 'z. B. Oma Heidi 0171 …', multi: true },
  { key: 'notes', label: 'Wichtig zu wissen', placeholder: 'z. B. hat Angst vor Hunden, Impfpass liegt im Flurschrank', multi: true },
];

export const hasEmergency = (c: Child) => !!c.emergency && Object.values(c.emergency).some(v => !!v?.trim());

/** Bearbeiten in den Einstellungen, zugeklappt, damit die Seite nicht überladen wirkt. */
export function EmergencyEdit({ child }: { child: Child }) {
  const { update } = useFamily();
  const [open, setOpen] = useState(false);
  const e = child.emergency ?? {};
  const set = (k: keyof Emergency, v: string) => update(d => ({ ...d, children: d.children.map(c => (c.id === child.id ? { ...c, emergency: { ...(c.emergency ?? {}), [k]: v } } : c)) }));
  return (
    <View style={{ paddingLeft: 50, gap: 8 }}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" style={s.row}>
        <Text style={{ color: C.danger, fontWeight: '800' }}>🆘 Notfall-Karte {hasEmergency(child) ? '✓' : '(leer)'} {open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 8, backgroundColor: '#fff5f5', borderRadius: 16, padding: 12 }}>
          <Text style={[s.muted, { fontSize: 13 }]}>Nur eintragen, was im Notfall wirklich hilft. Sehen können das alle Erwachsenen eurer Familie, nicht die Kinder.</Text>
          {FIELDS.map(f => (
            <View key={f.key} style={{ gap: 4 }}>
              <Text style={s.label}>{f.label}</Text>
              <TextInput style={[s.input, f.multi && { minHeight: 60, textAlignVertical: 'top' }]} multiline={f.multi} value={e[f.key] ?? ''} onChangeText={v => set(f.key, v)}
                placeholder={f.placeholder} keyboardType={f.phone ? 'phone-pad' : 'default'} accessibilityLabel={`${f.label} ${child.name}`} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Ansicht im Notfall: groß, klar, Telefonnummern antippbar. */
export function EmergencyCard({ child, onClose }: { child: Child; onClose: () => void }) {
  const e = child.emergency ?? {};
  const age = ageOf(child);
  const call = (n?: string) => n && Linking.openURL('tel:' + n.replace(/[^\d+]/g, '')).catch(() => {});
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,21,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={[{ backgroundColor: C.surface, borderRadius: 26, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' }, SHADOW.lg]}>
          <View style={[s.row, { backgroundColor: C.danger, padding: 18, alignItems: 'center', flexWrap: 'nowrap' }]}>
            <Avatar name={child.name} color={child.color} photo={child.photo} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>NOTFALL-KARTE</Text>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{child.name}</Text>
              <Text style={{ color: '#ffffffd0' }}>{[age !== undefined && `${age} Jahre`, child.birthday && `geb. ${child.birthday.split('-').reverse().join('.')}`, gradeLabel(child)].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
            {!hasEmergency(child) && <Text style={s.muted}>Noch nichts eingetragen. Mama oder Papa füllen die Karte unter ⚙️ › Familie aus.</Text>}
            {FIELDS.filter(f => e[f.key]?.trim()).map(f => (
              <View key={f.key} style={{ gap: 2 }}>
                <Text style={s.label}>{f.label}</Text>
                {f.phone
                  ? <Pressable onPress={() => call(e[f.key])} accessibilityRole="link"><Text style={{ color: C.accent, fontSize: 20, fontWeight: '800' }}>{e[f.key]}</Text></Pressable>
                  : <Text style={[s.text, { fontSize: 17, fontWeight: f.key === 'allergies' || f.key === 'meds' ? '800' : '500', color: f.key === 'allergies' ? C.danger : C.fg }]}>{e[f.key]}</Text>}
              </View>
            ))}
            <Text style={[s.muted, { fontSize: 13 }]}>Im echten Notfall immer zuerst 112 anrufen.</Text>
            <View style={s.row}>
              {Platform.OS !== 'web' && <Button color={C.danger} title="112" onPress={() => call('112')} />}
              <Button ghost title="Schließen" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
