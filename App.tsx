import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { cloudEnabled, cloudStore, DeviceLink, getLink, signOut } from './src/data/cloud';
import { FamilyProvider, useFamily } from './src/data/FamilyContext';
import { Connect } from './src/screens/Connect';
import { Avatar } from './src/ui/Avatar';
import { CalendarLink } from './src/screens/CalendarLink';
import { Devices } from './src/screens/Devices';
import { Family, Holiday } from './src/screens/Family';
import { Timetable } from './src/screens/Timetable';
import { Board } from './src/screens/Board';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { birthdaysOn, isAdmin, parentsOf, payAllowances, peopleOf, today } from './src/data/logic';
import { Money } from './src/screens/Money';
import { Food } from './src/screens/Food';
import { Calendar } from './src/screens/Calendar';
import { Grades } from './src/screens/Grades';
import { Learn } from './src/screens/Learn';
import { Manage } from './src/screens/Manage';
import { Points } from './src/screens/Points';
import { Setup } from './src/screens/Setup';
import { Today } from './src/screens/Today';
import { Button } from './src/ui/Button';
import { C, s } from './src/ui/theme';

type Tab = 'heute' | 'kalender' | 'lernen' | 'punkte' | 'geld' | 'essen' | 'aufgaben';
type Profile = { kind: 'eltern'; id: string } | { kind: 'kind'; id: string };

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


const TAB_ICON: Record<Tab, string> = { heute: '🏠', kalender: '📅', lernen: '📚', punkte: '⭐', geld: '💶', essen: '🍽️', aufgaben: '⚙️' };

