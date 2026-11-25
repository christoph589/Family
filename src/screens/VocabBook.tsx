import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { LANGS, langOf, newCards } from '../data/vocab';
import { VocabBook } from '../data/types';
import { AI_ERROR, extractVocabBook, getSample } from '../ai/generate';
import { Button } from '../ui/Button';
import { C, s } from '../ui/theme';
import { pickPhotos } from './Exam';

/** Pro Durchgang höchstens so viele Seiten, damit die Antwort der KI nicht abgeschnitten wird. */
const BATCH = 6;
const norm = (v: string) => v.trim().toLowerCase();

/** Ganze Vokabelverzeichnisse: zu Schuljahresbeginn in Etappen importieren, dann Bereich (von Unit bis Unit) zum Lernen wählen. */
export function VocabBooks({ childId, meId, onStarted }: { childId: string; meId?: string; onStarted: (deckId: string) => void }) {
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
      {books.map(b => <BookCard key={b.id} book={b} onStarted={onStarted} />)}
    </View>
  );
}

function NewBook({ childId, meId, onDone }: { childId: string; meId?: string; onDone: () => void }) {
  const { update } = useFamily();
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState('Englisch');
  return (
    <View style={{ gap: 8, backgroundColor: C.accentSoft, borderRadius: 14, padding: 12 }}>
      <TextInput style={[s.input, { backgroundColor: C.surface }]} value={title} onChangeText={setTitle} placeholder="Name des Buchs, z. B. Green Line 2" accessibilityLabel="Name des Buchs" />
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

function BookCard({ book, onStarted }: { book: VocabBook; onStarted: (deckId: string) => void }) {
  const { data, update } = useFamily();
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [del, setDel] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const count = (u: string) => book.entries.filter(e => e.unit === u).length;
  const lo = from === null ? null : Math.min(from, to ?? from), hi = from === null ? null : Math.max(from, to ?? from);
  const picked = lo === null ? [] : book.units.slice(lo, hi! + 1);
  const known = new Set((data?.vocab ?? []).filter(v => v.childId === book.childId).flatMap(v => v.cards.map(c => norm(c.front))));
  const fresh = book.entries.filter(e => picked.includes(e.unit) && !known.has(norm(e.front)));

  async function importPages() {
    setMsg('');
    const photos = await pickPhotos(BATCH).catch(() => [] as string[]);
    if (!photos.length) return;
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const cards = await extractVocabBook(photos, book.lang, book.units[book.units.length - 1], ctl.current.signal);
      update(d => ({ ...d, vocabBooks: (d.vocabBooks ?? []).map(b => {
        if (b.id !== book.id) return b;
        const seen = new Set(b.entries.map(e => e.unit + '|' + norm(e.front)));
        const add = cards.filter(c => !seen.has(c.unit + '|' + norm(c.front)) && (seen.add(c.unit + '|' + norm(c.front)), true));
        const units = [...b.units]; for (const c of add) if (!units.includes(c.unit)) units.push(c.unit);
        return { ...b, units, entries: [...b.entries, ...add] };
      }) }));
      setMsg(`${cards.length} Vokabeln gelesen. Weiter mit den nächsten Seiten (bis zu ${BATCH} auf einmal).`);
    } catch (e: any) { if (e?.code !== 'cancelled') setMsg(AI_ERROR[e?.code] ?? 'Die Seiten konnten nicht gelesen werden. Bitte nochmal versuchen.'); }
    setBusy(false);
  }
  function tapUnit(i: number) {
    if (from === null || to !== null) { setFrom(i); setTo(null); } else setTo(i);
  }
  function start() {
    const id = uid();
    const title = `${book.title}: ${picked[0]}${picked.length > 1 ? ` bis ${picked[picked.length - 1]}` : ''}`;
    update(d => ({ ...d, vocab: [...(d.vocab ?? []), { id, childId: book.childId, title, lang: book.lang, cards: newCards(fresh.map(e => ({ front: e.front, back: e.back }))), createdAt: today() }] }));
    setFrom(null); setTo(null); onStarted(id);
  }

  return (
    <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 14, gap: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[s.text, { fontWeight: '800', fontSize: 16, flexShrink: 1 }]} numberOfLines={1}>{langOf(book.lang).flag} {book.title}</Text>
        <Text style={[s.muted, { fontSize: 12 }]}>{book.entries.length} Vokabeln · {book.units.length} Units</Text>
      </View>
      {book.units.length > 0 && (
        <>
          <Text style={[s.muted, { fontSize: 13 }]}>{from === null ? 'Tippe die erste Unit an, die du lernen willst.' : to === null ? 'Jetzt die letzte Unit antippen, oder gleich starten.' : 'Bereich gewählt.'}</Text>
          <View style={[s.row, { gap: 6 }]}>
            {book.units.map((u, i) => {
              const on = lo !== null && i >= lo && i <= hi!;
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
            <View style={s.row}>
              <Button title={fresh.length ? `${fresh.length} Vokabeln lernen` : 'Schon alle im Kasten'} disabled={!fresh.length} onPress={start} />
              <Button ghost title="Auswahl aufheben" onPress={() => { setFrom(null); setTo(null); }} />
            </View>
          )}
          {picked.length > 0 && fresh.length < book.entries.filter(e => picked.includes(e.unit)).length && fresh.length > 0 && <Text style={[s.muted, { fontSize: 12 }]}>Wörter, die schon in einem deiner Kästen sind, kommen nicht doppelt dazu.</Text>}
        </>
      )}
      {busy && <View style={[s.row, { gap: 8 }]}><ActivityIndicator color={C.accent} /><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Die KI liest die Seiten. Das dauert etwa eine Minute.</Text></View>}
      {!!msg && <Text style={{ color: /gelesen/.test(msg) ? C.ok : C.danger, fontWeight: '700', fontSize: 13 }}>{msg}</Text>}
      <View style={s.row}>
        {ai && !busy && <Button ghost title={book.entries.length ? `+ Weitere Seiten (bis ${BATCH})` : `Seiten fotografieren (bis ${BATCH})`} onPress={importPages} />}
        {busy && <Button ghost title="Abbrechen" onPress={() => ctl.current?.abort()} />}
        {!busy && (del
          ? <Button color={C.danger} title="Buch wirklich löschen" onPress={() => update(d => ({ ...d, vocabBooks: (d.vocabBooks ?? []).filter(b => b.id !== book.id) }))} />
          : <Button ghost title="Löschen" onPress={() => setDel(true)} />)}
      </View>
      {!ai && <Text style={{ color: C.warn, fontWeight: '700', fontSize: 13 }}>Das Einlesen macht die KI. Dafür muss das Gerät mit dem Familienserver verbunden sein.</Text>}
    </View>
  );
}
