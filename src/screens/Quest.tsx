import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today } from '../data/logic';
import { Child } from '../data/types';
import { BADGES, BUDDIES, buddyMood, buddyStage, drawSurprise, earnedBadges, lastWeekStrong, lifetimeStars, openSurprise, Surprise, SURPRISE_DAYS, surpriseReady, taskStreak } from '../data/quest';
import { Button } from '../ui/Button';
import { C, s, SHADOW } from '../ui/theme';
import { Confetti } from './Vocab';

/** Eine schmale Zeile: Begleiter, Serie, Abzeichen. Alles Weitere erst nach Antippen. */
export function QuestStrip({ child, parent }: { child: Child; parent: boolean }) {
  const { data } = useFamily();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(false);
  const d = data!;
  const stars = lifetimeStars(d, child.id);
  const st = buddyStage(stars);
  const buddy = BUDDIES.find(b => b.kind === child.buddy?.kind);
  const hatchable = !buddy && st.stage >= 1;
  const streak = taskStreak(d, child.id);
  const earned = earnedBadges(d, child);
  const fresh = [...earned].filter(id => !(child.seenBadges ?? []).includes(id)).length;
  const ready = surpriseReady(d, child);
  const mood = buddyMood(d, child.id);
  const face = buddy ? buddy.emoji : '🥚';
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Begleiter und Abzeichen von ${child.name}`}
        style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.accentSoft, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, gap: 10 }]}>
        <Text style={{ fontSize: 18 + Math.min(st.stage, 3) * 3 }}>{face}</Text>
        <Text style={[s.text, { fontSize: 14, flex: 1, minWidth: 0 }]} numberOfLines={1}>
          {hatchable ? <Text style={{ fontWeight: '800', color: C.accent }}>Dein Ei schlüpft! 🐣</Text>
            : buddy ? <Text><Text style={{ fontWeight: '800' }}>{child.buddy?.name || buddy.label}</Text><Text style={{ color: C.muted }}> {mood.text}</Text></Text>
            : <Text style={{ color: C.muted }}>Noch {st.next!.at - stars} ⭐ bis zum Schlüpfen</Text>}
        </Text>
        {streak > 0 && <Text style={{ fontWeight: '800', color: C.accent2, fontSize: 14 }}>🔥 {streak}</Text>}
        <Text style={{ fontWeight: '800', color: C.accent, fontSize: 14 }}>🏅 {earned.size}{fresh && !parent ? <Text style={{ color: C.accent2 }}> •</Text> : null}</Text>
      </Pressable>
      {ready && (
        <Pressable onPress={() => setBox(true)} accessibilityRole="button" accessibilityLabel="Überraschungskiste öffnen"
          style={[s.row, { flexWrap: 'nowrap', backgroundColor: C.warnSoft, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: C.warn + '66' }]}>
          <Text style={{ fontSize: 26 }}>🎁</Text>
          <Text style={[s.text, { fontSize: 14, flex: 1 }]}><Text style={{ fontWeight: '800' }}>Überraschungskiste!</Text><Text style={{ color: C.muted }}> Starke Woche. Tippen zum Öffnen</Text></Text>
        </Pressable>
      )}
      {open && <QuestModal child={child} parent={parent} onClose={() => setOpen(false)} />}
      {box && <SurpriseModal child={child} onClose={() => setBox(false)} />}
    </>
  );
}

function QuestModal({ child, parent, onClose }: { child: Child; parent: boolean; onClose: () => void }) {
  const { data, update } = useFamily();
  const d = data!;
  const stars = lifetimeStars(d, child.id);
  const st = buddyStage(stars);
  const buddy = BUDDIES.find(b => b.kind === child.buddy?.kind);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState('');
  const earned = earnedBadges(d, child);
  const [seen] = useState(() => child.seenBadges ?? []);
  const streak = taskStreak(d, child.id);
  const week = lastWeekStrong(d, child.id);
  const close = () => {
    if (!parent && [...earned].some(id => !seen.includes(id))) update(x => ({ ...x, children: x.children.map(c => (c.id === child.id ? { ...c, seenBadges: [...earned] } : c)) }));
    onClose();
  };
  const hatch = () => pick && update(x => ({ ...x, children: x.children.map(c => (c.id === child.id ? { ...c, buddy: { kind: pick, name: name.trim() || undefined, since: today() } } : c)) }));
  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,21,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={[{ backgroundColor: C.surface, borderRadius: 26, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' }, SHADOW.lg]}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            {!buddy && st.stage >= 1 ? (
              <View style={{ gap: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 56 }}>🐣</Text>
                <Text style={[s.h2, { textAlign: 'center' }]}>Dein Ei schlüpft! Wer steckt drin?</Text>
                <View style={[s.row, { justifyContent: 'center' }]}>
                  {BUDDIES.map(b => (
                    <Pressable key={b.kind} onPress={() => setPick(b.kind)} accessibilityRole="radio" accessibilityState={{ checked: pick === b.kind }} accessibilityLabel={b.label}
                      style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pick === b.kind ? C.accentSoft : C.surface2, borderWidth: 2, borderColor: pick === b.kind ? C.accent : 'transparent' }}>
                      <Text style={{ fontSize: 34 }}>{b.emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                {pick && <TextInput value={name} onChangeText={setName} placeholder="Name (freiwillig)" accessibilityLabel="Name des Begleiters" maxLength={20} style={[s.input, { alignSelf: 'stretch' }]} />}
                <Button title="Schlüpfen lassen" disabled={!pick} onPress={hatch} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View><Text style={{ fontSize: 44 + st.stage * 10 }}>{buddy ? buddy.emoji : '🥚'}</Text>{buddy && st.extra ? <Text style={{ position: 'absolute', right: -14, bottom: -4, fontSize: 22 + st.stage * 4 }}>{st.extra}</Text> : null}</View>
                <Text style={s.h2}>{buddy ? child.buddy?.name || buddy.label : 'Dein Ei'}</Text>
                <Text style={s.muted}>{buddy ? `Stufe ${st.stage}: ${st.name}` : 'Sammle Punkte, dann schlüpft es'}</Text>
                {st.next && (
                  <View style={{ alignSelf: 'stretch', gap: 4 }}>
                    <View style={{ height: 10, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.round(st.progress * 100)}%`, backgroundColor: C.accent, borderRadius: 99 }} />
                    </View>
                    <Text style={[s.muted, { fontSize: 13, textAlign: 'center' }]}>Noch {st.next.at - stars} Punkte bis {buddy ? `„${st.next.name}“ ${st.next.extra}` : 'es schlüpft'}</Text>
                  </View>
                )}
              </View>
            )}
            <View style={[s.row, { justifyContent: 'space-around' }]}>
              <Stat big={`🔥 ${streak}`} small="Tage am Stück" />
              <Stat big={`${week}/7`} small={`starke Tage letzte Woche (ab ${SURPRISE_DAYS} gibt es 🎁)`} />
            </View>
            <Text style={[s.muted, { fontSize: 13, textAlign: 'center' }]}>Ein Tag zählt, wenn mindestens drei Viertel der Aufgaben erledigt sind.</Text>
            <Text style={s.label}>Abzeichen {earned.size} von {BADGES.length}</Text>
            <View style={[s.row, { gap: 8 }]}>
              {BADGES.map(b => {
                const has = earned.has(b.id), isNew = has && !seen.includes(b.id);
                return (
                  <View key={b.id} accessibilityLabel={`${b.title}: ${b.hint}${has ? '' : ', noch nicht geschafft'}`}
                    style={{ width: 100, padding: 8, borderRadius: 16, alignItems: 'center', gap: 2, backgroundColor: has ? C.accentSoft : C.surface2, opacity: has ? 1 : 0.45, borderWidth: isNew ? 2 : 0, borderColor: C.accent2 }}>
                    <Text style={{ fontSize: 28 }}>{has ? b.icon : '🔒'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: C.fg, textAlign: 'center', alignSelf: 'stretch', ...({ hyphens: 'auto', wordBreak: 'normal', overflowWrap: 'normal' } as any) }} numberOfLines={2}>{b.title.replace(/(Sternen|Wochen|Unaufhalt|Wort|Strahle|Sonder)(?=[a-zäöü])/, '$1\u00ad')}</Text>
                    <Text style={{ fontSize: 11, color: isNew ? C.accent2 : C.muted, textAlign: 'center', fontWeight: isNew ? '800' : '400' }} numberOfLines={2}>{isNew ? 'Neu!' : b.hint}</Text>
                  </View>
                );
              })}
            </View>
            <Button ghost title="Schließen" onPress={close} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const Stat = ({ big, small }: { big: string; small: string }) => (
  <View style={{ alignItems: 'center', maxWidth: 200 }}>
    <Text style={{ fontSize: 24, fontWeight: '800', color: C.fg }}>{big}</Text>
    <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>{small}</Text>
  </View>
);

