import { useEffect, useRef, useState } from 'react';
import { DeleteButton } from '../ui/DeleteButton';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { LANGS, langOf, newCards } from '../data/vocab';
import { VocabBook } from '../data/types';
import { AI_ERROR, extractVocabBook, getSample } from '../ai/generate';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { pickPhotos } from './Exam';

/** So viele Seiten auf einmal auswählen. Die App schickt sie in kleinen Paketen nacheinander an die KI. */
const MAX_PAGES = 40;
/** Seiten pro KI-Aufruf, damit die Antwort nicht abgeschnitten wird. */
const CHUNK = 3;
const norm = (v: string) => v.trim().toLowerCase();

/** Ganze Vokabelverzeichnisse: zu Schuljahresbeginn in Etappen importieren, dann Bereich (von Unit bis Unit) zum Lernen wählen. */
export function VocabBooks({ childId, meId, parent = false, onStarted }: { childId: string; meId?: string; parent?: boolean; onStarted: (deckId: string) => void }) {
  const { data } = useFamily();
  const [adding, setAdding] = useState(false);
  const books = (data?.vocabBooks ?? []).filter(b => b.childId === childId);
  return (
    <View style={s.card}>
      <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={s.label}>📖 Ganzes Buch</Text>
        {!adding && <Button ghost title="+ Buch importieren" style={{ paddingVertical: 8, paddingHorizontal: 14 }} onPress={() => setAdding(true)} />}
      </View>
      {!books.length && !adding && <Text style={s.muted}>Zum Schuljahresbeginn einmal das ganze Vokabelverzeichnis hinten im Buch fotografieren. Danach wählst du jede Woche, von welcher bis zu welcher Unit gelernt wird.</Text>}
      {adding && <NewBook childId={childId} meId={meId} onDone={() => setAdding(false)} />}
      {books.map(b => <BookCard key={b.id} book={b} parent={parent} onStarted={onStarted} />)}
    </View>
  );
}

