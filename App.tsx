import { StatusBar } from 'expo-status-bar';
import { IcloudSetup } from './src/screens/IcloudSetup';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { cloudEnabled, cloudStore, DeviceLink, getLink, signOut } from './src/data/cloud';
import { FamilyProvider, useFamily } from './src/data/FamilyContext';
import { Connect } from './src/screens/Connect';
import { Avatar } from './src/ui/Avatar';
import { CalendarLink } from './src/screens/CalendarLink';
import { Devices } from './src/screens/Devices';
import { Family, Holiday, ParentPin } from './src/screens/Family';
import { Timetable } from './src/screens/Timetable';
import { Board } from './src/screens/Board';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { birthdaysOn, isAdmin, parentsOf, payAllowances, peopleOf, today } from './src/data/logic';
import { MoneyTab } from './src/screens/Gifts';
import { Food } from './src/screens/Food';
import { Calendar } from './src/screens/Calendar';
import { Learn } from './src/screens/Learn';
import { Manage } from './src/screens/Manage';
import { Points } from './src/screens/Points';
import { Setup } from './src/screens/Setup';
import { Today } from './src/screens/Today';
import { Button } from './src/ui/Button';
import { C, grad, installWebStyles, s, SHADOW } from './src/ui/theme';

installWebStyles();

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

type Section = 'familie' | 'aufgaben' | 'ferien' | 'kalender' | 'geraete';
const SETTINGS: { value: Section; label: string; cloud?: boolean }[] = [
  { value: 'familie', label: '👪 Familie' }, { value: 'aufgaben', label: '✅ Aufgaben' }, { value: 'ferien', label: '🏖️ Ferien' },
  { value: 'kalender', label: '📅 Kalender', cloud: true }, { value: 'geraete', label: '📱 Geräte', cloud: true },
];

