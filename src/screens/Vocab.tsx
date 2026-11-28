import * as ImagePicker from 'expo-image-picker';
import { DeleteButton } from '../ui/DeleteButton';
import { usePinEntry } from '../data/pin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { currentGrade, today, uid } from '../data/logic';
import { activeTimer } from '../data/learnstats';
import { VocabCard, VocabClaim, VocabDeck } from '../data/types';
import {
  LANGS, MASTERED, Reward, RoundResult, buildRound, checkTyped, choicesFor, dueCards, finishRound, langOf, levelOf,
  liveStreak, masteredCount, modeFor, newCards, parseVocabList, DAILY_CAP, vocabLimit, vocabToday,
} from '../data/vocab';
import { AI_ERROR, extractVocab, generateHints, getSample, judgeAnswer } from '../ai/generate';
import { collectPhotos } from './PhotoCollector';
import { Button, Segmented } from '../ui/Button';
import { C, SHADOW, grad, s } from '../ui/theme';
import { shrink } from './Learn';
import { VocabBooks } from './VocabBook';
import { Icon } from '../ui/Icon';

const MAX_PHOTOS = 6;

function speak(text: string, lang?: string) {
  const synth = (globalThis as any).speechSynthesis;
  const U = (globalThis as any).SpeechSynthesisUtterance;
  if (!synth || !U || !lang) return;
  synth.cancel();
  const u = new U(text.replace(/\(.*?\)/g, ''));
  u.lang = lang; u.rate = 0.9;
  synth.speak(u);
}
const canSpeak = () => Platform.OS === 'web' && !!(globalThis as any).speechSynthesis;

