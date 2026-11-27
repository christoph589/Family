import { StatusBar } from 'expo-status-bar';
import { IcloudSetup } from './src/screens/IcloudSetup';
import { UntisSetup } from './src/screens/UntisSetup';
import { MoneySettings } from './src/screens/MoneySettings';
import { useUntisSync } from './src/data/untis';
import { googleReturn } from './src/data/icloud';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { cloudEnabled, cloudStore, DeviceLink, familyFlags, getLink, leaveSupport, signOut, supportBack } from './src/data/cloud';
import { Feature, isOn, setFlags, useFlags } from './src/data/flags';
import { FamilyProvider, useFamily } from './src/data/FamilyContext';
import { Connect } from './src/screens/Connect';
import { Landing } from './src/screens/Landing';
import { Operator } from './src/screens/Operator';
import { SupportSetup } from './src/screens/SupportSetup';
import { Avatar } from './src/ui/Avatar';
import { Icon, IconName } from './src/ui/Icon';
import { CalendarLink } from './src/screens/CalendarLink';
import { Devices } from './src/screens/Devices';
import { AiPrivacy, Family, Holiday, ParentPin } from './src/screens/Family';
import { WeatherSetup } from './src/ui/Weather';
import { TrainSetup } from './src/ui/Train';
import { Timetable } from './src/screens/Timetable';
import { Board } from './src/screens/Board';
import { Kiosk, wantsWall } from './src/ui/Kiosk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIG_SPLIT, splitPrepVocab } from './src/data/vocab';
import { birthdaysOn, extraStates, isAdmin, parentsOf, payAllowances, peopleOf, pruneAiPhotos, ensurePackTasks, today } from './src/data/logic';
import { PackSetup } from './src/screens/PackSetup';
import { AiConsent } from './src/ui/AiConsent';
import { OperatorEntry } from './src/ui/OperatorEntry';
import { PhotoCollector } from './src/screens/PhotoCollector';
import { loadHolidays } from './src/data/holidays';
import { MoneyTab } from './src/screens/Gifts';
import { PublicWishes } from './src/screens/Wishes';
import { Food } from './src/screens/Food';
import { Calendar } from './src/screens/Calendar';
import { Learn } from './src/screens/Learn';
import { Manage } from './src/screens/Manage';
import { Points } from './src/screens/Points';
import { Setup } from './src/screens/Setup';
import { Today } from './src/screens/Today';
import { Button } from './src/ui/Button';
import { LogoMark } from './src/ui/Logo';
import { BRAND } from './src/brand';
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

/** ?start zeigt die Startseite auch auf verbundenen Geräten (zum Ansehen und Teilen). */
const wantsStart = () => Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]start\b/.test(location.search);
/** ?wunsch=<token> zeigt einen geteilten Wunschzettel ohne Anmeldung. */
const wishToken = () => (Platform.OS === 'web' && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('wunsch') : null);
const wantsOperator = () => Platform.OS === 'web' && typeof location !== 'undefined' && /[?&]operator\b/.test(location.search);
const cleanUrl = () => { try { history.replaceState(null, '', location.pathname); } catch { /* egal */ } };

