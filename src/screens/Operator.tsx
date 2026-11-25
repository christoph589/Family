import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
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

/** Übersicht aller Familien für den Betreiber. Nur Kennzahlen, keine Inhalte. Hineingehen nur mit Freigabe der Familie. */
export function Operator({ onClose, onEntered }: { onClose: () => void; onEntered: () => void }) {
  const [list, setList] = useState<OpFamily[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => { setErr(''); opFamilies().then(setList, e => setErr(e.message)); };
  useEffect(load, []);
  const active = list?.filter(f => f.updated_at && Date.now() - new Date(f.updated_at).getTime() < 7 * 864e5).length ?? 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { maxWidth: 980 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={[s.row, { gap: 12 }]}>
          <LogoMark size={40} />
          <View><Text style={s.h1}>Operator</Text><Text style={s.muted}>{BRAND.name} · alle Familien</Text></View>
        </View>
        <View style={s.row}>
          <Button ghost title="↻ Neu laden" onPress={load} />
          <Button ghost title="Zur eigenen Familie" onPress={onClose} />
        </View>
      </View>
      <Text style={s.muted}>Hier siehst du nur Namen und Zahlen, keine Termine, Aufgaben, Fotos oder Geld. In eine Familie kommst du nur, wenn sie unter ⚙️ › Familie den Support-Zugang freigegeben hat. Jeder Besuch wird der Familie angezeigt.</Text>
      {!!err && <Text style={{ color: C.danger, fontWeight: '700' }}>{err}</Text>}
      {!list && !err && <ActivityIndicator color={C.accent} />}
      {list && (
        <>
          <View style={[s.row, { gap: 12 }]}>
            {[['Familien', list.length], ['Aktiv (7 Tage)', active], ['Kinder', list.reduce((a, f) => a + f.children, 0)], ['KI heute', list.reduce((a, f) => a + f.ai_today, 0)], ['Support offen', list.filter(f => f.support_until).length]].map(([l, v]) => (
              <View key={l} style={[s.card, { flexGrow: 1, flexBasis: 140, gap: 2, padding: 16 }]}>
                <Text style={s.label}>{l}</Text><Text style={{ fontSize: 28, fontWeight: '800', color: C.fg }}>{v}</Text>
              </View>
            ))}
          </View>
          {list.map(f => (
            <View key={f.id} style={[s.card, { gap: 8, padding: 16 }, f.support_until ? { borderLeftWidth: 6, borderLeftColor: C.ok } : null]}>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <Text style={[s.h2, { fontSize: 18 }]}>{f.name}{f.mine ? '  · eure Familie' : ''}</Text>
                {f.mine ? null : f.support_until ? (
                  <Button title={busy === f.id ? 'Moment …' : '🛟 Helfen'} disabled={!!busy} style={{ paddingVertical: 8 }}
                    onPress={() => { setBusy(f.id); opEnter(f.id).then(onEntered, e => { setErr(e.message); setBusy(''); }); }} />
                ) : <Text style={[s.muted, { fontSize: 13 }]}>🔒 kein Support freigegeben</Text>}
              </View>
              <Text style={s.muted}>
                {f.children} Kinder · {f.parents} Eltern-Konten · {f.kids} Kindergeräte · zuletzt aktiv {ago(f.updated_at)} · KI heute {f.ai_today} · seit {new Date(f.created_at).toLocaleDateString('de-DE')}
              </Text>
              {f.support_until && <Text style={{ color: C.ok, fontWeight: '700', fontSize: 13 }}>Support freigegeben bis {time(f.support_until)}</Text>}
            </View>
          ))}
          {!list.length && <Text style={s.muted}>Noch keine Familien.</Text>}
        </>
      )}
    </ScrollView>
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