function Root() {
  const { data, loading, replace, saveError, update } = useFamily();
  const cloud = useContext(LinkCtx);
  const ownChild = cloud?.link.role === 'kind' ? cloud.link.childId : undefined;
  const [profile, setProfile] = useState<Profile | null>(ownChild ? { kind: 'kind', id: ownChild } : null);
  const [tab, setTab] = useState<Tab>('heute');
  const [askPin, setAskPin] = useState<string | null>(null);
  const scroller = useRef<any>(null);
  const [board, setBoardState] = useState(false);
  // Fälliges Taschengeld buchen (idempotent, auch bei mehreren Geräten)
  useEffect(() => { if (data && payAllowances(data) !== data) update(d => payAllowances(d)); }, [data?.money, data && today()]);
  useEffect(() => { AsyncStorage.getItem('familienplaner:board').then(v => v === '1' && setBoardState(true), () => {}); }, []);
  const setBoard = (on: boolean) => { setBoardState(on); AsyncStorage.setItem('familienplaner:board', on ? '1' : '0').catch(() => {}); };
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [tab]);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);

  if (loading) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!data) return <SafeAreaView style={s.screen}>{cloud ? (
    <View style={s.pad}>
      <Text style={s.text}>{saveError ?? 'Keine Familiendaten gefunden.'}</Text>
      <Button ghost title="Gerät neu einrichten" onPress={cloud.unlink} />
    </View>
  ) : <Setup />}</SafeAreaView>;

  if (board) return <SafeAreaView style={s.screen}><Board onExit={() => { setBoard(false); setProfile(null); }} /></SafeAreaView>;

  const people = peopleOf(data).filter(p => p.role === 'eltern' || !ownChild || p.id === ownChild);
  const parent = profile?.kind === 'eltern';
  // Admin = volle Rechte. Andere Erwachsene (z. B. Oma, Opa) sehen alles, haken ab und tragen Termine ein, aber keine Einstellungen, Geld und Punkte.
  const admin = parent && isAdmin(parentsOf(data).find(p => p.id === profile?.id) ?? parentsOf(data)[0]);
  if (!profile) {
    const tryPin = () => {
      const who = parentsOf(data).find(p => p.id === askPin);
      const ok = isAdmin(who) ? pin === data.family.parentPin : !!who?.pin && pin === who.pin;
      if (ok) { setProfile({ kind: 'eltern', id: askPin! }); setAskPin(null); setPin(''); setTab('heute'); }
      else setPinErr(true);
    };
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={[s.pad, { maxWidth: 720, paddingTop: 32 }]}>
          <Text style={[s.h1, { textAlign: 'center' }]}>{data.family.name}</Text>
          <Text style={[s.muted, { textAlign: 'center', fontSize: 18 }]}>Wer bist du?</Text>
          <View style={[s.row, { justifyContent: 'center', gap: 14 }]}>
            {people.map(p => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name}
                onPress={() => { setPinErr(false); setPin(''); if (p.role === 'kind') { setProfile({ kind: 'kind', id: p.id }); setTab('heute'); } else setAskPin(p.id); }}
                style={({ pressed }) => [s.card, { width: 150, alignItems: 'center', paddingVertical: 22, borderWidth: 3, borderColor: askPin === p.id ? p.color : 'transparent', opacity: pressed ? 0.8 : 1 }]}>
                <Avatar name={p.name} color={p.color} photo={p.photo} size={72} />
                {p.role === 'kind' && birthdaysOn(data, today()).some(b => b.child.id === p.id) && <Text style={{ position: 'absolute', top: 8, right: 12, fontSize: 28 }}>🎂</Text>}
                <Text style={[s.h2, { textAlign: 'center' }]} numberOfLines={1}>{p.name}</Text>
                {p.role === 'eltern' && <Text style={[s.muted, { fontSize: 12 }]}>{p.admin ? 'mit PIN' : 'eigene PIN'}</Text>}
              </Pressable>
            ))}
          </View>
          {!ownChild && (
            <Pressable accessibilityRole="button" onPress={() => setBoard(true)}
              style={({ pressed }) => [s.card, { flexDirection: 'row', alignItems: 'center', gap: 14, maxWidth: 480, alignSelf: 'center', width: '100%', opacity: pressed ? 0.8 : 1 }]}>
              <Text style={{ fontSize: 34 }}>📺</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>Wandansicht</Text>
                <Text style={s.muted}>Alles auf einen Blick, nur zum Ansehen. Für ein Tablet an der Wand. Bleibt nach dem Neustart an, beenden mit PIN.</Text>
              </View>
            </Pressable>
          )}
          {askPin && (
            <View style={[s.card, { maxWidth: 360, alignSelf: 'center', width: '100%' }]}>
              <Text style={s.label}>PIN für {people.find(p => p.id === askPin)?.name}</Text>
              <TextInput autoFocus style={[s.input, { fontSize: 24, letterSpacing: 8, textAlign: 'center' }]} value={pin} secureTextEntry keyboardType="number-pad"
                onSubmitEditing={tryPin}
                onChangeText={t => { setPin(t.replace(/\D/g, '').slice(0, 4)); setPinErr(false); }} />
              {pinErr && <Text style={{ color: C.danger }}>{(() => { const w = parentsOf(data).find(p => p.id === askPin); return w && !isAdmin(w) && !w.pin ? 'Für diese Person ist noch keine PIN festgelegt. Mama oder Papa legt sie unter ⚙️ › Familie fest.' : 'PIN stimmt nicht.'; })()}</Text>}
              <View style={s.row}>
                <Button title="Weiter" disabled={pin.length !== 4} onPress={tryPin} style={{ flex: 1 }} />
                <Button ghost title="Abbrechen" onPress={() => setAskPin(null)} />
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const childIds = profile.kind === 'kind' ? [profile.id] : data.children.map(c => c.id);
  const sheetBadge = (data.worksheets ?? []).filter(w => childIds.includes(w.childId) && w.status === (parent ? 'abgegeben' : 'offen')).length
    + (parent ? (data.topics ?? []).filter(t => !(data.worksheets ?? []).some(w => w.topicId === t.id)).length : 0);
  const reqBadge = admin ? (data.requests ?? []).length + (data.ideas ?? []).length : 0;
  const tabs: { value: Tab; label: string; badge?: number }[] = [
    { value: 'heute', label: 'Heute' }, { value: 'kalender', label: 'Kalender' },
    { value: 'lernen', label: 'Lernen', badge: sheetBadge }, { value: 'punkte', label: 'Punkte', badge: reqBadge }, { value: 'geld', label: 'Geld' }, { value: 'essen', label: 'Essen' },
  ];
  const shownTabs = tabs.filter(t => !parent || admin || !['punkte', 'geld'].includes(t.value));
  const me = peopleOf(data).find(p => p.id === profile.id) ?? { name: 'Eltern', color: C.accent };
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={[s.row, { flexWrap: 'nowrap', paddingHorizontal: 16, paddingVertical: 10, maxWidth: 1100, width: '100%', alignSelf: 'center' }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.h2, { fontSize: 18 }]} numberOfLines={1}>{data.family.name}</Text>
            <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{dateStr}</Text>
          </View>
          {admin && (
            <Pressable accessibilityRole="button" accessibilityLabel="Verwalten" onPress={() => setTab('aufgaben')}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === 'aufgaben' ? me.color + '22' : C.bg }}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`${me.name}, Person wechseln`}
            onPress={() => { setProfile(null); setTab('heute'); }}
            style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.bg, borderRadius: 99, paddingVertical: 4, paddingLeft: 4, paddingRight: 12, gap: 8 }]}>
            <Avatar name={me.name} color={me.color} photo={(me as any).photo} size={34} />
            <View>
              <Text style={{ fontWeight: '800', color: C.fg }}>{me.name}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>wechseln</Text>
            </View>
          </Pressable>
        </View>
      </View>
      <ScrollView ref={scroller} contentContainerStyle={[s.pad, { paddingBottom: 32 }]}>
        {saveError && <Text style={{ color: C.danger, fontWeight: '700' }}>{saveError}</Text>}
        {tab === 'heute' && <Today childIds={childIds} parent={parent} />}
        {tab === 'kalender' && <Calendar childIds={childIds} parent={parent} />}
        {tab === 'kalender' && <Timetable childIds={childIds} parent={parent} />}
        {tab === 'lernen' && <Learn childIds={childIds} parent={parent} />}
        {tab === 'punkte' && <Points childIds={childIds} parent={parent} />}
        {tab === 'lernen' && admin && <Grades />}
        {tab === 'geld' && <Money childIds={childIds} parent={parent} />}
        {tab === 'essen' && <Food who={me.name} />}
        {tab === 'aufgaben' && admin && <Holiday />}
        {tab === 'aufgaben' && admin && <Family />}
        {tab === 'aufgaben' && admin && cloud && <CalendarLink link={cloud.link} />}
        {tab === 'aufgaben' && admin && cloud && <Devices link={cloud.link} onSignOut={cloud.unlink} />}
        {tab === 'aufgaben' && admin && <Manage onReset={cloud ? undefined : () => { replace(null); setProfile(null); }} />}
      </ScrollView>
      <View style={{ backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: 'row', maxWidth: 720, width: '100%', alignSelf: 'center' }}>
          {shownTabs.map(t => {
            const on = tab === t.value;
            return (
              <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.badge ? `${t.label}, ${t.badge} neu` : t.label}
                onPress={() => setTab(t.value)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 3, borderRadius: 99, backgroundColor: on ? me.color + '22' : 'transparent' }}>
                  <Text style={{ fontSize: 22, opacity: on ? 1 : 0.55 }}>{TAB_ICON[t.value]}</Text>
                  {!!t.badge && (
                    <View style={{ position: 'absolute', top: -2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? C.fg : C.muted }} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