function CloudApp() {
  const [link, setLinkState] = useState<DeviceLink | null | undefined>(undefined);
  const [start, setStart] = useState(wantsStart());
  const [op, setOp] = useState(wantsOperator());
  const [back, setBack] = useState<DeviceLink | null>(null);
  const leave = () => { cleanUrl(); setStart(false); };
  const reload = () => Promise.all([getLink(), supportBack()]).then(([l, b]) => { setLinkState(l); setBack(b); }, () => setLinkState(null));
  useEffect(() => { reload(); }, []);
  const store = useMemo(() => (link ? cloudStore(link.familyId) : null), [link?.familyId]);
  const wish = wishToken();
  if (wish) return <SafeAreaView style={s.screen}><StatusBar style="dark" /><PublicWishes token={wish} /></SafeAreaView>;
  if (start) return <Landing onNew={leave} onLogin={leave} onKid={leave} />;
  if (op && link) return <SafeAreaView style={s.screen}><Operator onClose={() => { cleanUrl(); setOp(false); }} onEntered={() => { cleanUrl(); setOp(false); reload(); }} /></SafeAreaView>;
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
        <View style={{ flex: 1, flexDirection: 'column' }}>
        {back && (
          <View style={{ flexGrow: 0, flexShrink: 0, backgroundColor: C.ok, paddingHorizontal: 16, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '800', flexShrink: 1, fontSize: 13 }} numberOfLines={2}>🛟 Support-Modus: andere Familie, Änderungen sind echt.</Text>
            <Pressable onPress={() => leaveSupport().then(reload)} style={{ backgroundColor: '#ffffff33', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Zurück zu meiner Familie</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }}><Root /></View>
        </View>
      </FamilyProvider>
    </LinkCtx.Provider>
  );
}


const TAB_ICON: Record<Tab, IconName> = { heute: 'home', kalender: 'cal', lernen: 'book', punkte: 'star', geld: 'wallet', essen: 'food', aufgaben: 'home' };

type Section = 'familie' | 'aufgaben' | 'schule' | 'geld' | 'ferien' | 'kalender' | 'geraete';
const SETTINGS: { value: Section; label: string; hint: string; cloud?: boolean }[] = [
  { value: 'familie', label: '👪 Familie', hint: 'Personen, Fotos, PINs, Schule' }, { value: 'aufgaben', label: '✅ Aufgaben', hint: 'Aufgaben, Routinen, Haushalt' },
  { value: 'schule', label: '🏫 Stundenplan', hint: 'Hochladen, bearbeiten, WebUntis' },
  { value: 'geld', label: '💶 Geld', hint: 'Taschengeld und Spartöpfe' }, { value: 'ferien', label: '🏖️ Ferien', hint: 'Ferien und Feiertage' },
  { value: 'kalender', label: '📅 Kalender', hint: 'Handy-Kalender, Abo', cloud: true }, { value: 'geraete', label: '📱 Geräte', hint: 'Partner einladen, Kindergeräte', cloud: true },
];

function Root() {
  const { data, loading, replace, saveError, update } = useFamily();
  const cloud = useContext(LinkCtx);
  const ownChild = cloud?.link.role === 'kind' ? cloud.link.childId : undefined;
  const [profile, setProfile] = useState<Profile | null>(ownChild ? { kind: 'kind', id: ownChild } : null);
  const [tab, setTab] = useState<Tab>('heute');
  const [askPin, setAskPin] = useState<string | null>(null);
  const scroller = useRef<any>(null);
  const [board, setBoardState] = useState(wantsWall());
  const [section, setSection] = useState<Section>('familie');
  const [menu, setMenu] = useState(true); // Handy: erst Liste der Bereiche, dann ein Bereich
  const [askOut, setAskOut] = useState(false);
  const [profMenu, setProfMenu] = useState(false);
  // Vom Betreiber geschaltete Funktionen: beim Start und beim Zurückkommen in die App neu holen
  const flags = useFlags();
  const fidForFlags = cloud?.link.familyId;
  useEffect(() => {
    if (!fidForFlags) { setFlags({}); return; }
    const go = () => { familyFlags(fidForFlags).then(setFlags, () => {}); };
    go();
    if (typeof document === 'undefined') return;
    const h = () => { if (document.visibilityState === 'visible') go(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [fidForFlags]);
  useEffect(() => { if (['kalender', 'lernen', 'punkte', 'geld', 'essen'].includes(tab) && !isOn(tab as Feature, flags)) setTab('heute'); }, [flags, tab]);
  // Zurück von der Google-Kalender-Freigabe: nach der Eltern-PIN direkt zu Einstellungen › Kalender
  useEffect(() => { if (profile?.kind === 'eltern' && googleReturn) { setTab('aufgaben'); setSection('kalender'); setMenu(false); } }, [profile]);
  const { width: winW } = useWindowDimensions();
  const narrowSet = winW < 700;
  const showSec = !narrowSet || !menu;
  // Fälliges Taschengeld buchen (idempotent, auch bei mehreren Geräten)
  useEffect(() => { if (data && payAllowances(data) !== data) update(d => payAllowances(d)); }, [data?.money, data && today()]);
  useEffect(() => { if (data && ensurePackTasks(data) !== data) update(d => ensurePackTasks(d)); }, [data?.children]);
  useEffect(() => { if (data && !data.migrations?.includes(MIG_SPLIT)) update(d => splitPrepVocab(d)); }, [!!data, data?.migrations]);
  useEffect(() => { if (data && pruneAiPhotos(data) !== data) update(d => pruneAiPhotos(d)); }, [data?.exams, data?.topics, data && today()]);
  // Ferien für Kinder mit eigenem Bundesland nachladen
  const needStates = data ? extraStates(data).filter(st => { const x = data.settings?.autoHoliday?.extra?.[st]; const soon = new Date(); soon.setDate(soon.getDate() + 200); return data.settings?.autoHoliday?.on && (!x || x.validTo < today(soon)); }).join(',') : '';
  useEffect(() => {
    if (!needStates) return;
    needStates.split(',').forEach(st => loadHolidays(st).then(r => update(d => d.settings?.autoHoliday ? ({ ...d, settings: { ...d.settings, autoHoliday: { ...d.settings.autoHoliday, extra: { ...(d.settings.autoHoliday.extra ?? {}), [st]: r } } } }) : d), () => {}));
  }, [needStates]);
  useEffect(() => { AsyncStorage.getItem('familienplaner:board').then(v => v === '1' && setBoardState(true), () => {}); }, []);
  const setBoard = (on: boolean) => { setBoardState(on); AsyncStorage.setItem('familienplaner:board', on ? '1' : '0').catch(() => {}); };
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [tab]);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState(false);
  useUntisSync(data, update);

  if (loading) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!data) return <SafeAreaView style={s.screen}>{cloud ? (
    <View style={s.pad}>
      <Text style={s.text}>{saveError ?? 'Keine Familiendaten gefunden.'}</Text>
      <Button ghost title="Gerät neu einrichten" onPress={cloud.unlink} />
    </View>
  ) : <Setup />}</SafeAreaView>;

  if (board) return <SafeAreaView style={s.screen}><Kiosk><Board onExit={() => { setBoard(false); setProfile(null); if (wantsWall() && typeof history !== 'undefined') history.replaceState(null, '', location.pathname); }} /></Kiosk></SafeAreaView>;

  const people = peopleOf(data).filter(p => p.role === 'eltern' || !ownChild || p.id === ownChild);
  const parent = profile?.kind === 'eltern';
  // Admin = volle Rechte. Andere Erwachsene (z. B. Oma, Opa) sehen alles, haken ab und tragen Termine ein, aber keine Einstellungen, Geld und Punkte.
  const admin = parent && isAdmin(parentsOf(data).find(p => p.id === profile?.id) ?? parentsOf(data)[0]);
  if (!profile) {
    const tryPin = (pin_ = pin) => {
      const pin = pin_;
      if (askPin === '__out') { if (pin === data.family.parentPin) { setAskPin(null); setPin(''); cloud?.unlink(); } else { setPinErr(true); setPin(''); } return; }
      const who = parentsOf(data).find(p => p.id === askPin);
      const ok = isAdmin(who) ? pin === data.family.parentPin : !!who?.pin && pin === who.pin;
      if (ok) { setProfile({ kind: 'eltern', id: askPin! }); setAskPin(null); setPin(''); setTab('heute'); }
      else { setPinErr(true); setPin(''); }
    };
    const hour = new Date().getHours();
    const hello = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 22 ? 'Guten Abend' : 'Gute Nacht';
    const asking = people.find(p => p.id === askPin);
    return (
      <SafeAreaView style={[s.screen, grad('#3a7d74', '#2c5f58', 150)]}>
        <ScrollView contentContainerStyle={[s.pad, { maxWidth: 820, paddingTop: 48, paddingBottom: 48, gap: 26 }]}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={[s.row, { gap: 8, marginBottom: 6 }]}><LogoMark size={36} /><Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{BRAND.name}</Text></View>
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
          {cloud && (
            <Pressable accessibilityRole="button" onPress={() => { setPin(''); setPinErr(false); setAskPin('__out'); }} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }}>
              <Text style={{ color: '#ffffffcc', fontWeight: '700' }}>Abmelden</Text>
            </Pressable>
          )}
          {cloud && <OperatorEntry />}
        </ScrollView>
        {(asking || askPin === '__out') && (
          <Pressable onPress={() => setAskPin(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1530aa', paddingTop: 70, paddingHorizontal: 16 }}>
            <Pressable onPress={() => {}} style={{ cursor: 'auto' } as any}>
                <View style={[s.card, { maxWidth: 380, alignSelf: 'center', width: '100%', ...SHADOW.lg, alignItems: 'center' }]}>
                  {asking ? <Avatar name={asking.name} color={asking.color} photo={asking.photo} size={52} /> : null}
                  <Text style={s.h2}>{asking ? `PIN für ${asking.name}` : 'Gerät abmelden'}</Text>
                  {!asking && <Text style={[s.muted, { textAlign: 'center' }]}>Mit der Eltern-PIN bestätigen. Eure Daten bleiben gespeichert.</Text>}
                  <TextInput autoFocus style={[s.input, { fontSize: 28, letterSpacing: 14, textAlign: 'center', width: '100%', fontWeight: '800' }]} value={pin} secureTextEntry keyboardType="number-pad"
                    onSubmitEditing={() => tryPin()} placeholder="••••"
                    onChangeText={t => { const v = t.replace(/\D/g, '').slice(0, 4); setPin(v); setPinErr(false); if (v.length === 4) tryPin(v); }} />
                  {pinErr && <Text style={{ color: C.danger, textAlign: 'center' }}>{(() => { const w = parentsOf(data).find(p => p.id === askPin); return w && !isAdmin(w) && !w.pin ? 'Für diese Person ist noch keine PIN festgelegt. Mama oder Papa legt sie unter ⚙️ › Familie fest.' : 'PIN stimmt nicht.'; })()}</Text>}
                  <View style={[s.row, { width: '100%' }]}>
                    <Button ghost title="Abbrechen" onPress={() => setAskPin(null)} style={{ flex: 1 }} />
                  </View>
                </View>
            </Pressable>
          </Pressable>
        )}
      </SafeAreaView>
    );
  }

  const childIds = profile.kind === 'kind' ? [profile.id] : data.children.map(c => c.id);
  const sheetBadge = (data.worksheets ?? []).filter(w => childIds.includes(w.childId) && w.status === (parent ? 'abgegeben' : 'offen')).length
    + (parent ? (data.topics ?? []).filter(t => !(data.worksheets ?? []).some(w => w.topicId === t.id)).length : 0);
  const reqBadge = admin ? (data.requests ?? []).length + (data.ideas ?? []).length : 0;
  const wishBadge = admin ? (data.wishes ?? []).filter(w => w.status === 'neu').length : 0;
  const tabs: { value: Tab; label: string; badge?: number }[] = [
    { value: 'heute', label: 'Heute' }, { value: 'kalender', label: 'Kalender' },
    { value: 'lernen', label: 'Lernen', badge: sheetBadge }, { value: 'punkte', label: 'Punkte', badge: reqBadge }, { value: 'geld', label: 'Geld', badge: wishBadge }, { value: 'essen', label: 'Essen' },
  ];
  const shownTabs = tabs.filter(t => (!parent || admin || !['punkte', 'geld'].includes(t.value)) && (t.value === 'heute' || isOn(t.value as Feature, flags)));
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
            <Text style={[s.h1, { fontSize: wide ? 28 : 24 }]} numberOfLines={1}>{tab === 'aufgaben' ? 'Einstellungen' : wide ? `${greet}, ${me.name}` : `Hallo ${me.name}`}</Text>
          </View>
          {tab === 'aufgaben' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Einstellungen schließen" onPress={() => setTab('heute')}
              style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, ...SHADOW.sm }}>
              <Text style={{ fontSize: 20, color: '#fff', fontWeight: '800' }}>✕</Text>
            </Pressable>
          )}
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${me.name}, Menü`}
              onPress={() => setProfMenu(o => !o)}
              style={{ borderRadius: 30 }}>
              <Avatar name={me.name} color={me.color} photo={(me as any).photo} size={40} />
            </Pressable>
            {profMenu && (
              <>
                <Pressable onPress={() => setProfMenu(false)} style={[{ position: 'fixed' as any, left: 0, right: 0, top: 0, bottom: 0, zIndex: 20 }]} accessibilityLabel="Menü schließen" />
                <View style={[{ position: 'absolute', right: 0, top: 58, zIndex: 21, backgroundColor: C.surface, borderRadius: 18, paddingVertical: 6, minWidth: 220 }, SHADOW.lg]}>
                  <Text style={[s.label, { paddingHorizontal: 16, paddingVertical: 8 }]} numberOfLines={1}>{me.name}</Text>
                  {admin && tab !== 'aufgaben' && (
                    <Pressable accessibilityRole="menuitem" onPress={() => { setProfMenu(false); setMenu(true); setTab('aufgaben'); }} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                      <Text style={[s.text, { fontWeight: '700' }]}>Einstellungen</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="menuitem" onPress={() => { setProfMenu(false); setProfile(null); setTab('heute'); }} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Text style={[s.text, { fontWeight: '700' }]}>Person wechseln</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
      <ScrollView ref={scroller} contentContainerStyle={[s.pad, { paddingTop: 6, paddingBottom: 120 }]}>
        {saveError && <Text style={{ color: C.danger, fontWeight: '700' }}>{saveError}</Text>}
        {tab === 'heute' && <Today childIds={childIds} parent={parent} meId={profile.id} admin={admin} />}
        {tab === 'kalender' && <Calendar childIds={childIds} parent={parent} meId={profile.id} />}
        {tab === 'kalender' && <Timetable childIds={childIds} parent={false} />}
        {tab === 'lernen' && <Learn childIds={childIds} parent={parent} meId={profile.id} admin={admin} />}
        {tab === 'punkte' && <Points childIds={childIds} parent={parent} admin={admin} />}
        {tab === 'geld' && <MoneyTab childIds={childIds} parent={parent} meId={profile.id} />}
        {tab === 'essen' && <Food who={me.name} meId={profile.id} parent={parent} />}
        {tab === 'aufgaben' && admin && !narrowSet && (
          <View style={[s.row, { gap: 8 }]} accessibilityRole="tablist">
            {SETTINGS.filter(x => (cloud || !x.cloud) && !(x.value === 'geld' && !isOn('geld', flags))).map(x => (
              <Pressable key={x.value} accessibilityRole="tab" accessibilityState={{ selected: section === x.value }} onPress={() => setSection(x.value)}
                style={[s.chip, { paddingHorizontal: 16, paddingVertical: 11, backgroundColor: section === x.value ? C.fg : C.surface }, section === x.value ? null : SHADOW.sm]}>
                <Text style={{ fontWeight: '700', color: section === x.value ? '#fff' : C.fg }}>{x.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {tab === 'aufgaben' && admin && narrowSet && menu && (
          <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
            {SETTINGS.filter(x => (cloud || !x.cloud) && !(x.value === 'geld' && !isOn('geld', flags))).map((x, i) => (
              <Pressable key={x.value} accessibilityRole="button" onPress={() => { setSection(x.value); setMenu(false); scroller.current?.scrollTo?.({ y: 0, animated: false }); }}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18, gap: 12, backgroundColor: pressed ? C.surface2 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
                <Text style={{ fontSize: 26 }}>{x.label.split(' ')[0]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.text, { fontWeight: '800', fontSize: 17 }]}>{x.label.split(' ').slice(1).join(' ')}</Text>
                  <Text style={[s.muted, { fontSize: 13 }]}>{x.hint}</Text>
                </View>
                <Text style={{ fontSize: 22, color: C.muted }}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
        {tab === 'aufgaben' && admin && narrowSet && !menu && (
          <Pressable accessibilityRole="button" onPress={() => setMenu(true)} style={[s.row, { gap: 6, paddingVertical: 6 }]}>
            <Text style={{ color: C.accent, fontSize: 22, fontWeight: '800' }}>‹</Text>
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>Einstellungen</Text>
            <Text style={[s.h2, { marginLeft: 8 }]}>{SETTINGS.find(x => x.value === section)?.label}</Text>
          </Pressable>
        )}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && <Family />}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && <ParentPin />}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && <WeatherSetup />}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && <TrainSetup />}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && <AiPrivacy />}
        {tab === 'aufgaben' && admin && showSec && section === 'familie' && cloud && <SupportSetup familyId={cloud.link.familyId} />}
        {tab === 'aufgaben' && admin && showSec && section === 'aufgaben' && <Manage onReset={cloud ? undefined : () => { replace(null); setProfile(null); }} />}
        {tab === 'aufgaben' && admin && showSec && section === 'schule' && <Timetable childIds={childIds} parent />}
        {tab === 'aufgaben' && admin && showSec && section === 'schule' && <PackSetup />}
        {tab === 'aufgaben' && admin && showSec && section === 'schule' && cloud && isOn('sync', flags) && <UntisSetup />}
        {tab === 'aufgaben' && admin && showSec && section === 'geld' && <MoneySettings />}
        {tab === 'aufgaben' && admin && showSec && section === 'ferien' && <Holiday />}
        {tab === 'aufgaben' && admin && showSec && section === 'kalender' && cloud && isOn('sync', flags) && <IcloudSetup />}
        {tab === 'aufgaben' && admin && showSec && section === 'kalender' && cloud && <CalendarLink link={cloud.link} />}
        {tab === 'aufgaben' && admin && showSec && section === 'geraete' && cloud && <Devices link={cloud.link} onSignOut={cloud.unlink} />}
        {tab === 'aufgaben' && admin && cloud && (
          <View style={{ marginTop: 18, alignItems: 'center', gap: 8 }}>
            {!askOut ? <Pressable accessibilityRole="button" onPress={() => setAskOut(true)} style={{ paddingVertical: 10, paddingHorizontal: 18 }}>
              <Text style={{ color: C.danger, fontWeight: '700' }}>Abmelden</Text>
            </Pressable> : <>
              <Text style={s.muted}>Dieses Gerät abmelden? Eure Daten bleiben gespeichert.</Text>
              <View style={[s.row, { gap: 10 }]}>
                <Button ghost title="Abbrechen" onPress={() => setAskOut(false)} />
                <Button title="Ja, abmelden" color={C.danger} onPress={cloud.unlink} />
              </View>
            </>}
          </View>
        )}
      </ScrollView>
      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, alignItems: 'center', paddingBottom: 6 }]}>
        <View style={{ flexDirection: 'row', maxWidth: 640, width: '100%', paddingHorizontal: 6, paddingTop: 8 }}>
          {shownTabs.map(t => {
            const on = tab === t.value;
            const col = on ? C.accent : C.muted;
            return (
              <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.badge ? `${t.label}, ${t.badge} neu` : t.label}
                onPress={() => setTab(t.value)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 3 }}>
                <View>
                  <Icon name={TAB_ICON[t.value]} size={23} color={col} stroke={on ? 2.1 : 1.7} />
                  {!!t.badge && (
                    <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.accent2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{t.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, fontWeight: on ? '800' : '600', color: col }} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <AiConsent />
      <PhotoCollector />
    </SafeAreaView>
  );
}
