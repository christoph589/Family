import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { createFamily, DeviceLink, finishOAuth, joinFamily, oauthProviders, myParentFamily, parentOAuth, parentSignIn, parentSignUp, sb, setLink } from '../data/cloud';
import { localStore } from '../data/store';
import { FamilyData } from '../data/types';
import { Button, Segmented } from '../ui/Button';
import { C, s } from '../ui/theme';
import { Setup } from './Setup';
import { Landing } from './Landing';

const sso = { borderRadius: 14, paddingVertical: 14, alignItems: 'center' as const };
const ssoT = { fontSize: 16, fontWeight: '700' as const };

type Step = 'start' | 'eltern' | 'neu' | 'kind' | 'kindWahl';

/** Erster Start mit Server: Familien-Pad (Eltern-Konto) oder Kindergerät (Familiencode). */
export function Connect({ onLinked }: { onLinked: (l: DeviceLink) => void }) {
  const [step, setStep] = useState<Step>('start');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'login' | 'neu'>('login');
  const [info, setInfo] = useState('');
  const [code, setCode] = useState('');
  const [local, setLocal] = useState<FamilyData | null>(null);
  const [kidFam, setKidFam] = useState<{ fid: string; data: FamilyData } | null>(null);

  const [prov, setProv] = useState({ google: false, apple: false });
  useEffect(() => { oauthProviders().then(setProv); }, []);
  useEffect(() => { localStore.load().then(r => setLocal(r.data), () => {}); }, []);
  // Rückkehr von „Mit Google/Apple anmelden“
  useEffect(() => {
    setBusy(true);
    finishOAuth().then(ok => { if (ok) { setStep('eltern'); return afterParentLogin(); } })
      .catch(e => { setStep('eltern'); setErr(e.message); }).finally(() => setBusy(false));
  }, []);

  const run = (f: () => Promise<void>) => { setBusy(true); setErr(''); f().catch(e => setErr(e.message)).finally(() => setBusy(false)); };
  const link = async (l: DeviceLink) => { await setLink(l); onLinked(l); };

  const afterParentLogin = async () => {
    const fid = await myParentFamily();
    if (fid) return link({ familyId: fid, role: 'eltern' });
    setStep('neu');
  };

  const box = (children: React.ReactNode) => (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { maxWidth: 560 }]}>{children}</ScrollView>
  );
  const error = !!err && <Text style={{ color: C.danger }}>{err}</Text>;
  const back = <Button ghost title="Zurück" onPress={() => { setStep('start'); setErr(''); }} />;

  if (step === 'start') return <Landing onNew={() => { setMode('neu'); setStep('eltern'); }} onLogin={() => { setMode('login'); setStep('eltern'); }} onKid={() => setStep('kind')} />;

  if (step === 'eltern') return box(<>
    <Text style={s.h1}>Eltern-Anmeldung</Text>
    {(prov.apple || prov.google) && <View style={{ gap: 10 }}>
      {prov.apple && <Pressable disabled={busy} onPress={() => run(() => parentOAuth('apple'))} style={[sso, { backgroundColor: '#000' }]}><Text style={[ssoT, { color: '#fff' }]}>Mit Apple fortfahren</Text></Pressable>}
      {prov.google && <Pressable disabled={busy} onPress={() => run(() => parentOAuth('google'))} style={[sso, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0' }]}><Text style={[ssoT, { color: '#1f1f1f' }]}><Text style={{ color: '#4285f4', fontWeight: '900' }}>G</Text>  Mit Google fortfahren</Text></Pressable>}
      <Text style={[s.muted, { textAlign: 'center' }]}>oder mit E-Mail</Text>
    </View>}
    <Segmented value={mode} onChange={setMode} options={[{ value: 'login', label: 'Anmelden' }, { value: 'neu', label: 'Neues Konto' }]} />
    <View style={s.card}>
      <Text style={s.label}>E-Mail</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Text style={s.label}>Passwort (mindestens 8 Zeichen)</Text>
      <TextInput style={s.input} value={pw} onChangeText={setPw} secureTextEntry autoComplete={mode === 'neu' ? 'new-password' : 'current-password'} />
      {pw.length > 0 && pw.length < 8 && <Text style={{ color: C.danger }}>Noch {8 - pw.length} Zeichen. Das ist nicht die 4-stellige Eltern-PIN.</Text>}
      {!!email && !email.includes('@') && <Text style={{ color: C.danger }}>Bitte eine gültige E-Mail eingeben.</Text>}
    </View>
    {!!info && <Text style={{ color: C.accent, fontWeight: '700' }}>{info}</Text>}
    {error}
    <Button title={busy ? 'Moment …' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'} disabled={busy || !email.includes('@') || pw.length < 8}
      onPress={() => run(async () => {
        if (mode === 'neu') {
          const confirm = await parentSignUp(email.trim(), pw);
          if (confirm) { setInfo('Fast fertig: Öffne den Link in der Mail, dann hier anmelden.'); setMode('login'); return; }
        } else await parentSignIn(email.trim(), pw);
        await afterParentLogin();
      })} />
    {back}
  </>);

  if (step === 'neu') return (
    <View style={{ flex: 1 }}>
      {local && (
        <View style={[s.pad, { maxWidth: 560 }]}>
          <View style={s.card}>
            <Text style={s.h2}>Vorhandene Daten übernehmen?</Text>
            <Text style={s.muted}>Auf diesem Gerät gibt es schon „{local.family.name}“ mit {local.children.length} Kind(ern).</Text>
            {error}
            <Button title={busy ? 'Moment …' : 'Ja, übernehmen'} disabled={busy}
              onPress={() => run(async () => { const fid = await createFamily(local); await link({ familyId: fid, role: 'eltern' }); })} />
          </View>
        </View>
      )}
      <Setup note="Die Familie wird auf dem Server gespeichert. Danach kannst du die Geräte der Kinder mit einem Code verbinden."
        onCreate={async d => { const fid = await createFamily(d); await link({ familyId: fid, role: 'eltern' }); }} />
    </View>
  );

  if (step === 'kind') return box(<>
    <Text style={s.h1}>Kindergerät verbinden</Text>
    <Text style={s.muted}>Den Code findest du auf dem Familien-Pad unter Eltern › Aufgaben › Geräte.</Text>
    <View style={s.card}>
      <Text style={s.label}>Familiencode</Text>
      <TextInput style={[s.input, { fontSize: 24, letterSpacing: 4 }]} value={code} autoCapitalize="characters" autoCorrect={false}
        onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="ABCD2345" />
    </View>
    {error}
    <Button title={busy ? 'Moment …' : 'Verbinden'} disabled={busy || code.length !== 8} onPress={() => run(async () => {
      const fid = await joinFamily(code, 'kind');
      const { data } = await sb().from('family_state').select('data').eq('family_id', fid).single();
      setKidFam({ fid, data: data!.data as FamilyData });
      setStep('kindWahl');
    })} />
    {back}
  </>);

  // kindWahl
  return box(<>
    <Text style={s.h1}>Wem gehört dieses Gerät?</Text>
    {kidFam?.data.children.map(c => (
      <Pressable key={c.id} disabled={busy} style={[s.card, { borderLeftWidth: 6, borderLeftColor: c.color }]}
        onPress={() => run(async () => { await joinFamily(code, 'kind', c.id); await link({ familyId: kidFam.fid, role: 'kind', childId: c.id }); })}>
        <Text style={s.h2}>{c.name}</Text>
      </Pressable>
    ))}
    {error}
    {back}
  </>);
}
