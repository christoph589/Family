import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, today, uid } from '../data/logic';
import { newCards } from '../data/vocab';
import { partCards, partShare, planFor, PlanDay, PART_GOAL } from '../data/studyplan';
import { AI_ERROR, generateStudyPack } from '../ai/generate';
import { printHtml, packHtml } from '../ui/Print';
import { Child, ExamPrep, FamilyData, StudyPack, VocabDeck } from '../data/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Clip } from '../ui/Clip';
import { C, s } from '../ui/theme';

/** Nach so langer Zeit ohne Ergebnis gilt ein Lauf als abgebrochen (Gerät zu, Netz weg). */
const STALE_MS = 6 * 60 * 1000;
const running = new Set<string>();
export const packRunning = (prep: ExamPrep) => running.has(prep.id) || (!!prep.packJob && !prep.packJob.error && Date.now() - new Date(prep.packJob.at).getTime() < STALE_MS);

/**
 * Lernpaket im Hintergrund erstellen: Merkzettel, Lernkarten je Abschnitt, daraus der Lernplan.
 * Startet automatisch, sobald Unterlagen da sind. Ersetzt den alten Karten-Stapel dieser Klassenarbeit.
 */
export async function startPack(prep: ExamPrep, child: Child | undefined, update: (f: (d: FamilyData) => FamilyData) => void) {
  if (running.has(prep.id)) return;
  running.add(prep.id);
  const at = new Date().toISOString();
  const setPrep = (f: (e: ExamPrep) => ExamPrep) => update(x => ({ ...x, exams: (x.exams ?? []).map(e => (e.id === prep.id ? f(e) : e)) }));
  setPrep(e => ({ ...e, packJob: { at } }));
  try {
    const g = await generateStudyPack(prep, prep.photos, { name: child?.name ?? '', grade: child ? currentGrade(child) : undefined, schoolType: child?.schoolType });
    const cards = newCards(g.parts.flatMap(p => p.cards));
    let k = 0;
    const pack: StudyPack = { at, photos: prep.photos.length, intro: g.intro || undefined, pitfalls: g.pitfalls, memo: g.memo || undefined,
      parts: g.parts.map(p => ({ title: p.title, points: p.points, example: p.example, cards: p.cards.map(() => cards[k++].id) })) };
    const id = uid();
    update(x => {
      const cur = (x.exams ?? []).find(e => e.id === prep.id);
      if (!cur || cur.packJob?.at !== at) return x; // gelöscht oder inzwischen neu gestartet
      return { ...x,
        vocab: [{ id, childId: prep.childId, title: `${prep.subject}: ${prep.title}`.slice(0, 80), lang: 'Andere', cards, createdAt: at, prepId: prep.id }, ...(x.vocab ?? []).filter(v => v.prepId !== prep.id)],
        exams: (x.exams ?? []).map(e => (e.id === prep.id ? { ...e, pack, deckId: id, packJob: undefined } : e)) };
    });
  } catch (e: any) {
    const error = AI_ERROR[e?.code] ?? 'Die KI ist gerade nicht erreichbar. Bitte nochmal versuchen.';
    update(x => ({ ...x, exams: (x.exams ?? []).map(v => (v.id === prep.id && v.packJob?.at === at ? { ...v, packJob: { at, error } } : v)) }));
  } finally { running.delete(prep.id); }
}

const fmtDay = (d: string) => (d === today() ? 'Heute' : new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }));

