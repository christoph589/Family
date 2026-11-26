import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { OpFamily, currentFamilyId, signOut, switchFamily, opDelete, opEnter, opFamilies, opRename, opSetFamily } from '../data/cloud';
import { FEATURES } from '../data/flags';
import { Popup } from '../ui/Popup';
import { BRAND } from '../brand';
import { Button } from '../ui/Button';
import { LogoMark } from '../ui/Logo';
import { C, s } from '../ui/theme';

const ago = (iso: string | null) => {
  if (!iso) return 'nie';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} Std.`;
  return `vor ${Math.round(min / 1440)} Tagen`;
};
const time = (iso: string) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Status = 'neu' | 'aktiv' | 'ruhend' | 'inaktiv';
const STATUS: Record<Status, { label: string; fg: string; bg: string }> = {
  neu: { label: 'Neu', fg: '#5b4cf0', bg: '#ecebff' },
  aktiv: { label: 'Aktiv', fg: '#14a05a', bg: '#dcf7e8' },
  ruhend: { label: 'Ruhend', fg: '#b26b00', bg: '#fff1d6' },
  inaktiv: { label: 'Inaktiv', fg: '#6b7088', bg: '#eef0f8' },
};
const FEAT: Record<string, string> = Object.fromEntries(FEATURES.map(f => [f.key, f.icon]));
const FEAT_NAME: Record<string, string> = Object.fromEntries(FEATURES.map(f => [f.key, f.name]));
const PLANS: Record<string, { label: string; fg: string; bg: string }> = {
  free: { label: 'Free', fg: '#6b7088', bg: '#eef0f8' }, pro: { label: 'Pro', fg: '#b26b00', bg: '#fff1d6' },
  test: { label: 'Test', fg: '#0b7fa8', bg: '#dff3fb' }, intern: { label: 'Intern', fg: '#5b4cf0', bg: '#ecebff' },
};
const usd = (n?: number) => (n ? `${n < 0.01 ? '<0,01' : n.toFixed(2).replace('.', ',')} $` : '–');
const offList = (f: OpFamily) => Object.entries(f.flags ?? {}).filter(([, v]) => v === false).map(([k]) => k);
const days = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
const statusOf = (f: OpFamily): Status => (days(f.created_at) < 7 ? 'neu' : days(f.updated_at) < 7 ? 'aktiv' : days(f.updated_at) < 30 ? 'ruhend' : 'inaktiv');
const AI_EUR = 0.02; // geschätzte Kosten pro KI-Aufruf (gemessen: 0,04 $ für die ersten Tests im Nov. 2026)

/** Übersicht aller Familien für den Betreiber. Nur Kennzahlen, keine Inhalte. Hineingehen nur mit Freigabe der Familie. */
export function Operator({ onClose, onEntered }: { onClose: () => void; onEntered: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [list, setList] = useState<OpFamily[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Status | 'alle'>('alle');
  const [copied, setCopied] = useState(false);
  const [cur, setCur] = useState<string | null>(null);
  useEffect(() => { currentFamilyId().then(setCur, () => {}); }, []);
  const [edit, setEdit] = useState<{ f: OpFamily; mode: 'menu' | 'rename' | 'delete' | 'flags'; text: string; err: string; flags?: Record<string, boolean>; plan?: string } | null>(null);
  const runEdit = async () => {
    if (!edit) return;
    try {
      if (edit.mode === 'flags') await opSetFamily(edit.f.id, edit.flags ?? {}, edit.plan ?? 'free', edit.text.trim() ? Number(edit.text) : null);
      else if (edit.mode === 'rename') await opRename(edit.f.id, edit.text);
      else await opDelete(edit.f.id, edit.text);
      setEdit(null); load();
    } catch (e: any) { setEdit(x => x && { ...x, err: e.message }); }
  };
  const load = () => { setErr(''); opFamilies().then(setList, e => setErr(e.message)); };
  useEffect(load, []);
  const all = list ?? [];
  const shown = all.filter(f => (filter === 'alle' || statusOf(f) === filter) && f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const aiToday = all.reduce((a, f) => a + f.ai_today, 0);
  const real = all.some(f => f.usd30 !== undefined && f.usd30 !== null);
  const sum = (k: 'usd_today' | 'usd7' | 'usd30' | 'ai7' | 'ai30') => all.reduce((a, f) => a + Number(f[k] ?? 0), 0);
  const invite = () => {
    const url = 'https://christoph589.github.io/Family/';
    try { (navigator as any).clipboard?.writeText(`Probier mal ${BRAND.name}, unseren Familienplaner: ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* egal */ }
  };
  const more = (f: OpFamily) => <Pressable accessibilityLabel={`Mehr zu ${f.name}`} onPress={() => setEdit({ f, mode: 'menu', text: '', err: '' })} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: C.muted, fontSize: 20, fontWeight: '800' }}>⋯</Text></Pressable>;
  const help = (f: OpFamily) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{helpBtn(f)}{more(f)}</View>;
  const helpBtn = (f: OpFamily) => f.id === cur ? <Text style={[s.muted, { fontSize: 13 }]}>hier angemeldet</Text> : f.mine ? (
    <Button ghost title={busy === f.id ? '…' : 'Wechseln →'} disabled={!!busy} style={{ paddingVertical: 8, paddingHorizontal: 14, minHeight: 0 }}
      onPress={() => { setBusy(f.id); switchFamily(f.id).then(onEntered, e => { setErr(e.message); setBusy(''); }); }} />
  ) : (
    <Button title={busy === f.id ? '…' : 'Öffnen →'} disabled={!!busy} style={{ paddingVertical: 8, paddingHorizontal: 14, minHeight: 0 }}
      onPress={() => { setBusy(f.id); opEnter(f.id).then(onEntered, e => { setErr(e.message); setBusy(''); }); }} />
  );
  const PlanBadge = ({ p }: { p: string }) => <View style={{ alignSelf: 'flex-start', backgroundColor: PLANS[p]?.bg ?? C.surface2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 }}><Text style={{ color: PLANS[p]?.fg ?? C.muted, fontWeight: '800', fontSize: 11 }}>{PLANS[p]?.label ?? p}</Text></View>;
  const featText = (f: OpFamily) => { const off = offList(f); return [...(f.features ?? []).filter(x => !off.includes(x)).map(x => FEAT[x] ?? ''), ...(off.length ? [`🚫${off.length}`] : [])].join(' ') || '–'; };
  const Badge = ({ st }: { st: Status }) => <View style={{ alignSelf: 'flex-start', backgroundColor: STATUS[st].bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: STATUS[st].fg, fontWeight: '800', fontSize: 13 }}>{STATUS[st].label}</Text></View>;
  const COLS: [string, number, 'left' | 'right'][] = [['Familie', 2.2, 'left'], ['Status', 1, 'left'], ['Kinder · Geräte', 1.2, 'right'], ['Erledigt (7 T.)', 1.1, 'right'], ['Funktionen', 1.4, 'left'], ['KI heute', 0.8, 'right'], ['Zuletzt aktiv', 1.2, 'right'], ['', 1.7, 'right']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: '#16132b', paddingHorizontal: 20, paddingVertical: 12 }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={[s.row, { gap: 10 }]}>
            <LogoMark size={34} />
            {width >= 420 && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{BRAND.name}</Text>}
            <View style={{ backgroundColor: '#5b4cf0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1.2 }}>OPERATOR</Text></View>
          </View>
          <View style={[s.row, { gap: 16 }]}>
            <Pressable onPress={onClose}><Text style={{ color: '#ffffffb0', fontWeight: '700' }}>{width < 520 ? 'Familie' : 'Zur eigenen Familie'}</Text></Pressable>
            <Pressable accessibilityLabel="Abmelden" onPress={() => { signOut().finally(() => { if (typeof window !== 'undefined') window.location.replace(window.location.pathname); }); }}>
              <Text style={{ color: '#ffffffb0', fontWeight: '700' }}>Abmelden</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={[s.pad, { maxWidth: 1200 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Text style={s.h1}>Familien</Text>
            <Text style={s.muted}>Übersicht ohne Inhalte. „Öffnen“ wechselt für 4 Stunden in die Familie. Jeder Besuch wird der Familie angezeigt.</Text>
          </View>
          <Button title={copied ? 'Link kopiert ✓' : '＋ Familie einladen'} onPress={invite} />
        </View>
        {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
        {!list && !err && <ActivityIndicator color={C.accent} />}
        {list && (
          <>
            <View style={[s.row, { gap: 12, alignItems: 'stretch' }]}>
              {([['Familien', String(all.length)], ['Aktiv (7 Tage)', String(all.filter(f => days(f.updated_at) < 7).length)], ['Kinder', String(all.reduce((a, f) => a + f.children, 0))], ['KI heute', real ? `${aiToday} · ${usd(sum('usd_today')) === '–' ? '0 $' : usd(sum('usd_today'))}` : `${aiToday} · ≈ ${(aiToday * AI_EUR).toFixed(2).replace('.', ',')} €`], ...(real ? [['KI 30 Tage', `${sum('ai30')} · ${usd(sum('usd30'))}`]] : []), ['Kindergeräte', String(all.reduce((a, f) => a + f.kids, 0))]] as [string, string][]).map(([l, v]) => (
                <View key={l} style={[s.card, { flexGrow: 1, flexBasis: 150, gap: 2, padding: 16 }]}>
                  <Text style={s.label}>{l}</Text><Text style={{ fontSize: 24, fontWeight: '800', color: C.fg }}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={[s.row, { gap: 6, flexShrink: 1 }]}>
                {(['alle', 'aktiv', 'neu', 'ruhend', 'inaktiv'] as const).map(k => (
                  <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: filter === k ? C.fg : C.surface }}>
                    <Text style={{ color: filter === k ? '#fff' : C.fg, fontWeight: '700' }}>{k === 'alle' ? `Alle (${all.length})` : `${STATUS[k].label} (${all.filter(f => statusOf(f) === k).length})`}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={[s.input, { minWidth: 220, backgroundColor: C.surface }]} value={q} onChangeText={setQ} placeholder="Familie suchen" />
            </View>
            {wide ? (
              <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
                <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  {COLS.map(([l, w, al], i) => <Text key={i} style={[s.label, { flex: w, textAlign: al, paddingLeft: i === 4 ? 16 : 0 }]}>{l}</Text>)}
                </View>
                {shown.map(f => (
                  <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <View style={{ flex: COLS[0][1], flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.accent, fontWeight: '800' }}>{f.name.replace(/^Familie\s+/i, '').slice(0, 2).toUpperCase()}</Text></View>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[s.text, { fontWeight: '800' }]} numberOfLines={1}>{f.name}</Text>
                        {f.plan && f.plan !== 'free' ? <PlanBadge p={f.plan} /> : null}
                      </View>
                    </View>
                    <View style={{ flex: COLS[1][1] }}><Badge st={statusOf(f)} /></View>
                    <Text style={[s.text, { flex: COLS[2][1], textAlign: 'right' }]}>{f.children} · {f.kids}</Text>
                    <Text style={[s.text, { flex: COLS[3][1], textAlign: 'right', fontWeight: '700' }]}>{f.done7}</Text>
                    <Text style={{ flex: COLS[4][1], fontSize: 18, paddingLeft: 16 }} accessibilityLabel={`Genutzt: ${(f.features ?? []).map(x => FEAT_NAME[x]).join(', ') || 'nichts'}. Aus: ${offList(f).map(x => FEAT_NAME[x]).join(', ') || 'nichts'}`}>{featText(f)}</Text>
                    <View style={{ flex: COLS[5][1], alignItems: 'flex-end' }}>
                      <Text style={s.text}>{f.ai_today || '–'}{f.ai_limit != null ? <Text style={s.muted}> / {f.ai_limit}</Text> : null}</Text>
                      {real && !!f.ai30 && <Text style={[s.muted, { fontSize: 11 }]}>30 T.: {f.ai30} · {usd(f.usd30)}</Text>}
                    </View>
                    <Text style={[s.muted, { flex: COLS[6][1], textAlign: 'right' }]}>{ago(f.updated_at)}</Text>
                    <View style={{ flex: COLS[7][1], alignItems: 'flex-end' }}>{help(f)}</View>
                  </View>
                ))}
              </View>
            ) : shown.map(f => (
              <View key={f.id} style={[s.card, { gap: 8, padding: 16 }]}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={[s.h2, { fontSize: 18, flexShrink: 1 }]}>{f.name}</Text><View style={[s.row, { gap: 6 }]}>{f.plan && f.plan !== 'free' ? <PlanBadge p={f.plan} /> : null}<Badge st={statusOf(f)} /></View>
                </View>
                <Text style={s.muted}>{f.children} Kinder · {f.kids} Kindergeräte · {f.done7} erledigt in 7 Tagen · KI heute {f.ai_today}{f.ai_limit != null ? `/${f.ai_limit}` : ''}{real && f.ai30 ? ` (30 T.: ${f.ai30} · ${usd(f.usd30)})` : ''} · aktiv {ago(f.updated_at)}</Text>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 18 }}>{featText(f)}</Text>{help(f)}
                </View>
              </View>
            ))}
            {!shown.length && <Text style={s.muted}>Keine Familie passt zum Filter.</Text>}
            <Text style={[s.muted, { fontSize: 12 }]}>Genutzte Funktionen: {FEATURES.map(x => `${x.icon} ${x.name.replace(/ \(.*\)/, '')}`).join(' · ')}. 🚫 = vom Operator ausgeschaltet. {real ? 'KI-Kosten echt aus den Tokens (Anthropic-Preise in US-Dollar).' : `KI-Kosten grob geschätzt mit ${AI_EUR.toFixed(2).replace('.', ',')} € pro Aufruf, echte Kosten nach fix-11 und neuem Server-Deploy.`}</Text>
          </>
        )}
      </ScrollView>
      {edit && (
        <Popup onClose={() => setEdit(null)}>
          <View style={{ gap: 12 }}>
            <Text style={s.h2}>{edit.f.name}</Text>
            {edit.mode === 'menu' && (
              <>
                <Button ghost title="⚙️ Funktionen, Plan und KI-Limit" onPress={() => setEdit({ ...edit, mode: 'flags', flags: { ...(edit.f.flags ?? {}) }, plan: edit.f.plan ?? 'free', text: edit.f.ai_limit != null ? String(edit.f.ai_limit) : '' })} />
                <Button ghost title="✏️ Umbenennen" onPress={() => setEdit({ ...edit, mode: 'rename', text: edit.f.name })} />
                {edit.f.id !== cur && <Button ghost title="🗑️ Familie löschen" onPress={() => setEdit({ ...edit, mode: 'delete', text: '' })} />}
              </>
            )}
            {edit.mode === 'flags' && (
              <>
                <Text style={s.label}>Funktionen</Text>
                {FEATURES.map(ft => {
                  const on = edit.flags?.[ft.key] !== false;
                  return (
                    <Pressable key={ft.key} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => setEdit({ ...edit, err: '', flags: { ...(edit.flags ?? {}), [ft.key]: !on } })}
                      style={[s.row, { flexWrap: 'nowrap', justifyContent: 'space-between', paddingVertical: 4 }]}>
                      <Text style={[s.text, { flex: 1, opacity: on ? 1 : 0.5 }]}>{ft.icon} {ft.name}</Text>
                      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? C.ok : C.line, padding: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
                      </View>
                    </Pressable>
                  );
                })}
                <Text style={s.label}>Plan</Text>
                <View style={[s.row, { gap: 6 }]}>
                  {Object.entries(PLANS).map(([k, p]) => (
                    <Pressable key={k} onPress={() => setEdit({ ...edit, plan: k, err: '' })} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: edit.plan === k ? p.fg : p.bg }}>
                      <Text style={{ color: edit.plan === k ? '#fff' : p.fg, fontWeight: '800' }}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.label}>KI-Aufrufe pro Tag</Text>
                <TextInput style={s.input} value={edit.text} onChangeText={x => setEdit({ ...edit, text: x.replace(/\D/g, '').slice(0, 4), err: '' })} placeholder="leer = Standard (30)" keyboardType="number-pad" />
                <Text style={[s.muted, { fontSize: 12 }]}>Ausgeschaltete Bereiche verschwinden in der App der Familie beim nächsten Öffnen. KI und Vokabel-Prüfung sperrt zusätzlich der Server. Daten bleiben erhalten.</Text>
                <Button title="Speichern" onPress={runEdit} />
              </>
            )}
            {edit.mode === 'rename' && (
              <>
                <TextInput style={s.input} value={edit.text} onChangeText={x => setEdit({ ...edit, text: x, err: '' })} autoFocus />
                <Button title="Speichern" disabled={!edit.text.trim()} onPress={runEdit} />
              </>
            )}
            {edit.mode === 'delete' && (
              <>
                <Text style={{ color: C.danger, fontWeight: '700' }}>Löscht die Familie endgültig mit allen Kindern, Terminen, Aufgaben, Geld und Geräten. Das lässt sich nicht rückgängig machen.</Text>
                <Text style={s.muted}>Zum Bestätigen den Namen genau eintippen: {edit.f.name}</Text>
                <TextInput style={s.input} value={edit.text} onChangeText={x => setEdit({ ...edit, text: x, err: '' })} autoFocus />
                <Button title="Endgültig löschen" disabled={edit.text !== edit.f.name} onPress={runEdit} style={{ backgroundColor: C.danger }} />
              </>
            )}
            {!!edit.err && <Text style={{ color: C.danger, fontWeight: '700' }}>{edit.err}</Text>}
            <Button ghost title="Abbrechen" onPress={() => setEdit(null)} />
          </View>
        </Popup>
      )}
    </View>
  );
}

/** Für Eltern: Transparenz, wann der Betreiber zur Hilfe in der Familie war. */
export function SupportAccess({ familyId, status }: { familyId: string; status: { until: string | null; visits: string[] } | null; onChange?: (hours: number) => void; busy?: boolean }) {
  return (
    <View style={[s.card, { gap: 10 }]}>
      <Text style={s.h2}>🛟 Support</Text>
      <Text style={s.muted}>Bei Problemen kann das {BRAND.name}-Team in eure Familie schauen und helfen. Jeder Besuch wird hier mit Uhrzeit angezeigt.</Text>
      <Text style={[s.text, { fontSize: 14 }]}>{status?.visits?.length ? `Letzte Besuche: ${status.visits.map(time).join(', ')}` : 'Bisher kein Besuch.'}</Text>
      <Text style={[s.muted, { fontSize: 12 }]}>Eure Familien-ID für Anfragen: {familyId.slice(0, 8)}</Text>
    </View>
  );
}
