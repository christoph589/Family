import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today, uid } from '../data/logic';
import { VocabCard, VocabDeck } from '../data/types';
import {
  LANGS, MASTERED, Reward, RoundResult, buildRound, checkTyped, choicesFor, dueCards, finishRound, langOf, levelOf,
  liveStreak, masteredCount, modeFor, newCards, parseVocabList, DAILY_CAP,
} from '../data/vocab';
import { AI_ERROR, extractVocab, getSample } from '../ai/generate';
import { Button, Segmented } from '../ui/Button';
import { C, SHADOW, grad, s } from '../ui/theme';
import { shrink } from './Learn';

const MAX_PHOTOS = 4;

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
  const [childId, setChildId] = useState(childIds[0] ?? '');
  const [editing, setEditing] = useState<VocabDeck | 'new' | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  const kid = kids.find(k => k.id === childId) ?? kids[0];
  if (!kid) return null;
  const decks = (data.vocab ?? []).filter(d => d.childId === kid.id);
  const due = decks.reduce((n, d) => n + dueCards(d).length, 0);
  const streak = liveStreak(data, kid.id);
  const stats = data.vocabStats?.[kid.id];
  const lv = levelOf(stats?.total ?? 0);
  const best = [...decks].sort((a, b) => dueCards(b).length - dueCards(a).length)[0];
  const practicedToday = stats?.last === today();
  const deck = decks.find(d => d.id === playing);

  return (
    <View style={{ gap: 16 }}>
      {kids.length > 1 && <Segmented value={kid.id} onChange={setChildId} options={kids.map(c => ({ value: c.id, label: c.name }))} />}

      <View style={[{ borderRadius: 24, padding: 20, gap: 14 }, grad('#5b4cf0', '#ff6a5c'), SHADOW.md]}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 1, opacity: 0.85 }}>VOKABELTRAINER{parent ? ` · ${kid.name.toUpperCase()}` : ''}</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>
              {due ? `${due} ${due === 1 ? 'Vokabel wartet' : 'Vokabeln warten'}` : decks.length ? 'Alles geschafft für heute 🎉' : 'Los geht’s mit Vokabeln'}
            </Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 28, opacity: streak ? 1 : 0.45 }}>🔥</Text>
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
        {best && (
          <Pressable accessibilityRole="button" onPress={() => setPlaying(best.id)}
            style={({ pressed }) => [{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, alignItems: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 18 }}>{due ? `Jetzt üben: ${best.title}` : 'Freie Runde spielen'}</Text>
          </Pressable>
        )}
        {parent && <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }}>Wenn du übst, gibt es keine Punkte. Punkte bekommt {kid.name} nur selbst.</Text>}
      </View>

      {editing && <DeckEditor deck={editing === 'new' ? undefined : editing} childId={kid.id} meId={meId} onDone={() => setEditing(null)} />}

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
                <Button title={n ? 'Üben' : 'Freie Runde'} style={{ paddingVertical: 7, paddingHorizontal: 14 }} onPress={() => setPlaying(d.id)} />
                <Button ghost title="Bearbeiten" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => setEditing(d)} />
                {confirmDel === d.id
                  ? <Button color={C.danger} title="Wirklich löschen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => { update(x => ({ ...x, vocab: (x.vocab ?? []).filter(v => v.id !== d.id) })); setConfirmDel(null); }} />
                  : <Button ghost title="Löschen" style={{ paddingVertical: 7, paddingHorizontal: 12 }} onPress={() => setConfirmDel(d.id)} />}
              </View>
            </View>
          );
        })}
        <Text style={[s.muted, { fontSize: 13 }]}>So funktioniert’s: Neue Wörter fragt der Trainer mit Auswahl ab, dann zum Umdrehen und am Ende zum selbst Schreiben. Was sitzt, kommt seltener dran (nach 1, 2, 4, 7, 14 Tagen). Pro Runde gibt es Punkte, höchstens {DAILY_CAP} am Tag, dazu Bonus für Tage am Stück.</Text>
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

