import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { uid } from '../data/logic';
import { trainLabel, trainTest, TrainTest, useTrains } from '../data/train';
import { Commute } from '../data/types';
import { Button } from './Button';
import { C, s, SHADOW } from './theme';

const TONE = { ok: { bg: C.okSoft, fg: C.ok }, warn: { bg: C.warnSoft, fg: C.warn }, bad: { bg: '#fde4e7', fg: C.danger }, none: { bg: C.surface2, fg: C.muted } };

/** Zug auf dem Schulweg: erscheint 60 Minuten vor Abfahrt bis 10 Minuten danach, sonst nichts. */
export function TrainCards({ childIds, big }: { childIds?: string[]; big?: boolean }) {
  const { data } = useFamily();
  const { list, statuses } = useTrains(data, childIds);
  if (!list.length) return null;
  const many = (data?.children.length ?? 0) > 1;
  return (
    <View style={{ gap: 10 }}>
      {list.map(({ child, c }) => {
        const st = statuses[c.id];
        const l = trainLabel(st);
        const t = TONE[l.tone];
        const checked = st?.checkedAt ? new Date(st.checkedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
        return (
          <View key={c.id} style={[{ backgroundColor: t.bg, borderRadius: 22, padding: big ? 18 : 14, gap: 4 }, SHADOW.sm]}>
            <View style={[s.row, { flexWrap: 'nowrap', gap: 12, alignItems: 'center' }]}>
              <Text style={{ fontSize: big ? 44 : 34 }}>{l.icon}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: big ? 22 : 18, fontWeight: '800', color: C.fg }}>
                  {many ? `${child.name}: ` : ''}{c.line ? `${c.line} ` : ''}{st?.planned ?? c.depart} ab {c.from}
                </Text>
                <Text style={{ fontSize: big ? 20 : 17, fontWeight: '800', color: t.fg }}>{l.text}</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>
                  {st?.platform ? `Gleis ${st.platform} · ` : ''}{c.to ? `nach ${c.to} · ` : ''}{checked ? `geprüft ${checked} Uhr` : 'Prüfung läuft ab 45 Min vor Abfahrt'}
                </Text>
              </View>
              {!!c.link && (
                <Pressable accessibilityRole="link" accessibilityLabel="Verbindung bei bahn.de ansehen" onPress={() => Linking.openURL(c.link!)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text style={{ color: C.accent, fontWeight: '800' }}>bahn.de ›</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** "6:59", "6.59", "659" oder "06:59" wird zu "06:59". Ungültig = null. */
export function normTime(v: string): string | null {
  const m = /^\s*(\d{1,2})\s*[:.hH]?\s*(\d{2})\s*(?:Uhr)?\s*$/.exec(v);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}

const DAYS = [{ n: 1, l: 'Mo' }, { n: 2, l: 'Di' }, { n: 3, l: 'Mi' }, { n: 4, l: 'Do' }, { n: 5, l: 'Fr' }];

/** Einstellungen › Familie › Schulweg mit dem Zug (nur Admins). */
export function TrainSetup() {
  const { data, update } = useFamily();
  const [kid, setKid] = useState<string | null>(null);
  const [draft, setDraft] = useState<Commute | null>(null);
  const [test, setTest] = useState<{ id: string; busy?: boolean; res?: TrainTest; err?: string } | null>(null);
  if (!data || !data.children.length) return null;
  const child = data.children.find(c => c.id === kid) ?? data.children[0];
  const setCommutes = (fn: (l: Commute[]) => Commute[]) => update(d => ({ ...d, children: d.children.map(c => (c.id === child.id ? { ...c, commutes: fn(c.commutes ?? []) } : c)) }));
  const [tried, setTried] = useState(false);
  const bad = {
    from: !draft?.from.trim(),
    eva: !/^\d{6,8}$/.test(draft?.fromEva.trim() ?? ''),
    time: !normTime(draft?.depart ?? ''),
    days: !draft?.days.length,
  };
  const missing = [bad.from && 'Einstieg', bad.eva && 'Bahnhofsnummer (6 bis 8 Ziffern)', bad.time && 'Abfahrt (z. B. 6:59)', bad.days && 'Wochentage'].filter(Boolean) as string[];
  const red = (b: boolean) => (tried && b ? { borderColor: C.danger, borderWidth: 2 } : null);
  const save = () => {
    if (!draft) return;
    if (missing.length) { setTried(true); return; }
    const c: Commute = { ...draft, depart: normTime(draft.depart)!, from: draft.from.trim(), fromEva: draft.fromEva.trim(), to: draft.to.trim(), line: draft.line?.trim() || undefined, link: draft.link?.trim() || undefined };
    setCommutes(l => (l.some(x => x.id === c.id) ? l.map(x => (x.id === c.id ? c : x)) : [...l, c]));
    setDraft(null); setTried(false);
  };
  const run = async (c: Commute) => {
    setTest({ id: c.id, busy: true });
    try { setTest({ id: c.id, res: await trainTest(c) }); } catch (e: any) { setTest({ id: c.id, err: e?.message ?? 'Fehler' }); }
  };
  const set = (p: Partial<Commute>) => setDraft(d => (d ? { ...d, ...p } : d));
  return (
    <View style={s.card}>
      <Text style={s.h2}>Schulweg mit dem Zug</Text>
      <Text style={s.muted}>
        Die App prüft ab 45 Minuten vor Abfahrt alle 5 Minuten, ob der Zug pünktlich kommt, ausfällt oder das Gleis wechselt. Bei einer Änderung bekommen Kind und Eltern eine Push-Nachricht. Gespeichert werden nur Bahnhof, Zeit und Linie, keine Standortdaten.
      </Text>
      {data.children.length > 1 && (
        <View style={s.row}>
          {data.children.map(c => (
            <Pressable key={c.id} onPress={() => { setKid(c.id); setDraft(null); setTest(null); }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: c.id === child.id ? c.color : C.surface2 }}>
              <Text style={{ fontWeight: '800', color: c.id === child.id ? '#fff' : C.fg }}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {(child.commutes ?? []).map(c => (
        <View key={c.id} style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 12, gap: 6 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>{c.line ? `${c.line} · ` : ''}{c.depart} ab {c.from}{c.to ? ` → ${c.to}` : ''}</Text>
          <Text style={s.muted}>{c.days.map(n => DAYS.find(d => d.n === n)?.l).filter(Boolean).join(' ')}{c.off ? ' · pausiert' : ''}{c.link ? ' · bahn.de-Link hinterlegt' : ''}</Text>
          <View style={s.row}>
            <Button ghost title="Ändern" onPress={() => setDraft(c)} />
            <Button ghost title={c.off ? 'Wieder an' : 'Pausieren'} onPress={() => setCommutes(l => l.map(x => (x.id === c.id ? { ...x, off: !x.off } : x)))} />
            <Button ghost title="Jetzt testen" onPress={() => run(c)} />
            <Button ghost title="Löschen" onPress={() => setCommutes(l => l.filter(x => x.id !== c.id))} />
          </View>
          {test?.id === c.id && <TestResult t={test} />}
        </View>
      ))}
      {draft ? (
        <View style={{ gap: 8 }}>
          <TextInput style={[s.input, red(bad.from)]} value={draft.from} onChangeText={v => set({ from: v })} placeholder="Einstieg, z. B. Mannheim-Friedrichsfeld Süd" />
          <TextInput style={[s.input, red(bad.eva)]} value={draft.fromEva} onChangeText={v => set({ fromEva: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="Bahnhofsnummer (EVA) des Einstiegs, 7 Ziffern" />
          <Text style={[s.muted, { fontSize: 12 }]}>Die EVA-Nummer steht bei der DB in den Stationsdaten (z. B. Heidelberg Hbf 8000156).</Text>
          <TextInput style={s.input} value={draft.to} onChangeText={v => set({ to: v })} placeholder="Ausstieg, z. B. Heidelberg Hbf" />
          <View style={[s.row, { flexWrap: 'nowrap' }]}>
            <TextInput style={[s.input, { flex: 1 }, red(bad.time)]} value={draft.depart} onChangeText={v => set({ depart: v })} placeholder="Abfahrt 06:59" />
            <TextInput style={[s.input, { flex: 1 }]} value={draft.line ?? ''} onChangeText={v => set({ line: v })} placeholder="Linie, z. B. S3" />
          </View>
          <View style={[s.row, tried && bad.days ? { borderWidth: 2, borderColor: C.danger, borderRadius: 14, padding: 4 } : null]}>
            {DAYS.map(d => {
              const on = draft.days.includes(d.n);
              return (
                <Pressable key={d.n} onPress={() => set({ days: on ? draft.days.filter(x => x !== d.n) : [...draft.days, d.n].sort() })} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: on ? C.accent : C.surface2 }}>
                  <Text style={{ fontWeight: '800', color: on ? '#fff' : C.fg }}>{d.l}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput style={s.input} value={draft.link ?? ''} onChangeText={v => set({ link: v })} autoCapitalize="none" placeholder="bahn.de-Link (optional, nur als Verweis)" />
          <View style={s.row}>
            <Button title="Speichern" onPress={save} />
            <Button ghost title="Abbrechen" onPress={() => { setDraft(null); setTried(false); }} />
          </View>
          {tried && missing.length > 0 && <Text style={{ color: C.danger, fontWeight: '700' }}>Bitte noch ausfüllen: {missing.join(', ')}</Text>}
        </View>
      ) : (
        <Button title="Zug hinzufügen" onPress={() => setDraft({ id: uid(), from: '', fromEva: '', to: '', depart: '', days: [1, 2, 3, 4, 5] })} />
      )}
      <Text style={[s.muted, { fontSize: 11 }]}>Fahrplandaten: Deutsche Bahn. Angaben ohne Gewähr, bei wichtigen Terminen bitte zusätzlich in der DB-App nachsehen.</Text>
    </View>
  );
}

function TestResult({ t }: { t: { busy?: boolean; res?: TrainTest; err?: string } }) {
  if (t.busy) return <Text style={s.muted}>Frage die Bahn …</Text>;
  if (t.err) return <Text style={{ color: C.danger, fontWeight: '700' }}>{t.err}</Text>;
  const r = t.res!;
  if (!r.ok) return <Text style={{ color: C.danger, fontWeight: '700' }}>Keine brauchbare Antwort ({r.status ?? '?'}) von {r.source ?? 'der Bahn'}. {r.raw ? `Rohantwort: ${r.raw.slice(0, 160)}` : r.count === 0 ? 'Die Abfahrtstafel ist leer.' : ''}</Text>;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: r.match ? C.ok : C.warn, fontWeight: '800' }}>
        {r.match ? `✓ Zug gefunden: ${r.match.line} ${r.match.planned}${r.match.actual && r.match.actual !== r.match.planned ? ` (jetzt ${r.match.actual})` : ''}${r.match.platform ? `, Gleis ${r.match.platform}` : ''}` : `Zug nicht gefunden (${r.count} Abfahrten in der Tafel, heute oder nur zu anderen Zeiten)`}
      </Text>
      {r.sample.map((x, i) => <Text key={i} style={s.muted}>{x.planned}{x.actual && x.actual !== x.planned ? ` → ${x.actual}` : ''} · {x.line} nach {x.dest}{x.platform ? ` · Gl. ${x.platform}` : ''}</Text>)}
    </View>
  );
}