/** Schritt 1 „Lernen“: Heute dran, Lernplan, Merkzettel je Abschnitt mit Karten dazu. */
export function StudySection({ prep, child, deck, parent, ai, hasSheet, checked, onPractice }: {
  prep: ExamPrep; child?: Child; deck?: VocabDeck; parent: boolean; ai: boolean; hasSheet: boolean; checked: boolean; onPractice: (d: VocabDeck) => void;
}) {
  const { update } = useFamily();
  const [openPart, setOpenPart] = useState<number | null>(null);
  const [allPlan, setAllPlan] = useState(false);
  const [msg, setMsg] = useState('');
  const pack = prep.pack;
  const busy = packRunning(prep);
  const canStart = ai && (prep.photos.length > 0 || prep.title.length >= 10);
  const start = () => { setMsg(''); startPack(prep, child, update as any); };

  if (!pack) {
    if (busy) return <BusyLine text="Die KI macht aus den Unterlagen einen Merkzettel, Lernkarten und einen Lernplan. Das dauert 1 bis 2 Minuten. Bitte die App so lange offen lassen." />;
    return (
      <View style={{ gap: 8 }}>
        {prep.packJob?.error ? <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{prep.packJob.error}</Text>
          : prep.packJob ? <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Das Erstellen wurde unterbrochen.</Text>
          : <Text style={[s.muted, { fontSize: 13 }]}>Erst lernen, dann üben: Die KI macht aus den Unterlagen einen Merkzettel in kleinen Portionen, Lernkarten dazu und einen Plan bis zum Termin.</Text>}
        {canStart ? <Button title={prep.packJob ? 'Nochmal versuchen' : 'Lernpaket erstellen'} onPress={start} style={btnS} />
          : !ai ? <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Das Lernpaket erstellt die KI. Dafür muss das Gerät mit dem Familienserver verbunden sein.</Text>
          : <Text style={[s.muted, { fontSize: 13 }]}>Zuerst Fotos der Unterlagen hinzufügen (unten „+ Fotos“).</Text>}
      </View>
    );
  }

  const plan = planFor(prep, deck, { hasSheet, checked });
  const now = plan.find(p => p.date === today());
  const newPhotos = prep.photos.length - pack.photos;
  const practicePart = (idx: number[]) => {
    if (!deck) return;
    const ids = new Set(idx.flatMap(i => pack.parts[i].cards));
    const cards = idx.length ? deck.cards.filter(c => ids.has(c.id)) : deck.cards;
    onPractice({ ...deck, cards: cards.length >= 2 ? cards : deck.cards });
  };
  function print() {
    setMsg('');
    printHtml(packHtml(pack!, { name: child?.name ?? '', grade: child ? currentGrade(child) : undefined, subject: prep.subject, title: prep.title, date: prep.date }))
      .catch(() => setMsg('Drucken geht hier gerade nicht. Bitte im normalen Browser versuchen.'));
  }

  return (
    <View style={{ gap: 12 }}>
      {!!pack.intro && <Text style={[s.text, { fontSize: 15 }]}>{pack.intro}</Text>}

      {/* Heute dran */}
      {now && (
        <View style={{ backgroundColor: now.done ? C.okSoft : C.accentSoft, borderRadius: 14, padding: 12, gap: 8 }}>
          <View style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
            <Icon name={now.done ? 'check' : 'book'} size={18} color={now.done ? C.ok : C.accent} stroke={2.2} />
            <Text style={[s.text, { fontWeight: '800', flex: 1 }]}>{now.done ? 'Heute geschafft' : 'Heute dran'} · etwa {now.minutes} Min</Text>
          </View>
          <Text style={[s.text, { fontSize: 15 }]}>{dayText(now)}</Text>
          {!now.done && (now.kind === 'teil' || now.kind === 'alles') && (
            <View style={s.row}>
              <Button title="Merkzettel lesen" ghost onPress={() => setOpenPart(now.parts[0] ?? null)} style={btnS} />
              <Button title="Karten üben" onPress={() => practicePart(now.kind === 'alles' ? [] : now.parts)} style={btnS} />
            </View>
          )}
          {!now.done && (now.kind === 'wdh' || now.kind === 'schwach' || now.kind === 'vorabend') && (
            <View style={s.row}><Button title="Alle Karten üben" onPress={() => practicePart([])} style={btnS} /></View>
          )}
        </View>
      )}

      {/* Lernplan */}
      {plan.length > 1 && (
        <View style={{ gap: 4 }}>
          <Pressable onPress={() => setAllPlan(x => !x)} style={[s.row, { justifyContent: 'space-between' }]} accessibilityRole="button">
            <View style={[s.row, { gap: 6 }]}><Icon name="cal" size={16} color={C.muted} /><Text style={s.label}>LERNPLAN BIS {prep.date ? 'ZUR ARBEIT' : 'ZUR PROBE-ARBEIT'}</Text></View>
            <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{allPlan ? 'Weniger' : `Alle ${plan.length} Tage`}</Text>
          </Pressable>
          {(allPlan ? plan : plan.slice(0, 3)).map(p => (
            <View key={p.date + p.kind} style={[s.row, { flexWrap: 'nowrap', gap: 10, paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }]}>
              <Text style={{ width: 62, fontSize: 13, fontWeight: p.date === today() ? '800' : '600', color: p.date === today() ? C.accent : C.muted }}>{fmtDay(p.date)}</Text>
              <Clip style={[s.text, { flex: 1, minWidth: 0, fontSize: 14, color: p.done ? C.muted : C.fg }]} lines={2}>{dayText(p)}</Clip>
              {p.done ? <Icon name="check" size={16} color={C.ok} stroke={2.4} /> : <Text style={[s.muted, { fontSize: 12 }]}>{p.minutes} Min</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Merkzettel in Abschnitten */}
      <View style={{ gap: 6 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.label}>MERKZETTEL</Text>
          <Pressable onPress={print} accessibilityRole="button"><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Drucken</Text></Pressable>
        </View>
        {pack.parts.map((p, i) => {
          const sh = partShare(deck, p), on = openPart === i, n = partCards(deck, p).length;
          return (
            <View key={i} style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? C.accent : C.line, backgroundColor: C.surface, overflow: 'hidden' }}>
              <Pressable onPress={() => setOpenPart(on ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: on }}
                style={[s.row, { flexWrap: 'nowrap', gap: 10, padding: 10 }]}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: sh >= PART_GOAL ? C.ok : C.surface2 }}>
                  {sh >= PART_GOAL ? <Icon name="check" size={14} color="#fff" stroke={2.6} /> : <Text style={{ fontWeight: '800', fontSize: 12, color: C.muted }}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={[s.text, { fontWeight: '700', fontSize: 15 }]} numberOfLines={on ? undefined : 1}>{p.title}</Text>
                  {n > 0 && <View style={{ height: 4, borderRadius: 2, backgroundColor: C.line, overflow: 'hidden' }}><View style={{ height: '100%', width: `${Math.round(sh * 100)}%`, backgroundColor: sh >= PART_GOAL ? C.ok : C.accent }} /></View>}
                </View>
                <View style={{ transform: [{ rotate: on ? '90deg' : '0deg' }] }}><Icon name="chev" size={16} color={C.muted} /></View>
              </Pressable>
              {on && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                  {p.points.map((x, j) => (
                    <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginTop: 8 }} />
                      <Text style={[s.text, { flex: 1, fontSize: 15 }]}>{x}</Text>
                    </View>
                  ))}
                  {p.example && (
                    <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 10, gap: 4 }}>
                      <Text style={[s.text, { fontWeight: '700', fontSize: 14 }]}>Beispiel: {p.example.task}</Text>
                      {p.example.steps.map((x, j) => <Text key={j} style={[s.text, { fontSize: 14 }]}>{j + 1}. {x}</Text>)}
                    </View>
                  )}
                  {n > 0 && <View style={s.row}><Button title={`${n} Karten dazu üben`} onPress={() => practicePart([i])} style={btnS} /></View>}
                </View>
              )}
            </View>
          );
        })}
        {pack.pitfalls.length > 0 && (
          <View style={{ backgroundColor: C.warnSoft, borderRadius: 12, padding: 10, gap: 4 }}>
            <Text style={[s.text, { fontWeight: '800', fontSize: 14 }]}>Aufpassen</Text>
            {pack.pitfalls.map((x, j) => <Text key={j} style={[s.text, { fontSize: 14 }]}>{x.replace(/^Aufpassen:\s*/i, '')}</Text>)}
          </View>
        )}
        {!!pack.memo && <Text style={[s.text, { fontSize: 14, fontStyle: 'italic' }]}>Merkspruch: {pack.memo}</Text>}
      </View>

      {newPhotos > 0 && (
        <View style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 10, gap: 6 }}>
          <Text style={[s.text, { fontSize: 14 }]}>{newPhotos === 1 ? '1 neues Foto' : `${newPhotos} neue Fotos`} seit dem Lernpaket.</Text>
          {busy ? <BusyLine text="Lernpaket wird neu erstellt …" />
            : ai && <View style={s.row}><Button ghost title="Lernpaket neu erstellen" onPress={start} style={btnS} /><Text style={[s.muted, { fontSize: 12, flexShrink: 1 }]}>Der Kartenfortschritt beginnt dann neu.</Text></View>}
        </View>
      )}
      {!newPhotos && parent && ai && (busy ? <BusyLine text="Lernpaket wird neu erstellt …" />
        : <Pressable onPress={start}><Text style={{ color: C.muted, fontWeight: '600', fontSize: 12 }}>Lernpaket neu erstellen (Kartenfortschritt beginnt neu)</Text></Pressable>)}
      {!!prep.packJob?.error && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{prep.packJob.error}</Text>}
      {!!msg && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
    </View>
  );
}

export function dayText(p: PlanDay) {
  if (p.kind === 'teil') return `Lernen: ${p.label}`;
  return p.label;
}

function BusyLine({ text }: { text: string }) {
  return (
    <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>{text}</Text>
    </View>
  );
}
const btnS = { paddingVertical: 8, minHeight: 40 };
