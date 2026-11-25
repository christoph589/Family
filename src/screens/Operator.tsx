import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { OpFamily, opEnter, opFamilies } from '../data/cloud';
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
const FEAT: Record<string, string> = { kalender: '📅', geld: '💶', lernen: '📚', essen: '🍽️', sync: '🔗' };
const FEAT_NAME: Record<string, string> = { kalender: 'Kalender', geld: 'Geld', lernen: 'Lernen', essen: 'Essen', sync: 'Kalender-Sync' };
const days = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
const statusOf = (f: OpFamily): Status => (days(f.created_at) < 7 ? 'neu' : days(f.updated_at) < 7 ? 'aktiv' : days(f.updated_at) < 30 ? 'ruhend' : 'inaktiv');
const AI_EUR = 0.15; // geschätzte Kosten pro KI-Aufruf

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
  const load = () => { setErr(''); opFamilies().then(setList, e => setErr(e.message)); };
  useEffect(load, []);
  const all = list ?? [];
  const shown = all.filter(f => (filter === 'alle' || statusOf(f) === filter) && f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const aiToday = all.reduce((a, f) => a + f.ai_today, 0);
  const invite = () => {
    const url = 'https://christoph589.github.io/Family/';
    try { (navigator as any).clipboard?.writeText(`Probier mal ${BRAND.name}, unseren Familienplaner: ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* egal */ }
  };
  const help = (f: OpFamily) => f.mine ? <Text style={[s.muted, { fontSize: 13 }]}>eure Familie</Text> : f.support_until ? (
    <Button title={busy === f.id ? '…' : 'Helfen →'} disabled={!!busy} style={{ paddingVertical: 8, paddingHorizontal: 14, minHeight: 0 }}
      onPress={() => { setBusy(f.id); opEnter(f.id).then(onEntered, e => { setErr(e.message); setBusy(''); }); }} />
  ) : <Text style={[s.muted, { fontSize: 13 }]}>🔒 keine Freigabe</Text>;
  const Badge = ({ st }: { st: Status }) => <View style={{ alignSelf: 'flex-start', backgroundColor: STATUS[st].bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: STATUS[st].fg, fontWeight: '800', fontSize: 13 }}>{STATUS[st].label}</Text></View>;
  const COLS: [string, number, 'left' | 'right'][] = [['Familie', 2.2, 'left'], ['Status', 1, 'left'], ['Kinder · Geräte', 1.2, 'right'], ['Erledigt (7 T.)', 1.1, 'right'], ['Funktionen', 1.4, 'left'], ['KI heute', 0.8, 'right'], ['Zuletzt aktiv', 1.2, 'right'], ['', 1.3, 'right']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ backgroundColor: '#16132b', paddingHorizontal: 20, paddingVertical: 12 }}>
        <View style={{ maxWidth: 1200, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={[s.row, { gap: 10 }]}>
            <LogoMark size={34} />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{BRAND.name}</Text>
            <View style={{ backgroundColor: '#5b4cf0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 1.2 }}>OPERATOR</Text></View>
          </View>
          <Pressable onPress={onClose}><Text style={{ color: '#ffffffb0', fontWeight: '700' }}>Zur eigenen Familie</Text></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={[s.pad, { maxWidth: 1200 }]}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Text style={s.h1}>Familien</Text>
            <Text style={s.muted}>Nur Namen und Zahlen, keine Inhalte. „Helfen“ geht nur, wenn die Familie den Support-Zugang freigegeben hat.</Text>
          </View>
          <Button title={copied ? 'Link kopiert ✓' : '＋ Familie einladen'} onPress={invite} />
        </View>
        {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
        {!list && !err && <ActivityIndicator color={C.accent} />}
        {list && (
          <>
            <View style={[s.row, { gap: 12, alignItems: 'stretch' }]}>
              {([['Familien', String(all.length)], ['Aktiv (7 Tage)', String(all.filter(f => days(f.updated_at) < 7).length)], ['Kinder', String(all.reduce((a, f) => a + f.children, 0))], ['KI heute', `${aiToday} · ≈ ${(aiToday * AI_EUR).toFixed(2).replace('.', ',')} €`], ['Support offen', String(all.filter(f => f.support_until).length)]] as [string, string][]).map(([l, v]) => (
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
                        {f.support_until && <Text style={{ color: C.ok, fontSize: 12, fontWeight: '700' }}>🛟 bis {time(f.support_until)}</Text>}
                      </View>
                    </View>
                    <View style={{ flex: COLS[1][1] }}><Badge st={statusOf(f)} /></View>
                    <Text style={[s.text, { flex: COLS[2][1], textAlign: 'right' }]}>{f.children} · {f.kids}</Text>
                    <Text style={[s.text, { flex: COLS[3][1], textAlign: 'right', fontWeight: '700' }]}>{f.done7}</Text>
                    <Text style={{ flex: COLS[4][1], fontSize: 18, paddingLeft: 16 }} accessibilityLabel={(f.features ?? []).map(x => FEAT_NAME[x]).join(', ') || 'keine'}>{(f.features ?? []).map(x => FEAT[x]).join(' ') || '–'}</Text>
                    <Text style={[s.text, { flex: COLS[5][1], textAlign: 'right' }]}>{f.ai_today || '–'}</Text>
                    <Text style={[s.muted, { flex: COLS[6][1], textAlign: 'right' }]}>{ago(f.updated_at)}</Text>
                    <View style={{ flex: COLS[7][1], alignItems: 'flex-end' }}>{help(f)}</View>
                  </View>
                ))}
              </View>
            ) : shown.map(f => (
              <View key={f.id} style={[s.card, { gap: 8, padding: 16 }]}>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={[s.h2, { fontSize: 18, flexShrink: 1 }]}>{f.name}</Text><Badge st={statusOf(f)} />
                </View>
                <Text style={s.muted}>{f.children} Kinder · {f.kids} Kindergeräte · {f.done7} erledigt in 7 Tagen · KI heute {f.ai_today} · aktiv {ago(f.updated_at)}</Text>
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 18 }}>{(f.features ?? []).map(x => FEAT[x]).join(' ') || '–'}</Text>{help(f)}
                </View>
              </View>
            ))}
            {!shown.length && <Text style={s.muted}>Keine Familie passt zum Filter.</Text>}
            <Text style={[s.muted, { fontSize: 12 }]}>Funktionen: 📅 Kalender · 💶 Geld · 📚 Lernen · 🍽️ Essen · 🔗 Kalender-Sync. KI-Kosten grob geschätzt mit {AI_EUR.toFixed(2).replace('.', ',')} € pro Aufruf.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Für Eltern: Support-Zugang für den Betreiber freigeben. */
export function SupportAccess({ familyId, status, onChange, busy }: { familyId: string; status: { until: string | null; visits: string[] } | null; onChange: (hours: number) => void; busy: boolean }) {
  const on = !!status?.until;
  return (
    <View style={[s.card, { gap: 10 }]}>
      <Text style={s.h2}>🛟 Support-Zugang</Text>
      <Text style={s.muted}>Wenn etwas nicht klappt, kann der Betreiber von {BRAND.name} für begrenzte Zeit in eure Familie schauen und helfen. Ohne Freigabe sieht er nur euren Familiennamen und Zahlen, keine Inhalte.</Text>
      {on ? (
        <>
          <Text style={{ color: C.ok, fontWeight: '800' }}>Freigegeben bis {time(status!.until!)}</Text>
          <Button ghost title={busy ? 'Moment …' : 'Jetzt beenden'} disabled={busy} onPress={() => onChange(0)} />
        </>
      ) : (
        <Pressable disabled={busy} onPress={() => onChange(48)}>
          <Text style={{ color: C.accent, fontWeight: '800' }}>{busy ? 'Moment …' : 'Für 48 Stunden freigeben'}</Text>
        </Pressable>
      )}
      {!!status?.visits?.length && <Text style={[s.muted, { fontSize: 13 }]}>Letzte Besuche: {status.visits.map(time).join(', ')}</Text>}
      <Text style={[s.muted, { fontSize: 12 }]}>Familien-ID für den Support: {familyId.slice(0, 8)}</Text>
    </View>
  );
}