function DeckEditor({ deck, childId, meId, onDone }: { deck?: VocabDeck; childId: string; meId?: string; onDone: () => void }) {
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

  async function photo(camera: boolean) {
    setMsg('');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !camera, selectionLimit: MAX_PHOTOS };
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setMsg('Kamera nicht erlaubt.'); return; }
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const photos = await Promise.all(res.assets.slice(0, MAX_PHOTOS).map(shrink));
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
    const next: VocabDeck = { id, childId, title: t, lang, cards: all, createdAt: deck?.createdAt ?? today(), by: deck?.by ?? meId };
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
        <Text style={[s.text, { fontWeight: '800' }]}>📸 Seite im Buch fotografieren</Text>
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
                {Platform.OS !== 'web' && <Button title="Foto machen" onPress={() => photo(true)} />}
                <Button title={Platform.OS === 'web' ? 'Foto hochladen' : 'Aus Fotos wählen'} onPress={() => photo(false)} />
              </View>
            )}
          </>
        ) : (
          <Text style={s.muted}>Das Ablesen per Foto macht die KI. Die läuft in der Live-App noch nicht, dafür fehlt noch die Server-Funktion. Bis dahin: Wörter unten abtippen oder eine Liste hineinkopieren.</Text>
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
                <Pressable accessibilityLabel={`${c.front} entfernen`} onPress={() => setCards(cs => cs.filter(x => x.id !== c.id))} style={{ padding: 6 }}>
                  <Text style={{ color: C.muted, fontWeight: '800' }}>✕</Text>
                </Pressable>
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

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: Math.random() * 100, d: 900 + Math.random() * 900, e: ['🎉', '⭐', '✨', '🟣', '🟠', '💛'][i % 6], r: Math.random() * 360 })), []);
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

