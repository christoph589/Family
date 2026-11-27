import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Clip } from '../ui/Clip';
import { useFamily } from '../data/FamilyContext';
import { cloudEnabled, currentFamilyId } from '../data/cloud';
import { euro, uid } from '../data/logic';
import { parseEuro } from '../data/gifts';
import { Wish } from '../data/types';
import { cleanLink, domainOf, publicList, publicRelease, publicReserve, PublicWish, Reservation, shareUrl, sortWishes, wishParentSet, wishReserved, wishShare, wishesOf } from '../data/wishes';
import { BRAND } from '../brand';
import { Button } from '../ui/Button';
import { PersonHead } from '../ui/Avatar';
import { DeleteButton } from '../ui/DeleteButton';
import { PhotoImg } from '../ui/PhotoImg';
import { C, s } from '../ui/theme';
import { pickDishPhoto } from './Food';

const open = (url: string) => { Linking.openURL(url).catch(() => {}); };

function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (v: 1 | 2 | 3) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`Wichtigkeit ${value} von 3`}>
      {[1, 2, 3].map(n => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n as 1 | 2 | 3)} hitSlop={4} accessibilityRole={onChange ? 'button' : undefined} accessibilityLabel={onChange ? `${n} Stern${n > 1 ? 'e' : ''}` : undefined}>
          <Text style={{ fontSize: size, opacity: n <= value ? 1 : 0.22 }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
const PRIO_LABEL: Record<number, string> = { 1: 'wäre schön', 2: 'wünsche ich mir sehr', 3: 'mein größter Wunsch' };

/** Formular für einen Wunsch. Kinder: ohne Preis. Eltern: mit Preis. */
function WishForm({ initial, withPrice, onSave, onCancel }: { initial?: Partial<Wish>; withPrice?: boolean; onSave: (w: Pick<Wish, 'title' | 'prio'> & Partial<Wish>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [link, setLink] = useState(initial?.link ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [prio, setPrio] = useState<1 | 2 | 3>(initial?.prio ?? 2);
  const [photo, setPhoto] = useState(initial?.photo);
  const [price, setPrice] = useState(initial?.cents !== undefined ? String(initial.cents / 100).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const l = cleanLink(link), badLink = !!link.trim() && !l;
  const cents = parseEuro(price), badPrice = !!price.trim() && cents === undefined;
  return (
    <View style={{ gap: 8, backgroundColor: C.accentSoft, borderRadius: 16, padding: 12 }}>
      <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Was wünschst du dir? z. B. Lego Feuerwehr" accessibilityLabel="Wunsch" autoFocus maxLength={120} />
      <TextInput style={s.input} value={link} onChangeText={setLink} placeholder="Link, z. B. von Amazon (optional)" accessibilityLabel="Link" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      {badLink && <Text style={{ color: C.danger, fontSize: 13, fontWeight: '700' }}>Das ist kein Link. Er muss mit https:// anfangen.</Text>}
      <TextInput style={s.input} value={note} onChangeText={setNote} placeholder="Hinweis, z. B. Größe 140, in Blau (optional)" accessibilityLabel="Hinweis" maxLength={200} />
      {withPrice && <TextInput style={s.input} value={price} onChangeText={setPrice} placeholder="ca. Preis in € (optional)" keyboardType="decimal-pad" accessibilityLabel="Preis" />}
      <View style={[s.row, { gap: 8 }]}>
        <Stars value={prio} onChange={setPrio} size={26} />
        <Text style={[s.muted, { fontSize: 13 }]}>{PRIO_LABEL[prio]}</Text>
      </View>
      <View style={[s.row, { gap: 8 }]}>
        {photo ? <PhotoImg uri={photo} style={{ width: 72, height: 54, borderRadius: 10 }} resizeMode="cover" /> : null}
        <Button ghost title={busy ? 'Lädt …' : photo ? 'Anderes Foto' : 'Foto (optional)'} disabled={busy}
          onPress={async () => { setBusy(true); try { const p = await pickDishPhoto(); if (p) setPhoto(p); } finally { setBusy(false); } }} />
        {photo && <Button ghost title="Foto weg" onPress={() => setPhoto(undefined)} />}
      </View>
      <View style={s.row}>
        <Button ghost title="Abbrechen" onPress={onCancel} />
        <Button title="Speichern" disabled={!title.trim() || badLink || badPrice}
          onPress={() => onSave({ title: title.trim(), link: l, note: note.trim() || undefined, prio, photo, ...(withPrice ? { cents } : {}) })} />
      </View>
    </View>
  );
}

function WishLine({ w, children, onPress }: { w: Wish; children?: React.ReactNode; onPress?: () => void }) {
  return (
    <View style={{ backgroundColor: w.status === 'nein' || w.done ? C.surface2 : C.bg, borderRadius: 14, padding: 10, gap: 8, opacity: w.status === 'nein' ? 0.75 : 1 }}>
      <Pressable onPress={onPress} disabled={!onPress} style={[s.row, { flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start' }]} accessibilityRole={onPress ? 'button' : undefined}>
        {w.photo ? <PhotoImg uri={w.photo} style={{ width: 56, height: 42, borderRadius: 8 }} resizeMode="cover" /> : <Text style={{ fontSize: 28, width: 40, textAlign: 'center' }}>🎁</Text>}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Clip style={[s.text, { fontWeight: '700', textDecorationLine: w.done ? 'line-through' : 'none' }]} lines={2} longPress>{w.title}</Clip>
          {w.note ? <Clip style={[s.muted, { fontSize: 13 }]} lines={2} longPress>{w.note}</Clip> : null}
          <View style={[s.row, { gap: 8 }]}>
            <Stars value={w.prio} size={13} />
            {w.cents !== undefined && <Text style={{ fontSize: 13, fontWeight: '700', color: C.fg }}>ca. {euro(w.cents)}</Text>}
            {w.link && <Pressable onPress={() => open(w.link!)} hitSlop={6}><Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>{domainOf(w.link)}</Text></Pressable>}
          </View>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

const pill = (text: string, bg: string, fg: string) => (
  <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
    <Text style={{ color: fg, fontSize: 12, fontWeight: '800' }}>{text}</Text>
  </View>
);

// Kind ------------------------------------------------------------------------

export function KidWishes({ childId }: { childId: string }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  if (!data) return null;
  const kid = data.children.find(c => c.id === childId);
  if (!kid) return null;
  const mine = sortWishes(wishesOf(data, childId));
  const set = (id: string, p: Partial<Wish>) => update(d => ({ ...d, wishes: (d.wishes ?? []).map(w => (w.id === id ? { ...w, ...p } : w)) }));
  const active = mine.filter(w => !w.done && w.status !== 'nein'), rest = mine.filter(w => w.done || w.status === 'nein');
  return (
    <View style={[s.card, { gap: 12 }]}>
      <PersonHead name={kid.name} color={kid.color} photo={kid.photo} sub="Mein Wunschzettel" value={`${active.length}`} />
      <Text style={s.muted}>Schreib auf, was du dir wünschst. Mama oder Papa schauen drüber. Danach kommt der Wunsch auf deinen Wunschzettel für Geburtstag und Weihnachten.</Text>
      {active.map(w => edit === w.id && w.status === 'neu'
        ? <WishForm key={w.id} initial={w} onCancel={() => setEdit(null)} onSave={p => { set(w.id, { ...p, status: 'neu' }); setEdit(null); }} />
        : (
          <WishLine key={w.id} w={w} onPress={w.status === 'neu' ? () => setEdit(w.id) : undefined}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              {w.status === 'neu' ? pill('Wartet auf Mama oder Papa', C.warnSoft, C.warn) : pill('✓ Auf dem Wunschzettel', C.okSoft, C.ok)}
              <View style={[s.row, { gap: 6 }]}>
                <Text style={[s.muted, { fontSize: 12 }]}>Wie wichtig?</Text>
                <Stars value={w.prio} onChange={v => set(w.id, { prio: v })} size={18} />
              </View>
            </View>
            {w.status === 'neu' && <DeleteButton parent={false} title="Löschen" style={{ paddingVertical: 6, minHeight: 36, alignSelf: 'flex-start' }} onDelete={() => update(d => ({ ...d, wishes: (d.wishes ?? []).filter(x => x.id !== w.id) }))} />}
          </WishLine>
        ))}
      {active.length === 0 && !adding && <Text style={[s.muted, { textAlign: 'center', paddingVertical: 8 }]}>Noch keine Wünsche. Was hättest du gern?</Text>}
      {adding
        ? <WishForm onCancel={() => setAdding(false)} onSave={p => { update(d => ({ ...d, wishes: [...(d.wishes ?? []), { ...p, id: uid(), childId, at: new Date().toISOString(), status: 'neu' } as Wish] })); setAdding(false); }} />
        : <Button title="+ Neuer Wunsch" onPress={() => setAdding(true)} />}
      {rest.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Bekommen oder nicht freigegeben</Text>
          {rest.map(w => <WishLine key={w.id} w={w}>{w.done ? pill('Bekommen', C.okSoft, C.ok) : pill('Nicht freigegeben', C.surface, C.muted)}</WishLine>)}
        </View>
      )}
    </View>
  );
}

// Eltern ----------------------------------------------------------------------

export function ParentWishes({ childIds, meId }: { childIds: string[]; meId?: string }) {
  const { data } = useFamily();
  const [fid, setFid] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Reservation[]>([]);
  const [err, setErr] = useState('');
  const reload = useCallback(async () => {
    if (!cloudEnabled) return;
    const f = await currentFamilyId();
    setFid(f);
    if (!f) return;
    try { const [t, r] = await Promise.all([wishShare(f), wishReserved(f)]); setTokens(t); setRes(r); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  return (
    <View style={{ gap: 14 }}>
      {err ? <View style={[s.card, { backgroundColor: C.warnSoft }]}><Text style={{ color: C.warn, fontWeight: '700' }}>{err}</Text></View> : null}
      {kids.map(k => <KidWishAdmin key={k.id} childId={k.id} meId={meId} fid={fid} token={tokens[k.id]} res={res} reload={reload} setTokens={setTokens} />)}
      <Text style={[s.muted, { fontSize: 12 }]}>Kinder sehen nie, wer was reserviert hat. Auf dem Teilen-Link stehen nur der Vorname und die freigegebenen Wünsche, keine Fotos und keine anderen Familiendaten.</Text>
    </View>
  );
}

function KidWishAdmin({ childId, meId, fid, token, res, reload, setTokens }: { childId: string; meId?: string; fid: string | null; token?: string; res: Reservation[]; reload: () => Promise<void>; setTokens: (t: Record<string, string>) => void }) {
  const { data, update } = useFamily();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [showRest, setShowRest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const kid = data!.children.find(c => c.id === childId)!;
  const all = sortWishes(wishesOf(data!, childId));
  const pending = all.filter(w => w.status === 'neu'), listed = all.filter(w => w.status === 'frei' && !w.done), rest = all.filter(w => w.status === 'nein' || w.done);
  const set = (id: string, p: Partial<Wish>) => update(d => ({ ...d, wishes: (d.wishes ?? []).map(w => (w.id === id ? { ...w, ...p, by: meId } : w)) }));
  const del = (id: string) => update(d => ({ ...d, wishes: (d.wishes ?? []).filter(w => w.id !== id) }));
  const resOf = (id: string) => res.find(r => r.wish_id === id);
  const me = (data!.parents ?? []).find(p => p.id === meId);
  const act = async (f: () => Promise<unknown>) => { setBusy(true); setMsg(''); try { await f(); await reload(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const link = token ? shareUrl(token) : '';
  const share = async () => {
    const text = `Hier ist der Wunschzettel von ${kid.name.split(' ')[0]}. Wenn du etwas schenken möchtest, tipp auf „Ich schenke das“. Dann weiß jeder, dass es schon vergeben ist: ${link}`;
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) await nav.share({ title: `Wunschzettel ${kid.name.split(' ')[0]}`, text });
      else if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); setMsg('Kopiert. Jetzt per WhatsApp oder Mail schicken.'); }
    } catch { /* abgebrochen */ }
  };
  return (
    <View style={[s.card, { gap: 12 }]}>
      <PersonHead name={kid.name} color={kid.color} photo={kid.photo} sub="Wunschzettel" value={`${listed.length}`} />

      {pending.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Neu, bitte prüfen ({pending.length})</Text>
          {pending.map(w => {
            const p = price[w.id] ?? '', cents = parseEuro(p);
            return (
              <WishLine key={w.id} w={w}>
                {w.link && <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={1}>Link prüfen: {w.link}</Text>}
                <View style={[s.row, { gap: 8 }]}>
                  <TextInput style={[s.input, { width: 120, paddingVertical: 8 }]} value={p} onChangeText={t => setPrice(x => ({ ...x, [w.id]: t }))} placeholder="ca. € (opt.)" keyboardType="decimal-pad" accessibilityLabel={`Preis für ${w.title}`} />
                  <Button title="Freigeben" color={C.ok} style={{ paddingVertical: 8, minHeight: 40 }} disabled={!!p.trim() && cents === undefined}
                    onPress={() => set(w.id, { status: 'frei', ...(cents !== undefined ? { cents } : {}) })} />
                  <Button ghost title="Nicht freigeben" style={{ paddingVertical: 8, minHeight: 40 }} onPress={() => set(w.id, { status: 'nein' })} />
                </View>
              </WishLine>
            );
          })}
        </View>
      )}

      <Text style={s.label}>Auf dem Wunschzettel ({listed.length})</Text>
      {listed.length === 0 && <Text style={s.muted}>Noch nichts freigegeben.</Text>}
      {listed.map(w => {
        const r = resOf(w.id);
        if (edit === w.id) return <WishForm key={w.id} initial={w} withPrice onCancel={() => setEdit(null)} onSave={p => { set(w.id, p); setEdit(null); }} />;
        return (
          <WishLine key={w.id} w={w} onPress={() => setEdit(w.id)}>
            {r
              ? pill(r.by_parent ? `Schenkt ihr${r.name ? ` (${r.name})` : ''}` : `Reserviert${r.name ? ` von ${r.name}` : ''}`, C.accentSoft, C.accent)
              : pill('Noch frei', C.okSoft, C.ok)}
            <View style={[s.row, { gap: 6 }]}>
              {fid && (r
                ? <Button ghost title="Reservierung aufheben" disabled={busy} style={{ paddingVertical: 6, minHeight: 36 }} onPress={() => act(() => wishParentSet(fid, childId, w.id, false))} />
                : <Button ghost title="Wir schenken das" disabled={busy} style={{ paddingVertical: 6, minHeight: 36 }} onPress={() => act(() => wishParentSet(fid, childId, w.id, true, me?.title || me?.name))} />)}
              <Button ghost title="Bekommen" style={{ paddingVertical: 6, minHeight: 36 }} onPress={() => set(w.id, { done: true })} />
              <Button ghost title="Von der Liste nehmen" style={{ paddingVertical: 6, minHeight: 36 }} onPress={() => set(w.id, { status: 'nein' })} />
            </View>
          </WishLine>
        );
      })}
      {adding
        ? <WishForm withPrice onCancel={() => setAdding(false)} onSave={p => { update(d => ({ ...d, wishes: [...(d.wishes ?? []), { ...p, id: uid(), childId, at: new Date().toISOString(), status: 'frei', by: meId } as Wish] })); setAdding(false); }} />
        : <Button ghost title={`+ Wunsch für ${kid.name} eintragen`} onPress={() => setAdding(true)} />}

      {cloudEnabled && fid && (
        <View style={{ gap: 8, backgroundColor: C.surface2, borderRadius: 16, padding: 12 }}>
          <Text style={[s.text, { fontWeight: '800' }]}>Teilen für Geburtstag und Weihnachten</Text>
          {token ? (<>
            <Text style={[s.muted, { fontSize: 13 }]}>Wer diesen Link hat, sieht die freigegebenen Wünsche ohne Anmeldung und kann einen reservieren. Schick ihn nicht in Gruppen, in denen {kid.name.split(' ')[0]} mitliest.</Text>
            <Text selectable style={{ fontSize: 12, color: C.fg, backgroundColor: C.surface, borderRadius: 10, padding: 8 }} numberOfLines={2}>{link}</Text>
            <View style={[s.row, { gap: 6 }]}>
              <Button title="Link teilen" disabled={busy} onPress={share} />
              <Button ghost title="Ansehen" onPress={() => open(link)} />
              <Button ghost title="Neuer Link" disabled={busy} onPress={() => act(async () => { setTokens(await wishShare(fid, childId, 'new')); })} />
              <Button ghost title="Abschalten" disabled={busy} onPress={() => act(async () => { setTokens(await wishShare(fid, childId, 'off')); })} />
            </View>
            <Text style={[s.muted, { fontSize: 12 }]}>„Neuer Link“ und „Abschalten“ machen den alten Link sofort ungültig. Reservierungen bleiben erhalten.</Text>
          </>) : (<>
            <Text style={[s.muted, { fontSize: 13 }]}>Noch kein Link. Erst wenn ihr ihn erstellt, kann jemand außerhalb der Familie die Liste sehen.</Text>
            <Button title="Teilen-Link erstellen" disabled={busy} onPress={() => act(async () => { setTokens(await wishShare(fid, childId, 'on')); })} />
          </>)}
          {msg ? <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>{msg}</Text> : null}
        </View>
      )}

      {rest.length > 0 && (
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setShowRest(!showRest)} accessibilityRole="button"><Text style={[s.label, { color: C.accent }]}>{showRest ? '▾' : '▸'} Bekommen oder nicht freigegeben ({rest.length})</Text></Pressable>
          {showRest && rest.map(w => (
            <WishLine key={w.id} w={w}>
              <View style={[s.row, { gap: 6 }]}>
                {w.done ? pill('Bekommen', C.okSoft, C.ok) : pill('Nicht freigegeben', C.surface, C.muted)}
                <Button ghost title={w.done ? 'Doch nicht bekommen' : 'Doch freigeben'} style={{ paddingVertical: 6, minHeight: 36 }} onPress={() => set(w.id, w.done ? { done: false } : { status: 'frei' })} />
                <DeleteButton parent style={{ paddingVertical: 6, minHeight: 36 }} onDelete={() => del(w.id)} />
              </View>
            </WishLine>
          ))}
        </View>
      )}
    </View>
  );
}

// Öffentliche Seite (?wunsch=…) ------------------------------------------------

const keyStore = (tok: string) => `famelio:wish:${tok}`;

export function PublicWishes({ token }: { token: string }) {
  const [list, setList] = useState<{ name: string; wishes: PublicWish[] } | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => publicList(token).then(setList, e => { setErr(e.message); setList(null); }), [token]);
  useEffect(() => {
    load();
    AsyncStorage.getItem(keyStore(token)).then(r => r && setKeys(JSON.parse(r))).catch(() => {});
    AsyncStorage.getItem('famelio:wishname').then(n => n && setWho(n)).catch(() => {});
  }, [token, load]);
  const saveKeys = (k: Record<string, string>) => { setKeys(k); AsyncStorage.setItem(keyStore(token), JSON.stringify(k)).catch(() => {}); };
  const reserve = async (id: string) => {
    setBusy(true); setErr('');
    try {
      const k = await publicReserve(token, id, who.trim() || undefined);
      saveKeys({ ...keys, [id]: k });
      if (who.trim()) AsyncStorage.setItem('famelio:wishname', who.trim()).catch(() => {});
      setAsk(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); await load(); }
  };
  const release = async (id: string) => {
    setBusy(true); setErr('');
    try { await publicRelease(token, id, keys[id]); const k = { ...keys }; delete k[id]; saveKeys(k); } catch (e: any) { setErr(e.message); } finally { setBusy(false); await load(); }
  };

  if (list === undefined) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.accent} /></View>;
  if (!list) return (
    <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
      <View style={[s.card, { maxWidth: 480, alignSelf: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 44 }}>🎁</Text>
        <Text style={[s.h2, { textAlign: 'center' }]}>Dieser Wunschzettel ist nicht (mehr) geteilt.</Text>
        <Text style={[s.muted, { textAlign: 'center' }]}>{err || 'Frag bei der Familie nach einem neuen Link.'}</Text>
      </View>
    </View>
  );
  const mine = (w: PublicWish) => !!keys[w.id] && w.reserved;
  const sorted = [...list.wishes].sort((a, b) => Number(a.reserved && !mine(a)) - Number(b.reserved && !mine(b)));
  const free = list.wishes.filter(w => !w.reserved).length;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { maxWidth: 640 }]}>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 12 }}>
        <Text style={{ fontSize: 52 }}>🎁</Text>
        <Text style={[s.h1, { textAlign: 'center' }]}>Wunschzettel von {list.name}</Text>
        <Text style={[s.muted, { textAlign: 'center', maxWidth: 460 }]}>Tipp auf „Ich schenke das“, dann ist der Wunsch für alle anderen vergeben und nichts kommt doppelt. {list.name} sieht nicht, wer was schenkt.</Text>
      </View>
      {err ? <Text style={{ color: C.danger, fontWeight: '700', textAlign: 'center' }}>{err}</Text> : null}
      {list.wishes.length === 0 && <View style={s.card}><Text style={[s.muted, { textAlign: 'center' }]}>Gerade steht nichts auf dem Wunschzettel.</Text></View>}
      {sorted.map(w => {
        const taken = w.reserved && !mine(w);
        return (
          <View key={w.id} style={[s.card, { gap: 10, padding: 16, opacity: taken ? 0.55 : 1 }]}>
            <View style={[s.row, { flexWrap: 'nowrap', alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={[s.text, { fontWeight: '800', fontSize: 18 }]}>{w.title}</Text>
                {w.note ? <Text style={s.muted}>{w.note}</Text> : null}
                <View style={[s.row, { gap: 8 }]}>
                  <Stars value={w.prio} size={14} />
                  {w.prio === 3 && <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent2 }}>Größter Wunsch</Text>}
                </View>
              </View>
              {w.cents != null && <Text style={{ fontWeight: '800', color: C.fg }}>ca. {euro(w.cents)}</Text>}
            </View>
            <View style={[s.row, { gap: 8 }]}>
              {w.link && <Button ghost title={`Ansehen bei ${domainOf(w.link)}`} onPress={() => open(w.link!)} />}
              {mine(w)
                ? (<>
                  <Text style={{ color: C.ok, fontWeight: '800' }}>✓ Du schenkst das</Text>
                  <Button ghost title="Doch nicht" disabled={busy} onPress={() => release(w.id)} />
                </>)
                : taken
                  ? <Text style={[s.muted, { fontWeight: '800' }]}>Schon vergeben</Text>
                  : ask === w.id
                    ? (
                      <View style={{ gap: 6, width: '100%' }}>
                        <TextInput style={s.input} value={who} onChangeText={setWho} placeholder="Dein Name (optional, sehen nur die Eltern)" accessibilityLabel="Dein Name" maxLength={40} autoFocus />
                        <View style={s.row}>
                          <Button ghost title="Abbrechen" onPress={() => setAsk(null)} />
                          <Button title="Reservieren" color={C.ok} disabled={busy} onPress={() => reserve(w.id)} />
                        </View>
                      </View>
                    )
                    : <Button title="Ich schenke das" color={C.ok} onPress={() => setAsk(w.id)} />}
            </View>
          </View>
        );
      })}
      {list.wishes.length > 0 && <Text style={[s.muted, { textAlign: 'center', fontSize: 13 }]}>{free === 0 ? 'Alles ist schon vergeben. Danke!' : `${free} von ${list.wishes.length} Wünschen sind noch frei.`}</Text>}
      <Text style={[s.muted, { textAlign: 'center', fontSize: 12, paddingBottom: 24 }]}>Geteilt mit {BRAND.name}, dem Familienplaner. Links führen zu fremden Shops.</Text>
    </ScrollView>
  );
}
