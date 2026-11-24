import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { cloudEnabled, cloudStore, DeviceLink, getLink, signOut } from './src/data/cloud';
import { FamilyProvider, useFamily } from './src/data/FamilyContext';
import { Connect } from './src/screens/Connect';
import { Devices } from './src/screens/Devices';
import { Calendar } from './src/screens/Calendar';
import { Grades } from './src/screens/Grades';
import { Learn } from './src/screens/Learn';
import { Manage } from './src/screens/Manage';
import { Points } from './src/screens/Points';
import { Setup } from './src/screens/Setup';
import { Today } from './src/screens/Today';
import { Button, Segmented } from './src/ui/Button';
import { C, s } from './src/ui/theme';

type Tab = 'heute' | 'kalender' | 'lernen' | 'punkte' | 'noten' | 'aufgaben';
type Profile = { kind: 'eltern' } | { kind: 'kind'; id: string };

const LinkCtx = createContext<{ link: DeviceLink; unlink: () => void } | null>(null);

export default function App() {
  if (cloudEnabled) return <CloudApp />;
  return (
    <FamilyProvider>
      <StatusBar style="dark" />
      <Root />
    </FamilyProvider>
  );
}

function CloudApp() {
  const [link, setLinkState] = useState<DeviceLink | null | undefined>(undefined);
  useEffect(() => { getLink().then(setLinkState, () => setLinkState(null)); }, []);
  const store = useMemo(() => (link ? cloudStore(link.familyId) : null), [link?.familyId]);
  if (link === undefined) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!link || !store) return (
    <FamilyProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={s.screen}><Connect onLinked={setLinkState} /></SafeAreaView>
    </FamilyProvider>
  );
  return (
    <LinkCtx.Provider value={{ link, unlink: () => { signOut().finally(() => setLinkState(null)); } }}>
      <FamilyProvider key={link.familyId} store={store}>
        <StatusBar style="dark" />
        <Root />
      </FamilyProvider>
    </LinkCtx.Provider>
  );
}

function Root() {
  const { data, loading, replace, saveError } = useFamily();
  const cloud = useContext(LinkCtx);
  const ownChild = cloud?.link.role === 'kind' ? cloud.link.childId : undefined;
  const [profile, setProfile] = useState<Profile | null>(ownChild ? { kind: 'kind', id: ownChild } : null);
  const [tab, setTab] = useState<Tab>('heute');
  const [askPin, setAskPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);

  if (loading) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!data) return <SafeAreaView style={s.screen}>{cloud ? (
    <View style={s.pad}>
      <Text style={s.text}>{saveError ?? 'Keine Familiendaten gefunden.'}</Text>
      <Button ghost title="Gerät neu einrichten" onPress={cloud.unlink} />
    </View>
  ) : <Setup />}</SafeAreaView>;

  const parent = profile?.kind === 'eltern';
  if (!profile) {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={[s.pad, { maxWidth: 560 }]}>
          <Text style={s.h1}>{data.family.name}</Text>
          <Text style={s.muted}>Wer bist du?</Text>
          {data.children.filter(c => !ownChild || c.id === ownChild).map(c => (
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
  const tabs: { value: Tab; label: string }[] = [{ value: 'heute', label: 'Heute' }, { value: 'kalender', label: 'Kalender' }, { value: 'lernen', label: sheetBadge ? `Lernen (${sheetBadge})` : 'Lernen' }, { value: 'punkte', label: parent && (data.requests ?? []).length ? `Punkte (${(data.requests ?? []).length})` : 'Punkte' }];
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
        {saveError && <Text style={{ color: C.danger, fontWeight: '700' }}>{saveError}</Text>}
        {tab === 'heute' && <Today childIds={childIds} parent={parent} />}
        {tab === 'kalender' && <Calendar childIds={childIds} parent={parent} />}
        {tab === 'lernen' && <Learn childIds={childIds} parent={parent} />}
        {tab === 'punkte' && <Points childIds={childIds} parent={parent} />}
        {tab === 'noten' && parent && <Grades />}
        {tab === 'aufgaben' && parent && cloud && <Devices link={cloud.link} onSignOut={cloud.unlink} />}
        {tab === 'aufgaben' && parent && <Manage onReset={cloud ? undefined : () => { replace(null); setProfile(null); }} />}
      </ScrollView>
    </SafeAreaView>
  );
}