function Practice({ deck, givePoints, onClose }: { deck: VocabDeck; givePoints: boolean; onClose: () => void }) {
  const { data, update } = useFamily();
  const [round, setRound] = useState(() => buildRound(deck));
  const [queue, setQueue] = useState<VocabCard[]>(round.cards);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [answered, setAnswered] = useState<null | { ok: boolean; chosen?: string; typo?: boolean }>(null);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [reward, setReward] = useState<Reward | null>(null);
  const pop = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const L = langOf(deck.lang);
  const card = queue[idx];
  const plan = useMemo(() => (card ? { ...modeFor(card, deck) } : null), [card?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => (card && plan?.mode === 'choice' ? choicesFor(card, deck, plan.reverse) : []), [card?.id, idx, plan?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = card ? (plan?.reverse ? card.back : card.front) : '';
  const solution = card ? (plan?.reverse ? card.front : card.back) : '';
  const askForeign = !plan?.reverse;

  useEffect(() => { if (card && askForeign && canSpeak() && plan?.mode !== 'type') speak(card.front, L.speech); }, [card?.id, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  function answer(ok: boolean, extra: { chosen?: string; typo?: boolean } = {}) {
    if (!card || answered) return;
    setAnswered({ ok, ...extra });
    setResults(r => [...r, { cardId: card.id, ok }]);
    if (ok) {
      const c = combo + 1;
      setCombo(c); setBestCombo(b => Math.max(b, c));
      Animated.sequence([Animated.timing(pop, { toValue: 1.08, duration: 110, useNativeDriver: false }), Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: false })]).start();
      if (!askForeign && canSpeak()) speak(card.front, L.speech);
    } else {
      setCombo(0);
      Animated.sequence([10, -10, 7, -7, 0].map(x => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: false }))).start();
      // Falsches kommt in dieser Runde nochmal dran (höchstens zweimal).
      if (queue.filter(c => c.id === card.id).length < 3) setQueue(q => [...q, card]);
      if (canSpeak()) speak(card.front, L.speech);
    }
  }

  function next() {
    setAnswered(null); setFlipped(false); setTyped('');
    if (idx + 1 < queue.length) { setIdx(idx + 1); return; }
    if (!data) return;
    const res = finishRound(data, deck.id, results, round.free, givePoints);
    setReward(res.reward);
    update(d => finishRound(d, deck.id, results, round.free, givePoints).data);
  }

  // Richtig: automatisch weiter, damit es flott bleibt.
  useEffect(() => {
    if (answered?.ok && !answered.typo) { const t = setTimeout(next, 750); return () => clearTimeout(t); }
  }, [answered]); // eslint-disable-line react-hooks/exhaustive-deps

  function again() {
    const fresh = (data?.vocab ?? []).find(v => v.id === deck.id) ?? deck;
    const r = buildRound(fresh);
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
              <View style={[{ height: '100%', borderRadius: 7, width: `${reward ? 100 : Math.round((idx / Math.max(1, queue.length)) * 100)}%` }, grad('#5b4cf0', '#ff6a5c', 90)]} />
            </View>
            <Text style={{ fontWeight: '800', color: combo >= 3 ? C.accent2 : C.muted, minWidth: 54, textAlign: 'right' }}>{combo >= 2 ? `🔥 ×${combo}` : `${Math.min(idx + 1, queue.length)}/${queue.length}`}</Text>
          </View>

          {reward ? (
            <Done reward={reward} right={right} total={total} bestCombo={bestCombo} givePoints={givePoints} free={round.free} onAgain={again} onClose={onClose} />
          ) : card && plan ? (
            <>
              {round.free && idx === 0 && !answered && <Text style={[s.muted, { textAlign: 'center' }]}>Heute ist nichts fällig. Das ist eine freie Runde zum Festigen.</Text>}
              <Animated.View style={[{ borderRadius: 28, padding: 28, minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 10, transform: [{ scale: pop }, { translateX: shake }] },
                answered ? { backgroundColor: answered.ok ? C.ok : C.danger } : grad('#5b4cf0', '#8a6cff'), SHADOW.lg]}>
                <Text style={{ color: '#fff', opacity: 0.85, fontWeight: '700' }}>
                  {plan.reverse ? `Wie heißt das auf ${deck.lang === 'Andere' ? 'der Fremdsprache' : deck.lang}?` : 'Was heißt das auf Deutsch?'}
                </Text>
                <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', textAlign: 'center' }}>{ask}</Text>
                {askForeign && L.speech && canSpeak() && (
                  <Pressable accessibilityLabel="Vorlesen" onPress={() => speak(card.front, L.speech)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>🔊 Anhören</Text>
                  </Pressable>
                )}
                {(flipped || (answered && !answered.ok) || answered?.typo) && (
                  <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' }}>{answered?.typo ? `Fast! Richtig: ${solution}` : solution}</Text>
                )}
                {answered && !answered.ok && typed.trim() ? <Text style={{ color: '#fff', opacity: 0.85, textDecorationLine: 'line-through' }}>{typed.trim()}</Text> : null}
                {answered?.ok && !answered.typo && <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{combo >= 5 ? 'Unaufhaltsam! 🚀' : combo >= 3 ? 'Läuft! 🔥' : 'Richtig! ✓'}</Text>}
              </Animated.View>

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
                  ? <Button title="Umdrehen" onPress={() => setFlipped(true)} style={{ paddingVertical: 16 }} />
                  : (
                    <View style={[s.row, { flexWrap: 'nowrap' }]}>
                      <Button ghost title="😅 Wusste ich nicht" style={{ flex: 1, paddingVertical: 16 }} onPress={() => answer(false)} />
                      <Button color={C.ok} title="✅ Wusste ich" style={{ flex: 1, paddingVertical: 16 }} onPress={() => answer(true)} />
                    </View>
                  )
              )}

              {plan.mode === 'type' && !answered && (
                <View style={{ gap: 10 }}>
                  <TextInput autoFocus style={[s.input, { fontSize: 20, paddingVertical: 16 }]} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false}
                    placeholder="Antwort schreiben" returnKeyType="done" onSubmitEditing={() => { const r = checkTyped(typed, solution); answer(r !== 'wrong', { typo: r === 'typo' }); }} />
                  <View style={[s.row, { flexWrap: 'nowrap' }]}>
                    <Button ghost title="Weiß ich nicht" style={{ flex: 1 }} onPress={() => answer(false)} />
                    <Button title="Prüfen" style={{ flex: 1 }} disabled={!typed.trim()} onPress={() => { const r = checkTyped(typed, solution); answer(r !== 'wrong', { typo: r === 'typo' }); }} />
                  </View>
                </View>
              )}

              {answered && (!answered.ok || answered.typo) && (
                <View style={{ gap: 6 }}>
                  {!answered.ok && <Text style={[s.muted, { textAlign: 'center' }]}>Kein Problem, die kommt gleich nochmal.</Text>}
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

function Done({ reward, right, total, bestCombo, givePoints, free, onAgain, onClose }: { reward: Reward; right: number; total: number; bestCombo: number; givePoints: boolean; free: boolean; onAgain: () => void; onClose: () => void }) {
  const ratio = total ? right / total : 0;
  const big = ratio === 1 ? '🏆' : ratio >= 0.7 ? '🎉' : '💪';
  const head = ratio === 1 ? 'Alles richtig!' : ratio >= 0.7 ? 'Stark gemacht!' : 'Gut drangeblieben!';
  const pop = useRef(new Animated.Value(0.3)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: false }).start(); }, [pop]);
  const lines: [string, string][] = [];
  if (givePoints && reward.points > 0) lines.push(['⭐', `+${reward.points} Punkte`]);
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