function Root() {
  const { data, loading, replace, saveError, update } = useFamily();
  const cloud = useContext(LinkCtx);
  const ownChild = cloud?.link.role === 'kind' ? cloud.link.childId : undefined;
  const [profile, setProfile] = useState<Profile | null>(ownChild ? { kind: 'kind', id: ownChild } : null);
  const [tab, setTab] = useState<Tab>('heute');
  const [askPin, setAskPin] = useState<string | null>(null);
  const scroller = useRef<any>(null);
  const [board, setBoardState] = useState(false);
  const [section, setSection] = useState<Section>('familie');
  const { width: winW } = useWindowDimensions();
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
    const hour = new Date().getHours();
    const hello = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 22 ? 'Guten Abend' : 'Gute Nacht';
    const asking = people.find(p => p.id === askPin);
    return (
      <SafeAreaView style={[s.screen, grad('#5b4cf0', '#ff6a5c', 150)]}>
        <ScrollView contentContainerStyle={[s.pad, { maxWidth: 820, paddingTop: 48, paddingBottom: 48, gap: 26 }]}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#ffffffcc', fontSize: 15, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>{hello}</Text>
            <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }}>{data.family.name}</Text>
            <Text style={{ color: '#ffffffd9', fontSize: 18, fontWeight: '600' }}>Wer bist du?</Text>
          </View>
          <View style={[s.row, { justifyContent: 'center', gap: 14 }]}>
            {people.map(p => {
              const bday = p.role === 'kind' && birthdaysOn(data, today()).some(b => b.child.id === p.id);
              return (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name}
                  onPress={() => { setPinErr(false); setPin(''); if (p.role === 'kind') { setProfile({ kind: 'kind', id: p.id }); setTab('heute'); } else setAskPin(p.id); }}
                  style={({ pressed }) => [{ width: 140, alignItems: 'center', paddingTop: 20, paddingBottom: 16, gap: 10, borderRadius: 26, backgroundColor: '#ffffff', ...SHADOW.lg, transform: [{ scale: pressed ? 0.96 : askPin === p.id ? 1.04 : 1 }], borderWidth: 3, borderColor: askPin === p.id ? p.color : 'transparent' }]}>
                  <View style={{ padding: 4, borderRadius: 50, ...grad(p.color, p.color + '66') }}>
                    <View style={{ borderRadius: 46, borderWidth: 3, borderColor: '#fff' }}>
                      <Avatar name={p.name} color={p.color} photo={p.photo} size={76} />
                    </View>
                  </View>
                  {bday && <Text style={{ position: 'absolute', top: 6, right: 10, fontSize: 26 }}>🎂</Text>}
                  <Text style={[s.h2, { textAlign: 'center', fontSize: 18 }]} numberOfLines={1}>{p.name}</Text>
                  <View style={[s.chip, { backgroundColor: p.role === 'kind' ? p.color + '1f' : C.surface2 }]}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: p.role === 'kind' ? p.color : C.muted }}>{p.role === 'kind' ? 'Kind' : `🔒 ${p.title || (p.admin ? 'Eltern' : 'Familie')}`}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {asking && (
            <View style={[s.card, { maxWidth: 380, alignSelf: 'center', width: '100%', ...SHADOW.lg, alignItems: 'center' }]}>
              <Avatar name={asking.name} color={asking.color} photo={asking.photo} size={52} />
              <Text style={s.h2}>PIN für {asking.name}</Text>
              <TextInput autoFocus style={[s.input, { fontSize: 28, letterSpacing: 14, textAlign: 'center', width: '100%', fontWeight: '800' }]} value={pin} secureTextEntry keyboardType="number-pad"
                onSubmitEditing={tryPin} placeholder="••••"
                onChangeText={t => { setPin(t.replace(/\D/g, '').slice(0, 4)); setPinErr(false); }} />
              {pinErr && <Text style={{ color: C.danger, textAlign: 'center' }}>{(() => { const w = parentsOf(data).find(p => p.id === askPin); return w && !isAdmin(w) && !w.pin ? 'Für diese Person ist noch keine PIN festgelegt. Mama oder Papa legt sie unter ⚙️ › Familie fest.' : 'PIN stimmt nicht.'; })()}</Text>}
              <View style={[s.row, { width: '100%' }]}>
                <Button title="Weiter" disabled={pin.length !== 4} onPress={tryPin} style={{ flex: 1 }} />
                <Button ghost title="Abbrechen" onPress={() => setAskPin(null)} />
              </View>
            </View>
          )}
          {!ownChild && (
            <Pressable accessibilityRole="button" accessibilityLabel="Wandansicht" onPress={() => setBoard(true)}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, maxWidth: 480, alignSelf: 'center', width: '100%', padding: 16, borderRadius: 22, backgroundColor: '#ffffff26', borderWidth: 1, borderColor: '#ffffff55', opacity: pressed ? 0.8 : 1 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>📺</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Wandansicht starten</Text>
                <Text style={{ color: '#ffffffcc', fontSize: 13 }}>Alles auf einen Blick fürs Tablet an der Wand. Beenden mit PIN.</Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 22 }}>›</Text>
            </Pressable>
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
  const wide = winW >= 700;
  const me = peopleOf(data).find(p => p.id === profile.id) ?? { name: 'Eltern', color: C.accent };
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const hr = new Date().getHours();
  const greet = hr < 11 ? 'Guten Morgen' : hr < 17 ? 'Hallo' : 'Guten Abend';

  return (
    <SafeAreaView style={s.screen}>
      <View style={[{ backgroundColor: C.bg + 'e6', zIndex: 5 }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', position: 'sticky', top: 0 } as any) : null]}>
        <View style={[s.row, { flexWrap: 'nowrap', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, maxWidth: 1100, width: '100%', alignSelf: 'center' }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.muted, { fontSize: 13, fontWeight: '700' }]} numberOfLines={1}>{dateStr} · {data.family.name}</Text>
            <Text style={[s.h1, { fontSize: wide ? 28 : 24 }]} numberOfLines={1}>{tab === 'aufgaben' ? 'Einstellungen' : wide ? `${greet}, ${me.name}` : `Hallo ${me.name} 👋`}</Text>
          </View>
          {admin && (
            <Pressable accessibilityRole="button" accessibilityLabel="Verwalten" onPress={() => setTab(tab === 'aufgaben' ? 'heute' : 'aufgaben')}
              style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === 'aufgaben' ? C.accent : C.surface, ...SHADOW.sm }}>
              <Text style={{ fontSize: 20 }}>{tab === 'aufgaben' ? '✕' : '⚙️'}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={`${me.name}, Person wechseln`}
            onPress={() => { setProfile(null); setTab('heute'); }}
            style={{ borderRadius: 30, padding: 3, ...grad(me.color, me.color + '55') }}>
            <View style={{ borderRadius: 26, borderWidth: 2, borderColor: '#fff' }}>
              <Avatar name={me.name} color={me.color} photo={(me as any).photo} size={42} />
            </View>
          </Pressable>
        </View>
      </View>
      <ScrollView ref={scroller} contentContainerStyle={[s.pad, { paddingTop: 6, paddingBottom: 120 }]}>
        {saveError && <Text style={{ color: C.danger, fontWeight: '700' }}>{saveError}</Text>}
        {tab === 'heute' && <Today childIds={childIds} parent={parent} />}
        {tab === 'kalender' && <Calendar childIds={childIds} parent={parent} meId={profile.id} />}
        {tab === 'kalender' && <Timetable childIds={childIds} parent={parent} />}
        {tab === 'lernen' && <Learn childIds={childIds} parent={parent} meId={profile.id} admin={admin} />}
        {tab === 'punkte' && <Points childIds={childIds} parent={parent} admin={admin} />}
        {tab === 'geld' && <MoneyTab childIds={childIds} parent={parent} meId={profile.id} />}
        {tab === 'essen' && <Food who={me.name} meId={profile.id} parent={parent} />}
        {tab === 'aufgaben' && admin && (
          <View style={[s.row, { gap: 8 }]} accessibilityRole="tablist">
            {SETTINGS.filter(x => cloud || !x.cloud).map(x => (
              <Pressable key={x.value} accessibilityRole="tab" accessibilityState={{ selected: section === x.value }} onPress={() => setSection(x.value)}
                style={[s.chip, { paddingHorizontal: 16, paddingVertical: 11, backgroundColor: section === x.value ? C.fg : C.surface }, section === x.value ? null : SHADOW.sm]}>
                <Text style={{ fontWeight: '700', color: section === x.value ? '#fff' : C.fg }}>{x.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {tab === 'aufgaben' && admin && section === 'familie' && <Family />}
        {tab === 'aufgaben' && admin && section === 'familie' && <ParentPin />}
        {tab === 'aufgaben' && admin && section === 'aufgaben' && <Manage onReset={cloud ? undefined : () => { replace(null); setProfile(null); }} />}
        {tab === 'aufgaben' && admin && section === 'ferien' && <Holiday />}
        {tab === 'aufgaben' && admin && section === 'kalender' && cloud && <IcloudSetup />}
        {tab === 'aufgaben' && admin && section === 'kalender' && cloud && <CalendarLink link={cloud.link} />}
        {tab === 'aufgaben' && admin && section === 'geraete' && cloud && <Devices link={cloud.link} onSignOut={cloud.unlink} />}
      </ScrollView>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center', paddingHorizontal: 12 }}>
        <View style={[{ flexDirection: 'row', maxWidth: 640, width: '100%', padding: 6, borderRadius: 28, backgroundColor: '#ffffffeb', ...SHADOW.lg, borderWidth: 1, borderColor: '#ffffff' }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as any) : null]}>
          {shownTabs.map(t => {
            const on = tab === t.value;
            return (
              <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.badge ? `${t.label}, ${t.badge} neu` : t.label}
                onPress={() => setTab(t.value)}
                style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 22, gap: 1 }, on ? grad(C.accent, '#7d5cf6') : null, on ? SHADOW.md : null]}>
                <View>
                  <Text style={{ fontSize: 21, opacity: on ? 1 : 0.7 }}>{TAB_ICON[t.value]}</Text>
                  {!!t.badge && (
                    <View style={{ position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{t.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: on ? '#fff' : C.muted }} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