export function Vocab({ childIds, parent, meId }: { childIds: string[]; parent: boolean; meId?: string }) {
  const { data, update } = useFamily();
  const [how, setHow] = useState(false);
  const [childId, setChildId] = useState(childIds[0] ?? '');
  const [editing, setEditing] = useState<VocabDeck | 'new' | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const kid = kids.find(k => k.id === childId) ?? kids[0];
  if (!kid) return null;
  const decks = (data.vocab ?? []).filter(d => d.childId === kid.id && !d.prepId);
  const due = decks.reduce((n, d) => n + dueCards(d).length, 0);
  const streak = liveStreak(data, kid.id);
  const stats = data.vocabStats?.[kid.id];
  const lv = levelOf(stats?.total ?? 0);
  const best = [...decks].sort((a, b) => dueCards(b).length - dueCards(a).length)[0];
  const practicedToday = stats?.last === today();
  const deck = decks.find(d => d.id === playing);
  // Tageslimit: kurze Einheiten, danach Pause bis morgen (Eltern können freigeben)
  const limit = vocabLimit(currentGrade(kid));
  const doneToday = vocabToday(data, kid.id);
  const locked = !parent && doneToday >= limit && stats?.unlock !== today();
  const play = (id: string) => setPlaying(locked ? null : id);

  return (
    <View style={{ gap: 16 }}>
      {kids.length > 1 && <Segmented value={kid.id} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name, n: parent ? (data.vocabClaims ?? []).filter(x => x.childId === c.id).length : 0 }))} />}

      <View style={[{ borderRadius: 24, padding: 20, gap: 14 }, grad('#1f6f63', '#17564d'), SHADOW.md]}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1, opacity: 0.85 }}>VOKABELTRAINER{parent ? ` · ${kid.name.toUpperCase()}` : ''}</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>
              {due ? `${due} ${due === 1 ? 'Vokabel wartet' : 'Vokabeln warten'}` : decks.length ? 'Alles geschafft für heute' : 'Los geht’s mit Vokabeln'}
            </Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Icon name="flame" size={28} color="#fff" fill={!!streak} />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{streak} {streak === 1 ? 'Tag' : 'Tage'}</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Level {lv.level}</Text>
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>noch {lv.toNext} richtige bis Level {lv.level + 1}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(lv.progress * 100)}%`, height: '100%', backgroundColor: '#fff', borderRadius: 5 }} />
          </View>
        </View>
        {!parent && streak > 0 && !practicedToday && <Text style={{ color: '#fff', fontWeight: '700' }}>Heute noch eine Runde, sonst ist deine Serie weg!</Text>}
        {locked && <LockCard name={kid.name} limit={limit} onUnlock={() => update(d => ({ ...d, vocabStats: { ...(d.vocabStats ?? {}), [kid.id]: { ...(d.vocabStats?.[kid.id] ?? { streak: 0, best: 0, total: 0 }), unlock: today() } } }))} />}
        {best && !locked && (
          <Pressable accessibilityRole="button" onPress={() => play(best.id)}
            style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, alignItems: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 18 }}>{due ? `Jetzt üben: ${best.title}` : 'Freie Runde spielen'}</Text>
          </Pressable>
        )}
        {parent && <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>Wenn du übst, gibt es keine Punkte. Punkte bekommt {kid.name} nur selbst.</Text>}
      </View>

      {parent && <VocabClaims childId={kid.id} name={kid.name} />}
      {parent && <VocabReport childId={kid.id} name={kid.name} limit={limit} />}

      <VocabBooks childId={kid.id} meId={meId} parent={parent} onStarted={id => play(id)} />

      {editing && <DeckEditor deck={editing === 'new' ? undefined : editing} childId={kid.id} meId={meId} parent={parent} onDone={() => setEditing(null)} />}

      <View style={s.card}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={s.label}>Vokabelkästen</Text>
          {!editing && <Button title="+ Neue Vokabeln" style={{ paddingVertical: 8, paddingHorizontal: 14 }} onPress={() => setEditing('new')} />}
        </View>
        {!decks.length && <Text style={s.muted}>Noch keine Vokabeln. Fotografiere die Seite im Buch oder tippe die Wörter ab.</Text>}
        {decks.map(d => {
          const n = dueCards(d).length, m = masteredCount(d), L = langOf(d.lang);
          return (
            <View key={d.id} style={{ backgroundColor: C.bg, borderRadius: 16, padding: 14, gap: 8 }}>
              <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap' }]}>
                <Text style={[s.text, { fontWeight: '800', fontSize: 16, flexShrink: 1 }]} numberOfLines={1}>{L.flag} {d.title}</Text>
                {n > 0 ? <Text style={{ color: '#fff', backgroundColor: C.accent2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, fontWeight: '800', fontSize: 12, overflow: 'hidden' }}>{n} fällig</Text>
                  : <Text style={{ color: C.ok, fontWeight: '800', fontSize: 12 }}>✓ erledigt</Text>}
              </View>
              <BoxBar deck={d} />
              <Text style={[s.muted, { fontSize: 12 }]}>{d.cards.length} Vokabeln · {m} sitzen</Text>
              <View style={s.row}>
                <Button title={n ? 'Üben' : 'Freie Runde'} style={{ paddingVertical: 7, paddingHorizontal: 14 }} onPress={() => play(d.id)} />
                <Button ghost title="Bearbeiten" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => setEditing(d)} />
                <DeleteButton parent={parent} style={{ paddingVertical: 7, paddingHorizontal: 12 }} onDelete={() => update(x => ({ ...x, vocab: (x.vocab ?? []).filter(v => v.id !== d.id) }))} />
              </View>
            </View>
          );
        })}
        <Pressable onPress={() => setHow(h => !h)} accessibilityRole="button"><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{how ? 'So funktioniert’s ausblenden' : 'So funktioniert’s anzeigen'}</Text></Pressable>
        {how && <Text style={[s.muted, { fontSize: 13 }]}>Der Trainer fragt in beide Richtungen und gemischt ab: auswählen und selbst schreiben. Je besser ein Wort sitzt, desto öfter wird geschrieben. Falsches kommt in der Runde nochmal, dann zum Schreiben. Was sitzt, kommt seltener dran (nach 1, 2, 4, 7, 14 Tagen). Pro Runde gibt es Punkte, höchstens {DAILY_CAP} am Tag, dazu Bonus für Tage am Stück.</Text>}
      </View>

      {deck && <Practice deck={deck} givePoints={!parent} onClose={() => setPlaying(null)} />}
    </View>
  );
}

function BoxBar({ deck }: { deck: VocabDeck }) {
  const n = deck.cards.length || 1;
  const parts = [0, 1, 2, 3, 4, 5].map(b => deck.cards.filter(c => c.box === b).length);
  const colors = ['#e4e6f0', '#ffd2cc', '#ffb199', '#c9c2ff', '#8f83ff', '#14a05a'];
  return (
    <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: C.line }}>
      {parts.map((p, i) => (p ? <View key={i} style={{ flex: p / n, backgroundColor: colors[i] }} /> : null))}
    </View>
  );
}

export function DeckEditor({ deck, childId, meId, parent, onDone }: { deck?: VocabDeck; childId: string; meId?: string; parent: boolean; onDone: () => void }) {
  const { update } = useFamily();
  const [title, setTitle] = useState(deck?.title ?? '');
  const [lang, setLang] = useState(deck?.lang ?? 'Englisch');
  const [text, setText] = useState('');
  const [cards, setCards] = useState<VocabCard[]>(deck?.cards ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ai, setAi] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { let on = true; getSample().then(x => on && setAi(!!x)); return () => { on = false; }; }, []);
  const parsed = parseVocabList(text);
  const badLines = text.split(/\r?\n/).filter(l => l.trim()).length - parsed.length;

  async function photo() {
    setMsg('');
    const shots = await collectPhotos(MAX_PHOTOS, 'Vokabelseiten fotografieren').catch(() => [] as string[]);
    if (!shots.length) return;
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const photos = shots;
      const out = await extractVocab(photos, lang, ctl.current.signal);
      setText(t => (t.trim() ? t.trim() + '\n' : '') + out.cards.map(c => `${c.front} - ${c.back}`).join('\n'));
      if (!title.trim() && out.title) setTitle(out.title);
      const l = LANGS.find(x => x.value.toLowerCase() === out.lang.toLowerCase());
      if (l) setLang(l.value);
      setMsg(`${out.cards.length} Vokabeln erkannt. Kurz drüberschauen, dann speichern.`);
    } catch (e: any) {
      if (e?.code !== 'cancelled') setMsg(AI_ERROR[e?.code] ?? 'Das Foto konnte nicht gelesen werden. Bitte nochmal versuchen oder abtippen.');
    }
    setBusy(false);
  }

  function save() {
    const all = [...cards, ...newCards(parsed)];
    if (!all.length) return;
    const t = title.trim() || `${lang} ${new Date().toLocaleDateString('de-DE')}`;
    const id = deck?.id ?? uid();
    const next: VocabDeck = { ...(deck ?? {}), id, childId, title: t, lang, cards: all, createdAt: deck?.createdAt ?? today(), by: deck?.by ?? meId };
    update(d => ({ ...d, vocab: deck ? (d.vocab ?? []).map(v => (v.id === id ? next : v)) : [next, ...(d.vocab ?? [])] }));
    onDone();
  }

  return (
    <View style={s.card}>
      <Text style={s.h2}>{deck ? 'Vokabeln bearbeiten' : 'Neue Vokabeln'}</Text>
      <Text style={s.label}>Titel</Text>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Unit 3: At school" />
      <Text style={s.label}>Sprache</Text>
      <View style={s.row}>
        {LANGS.map(l => (
          <Pressable key={l.value} onPress={() => setLang(l.value)} accessibilityRole="button" accessibilityState={{ selected: lang === l.value }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: lang === l.value ? C.accent : C.surface2 }}>
            <Text style={{ fontWeight: '700', color: lang === l.value ? '#fff' : C.fg }}>{l.flag} {l.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ backgroundColor: C.accentSoft, borderRadius: 16, padding: 14, gap: 8 }}>
        <Text style={[s.text, { fontWeight: '800' }]}>Seite im Buch fotografieren</Text>
        {ai ? (
          <>
            <Text style={s.muted}>Die KI liest die Vokabeln ab und schreibt sie unten in die Liste. Bis zu {MAX_PHOTOS} Fotos.</Text>
            {busy ? (
              <View style={[s.row, { alignItems: 'center' }]}>
                <ActivityIndicator color={C.accent} />
                <Text style={{ color: C.accent, fontWeight: '700' }}>Lese Vokabeln …</Text>
                <Button ghost title="Abbrechen" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => ctl.current?.abort()} />
              </View>
            ) : (
              <View style={s.row}>
                <Button title="Seiten fotografieren" onPress={photo} />
              </View>
            )}
          </>
        ) : (
          <Text style={s.muted}>Das Ablesen per Foto macht die KI. Dafür muss dieses Gerät mit dem Familienserver verbunden sein. Bis dahin: Wörter unten abtippen oder eine Liste hineinkopieren.</Text>
        )}
      </View>

      <Text style={s.label}>Vokabeln, eine pro Zeile</Text>
      <TextInput style={[s.input, { minHeight: 140, textAlignVertical: 'top', fontFamily: Platform.OS === 'web' ? 'inherit' : undefined }]} multiline value={text} onChangeText={setText}
        placeholder={'apple - Apfel\nto go - gehen\nschool bag - Schultasche'} autoCapitalize="none" />
      {text.trim() ? <Text style={[s.muted, { fontSize: 13 }]}>{parsed.length} erkannt{badLines > 0 ? `, ${badLines} Zeile${badLines === 1 ? '' : 'n'} ohne Trennzeichen (ein „-“ zwischen Wort und Bedeutung fehlt)` : ''}.</Text> : null}
      {msg ? <Text style={{ color: C.accent, fontWeight: '700' }}>{msg}</Text> : null}

      {cards.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Schon im Kasten ({cards.length})</Text>
          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 4 }}>
            {cards.map(c => (
              <View key={c.id} style={[s.row, { flexWrap: 'nowrap', alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }]}>
                <Text style={[s.text, { flex: 1 }]} numberOfLines={1}><Text style={{ fontWeight: '700' }}>{c.front}</Text>  {c.back}</Text>
                <Text style={[s.muted, { fontSize: 11 }]}>{c.box >= MASTERED ? '✓ sitzt' : `Fach ${c.box}`}</Text>
                {parent && <Pressable accessibilityLabel={`${c.front} entfernen`} onPress={() => setCards(cs => cs.filter(x => x.id !== c.id))} style={{ padding: 6 }}>
                  <Text style={{ color: C.muted, fontWeight: '800' }}>✕</Text>
                </Pressable>}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.row}>
        <Button title={deck ? 'Speichern' : `${parsed.length || ''} Vokabeln speichern`.trim()} disabled={busy || (!parsed.length && !deck) || (!!deck && !cards.length && !parsed.length)} onPress={save} />
        <Button ghost title="Abbrechen" onPress={onDone} />
      </View>
    </View>
  );
}

// ---------------- Üben ----------------

export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: Math.random() * 100, d: 900 + Math.random() * 900, e: ['🎉', '★', '✨', '🟣', '🟠', '💛'][i % 6], r: Math.random() * 360 })), []);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(); }, [v]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <Animated.Text key={i} style={{ position: 'absolute', left: `${p.x}%`, top: -30, fontSize: 22,
          opacity: v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.d / 2.2] }) }, { rotate: `${p.r}deg` }] }}>{p.e}</Animated.Text>
      ))}
    </View>
  );
}

export function Practice({ deck, givePoints, onClose }: { deck: VocabDeck; givePoints: boolean; onClose: () => void }) {
  const { data, update } = useFamily();
  const [round, setRound] = useState(() => buildRound(deck));
  const [queue, setQueue] = useState<VocabCard[]>(round.cards);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [answered, setAnswered] = useState<null | { ok: boolean; chosen?: string; typo?: boolean; note?: string; judged?: boolean }>(null);
  const [judging, setJudging] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [reward, setReward] = useState<Reward | null>(null);
  // Abgebrochene Runde nicht verlieren: Beim Beenden oder Schließen zählen die schon beantworteten Wörter.
  const pending = useRef<{ results: RoundResult[]; done: boolean }>({ results: [], done: false });
  const timer = useRef(activeTimer()).current;
  pending.current.results = results; pending.current.done = !!reward;
  const savePartial = () => {
    const p = pending.current;
    if (p.done || !p.results.length) return;
    p.done = true;
    const res = p.results.slice(), free = round.free;
    const secs = timer.take();
    update(d => finishRound(d, deck.id, res, free, givePoints, undefined, secs).data);
  };
  useEffect(() => {
    const h = () => savePartial();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', h);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('pagehide', h); savePartial(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pop = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const L = langOf(deck.lang);
  const card = queue[idx];
  const plan = useMemo(() => (card ? modeFor(card, deck, queue.slice(0, idx).some(c => c.id === card.id)) : null), [card?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => (card && plan?.mode === 'choice' ? choicesFor(card, deck, plan.reverse) : []), [card?.id, idx, plan?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = card ? (plan?.reverse ? card.back : card.front) : '';
  const solution = card ? (plan?.reverse ? card.front : card.back) : '';
  const askForeign = !plan?.reverse;
  // Merkhilfe: beim ersten Fehler für dieses und bis zu 24 weitere Wörter ohne Hilfe in EINEM KI-Aufruf holen und speichern
  const [hintBusy, setHintBusy] = useState(false);
  const liveCard = data?.vocab?.find(v => v.id === deck.id)?.cards.find(c => c.id === card?.id);
  const hint = liveCard?.hint;
  async function loadHints() {
    if (deck.prepId || hintBusy || hint || !card) return;
    const live = data?.vocab?.find(v => v.id === deck.id)?.cards ?? deck.cards;
    const todo = [card, ...live.filter(c => !c.hint && c.id !== card.id)].slice(0, 25);
    setHintBusy(true);
    try {
      const got = await generateHints(todo, deck.lang);
      if (Object.keys(got).length) update(d => ({ ...d, vocab: (d.vocab ?? []).map(v => (v.id !== deck.id ? v : { ...v, cards: v.cards.map(c => (got[c.id] && !c.hint ? { ...c, hint: got[c.id] } : c)) })) }));
    } catch { /* ohne KI keine Merkhilfe */ }
    setHintBusy(false);
  }

  useEffect(() => { if (card && askForeign && canSpeak() && plan?.mode !== 'type') speak(card.front, L.speech); }, [card?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Schreibantwort prüfen: erst lokal, bei "falsch" fragt die App kurz die KI, ob es inhaltlich doch stimmt. */
  async function submitTyped() {
    if (!card || answered || judging || !typed.trim()) return;
    const dirKey = plan?.reverse ? 'fx' : 'de';
    const liveC = data?.vocab?.find(v => v.id === deck.id)?.cards.find(c => c.id === card.id);
    const r = checkTyped(typed, solution, liveC?.ok?.[dirKey] ?? []);
    if (r !== 'wrong') { answer(true, { typo: r === 'typo' }); return; }
    setJudging(true);
    const j = await judgeAnswer(ask, solution, typed.trim(), deck.lang, !!plan?.reverse);
    setJudging(false);
    if (j?.ok) {
      const a = typed.trim();
      update(d => ({ ...d, vocab: (d.vocab ?? []).map(v => (v.id !== deck.id ? v : { ...v, cards: v.cards.map(c => (c.id !== card.id ? c : { ...c, ok: { ...c.ok, [dirKey]: [...(c.ok?.[dirKey] ?? []), a].slice(-6) } })) })) }));
      answer(true, { typo: true, note: j.note || 'Stimmt, das passt auch.', judged: true });
    } else answer(false, { note: j?.note, judged: !!j });
  }

  function answer(ok: boolean, extra: { chosen?: string; typo?: boolean; note?: string; judged?: boolean } = {}) {
    if (!card || answered) return;
    setAnswered({ ok, ...extra });
    timer.tick();
    setResults(r => [...r, { cardId: card.id, ok }]);
    if (ok) {
      const c = combo + 1;
      setCombo(c); setBestCombo(b => Math.max(b, c));
      Animated.sequence([Animated.timing(pop, { toValue: 1.08, duration: 110, useNativeDriver: false }), Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: false })]).start();
      if (!askForeign && canSpeak()) speak(card.front, L.speech);
    } else {
      setCombo(0);
      Animated.sequence([10, -10, 7, -7, 0].map(x => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: false }))).start();
      loadHints();
      // Falsches kommt in dieser Runde nochmal dran (höchstens zweimal).
      if (queue.filter(c => c.id === card.id).length < 3) setQueue(q => [...q, card]);
      if (canSpeak()) speak(card.front, L.speech);
    }
  }

  /** Kind meint, es war richtig: zählt jetzt als falsch, die Eltern entscheiden später. Selbst auf richtig stellen geht nicht. */
  const [claimed, setClaimed] = useState(false);
  function claim() {
    if (!card || !answered || answered.ok || claimed) return;
    const c: VocabClaim = { id: uid(), childId: deck.childId, deckId: deck.id, cardId: card.id, dir: plan?.reverse ? 'fx' : 'de', ask, solution, answer: typed.trim().slice(0, 120), at: new Date().toISOString(), note: answered.note };
    update(d => ({ ...d, vocabClaims: [...(d.vocabClaims ?? []).filter(x => !(x.cardId === c.cardId && x.answer === c.answer)), c].slice(-50) }));
    setClaimed(true);
  }
  /** Nur Eltern beim eigenen Üben: zählt doch als richtig, kein Wiederholen. */
  function overrule() {
    if (givePoints) return;
    if (!card || !answered || answered.ok) return;
    setAnswered({ ...answered, ok: true });
    setResults(r => r.map((x, i) => (i === r.length - 1 ? { ...x, ok: true } : x)));
    setQueue(q => { const i = q.lastIndexOf(card); return i > idx ? q.filter((_, j) => j !== i) : q; });
  }

  function next() {
    setAnswered(null); setFlipped(false); setTyped(''); setClaimed(false);
    if (idx + 1 < queue.length) { setIdx(idx + 1); return; }
    if (!data) return;
    const secs = timer.take();
    const res = finishRound(data, deck.id, results, round.free, givePoints, undefined, secs);
    setReward(res.reward);
    update(d => finishRound(d, deck.id, results, round.free, givePoints, undefined, secs).data);
  }

  // Richtig: automatisch weiter, damit es flott bleibt.
  useEffect(() => {
    if (answered?.ok && !answered.typo) { const t = setTimeout(next, 750); return () => clearTimeout(t); }
  }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps

  function again() {
    const fresh = (data?.vocab ?? []).find(v => v.id === deck.id) ?? deck;
    const r = buildRound(fresh);
    timer.reset();
    setRound(r); setQueue(r.cards); setIdx(0); setResults([]); setCombo(0); setBestCombo(0); setReward(null);
  }

  const right = (() => { const m = new Map<string, boolean>(); results.forEach(r => { if (!m.has(r.cardId)) m.set(r.cardId, r.ok); }); return [...m.values()].filter(Boolean).length; })();
  const total = new Set(results.map(r => r.cardId)).size;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 640, width: '100%', alignSelf: 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={[s.row, { alignItems: 'center', flexWrap: 'nowrap' }]}>
            <Pressable accessibilityLabel="Beenden" onPress={onClose} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, ...SHADOW.sm }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.fg }}>✕</Text>
            </Pressable>
            <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: C.line, overflow: 'hidden' }}>
              <View style={[{ height: '100%', borderRadius: 7, width: `${reward ? 100 : Math.round((idx / Math.max(1, queue.length)) * 100)}%` }, grad('#ffc94d', '#e8923a', 90)]} />
            </View>
            <Text style={{ fontWeight: '800', color: combo >= 3 ? C.accent2 : C.muted, minWidth: 54, textAlign: 'right' }}>{combo >= 2 ? `×${combo}` : `${Math.min(idx + 1, queue.length)}/${queue.length}`}</Text>
          </View>

          {reward ? (
            <Done reward={reward} right={right} total={total} bestCombo={bestCombo} givePoints={givePoints} free={round.free} onAgain={again} onClose={onClose} />
          ) : card && plan ? (
            <>
              {round.free && idx === 0 && !answered && <Text style={[s.muted, { textAlign: 'center' }]}>Heute ist nichts fällig. Das ist eine freie Runde zum Festigen.</Text>}
              {plan.mode === 'flip' && !answered ? <FlipCard key={card.id + idx} ask={ask} answer={solution} flipped={flipped} onFlip={() => setFlipped(true)} /> : (
              <Animated.View style={[{ borderRadius: 28, padding: 28, minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 10, transform: [{ scale: pop }, { translateX: shake }] },
                answered ? { backgroundColor: answered.ok ? C.ok : C.danger } : grad(C.accent, '#8a6cff'), SHADOW.lg]}>
                <Text style={{ color: '#fff', opacity: 0.85, fontWeight: '700' }}>
                  {deck.prepId ? (plan.mode === 'choice' ? 'Was stimmt?' : 'Weißt du es? Erst überlegen, dann umdrehen.') : plan.mode === 'type' ? (plan.reverse ? `Schreib es auf ${deck.lang === 'Andere' ? 'in der Fremdsprache' : deck.lang} ✍️` : 'Schreib es auf Deutsch ✍️') : plan.reverse ? `Wie heißt das auf ${deck.lang === 'Andere' ? 'der Fremdsprache' : deck.lang}?` : 'Was heißt das auf Deutsch?'}
                </Text>
                <Text style={{ color: '#fff', fontSize: deck.prepId ? (ask.length > 60 ? 20 : 24) : 34, fontWeight: '800', textAlign: 'center' }}>{ask}</Text>
                {askForeign && L.speech && canSpeak() && (
                  <Pressable accessibilityLabel="Vorlesen" onPress={() => speak(card.front, L.speech)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Anhören</Text>
                  </Pressable>
                )}
                {(flipped || (answered && !answered.ok) || answered?.typo) && (
                  <Text style={{ color: '#fff', fontSize: deck.prepId ? 19 : 24, fontWeight: '700', textAlign: 'center' }}>{answered?.judged && answered.ok ? `✓ Richtig! Buch: ${solution}` : answered?.typo ? `Fast! Richtig: ${solution}` : solution}</Text>
                )}
                {answered && !answered.ok && typed.trim() ? <Text style={{ color: '#fff', opacity: 0.85, textDecorationLine: 'line-through' }}>{typed.trim()}</Text> : null}
                {answered?.ok && !answered.typo && <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{combo >= 5 ? 'Unaufhaltsam!' : combo >= 3 ? 'Läuft!' : 'Richtig! ✓'}</Text>}
              </Animated.View>)}

              {plan.mode === 'choice' && (
                <View style={{ gap: 10 }}>
                  {options.map(o => {
                    const isRight = o === solution, picked = answered?.chosen === o;
                    const bg = !answered ? C.surface : isRight ? '#dff5e8' : picked ? '#fde2e5' : C.surface;
                    const bc = !answered ? C.line : isRight ? C.ok : picked ? C.danger : C.line;
                    return (
                      <Pressable key={o} disabled={!!answered} onPress={() => answer(isRight, { chosen: o })} accessibilityRole="button"
                        style={({ pressed }) => [{ backgroundColor: bg, borderColor: bc, borderWidth: 2, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18, transform: [{ scale: pressed ? 0.98 : 1 }] }, SHADOW.sm]}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: C.fg }}>{o}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {plan.mode === 'flip' && !answered && (
                !flipped
                  ? <Button title="Antwort zeigen" onPress={() => setFlipped(true)} style={{ paddingVertical: 16 }} />
                  : (<View style={{ gap: 8 }}>
                    <Text style={[s.muted, { textAlign: 'center' }]}>Hast du es gewusst? Sei ehrlich: Was du nicht wusstest, kommt öfter dran.</Text>
                    <View style={[s.row, { flexWrap: 'nowrap' }]}>
                      <Button color={C.danger} title="Nein, noch nicht" style={{ flex: 1, paddingVertical: 16 }} onPress={() => answer(false)} />
                      <Button color={C.ok} title="Ja, gewusst" style={{ flex: 1, paddingVertical: 16 }} onPress={() => answer(true)} />
                    </View>
                  </View>)
              )}

              {plan.mode === 'type' && !answered && (
                <View style={{ gap: 10 }}>
                  <TextInput autoFocus style={[s.input, { fontSize: 20, paddingVertical: 16 }]} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false}
                    placeholder="Antwort schreiben" returnKeyType="done" onSubmitEditing={submitTyped} editable={!judging} />
                  <View style={[s.row, { flexWrap: 'nowrap' }]}>
                    <Button ghost title="Weiß ich nicht" style={{ flex: 1 }} onPress={() => answer(false)} />
                    <Button title={judging ? 'Prüfe genauer …' : 'Prüfen'} style={{ flex: 1 }} disabled={!typed.trim() || judging} onPress={submitTyped} />
                  </View>
                </View>
              )}

              {answered && (!answered.ok || answered.typo) && (
                <View style={{ gap: 6 }}>
                  {!answered.ok && <Text style={[s.muted, { textAlign: 'center' }]}>Kein Problem, die kommt gleich nochmal.</Text>}
                  {!!answered.note && <Text style={[s.text, { textAlign: 'center' }]}>{answered.note}</Text>}
                  {!answered.ok && typed.trim() && !claimed && <Button ghost title={givePoints ? '✋ Meins stimmt doch, Eltern fragen' : '✋ Stimmt doch (als richtig zählen)'} onPress={givePoints ? claim : overrule} />}
                  {claimed && <Text style={[s.muted, { textAlign: 'center' }]}>Mama oder Papa schauen drüber. Wenn deine Antwort stimmt, zählt sie ab dann als richtig.</Text>}
                  {!answered.ok && !deck.prepId && (hint || hintBusy) && (
                    <View style={{ backgroundColor: '#fff7e0', borderRadius: 18, padding: 16, gap: 6 }}>
                      <Text style={{ fontWeight: '800', color: C.fg }}>Merkhilfe</Text>
                      {hint ? (
                        <>
                          <Pressable onPress={() => L.speech && canSpeak() && speak(hint.ex, L.speech)} accessibilityLabel="Beispielsatz vorlesen">
                            <Text style={{ fontSize: 17, fontWeight: '700', color: C.fg }}>{hint.ex}</Text>
                          </Pressable>
                          <Text style={{ fontSize: 15, color: C.muted }}>{hint.de}</Text>
                          {!!hint.memo && <Text style={{ fontSize: 15, color: C.fg, marginTop: 4 }}>{hint.memo}</Text>}
                        </>
                      ) : <Text style={{ color: C.muted }}>Wird erstellt …</Text>}
                    </View>
                  )}
                  <Button title="Weiter" onPress={next} style={{ paddingVertical: 16 }} />
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Lernkarte mit echter Kartenwende: vorn die Frage (weiß), hinten die Antwort (farbig). Antippen dreht um. */
function FlipCard({ ask, answer, flipped, onFlip }: { ask: string; answer: string; flipped: boolean; onFlip: () => void }) {
  const rot = useRef(new Animated.Value(0)).current;
  const [back, setBack] = useState(false);
  const native = Platform.OS !== 'web';
  useEffect(() => {
    if (!flipped || back) return;
    Animated.timing(rot, { toValue: 1, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      setBack(true); rot.setValue(-1);
      Animated.timing(rot, { toValue: 0, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    });
  }, [flipped]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotateY = rot.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });
  const tag = (t: string, color: string, bg: string) => (
    <View style={{ alignSelf: 'center', backgroundColor: bg, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ color, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>{t}</Text>
    </View>
  );
  return (
    <Pressable onPress={onFlip} disabled={back} accessibilityRole="button" accessibilityLabel={back ? `Antwort: ${answer}` : `Frage: ${ask}. Zum Umdrehen tippen`}>
      <Animated.View style={[{ borderRadius: 24, padding: 24, minHeight: 230, gap: 14, justifyContent: 'center', borderWidth: 2,
        transform: [{ perspective: 1000 }, { rotateY }] },
        back ? { backgroundColor: C.accent, borderColor: C.accent } : { backgroundColor: C.surface, borderColor: C.line }, SHADOW.md]}>
        {back ? (<>
          {tag('ANTWORT', C.accent, '#fff')}
          <Text style={{ color: '#fff', opacity: 0.8, fontSize: 15, textAlign: 'center' }} numberOfLines={3}>{ask}</Text>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.35)', marginHorizontal: 20 }} />
          <Text style={{ color: '#fff', fontSize: answer.length > 50 ? 22 : 27, fontWeight: '800', textAlign: 'center' }}>{answer}</Text>
        </>) : (<>
          {tag('FRAGE', C.accent, C.accentSoft)}
          <Text style={{ color: C.fg, fontSize: ask.length > 60 ? 21 : 25, fontWeight: '800', textAlign: 'center', lineHeight: ask.length > 60 ? 28 : 32 }}>{ask}</Text>
          <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>Erst im Kopf antworten, dann tippen zum Umdrehen</Text>
        </>)}
        {/* Ecke als Hinweis, dass es eine Rückseite gibt */}
        {!back && <View style={{ position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderTopLeftRadius: 14, borderBottomRightRadius: 22, backgroundColor: C.accentSoft }} />}
      </Animated.View>
    </Pressable>
  );
}

function Done({ reward, right, total, bestCombo, givePoints, free, onAgain, onClose }: { reward: Reward; right: number; total: number; bestCombo: number; givePoints: boolean; free: boolean; onAgain: () => void; onClose: () => void }) {
  const ratio = total ? right / total : 0;
  const big = ratio === 1 ? '🏆' : ratio >= 0.7 ? '🎉' : '💪';
  const head = ratio === 1 ? 'Alles richtig!' : ratio >= 0.7 ? 'Stark gemacht!' : 'Gut drangeblieben!';
  const pop = useRef(new Animated.Value(0.3)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: false }).start(); }, [pop]);
  const lines: [string, string][] = [];
  if (givePoints && reward.points > 0) lines.push(['★', `+${reward.points} Punkte`]);
  if (reward.streakBonus > 0) lines.push(['🎁', `+${reward.streakBonus} Bonus für ${reward.streak} Tage am Stück`]);
  if (givePoints && reward.streak > 0) lines.push(['🔥', reward.streakUp ? `${reward.streak} Tage am Stück!` : `${reward.streak} ${reward.streak === 1 ? 'Tag' : 'Tage'} Serie`]);
  if (reward.levelUp) lines.push(['🚀', `Level ${reward.level} erreicht!`]);
  if (reward.newlyMastered > 0) lines.push(['🧠', `${reward.newlyMastered} ${reward.newlyMastered === 1 ? 'Vokabel sitzt' : 'Vokabeln sitzen'} jetzt`]);
  if (bestCombo >= 3) lines.push(['⚡', `Beste Serie: ${bestCombo} richtig hintereinander`]);
  return (
    <View style={{ alignItems: 'center', gap: 16, paddingTop: 10 }}>
      {ratio >= 0.7 && <Confetti />}
      <Animated.Text style={{ fontSize: 96, transform: [{ scale: pop }] }}>{big}</Animated.Text>
      <Text style={[s.h1, { textAlign: 'center' }]}>{head}</Text>
      <Text style={[s.text, { fontSize: 18 }]}>{right} von {total} beim ersten Versuch richtig</Text>
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        {lines.map(([e, t]) => (
          <View key={t} style={[s.row, { alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 14, flexWrap: 'nowrap' }, SHADOW.sm]}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
            <Text style={[s.text, { fontWeight: '800', fontSize: 16, flexShrink: 1 }]}>{t}</Text>
          </View>
        ))}
      </View>
      {givePoints && reward.capped && <Text style={[s.muted, { textAlign: 'center' }]}>Für heute ist das Punkte-Maximum erreicht. Üben bringt trotzdem was: Die Wörter wandern weiter im Kasten.</Text>}
      {!givePoints && <Text style={[s.muted, { textAlign: 'center' }]}>Probelauf als Erwachsene: keine Punkte, aber die Karten zählen.</Text>}
      {free && <Text style={[s.muted, { textAlign: 'center' }]}>Freie Runde: Was falsch war, kommt beim nächsten Üben wieder dran.</Text>}
      <View style={[s.row, { alignSelf: 'stretch', flexWrap: 'nowrap' }]}>
        <Button ghost title="Fertig" style={{ flex: 1, paddingVertical: 16 }} onPress={onClose} />
        <Button title="Noch eine Runde" style={{ flex: 1, paddingVertical: 16 }} onPress={onAgain} />
      </View>
    </View>
  );
}

/**
 * Eltern setzen den Vokabeltrainer zurück, für alle oder ein Kind, mit Eltern-PIN.
 * "Nur Level und Serie" lässt Kästen und Bücher stehen. "Alles" löscht auch Kästen, Bücher und Lernstand.
 * Lernkarten zu Klassenarbeiten und Punkte bleiben immer.
 */
export function VocabReset({ childIds }: { childIds: string[] }) {
  const { data, update } = useFamily();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string>('alle');
  const [all, setAll] = useState(false);
  const [done, setDone] = useState('');
  const pin = usePinEntry('any', () => reset());
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const targets = who === 'alle' ? kids : kids.filter(k => k.id === who);
  const ids = targets.map(k => k.id);
  const decks = (data.vocab ?? []).filter(d => ids.includes(d.childId) && !d.prepId);
  const books = (data.vocabBooks ?? []).filter(b => ids.includes(b.childId));
  const cards = decks.reduce((a, d) => a + d.cards.length, 0);
  const close = () => { setOpen(false); pin.reset(); };
  const reset = () => {
    update(d => {
      const stats = { ...(d.vocabStats ?? {}) };
      ids.forEach(id => delete stats[id]);
      if (!all) return { ...d, vocabStats: stats };
      return { ...d, vocabStats: stats, vocab: (d.vocab ?? []).filter(x => x.prepId || !ids.includes(x.childId)), vocabBooks: (d.vocabBooks ?? []).filter(b => !ids.includes(b.childId)) };
    });
    setDone(`${targets.map(k => k.name).join(', ')}: ${all ? 'Vokabeln komplett zurückgesetzt' : 'Level und Serie auf Anfang'}.`);
    close();
  };
  if (!open) return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable onPress={() => { setOpen(true); setDone(''); }} style={{ padding: 8 }}><Text style={{ color: C.muted, fontWeight: '700' }}>Vokabeln zurücksetzen</Text></Pressable>
      {!!done && <Text style={{ color: C.ok, fontWeight: '700', fontSize: 13 }}>{done}</Text>}
    </View>
  );
  const chip = (on: boolean) => [s.chip, { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: on ? C.danger : C.surface2 }];
  return (
    <View style={[s.card, { gap: 10, borderWidth: 2, borderColor: C.danger }]}>
      <Text style={s.h2}>Vokabeln zurücksetzen</Text>
      <View style={[s.row, { gap: 6 }]}>
        {[{ id: 'alle', name: 'Alle Kinder' }, ...kids].map(k => (
          <Pressable key={k.id} onPress={() => setWho(k.id)} style={chip(who === k.id)}>
            <Text style={{ fontWeight: '800', color: who === k.id ? '#fff' : C.fg }}>{k.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.text}>{targets.map(k => { const st = data.vocabStats?.[k.id]; return `${k.name}: Level ${levelOf(st?.total ?? 0).level}, ${liveStreak(data, k.id)} Tage`; }).join(' · ')}</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Pressable onPress={() => setAll(false)} style={chip(!all)}><Text style={{ fontWeight: '800', color: !all ? '#fff' : C.fg }}>Nur Level und Serie</Text></Pressable>
        <Pressable onPress={() => setAll(true)} style={chip(all)}><Text style={{ fontWeight: '800', color: all ? '#fff' : C.fg }}>Alles</Text></Pressable>
      </View>
      <Text style={[s.muted, { fontSize: 13 }]}>
        {all
          ? `Löscht Level, Serie, ${cards} Vokabeln in ${decks.length} ${decks.length === 1 ? 'Kasten' : 'Kästen'}${books.length ? ` und ${books.length} ${books.length === 1 ? 'Buch' : 'Bücher'}` : ''}.`
          : 'Level und Serie fangen wieder bei 0 an. Vokabelkästen und Bücher bleiben.'}
        {' '}Punkte und Lernkarten zu Klassenarbeiten bleiben. Das lässt sich nicht rückgängig machen. Zum Bestätigen die Eltern-PIN eingeben.
      </Text>
      <View style={[s.row, { gap: 8, flexWrap: 'nowrap' }]}>
        <TextInput style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6 }]} value={pin.pin} editable={!pin.busy} secureTextEntry keyboardType="number-pad" placeholder="PIN"
          accessibilityLabel="Eltern-PIN" onChangeText={pin.onChange} />
        <Button ghost title="Abbrechen" onPress={close} />
      </View>
      {pin.busy && <Text style={[s.muted, { fontSize: 13 }]}>Prüfe …</Text>}
      {!!pin.msg && <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>{pin.msg}</Text>}
    </View>
  );
}

function LockCard({ name, limit, onUnlock }: { name: string; limit: number; onUnlock: () => void }) {
  const [ask, setAsk] = useState(false);
  const pin = usePinEntry('any', () => onUnlock());
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: C.fg }}>Genug für heute, {name}!</Text>
      <Text style={{ color: C.fg }}>Du hast heute schon {limit} Wörter geübt. Dein Kopf braucht jetzt Pause, damit die Wörter über Nacht hängen bleiben. Komm morgen wieder!</Text>
      {!ask ? (
        <Pressable onPress={() => setAsk(true)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}><Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>Eltern: heute weiter üben lassen</Text></Pressable>
      ) : (
        <View style={[s.row, { gap: 8 }]}>
          <TextInput autoFocus style={[s.input, { width: 110, textAlign: 'center', letterSpacing: 6 }]} value={pin.pin} editable={!pin.busy} secureTextEntry keyboardType="number-pad" placeholder="PIN"
            onChangeText={pin.onChange} />
          {pin.busy && <Text style={s.muted}>Prüfe …</Text>}
          {!!pin.msg && <Text style={{ color: C.danger, fontWeight: '700', flexShrink: 1 }}>{pin.msg}</Text>}
        </View>
      )}
    </View>
  );
}

/** Eltern-Überblick: Was sitzt, was ist in Arbeit, wo hakt es, wie viel wurde geübt. */
function VocabReport({ childId, name, limit }: { childId: string; name: string; limit: number }) {
  const { data } = useFamily();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const decks = (data.vocab ?? []).filter(d => d.childId === childId && !d.prepId);
  const cards = decks.flatMap(d => d.cards.map(c => ({ ...c, deck: d.title })));
  if (!cards.length) return null;
  const sit = cards.filter(c => c.box >= 3).length;
  const work = cards.filter(c => c.box > 0 && c.box < 3).length;
  const fresh = cards.filter(c => c.box === 0 && !c.right && !c.wrong).length;
  const shaky = cards.filter(c => c.box === 0 && (c.right || c.wrong)).length;
  const hard = [...cards].filter(c => c.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.box - b.box).slice(0, 8);
  const days = data.vocabStats?.[childId]?.days ?? {};
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() - (6 - i)); const k = d.toISOString().slice(0, 10); return { k, n: Math.max(days[k] ?? 0, cards.filter(c => c.seen === k).length), wd: d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2) }; });
  const max = Math.max(limit, ...week.map(w => w.n));
  const seg = (n: number, color: string) => n > 0 ? <View style={{ flex: n, backgroundColor: color }} /> : null;
  return (
    <View style={[s.card, { gap: 12 }]}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[s.h2, { flexShrink: 1 }]}>So steht {name}</Text>
        <Text style={{ color: C.accent, fontWeight: '800' }}>{open ? 'Weniger ▲' : 'Mehr ▼'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: C.line }}>
        {seg(sit, C.ok)}{seg(work, '#f5b400')}{seg(shaky, C.danger)}{seg(fresh, '#c9c6e8')}
      </View>
      <View style={[s.row, { gap: 12 }]}>
        <Text style={{ fontWeight: '800', color: C.ok }}>✓ {sit} sitzen</Text>
        <Text style={{ fontWeight: '800', color: '#b88400' }}>↻ {work} in Arbeit</Text>
        <Text style={{ fontWeight: '800', color: C.danger }}>✗ {shaky} wackeln</Text>
        <Text style={{ fontWeight: '800', color: C.muted }}>{fresh} noch nicht geübt</Text>
      </View>
      {open && (
        <>
          <Text style={s.label}>Geübt, letzte 7 Tage (Wörter)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 70 }}>
            {week.map(w => (
              <View key={w.k} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 10, color: C.muted }}>{w.n || ''}</Text>
                <View style={{ width: '100%', height: Math.max(3, Math.round((w.n / max) * 44)), borderRadius: 4, backgroundColor: w.n ? C.accent : C.line }} />
                <Text style={{ fontSize: 11, color: C.muted }}>{w.wd}</Text>
              </View>
            ))}
          </View>
          {hard.length > 0 && (
            <>
              <Text style={s.label}>Hier hakt es (meiste Fehler)</Text>
              {hard.map(c => (
                <View key={c.deck + c.id} style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
                  <Text style={{ width: 34, textAlign: 'center', fontWeight: '800', color: C.danger }}>{c.wrong}×</Text>
                  <Text style={[s.text, { flex: 1, minWidth: 0 }]} numberOfLines={1}>{c.front} <Text style={{ color: C.muted }}>· {c.back}</Text></Text>
                </View>
              ))}
            </>
          )}
          <Text style={s.label}>Je Kasten</Text>
          {decks.map(d => { const n = d.cards.length, k = d.cards.filter(c => c.box >= 3).length; return (
            <View key={d.id} style={{ gap: 4 }}>
              <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}><Text style={[s.text, { flexShrink: 1, fontSize: 14 }]} numberOfLines={1}>{d.title}</Text><Text style={{ fontSize: 13, color: C.muted }}>{k} / {n}</Text></View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}><View style={{ width: `${Math.round((k / Math.max(1, n)) * 100)}%`, height: '100%', backgroundColor: C.ok }} /></View>
            </View>
          ); })}
          <Text style={[s.muted, { fontSize: 12 }]}>„Sitzen“ heißt: mindestens dreimal hintereinander gewusst, mit Abstand von Tagen. Tageslimit für {name}: {limit} Wörter. Bisher {cards.filter(c => c.right || c.wrong).length} verschiedene Wörter geübt (Tageswerte zählen erst seit 26.11. abends).</Text>
        </>
      )}
    </View>
  );
}

/** Eltern: Einsprüche des Kindes („Meins stimmt doch“) und von der KI als richtig anerkannte Antworten prüfen. */
function VocabClaims({ childId, name }: { childId: string; name: string }) {
  const { data, update } = useFamily();
  const [showAi, setShowAi] = useState(false);
  if (!data) return null;
  const claims = (data.vocabClaims ?? []).filter(c => c.childId === childId);
  const decks = (data.vocab ?? []).filter(d => d.childId === childId && !d.prepId);
  const accepted = decks.flatMap(d => d.cards.flatMap(c => (['de', 'fx'] as const).flatMap(dir => (c.ok?.[dir] ?? []).map(a => ({ deckId: d.id, card: c, dir, a })))));
  if (!claims.length && !accepted.length) return null;
  const setOk = (deckId: string, cardId: string, dir: 'de' | 'fx', fn: (l: string[]) => string[]) => (d: any) => ({ ...d, vocab: (d.vocab ?? []).map((v: VocabDeck) => (v.id !== deckId ? v : { ...v, cards: v.cards.map(c => (c.id !== cardId ? c : { ...c, ok: { ...c.ok, [dir]: fn(c.ok?.[dir] ?? []) } })) })) });
  const decide = (c: VocabClaim, yes: boolean) => update(d => {
    let next = { ...d, vocabClaims: (d.vocabClaims ?? []).filter(x => x.id !== c.id) };
    if (yes) next = setOk(c.deckId, c.cardId, c.dir, l => [...l.filter(x => x !== c.answer), c.answer].slice(-6))(next);
    return next;
  });
  return (
    <View style={[s.card, { gap: 10 }, claims.length ? { borderWidth: 2, borderColor: C.warn } : null]}>
      {claims.length > 0 && <Text style={s.h2}>✋ {name} meint, das stimmt ({claims.length})</Text>}
      {claims.map(c => (
        <View key={c.id} style={{ backgroundColor: C.bg, borderRadius: 12, padding: 10, gap: 4 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>{c.ask}</Text>
          <Text style={s.text}>Antwort von {name}: <Text style={{ fontWeight: '800', color: C.danger }}>{c.answer}</Text></Text>
          <Text style={s.muted}>Lösung im Buch: {c.solution}</Text>
          {!!c.note && <Text style={[s.muted, { fontSize: 13 }]}>{c.note}</Text>}
          <View style={s.row}>
            <Button title="Stimmt, gilt ab jetzt" color={C.ok} style={{ paddingVertical: 7 }} onPress={() => decide(c, true)} />
            <Button ghost title="Ist falsch" style={{ paddingVertical: 7 }} onPress={() => decide(c, false)} />
          </View>
        </View>
      ))}
      {claims.length > 0 && <Text style={[s.muted, { fontSize: 12 }]}>Bis ihr entscheidet, zählt die Antwort als falsch. Selbst auf richtig stellen kann {name} nicht.</Text>}
      {accepted.length > 0 && (
        <Pressable onPress={() => setShowAi(x => !x)} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={[s.text, { fontWeight: '700', fontSize: 14 }]}>Als richtig anerkannte Antworten ({accepted.length})</Text>
          <Text style={{ color: C.accent, fontWeight: '800' }}>{showAi ? '▲' : '▼'}</Text>
        </Pressable>
      )}
      {showAi && accepted.map(x => (
        <View key={x.card.id + x.dir + x.a} style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
          <Text style={[s.text, { flex: 1, minWidth: 0, fontSize: 14 }]} numberOfLines={2}>{x.dir === 'de' ? x.card.front : x.card.back} → <Text style={{ fontWeight: '800' }}>{x.a}</Text> <Text style={{ color: C.muted }}>(Buch: {x.dir === 'de' ? x.card.back : x.card.front})</Text></Text>
          <Pressable accessibilityLabel="Nicht mehr gelten lassen" onPress={() => update(setOk(x.deckId, x.card.id, x.dir, l => l.filter(v => v !== x.a)))} style={{ paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ color: C.danger, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {showAi && <Text style={[s.muted, { fontSize: 12 }]}>Diese Antworten hat die KI oder ihr als richtig gewertet, sie zählen künftig ohne Nachfrage. Mit ✕ gilt wieder nur die Lösung aus dem Buch.</Text>}
    </View>
  );
}
