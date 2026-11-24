import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { C, s } from './theme';

const z = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${z(m + 1)}-${z(d)}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function niceDate(v: string, long = false) {
  if (!v) return '';
  return new Date(v + 'T12:00:00').toLocaleDateString('de-DE', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Datum (YYYY-MM-DD) oder Uhrzeit (HH:MM) mit eigener, großer Auswahl im App-Stil.
 * Funktioniert gleich im Browser, auf dem Tablet und später in der App.
 */
export function DateField({ value, onChange, type = 'date', label, width, min, max, placeholder, clearable }: {
  value: string; onChange: (v: string) => void; type?: 'date' | 'time'; label: string; width?: number; min?: string; max?: string;
  placeholder?: string; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = type === 'date' ? niceDate(value) : value ? `${value} Uhr` : '';
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: open ? C.accent : C.line, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, backgroundColor: pressed ? C.surface2 : C.bg, width }]}>
        <Text style={{ fontSize: 18 }}>{type === 'date' ? '📅' : '🕒'}</Text>
        <Text style={{ fontSize: 16, color: shown ? C.fg : C.muted, fontWeight: shown ? '600' : '400' }}>{shown || placeholder || (type === 'date' ? 'Datum wählen' : 'Uhrzeit')}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,30,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 22, padding: 18, width: '100%', maxWidth: 380, gap: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any}>
            <Text style={s.label}>{label}</Text>
            {type === 'date'
              ? <DatePanel value={value} min={min} max={max} onPick={v => { onChange(v); setOpen(false); }} />
              : <TimePanel value={value} onPick={v => onChange(v)} onDone={() => setOpen(false)} />}
            <View style={[s.row, { justifyContent: 'flex-end' }]}>
              {clearable && !!value && <Pressable onPress={() => { onChange(''); setOpen(false); }} style={{ padding: 10 }}><Text style={{ color: C.danger, fontWeight: '700' }}>{type === 'time' ? 'Ohne Uhrzeit' : 'Leeren'}</Text></Pressable>}
              <Pressable onPress={() => setOpen(false)} style={{ padding: 10 }}><Text style={{ color: C.accent, fontWeight: '700' }}>{type === 'time' ? 'Fertig' : 'Schließen'}</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function DatePanel({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (v: string) => void }) {
  const start = value || (max && max < todayIso() ? max : todayIso());
  const [y, setY] = useState(+start.slice(0, 4));
  const [m, setM] = useState(+start.slice(5, 7) - 1);
  const [years, setYears] = useState(false);
  const step = (n: number) => { const d = new Date(y, m + n, 1); setY(d.getFullYear()); setM(d.getMonth()); };
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const tIso = todayIso();
  const ok = (v: string) => (!min || v >= min) && (!max || v <= max);
  const yMin = +(min ?? '1990').slice(0, 4), yMax = +(max ?? String(new Date().getFullYear() + 5)).slice(0, 4);
  const nav = (t: string, f: () => void, l: string) => (
    <Pressable accessibilityLabel={l} onPress={f} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.surface2 : C.bg })}>
      <Text style={{ fontSize: 20, color: C.fg, fontWeight: '700' }}>{t}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        {nav('‹', () => step(-1), 'Voriger Monat')}
        <Pressable onPress={() => setYears(v => !v)} style={{ flex: 1, alignItems: 'center' }} accessibilityLabel="Jahr wählen">
          <Text style={[s.h2, { fontSize: 19 }]}>{MONTHS[m]} {y} ▾</Text>
        </Pressable>
        {nav('›', () => step(1), 'Nächster Monat')}
      </View>
      {years ? (
        <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {Array.from({ length: yMax - yMin + 1 }, (_, i) => yMax - i).map(yy => (
            <Pressable key={yy} onPress={() => { setY(yy); setYears(false); }}
              style={{ width: 76, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: yy === y ? C.accent : C.bg }}>
              <Text style={{ fontWeight: '700', color: yy === y ? '#fff' : C.fg }}>{yy}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (<>
        <View style={{ flexDirection: 'row' }}>
          {WD.map((w, i) => <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: i > 4 ? C.accent : C.muted }}>{w}</Text>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
            const v = iso(y, m, d), sel = v === value, tod = v === tIso, en = ok(v);
            return (
              <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                <Pressable disabled={!en} accessibilityLabel={`${d}. ${MONTHS[m]} ${y}`} onPress={() => onPick(v)}
                  style={({ pressed }) => ({ flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? C.accent : pressed ? C.surface2 : 'transparent', borderWidth: tod && !sel ? 2 : 0, borderColor: C.accent })}>
                  <Text style={{ fontSize: 16, fontWeight: sel || tod ? '800' : '500', color: sel ? '#fff' : !en ? C.line : C.fg }}>{d}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {(!max || max >= tIso) && (!min || min <= tIso) && (
          <View style={[s.row, { gap: 8 }]}>
            {[['Heute', 0], ['Morgen', 1], ['In einer Woche', 7]].map(([l, n]) => {
              const d = new Date(); d.setDate(d.getDate() + (n as number)); const v = iso(d.getFullYear(), d.getMonth(), d.getDate());
              return ok(v) ? (
                <Pressable key={l} onPress={() => onPick(v)} style={[s.chip, { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.bg }]}>
                  <Text style={{ fontWeight: '700', color: C.accent }}>{l}</Text>
                </Pressable>
              ) : null;
            })}
          </View>
        )}
      </>)}
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24); // 6 Uhr zuerst, Nacht am Ende
function TimePanel({ value, onPick, onDone }: { value: string; onPick: (v: string) => void; onDone: () => void }) {
  const [h, setH] = useState<number | null>(value ? +value.slice(0, 2) : null);
  const mm = value ? +value.slice(3, 5) : 0;
  const cell = (on: boolean) => ({ width: '16.66%' as const, padding: 3 });
  return (
    <View style={{ gap: 12 }}>
      <Text style={[s.h2, { fontSize: 30, textAlign: 'center', fontVariant: ['tabular-nums'] } as any]}>{h === null ? '--' : z(h)}:{z(mm)}</Text>
      <Text style={s.muted}>Stunde</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {HOURS.map(x => (
          <View key={x} style={cell(x === h)}>
            <Pressable accessibilityLabel={`${x} Uhr`} onPress={() => { setH(x); onPick(`${z(x)}:${z(mm)}`); }}
              style={({ pressed }) => ({ paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: x === h ? C.accent : pressed ? C.surface2 : C.bg, opacity: x < 6 ? 0.6 : 1 })}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: x === h ? '#fff' : C.fg }}>{x}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <Text style={s.muted}>Minute</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(x => (
          <View key={x} style={cell(false)}>
            <Pressable accessibilityLabel={`Minute ${z(x)}`} disabled={h === null} onPress={() => { onPick(`${z(h!)}:${z(x)}`); onDone(); }}
              style={({ pressed }) => ({ paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: value && x === mm ? C.accent : pressed ? C.surface2 : C.bg, opacity: h === null ? 0.4 : 1 })}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: value && x === mm ? '#fff' : C.fg }}>{z(x)}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
