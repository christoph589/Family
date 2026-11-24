import { Pressable, Text, View } from 'react-native';
import { useFamily } from '../data/FamilyContext';
import { confirm, pointsOf, tasksFor, today, toggleByChild, undoConfirm } from '../data/logic';
import { Child, TaskKind } from '../data/types';
import { C, s } from '../ui/theme';

export function Today({ childIds, parent }: { childIds: string[]; parent: boolean }) {
  const { data } = useFamily();
  if (!data) return null;
  const kids = data.children.filter(c => childIds.includes(c.id));
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: 16 }]}>
      {kids.map(k => <ChildColumn key={k.id} child={k} parent={parent} />)}
    </View>
  );
}

function ChildColumn({ child, parent }: { child: Child; parent: boolean }) {
  const { data, update } = useFamily();
  const date = today();
  const items = tasksFor(data!, child.id, date);
  const done = items.filter(i => i.completion?.status === 'bestaetigt').length;
  const pct = items.length ? (done / items.length) * 100 : 0;
  const group = (kind: TaskKind, label: string) => {
    const list = items.filter(i => i.task.kind === kind);
    return (
      <View style={{ gap: 8 }}>
        <Text style={s.label}>{label}</Text>
        {list.length === 0 && <Text style={s.muted}>Nichts für heute.</Text>}
        {list.map(({ task, completion }) => {
          const st = completion?.status;
          const bg = st === 'wartet' ? C.warnSoft : C.bg;
          return (
            <View key={task.id} style={[s.row, { backgroundColor: bg, padding: 12, borderRadius: 12, flexWrap: 'nowrap', borderWidth: 1, borderColor: st === 'wartet' ? C.warn : 'transparent', opacity: st === 'bestaetigt' ? 0.65 : 1 }]}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!st }} accessibilityLabel={task.title}
                onPress={() => update(d => (st === 'bestaetigt' ? (parent ? undoConfirm(d, task, date) : d) : toggleByChild(d, task, date)))}
                style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: st === 'bestaetigt' ? C.ok : st === 'wartet' ? C.warn : child.color, backgroundColor: st === 'bestaetigt' ? C.ok : st === 'wartet' ? C.warn : C.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{st === 'bestaetigt' ? '✓' : st === 'wartet' ? '?' : ''}</Text>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.text, { fontWeight: '700', textDecorationLine: st === 'bestaetigt' ? 'line-through' : 'none' }]}>{task.title}</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>{st === 'wartet' ? 'Wartet auf Eltern' : st === 'bestaetigt' ? 'Bestätigt' : task.repeat === 'einmal' ? 'Heute' : task.repeat === 'taeglich' ? 'Jeden Tag' : 'Mo bis Fr'}</Text>
              </View>
              {parent && st !== 'bestaetigt' ? (
                <Pressable onPress={() => update(d => confirm(d, task, date))} style={{ backgroundColor: C.ok, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Bestätigen +{task.points}</Text>
                </Pressable>
              ) : (
                <Text style={[s.chip, { backgroundColor: child.color + '22', color: child.color, fontWeight: '700', fontSize: 12 }]}>+{task.points} P</Text>
              )}
            </View>
          );
        })}
      </View>
    );
  };
  return (
    <View style={[s.card, { flexGrow: 1, flexBasis: 320, borderTopWidth: 6, borderTopColor: child.color }]}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: child.color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{child.name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>{child.name}</Text>
          {child.grade ? <Text style={s.muted}>{/^\d+$/.test(child.grade) ? `${child.grade}. Klasse` : child.grade}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: child.color }}>{pointsOf(data!, child.id)}</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>Punkte</Text>
        </View>
      </View>
      <View>
        <Text style={[s.muted, { fontSize: 13, marginBottom: 4 }]}>{done} von {items.length} erledigt</Text>
        <View style={{ height: 10, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: child.color, borderRadius: 99 }} />
        </View>
      </View>
      {group('hausaufgabe', 'Hausaufgaben')}
      {group('pflicht', 'Pflichten')}
    </View>
  );
}
