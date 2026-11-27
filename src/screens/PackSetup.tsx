import { Pressable, Switch, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { isoWeek, today } from '../data/logic';
import { Task } from '../data/types';
import { Icon } from '../ui/Icon';
import { C, s } from '../ui/theme';

const OPTS: { v: Task['weeks']; l: string; a: string }[] = [{ v: undefined, l: 'Jede Woche', a: 'Jede Woche' }, { v: 'gerade', l: 'Gerade', a: 'Gerade KW' }, { v: 'ungerade', l: 'Ungerade', a: 'Ungerade KW' }];

/** Einstellungen › Stundenplan: Erinnerung am Vorabend, Sport- oder Schwimmsachen zu richten. */
export function PackSetup() {
  const { data, update } = useFamily();
  if (!data) return null;
  const tasks = data.tasks.filter(t => t.repeat === 'vorFach');
  const groups: { key: string; title: string; items: { t: Task; kid: NonNullable<typeof data>['children'][number] }[] }[] = [];
  for (const t of tasks) {
    const kid = data.children.find(c => c.id === t.childId);
    if (!kid) continue;
    const key = t.subject ?? t.title;
    let g = groups.find(x => x.key === key);
    if (!g) groups.push((g = { key, title: t.title, items: [] }));
    g.items.push({ t, kid });
  }
  const kw = isoWeek(today());
  const set = (id: string, patch: Partial<Task>) => update(d => ({ ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) }));
  return (
    <View style={s.card}>
      <Text style={s.h2}>Sachen richten am Vorabend</Text>
      <Text style={s.muted}>Steht Sport oder Schwimmen im Stundenplan, bekommt das Kind am Abend vorher automatisch die Aufgabe dazu. Wechselt Schwimmen wochenweise (z. B. Mädchen und Jungs), stell hier die Woche ein.</Text>
      {!tasks.length && <Text style={s.muted}>Noch kein Sport oder Schwimmen im Stundenplan gefunden.</Text>}
      {groups.map(g => (
        <View key={g.key} style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={[s.row, { gap: 10, flexWrap: 'nowrap' }]}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} color={C.accent} />
            </View>
            <Text style={[s.text, { fontWeight: '800', flex: 1 }]}>{g.title}</Text>
          </View>
          {g.items.map(({ t, kid }) => (
            <View key={t.id} style={{ gap: 6, paddingLeft: 38, opacity: t.active ? 1 : 0.5 }}>
              <View style={[s.row, { flexWrap: 'nowrap', gap: 8 }]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kid.color }} />
                <Text style={[s.text, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{kid.name}</Text>
                <Switch value={t.active} onValueChange={v => set(t.id, { active: v })} accessibilityLabel={`${t.title} für ${kid.name}`} />
              </View>
              {t.active && (
                <View style={{ flexDirection: 'row', borderRadius: 10, borderWidth: 1.5, borderColor: kid.color, overflow: 'hidden' }}>
                  {OPTS.map((o, i) => {
                    const on = t.weeks === o.v;
                    return (
                      <Pressable key={o.l} accessibilityRole="radio" accessibilityLabel={o.a} accessibilityState={{ checked: on }} onPress={() => set(t.id, { weeks: o.v })}
                        style={{ flex: 1, paddingVertical: 7, alignItems: 'center', backgroundColor: on ? kid.color : C.surface, borderLeftWidth: i ? 1.5 : 0, borderLeftColor: kid.color }}>
                        <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700', fontSize: 13 }}>{o.l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
      <Text style={[s.muted, { fontSize: 12 }]}>Diese Woche ist KW {kw} ({kw % 2 === 0 ? 'gerade' : 'ungerade'}). Hat das Kind diese Woche Schwimmen, wähle „{kw % 2 === 0 ? 'Gerade' : 'Ungerade'}“.</Text>
    </View>
  );
}
