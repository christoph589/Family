import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { FamilyProvider, useFamily } from './src/data/FamilyContext';
import { Grades } from './src/screens/Grades';
import { Learn } from './src/screens/Learn';
import { Manage } from './src/screens/Manage';
import { Points } from './src/screens/Points';
import { Setup } from './src/screens/Setup';
import { Today } from './src/screens/Today';
import { Button, Segmented } from './src/ui/Button';
import { C, s } from './src/ui/theme';

type Tab = 'heute' | 'lernen' | 'punkte' | 'noten' | 'aufgaben';
type Profile = { kind: 'eltern' } | { kind: 'kind'; id: string };

export default function App() {
  return (
    <FamilyProvider>
      <StatusBar style="dark" />
      <Root />
    </FamilyProvider>
  );
}

function Root() {
  const { data, loading, replace, saveError } = useFamily();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('heute');
  const [askPin, setAskPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);

  if (loading) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!data) return <SafeAreaView style={s.screen}><Setup /></SafeAreaView>;

  const parent = profile?.kind === 'eltern';
  if (!profile) {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={[s.pad, { maxWidth: 560 }]}>
          <Text style={s.h1}>{data.family.name}</Text>
          <Text style={s.muted}>Wer bist du?</Text>
          {data.children.map(c => (
            <Pressable key={c.id} onPress={() => { setProfile({ kind: 'kind', id: c.id }); setTab('heute'); }}
              style={[s.card, s.row, { flexWrap: 'nowrap', borderLeftWidth: 6, borderLeftColor: c.color }]}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{c.name[0]}</Text>
              </View>
              <Text style={s.h2}>{c.name}</Text>
            </Pressable>
          ))}
          {!askPin ? (
            <Button ghost title="Eltern" onPress={() => setAskPin(true)} />
          ) : (
            <View style={s.card}>
              <Text style={s.label}>Eltern-PIN</Text>
              <TextInput autoFocus style={s.input} value={pin} secureTextEntry keyboardType="number-pad"
                onChangeText={t => { setPin(t.replace(/\D/g, '').slice(0, 4)); setPinErr(false); }} />
              {pinErr && <Text style={{ color: C.danger }}>PIN stimmt nicht.</Text>}
              <Button title="Weiter" onPress={() => {
                if (pin === data.family.parentPin) { setProfile({ kind: 'eltern' }); setAskPin(false); setPin(''); }
                else setPinErr(true);
              }} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const childIds = profile.kind === 'kind' ? [profile.id] : data.children.map(c => c.id);
  const sheetBadge = (data.worksheets ?? []).filter(w => childIds.includes(w.childId) && w.status === (parent ? 'abgegeben' : 'offen')).length
    + (parent ? (data.topics ?? []).filter(t => !(data.worksheets ?? []).some(w => w.topicId === t.id)).length : 0);
  const tabs: { value: Tab; label: string }[] = [{ value: 'heute', label: 'Heute' }, { value: 'lernen', label: sheetBadge ? `Lernen (${sheetBadge})` : 'Lernen' }, { value: 'punkte', label: parent && (data.requests ?? []).length ? `Punkte (${(data.requests ?? []).length})` : 'Punkte' }];
  if (parent) tabs.push({ value: 'noten', label: 'Noten' }, { value: 'aufgaben', label: 'Aufgaben' });
  const who = profile.kind === 'kind' ? data.children.find(c => c.id === profile.id)?.name : 'Eltern';
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.pad}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.h1}>{data.family.name}</Text>
            <Text style={s.muted}>{dateStr} · {who}</Text>
          </View>
          <View style={[s.row, { flexShrink: 1, maxWidth: '100%' }]}>
            <Segmented value={tab} onChange={setTab} options={tabs} />
            <Button ghost title="Wechseln" onPress={() => { setProfile(null); setTab('heute'); }} />
          </View>
        </View>
        {saveError && <Text style={{ color: C.danger, fontWeight: '700' }}>Speicher auf diesem Gerät ist voll. Bitte alte Themen mit Fotos löschen.</Text>}
        {tab === 'heute' && <Today childIds={childIds} parent={parent} />}
        {tab === 'lernen' && <Learn childIds={childIds} parent={parent} />}
        {tab === 'punkte' && <Points childIds={childIds} parent={parent} />}
        {tab === 'noten' && parent && <Grades />}
        {tab === 'aufgaben' && parent && <Manage onReset={() => { replace(null); setProfile(null); }} />}
      </ScrollView>
    </SafeAreaView>
  );
}
