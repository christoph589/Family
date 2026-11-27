import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { today } from '../data/logic';
import { Child } from '../data/types';
import { Badge, BADGE_GROUPS, badgeMetrics, BADGES, BUDDIES, buddyMood, buddyStage, drawSurprise, earnedBadges, lastWeekStrong, lifetimeStars, openSurprise, Surprise, SURPRISE_DAYS, surpriseReady, taskStreak } from '../data/quest';
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
            : <Text style={{ color: C.muted }}>Noch {st.next!.at - stars} ★ bis zum Schlüpfen</Text>}
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
  const m = badgeMetrics(d, child);
  const [detail, setDetail] = useState<Badge | null>(null);
  const [party, setParty] = useState<Badge[]>(() => (parent ? [] : BADGES.filter(b => earned.has(b.id) && !seen.includes(b.id))));
  const cols = useWindowDimensions().width >= 480 ? 3 : 2;
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
            {BADGE_GROUPS.map(g => (
              <View key={g.id} style={{ gap: 10 }}>
                <Text style={[s.h2, { fontSize: 18 }]}>{g.title}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {BADGES.filter(b => b.group === g.id).map(b => {
                    const has = earned.has(b.id), isNew = has && !seen.includes(b.id);
                    const pct = Math.min(1, m[b.metric] / b.goal);
                    return (
                      <Pressable key={b.id} onPress={() => setDetail(b)} accessibilityRole="button" accessibilityLabel={`${b.title}: ${b.hint}. ${has ? 'Geschafft' : `${m[b.metric]} von ${b.goal}`}`}
                        style={[{ width: cols === 3 ? '31%' : '47%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 18, alignItems: 'center', gap: 6, backgroundColor: has ? C.surface : C.surface2,
                          borderWidth: has ? (isNew ? 2 : 0) : 1.5, borderStyle: has ? 'solid' : 'dashed', borderColor: has ? C.accent2 : C.line }, has ? SHADOW.sm : null]}>
                        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: has ? C.accentSoft : C.line + '88', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={[{ fontSize: 36 }, has ? null : ({ opacity: 0.35, filter: 'grayscale(1)' } as any)]}>{b.icon}</Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: has ? C.accent : C.muted, textAlign: 'center' }}>{b.title}</Text>
                        {has ? (isNew ? <Text style={{ fontSize: 11, fontWeight: '800', color: C.accent2 }}>Neu!</Text> : null) : (
                          <View style={{ alignSelf: 'stretch', marginHorizontal: 6, height: 8, borderRadius: 4, backgroundColor: C.surface, overflow: 'hidden' }}>
                            <View style={{ width: `${Math.max(pct > 0 ? 6 : 0, pct * 100)}%`, height: '100%', backgroundColor: C.ok, borderRadius: 4 }} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Button ghost title="Schließen" onPress={close} />
          </ScrollView>
          {detail && (
            <Pressable onPress={() => setDetail(null)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(18,21,39,0.35)', padding: 16 }}>
              <View style={[s.row, { flexWrap: 'nowrap', backgroundColor: '#2b2d3a', borderRadius: 22, padding: 16, gap: 14 }, SHADOW.lg]}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[{ fontSize: 42 }, earned.has(detail.id) ? null : ({ filter: 'grayscale(1)', opacity: 0.6 } as any)]}>{detail.icon}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{detail.title}</Text>
                  <Text style={{ color: '#ffffffcc', fontSize: 15 }}>{detail.hint}</Text>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 6 }}>{earned.has(detail.id) ? '✅ Geschafft!' : `Bisher: ${m[detail.metric]} / ${detail.goal} ${detail.unit}`}</Text>
                </View>
              </View>
            </Pressable>
          )}
          {party.length > 0 && (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
              <Confetti key={party[0].id} />
              <Text style={[s.label, { color: C.accent2 }]}>Neues Abzeichen!</Text>
              <BadgePop icon={party[0].icon} />
              <Text style={[s.h1, { textAlign: 'center' }]}>{party[0].title}</Text>
              <Text style={[s.muted, { fontSize: 16, textAlign: 'center' }]}>{party[0].hint}</Text>
              <Button title={party.length > 1 ? `Weiter (noch ${party.length - 1})` : 'Juhu! 🎉'} onPress={() => setParty(p => p.slice(1))} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Abzeichen springt groß herein */
function BadgePop({ icon }: { icon: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.spring(v, { toValue: 1, friction: 4, tension: 60, useNativeDriver: false }).start(); }, [icon, v]);
  return (
    <Animated.View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', transform: [{ scale: v }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }] }}>
      <Text style={{ fontSize: 84 }}>{icon}</Text>
    </Animated.View>
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
          <Text style={{ fontSize: 72 }}>{got ? (got.kind === 'punkte' ? '★' : '🎉') : '🎁'}</Text>
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