function SurpriseModal({ child, onClose }: { child: Child; onClose: () => void }) {
  const { update } = useFamily();
  const [got, setGot] = useState<Surprise | null>(null);
  const open = () => { const x = drawSurprise(); setGot(x); update(d => openSurprise(d, child.id, x)); };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,21,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={[{ backgroundColor: C.surface, borderRadius: 26, width: '100%', maxWidth: 420, padding: 24, gap: 14, alignItems: 'center', overflow: 'hidden' }, SHADOW.lg]}>
          {got && <Confetti />}
          <Text style={{ fontSize: 72 }}>{got ? (got.kind === 'punkte' ? '⭐' : '🎉') : '🎁'}</Text>
          {got ? (
            <>
              <Text style={[s.h2, { textAlign: 'center' }]}>{got.text}</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>{got.kind === 'punkte' ? 'Sind schon auf deinem Konto.' : 'Sag Mama oder Papa Bescheid, es steht auch in deinem Punkte-Verlauf.'}</Text>
              <Button title="Super!" onPress={onClose} />
            </>
          ) : (
            <>
              <Text style={[s.h2, { textAlign: 'center' }]}>Starke Woche, {child.name}!</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>Was steckt wohl drin? Nächste Woche gibt es wieder eine.</Text>
              <Button title="Kiste öffnen" onPress={open} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
