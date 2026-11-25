import { Pressable, Switch, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { isoWeek, today } from '../data/logic';
import { Task } from '../data/types';
import { C, s } from '../ui/theme';

/** Einstellungen › Stundenplan: Erinnerung am Vorabend, Sport- oder Schwimmsachen zu richten. */
export function PackSetup() {
  const { data, update } = useFamily();
  if (!data) return null;
  const tasks = data.tasks.filter(t => t.repeat === 'vorFach');
  const kw = isoWeek(today());
  const set = (id: string, patch: Partial<Task>) => update(d => ({ ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) }));
  return (
    <View style={s.card}>
      <Text style={s.h2}>🎒 Sachen richten am Vorabend</Text>
      <Text style={s.muted}>Steht Sport oder Schwimmen im Stundenplan, bekommt das Kind am Abend vorher automatisch die Aufgabe dazu. Wechselt Schwimmen wochenweise (z. B. Mädchen und Jungs), stell hier die Woche ein.</Text>
      {!tasks.length && <Text style={s.muted}>Noch kein Sport oder Schwimmen im Stundenplan gefunden.</Text>}
      {tasks.map(t => {
        const kid = data.children.find(c => c.id === t.childId);
        if (!kid) return null;
        const opts: { v: Task['weeks']; l: string }[] = [{ v: undefined, l: 'Jede Woche' }, { v: 'gerade', l: 'Gerade KW' }, { v: 'ungerade', l: 'Ungerade KW' }];
        return (
          <View key={t.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, opacity: t.active ? 1 : 0.5 }}>
            <View style={[s.row, { flexWrap: 'nowrap' }]}>
              <Text style={[s.text, { fontWeight: '800', flex: 1 }]}>{t.icon} {t.title} · <Text style={{ color: kid.color }}>{kid.name}</Text></Text>
              <Switch value={t.active} onValueChange={v => set(t.id, { active: v })} accessibilityLabel={`${t.title} für ${kid.name}`} />
            </View>
            {t.active && (
              <View style={[s.row, { gap: 8 }]}>
                {opts.map(o => {
                  const on = t.weeks === o.v;
                  return (
                    <Pressable key={o.l} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => set(t.id, { weeks: o.v })}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 2, borderColor: kid.color, backgroundColor: on ? kid.color : C.surface }}>
                      <Text style={{ color: on ? '#fff' : C.fg, fontWeight: '700' }}>{o.l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <Text style={[s.muted, { fontSize: 12 }]}>Diese Woche ist KW {kw} ({kw % 2 === 0 ? 'gerade' : 'ungerade'}). Hat das Kind diese Woche Schwimmen, wähle „{kw % 2 === 0 ? 'Gerade' : 'Ungerade'} KW“.</Text>
    </View>
  );
}