function NewBook({ childId, meId, onDone }: { childId: string; meId?: string; onDone: () => void }) {
  const { update } = useFamily();
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState('Englisch');
  return (
    <View style={{ gap: 8, backgroundColor: C.accentSoft, borderRadius: 14, padding: 12 }}>
      <TextInput style={[s.input, { backgroundColor: C.surface }]} value={title} onChangeText={setTitle} placeholder="Name des Buchs, z. B. Englisch Klasse 6" accessibilityLabel="Name des Buchs" />
      <View style={[s.row, { gap: 6 }]}>
        {LANGS.map(l => (
          <Pressable key={l.value} onPress={() => setLang(l.value)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 2, borderColor: C.accent, backgroundColor: lang === l.value ? C.accent : C.surface }}>
            <Text style={{ color: lang === l.value ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{l.flag} {l.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onDone} />
        <Button title="Anlegen, dann Seiten fotografieren" disabled={!title.trim()} onPress={() => {
          update(d => ({ ...d, vocabBooks: [...(d.vocabBooks ?? []), { id: uid(), childId, title: title.trim(), lang, units: [], entries: [], createdAt: today(), by: meId }] }));
          onDone();
        }} />
      </View>
    </View>
  );
}

function BookCard({ book, parent, onStarted }: { book: VocabBook; parent: boolean; onStarted: (deckId: string) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<number[]>([]);
  /** Abgewählte Wörter (Schlüssel unit|wort). Standard: alle Wörter der gewählten Units. */
  const [off, setOff] = useState<Set<string>>(new Set());
  const [showWords, setShowWords] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const count = (u: string) => book.entries.filter(e => e.unit === u).length;
  const picked = book.units.filter((_, i) => sel.includes(i));
  const known = new Set((data?.vocab ?? []).filter(v => v.childId === book.childId).flatMap(v => v.cards.map(c => norm(c.front))));
  const keyOf = (e: { unit: string; front: string }) => e.unit + '|' + e.front;
  const inUnits = book.entries.filter(e => picked.includes(e.unit));
  const chosen = inUnits.filter(e => !off.has(keyOf(e)));
  const fresh = chosen.filter(e => !known.has(norm(e.front)));
  // Sind alle gewählten Wörter schon im Kasten: den Kasten mit den meisten davon zum Weiterüben anbieten
  const home = fresh.length || !chosen.length ? null : (data?.vocab ?? []).filter(v => v.childId === book.childId)
    .map(v => ({ v, n: v.cards.filter(c => chosen.some(e => norm(e.front) === norm(c.front))).length }))
    .sort((a, b) => b.n - a.n)[0]?.v ?? null;
  function tapWord(k: string) {
    if (rangeFrom === '') { setRangeFrom(k); return; }
    if (rangeFrom) {
      const a = inUnits.findIndex(e => keyOf(e) === rangeFrom), b = inUnits.findIndex(e => keyOf(e) === k);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setOff(new Set(inUnits.filter((_, i) => i < lo || i > hi).map(keyOf)));
      setRangeFrom(null); return;
    }
    setOff(x => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  const [prog, setProg] = useState('');
  function merge(cards: { unit: string; front: string; back: string }[]) {
    update(d => ({ ...d, vocabBooks: (d.vocabBooks ?? []).map(b => {
      if (b.id !== book.id) return b;
      const seen = new Set(b.entries.map(e => e.unit + '|' + norm(e.front)));
      const add = cards.filter(c => !seen.has(c.unit + '|' + norm(c.front)) && (seen.add(c.unit + '|' + norm(c.front)), true));
      const units = [...b.units]; for (const c of add) if (!units.includes(c.unit)) units.push(c.unit);
      return { ...b, units, entries: [...b.entries, ...add] };
    }) }));
  }
  async function importPages() {
    setMsg('');
    const photos = await pickPhotos(MAX_PAGES, 'Buchseiten fotografieren').catch(() => [] as string[]);
    if (!photos.length) return;
    setBusy(true);
    ctl.current = new AbortController();
    let lastUnit = book.units[book.units.length - 1], total = 0;
    const failed: string[] = [];
    let stop = '';
    for (let i = 0; i < photos.length && !stop; i += CHUNK) {
      const part = photos.slice(i, i + CHUNK);
      const label = part.length > 1 ? `${i + 1} bis ${i + part.length}` : `${i + 1}`;
      setProg(`Seite ${label} von ${photos.length}`);
      for (let tries = 0; tries < 2; tries++) {
        try {
          const cards = await extractVocabBook(part, book.lang, lastUnit, ctl.current.signal);
          merge(cards); total += cards.length;
          lastUnit = cards[cards.length - 1]?.unit ?? lastUnit;
          break;
        } catch (e: any) {
          if (e?.code === 'cancelled') { stop = 'cancelled'; break; }
          if (e?.code === 'daily_limit' || e?.code === 'no_consent' || e?.code === 'unavailable') { stop = AI_ERROR[e.code] ?? 'Die KI ist gerade nicht erreichbar.'; failed.push(label); break; }
          if (tries === 1) failed.push(label);
        }
      }
    }
    setProg('');
    const rest = stop && stop !== 'cancelled' ? ` ${stop}` : '';
    setMsg(failed.length
      ? `${total} Vokabeln gelesen. Nicht geklappt: Seite ${failed.join(', ')}. Diese Seiten bitte nochmal auswählen.${rest}`
      : stop === 'cancelled' ? `Abgebrochen. ${total} Vokabeln bis dahin gelesen und gespeichert.` : `${total} Vokabeln gelesen und gespeichert.`);
    setBusy(false);
  }
  const tapUnit = (i: number) => { setSel(x => (x.includes(i) ? x.filter(j => j !== i) : [...x, i])); setRangeFrom(null); };
  function start() {
    const id = uid();
    const title = `${book.title}: ${picked.join(', ')}`.slice(0, 80);
    update(d => ({ ...d, vocab: [...(d.vocab ?? []), { id, childId: book.childId, title, lang: book.lang, cards: newCards(fresh.map(e => ({ front: e.front, back: e.back }))), createdAt: today() }] }));
    setSel([]); setOff(new Set()); setShowWords(false); onStarted(id);
  }

  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 14, gap: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[s.text, { fontWeight: '800', fontSize: 16, flexShrink: 1 }]} numberOfLines={1}>{langOf(book.lang).flag} {book.title}</Text>
        <Text style={[s.muted, { fontSize: 12 }]}>{book.entries.length} Vokabeln · {book.units.length} Units</Text>
      </View>
      {book.units.length > 0 && (
        <>
          <Text style={[s.muted, { fontSize: 13 }]}>{sel.length ? `${picked.length} ${picked.length === 1 ? 'Unit' : 'Units'} gewählt. Nochmal antippen nimmt sie wieder raus.` : 'Tippe alle Units an, die gelernt werden sollen.'}</Text>
          <View style={[s.row, { gap: 6 }]}>
            {book.units.map((u, i) => {
              const on = sel.includes(i);
              return (
                <Pressable key={u} onPress={() => tapUnit(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${u}, ${count(u)} Vokabeln`}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: C.accent, backgroundColor: on ? C.accent : C.surface }}>
                  <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '800', fontSize: 13 }}>{u}</Text>
                  <Text style={{ color: on ? '#ffffffcc' : C.muted, fontSize: 11 }}>{count(u)} Wörter</Text>
                </Pressable>
              );
            })}
          </View>
          {picked.length > 0 && (
            <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 10, gap: 8 }}>
              <Pressable onPress={() => setShowWords(v => !v)} accessibilityRole="button" style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
                <Text style={[s.text, { fontWeight: '800', flexShrink: 1 }]}>✏️ Wörter: {chosen.length} von {inUnits.length} gewählt</Text>
                <Text style={{ color: C.accent, fontWeight: '800' }}>{showWords ? 'Zuklappen ▲' : 'Auswählen ▼'}</Text>
              </Pressable>
              {showWords && (
                <>
                  <View style={[s.row, { gap: 6 }]}>
                    <Button ghost title={rangeFrom === null ? '↕️ Von … bis …' : 'Bereich abbrechen'} style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 38 }} onPress={() => setRangeFrom(r => (r === null ? '' : null))} />
                    <Button ghost title="Alle" style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 38 }} onPress={() => { setOff(new Set()); setRangeFrom(null); }} />
                    <Button ghost title="Keine" style={{ paddingVertical: 8, paddingHorizontal: 12, minHeight: 38 }} onPress={() => { setOff(new Set(inUnits.map(keyOf))); setRangeFrom(null); }} />
                  </View>
                  {rangeFrom !== null && <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{rangeFrom === '' ? 'Tippe das erste Wort an.' : 'Jetzt das letzte Wort antippen.'}</Text>}
                  <ScrollView style={{ maxHeight: 380 }} nestedScrollEnabled>
                    {picked.map(u => (
                      <View key={u} style={{ gap: 2, marginBottom: 6 }}>
                        <Text style={[s.label, { marginTop: 4 }]}>{u}</Text>
                        {inUnits.filter(e => e.unit === u).map((e, i) => {
                          const k = keyOf(e), on = !off.has(k), mark = rangeFrom === k;
                          return (
                            <Pressable key={k} onPress={() => tapWord(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, backgroundColor: mark ? C.accentSoft : 'transparent' }}>
                              <Text style={{ width: 24, textAlign: 'right', color: C.muted, fontSize: 12 }}>{i + 1}</Text>
                              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: C.accent, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                {on && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                              </View>
                              <Text style={[s.text, { flex: 1, minWidth: 0, fontSize: 14, opacity: on ? 1 : 0.5 }]} numberOfLines={1}>{e.front} <Text style={{ color: C.muted }}>· {e.back}</Text></Text>
                              {known.has(norm(e.front)) && <Text style={{ fontSize: 11, color: C.muted }}>schon im Kasten</Text>}
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )}
          {picked.length > 0 && (
            <View style={s.row}>
              {home
                ? <Button color={C.ok} title="📚 Diese Wörter jetzt üben" onPress={() => { setSel([]); setOff(new Set()); setShowWords(false); onStarted(home.id); }} />
                : <Button title={fresh.length ? `${fresh.length} Vokabeln lernen` : 'Erst Wörter wählen'} disabled={!fresh.length} onPress={start} />}
              <Button ghost title="Auswahl aufheben" onPress={() => { setSel([]); setOff(new Set()); setRangeFrom(null); }} />
            </View>
          )}
          {home && <Text style={{ color: C.ok, fontWeight: '700', fontSize: 13 }}>Diese Wörter sind schon in deinem Kasten „{home.title}“. Mit dem grünen Knopf übst du sie gleich.</Text>}
          {picked.length > 0 && fresh.length < chosen.length && fresh.length > 0 && <Text style={[s.muted, { fontSize: 12 }]}>Wörter, die schon in einem deiner Kästen sind, kommen nicht doppelt dazu.</Text>}
        </>
      )}
      {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI liest {prog || 'die Seiten'}. Pro Paket etwa eine Minute. Bereits Gelesenes ist schon gespeichert.</Text></View>}
      {!!msg && <Text style={{ color: /Nicht geklappt|Limit|nicht erreichbar/.test(msg) ? C.danger : C.ok, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
      <View style={s.row}>
        {ai && !busy && <Button ghost title={book.entries.length ? '+ Weitere Seiten' : '📸 Seiten scannen'} onPress={importPages} />}
        {busy && <Button ghost title="Abbrechen" onPress={() => ctl.current?.abort()} />}
        {!busy && <DeleteButton parent={parent} confirm="Buch wirklich löschen" onDelete={() => update(d => ({ ...d, vocabBooks: (d.vocabBooks ?? []).filter(b => b.id !== book.id) }))} />}
      </View>
      {!ai && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Das Einlesen macht die KI. Dafür muss das Gerät mit dem Familienserver verbunden sein.</Text>}
    </View>
  );
}
