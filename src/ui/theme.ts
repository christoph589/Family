import { StyleSheet } from 'react-native';
export const C = {
  bg: '#eef2f5', surface: '#ffffff', surface2: '#e4eaef', fg: '#18232c', muted: '#5b6b78', line: '#d3dce3',
  accent: '#0f6e73', ok: '#2b8a4b', okSoft: '#dcf1e3', warn: '#b26a00', warnSoft: '#fbecd2', danger: '#c0392b',
};
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, gap: 12 },
  h1: { fontSize: 26, fontWeight: '800', color: C.fg },
  h2: { fontSize: 20, fontWeight: '800', color: C.fg },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1 },
  muted: { color: C.muted, fontSize: 14 },
  text: { color: C.fg, fontSize: 16 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.fg, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.accent, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ghost: { backgroundColor: C.surface2 },
  ghostText: { color: C.fg },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
});
