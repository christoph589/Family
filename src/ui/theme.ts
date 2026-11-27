import { Platform, StyleSheet } from 'react-native';

// Farben (Design „freundlich und weich“): warmes helles Grau, gedecktes Grün als einziger Akzent, Pastell nur sparsam
export const C = {
  bg: '#fbf8f1', surface: '#ffffff', surface2: '#f1ede3', fg: '#1f2a27', muted: '#7a837f', line: '#eee8da',
  accent: '#1f6f63', accent2: '#d9693f', accentSoft: '#d9efe9', deep: '#17564d', sun: '#ffc94d', sunSoft: '#ffe9a8', sunInk: '#4a3300',
  ok: '#2f8f5b', okSoft: '#dcf1e5', warn: '#b8741a', warnSoft: '#fbf0d9', danger: '#d1443c',
};
/** Sanfte Kachelfarben für Icons und Zeitangaben */
export const TINT = ['#d9efe9', '#fbe3d3', '#e9e6f6', '#fdf1cf'];
/** Satte Kachelfarben (Gerichte, Aufgabenarten) */
export const STRONG = ['#e5533d', '#ffc94d', '#4fa36a', '#3d7bd1', '#e8923a', '#8e63c7'];

export const FONT = Platform.OS === 'web' ? "'Plus Jakarta Sans', -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" : undefined;
const shadow = (y: number, blur: number, a: number) => (Platform.OS === 'web'
  ? ({ boxShadow: `0 1px 2px rgba(35,38,43,0.04), 0 ${y}px ${blur}px rgba(35,38,43,${a})` } as any)
  : { shadowColor: '#23262b', shadowOpacity: a * 1.5, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y / 2 }, elevation: 2 });
export const SHADOW = { sm: shadow(2, 6, 0.04), md: shadow(6, 16, 0.07), lg: shadow(12, 32, 0.12) };
/** Farbverlauf im Browser, auf dem Handy die erste Farbe. */
export const grad = (a: string, b: string, deg = 135) => (Platform.OS === 'web' ? ({ backgroundColor: a, backgroundImage: `linear-gradient(${deg}deg, ${a}, ${b})` } as any) : { backgroundColor: a });

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 18, gap: 18, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, gap: 12, ...SHADOW.sm },
  h1: { fontSize: 28, fontWeight: '800', color: C.fg, letterSpacing: -0.5 },
  h2: { fontSize: 19, fontWeight: '700', color: C.fg, letterSpacing: -0.3 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.2 },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20 },
  text: { color: C.fg, fontSize: 16, lineHeight: 22 },
  input: { minWidth: 0, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.fg, backgroundColor: C.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48, maxWidth: '100%', flexShrink: 1 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: -0.1, textAlign: 'center' },
  ghost: { backgroundColor: C.surface2 },
  ghostText: { color: C.fg },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
});

/** Schrift und ein paar Browser-Feinheiten einmal global setzen. */
export function installWebStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('fp-style')) return;
  // Schrift liegt auf unserem eigenen Server (kein Google Fonts, wegen Datenschutz)
  const font = (f: string) => new URL(`fonts/${f}`, document.baseURI).toString();
  const st = document.createElement('style');
  st.id = 'fp-style';
  st.textContent = `
    @font-face { font-family: 'Plus Jakarta Sans'; font-style: normal; font-display: swap; font-weight: 200 800;
      src: url(${font('plus-jakarta-sans-latin-wght-normal.woff2')}) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    @font-face { font-family: 'Plus Jakarta Sans'; font-style: normal; font-display: swap; font-weight: 200 800;
      src: url(${font('plus-jakarta-sans-latin-ext-wght-normal.woff2')}) format('woff2');
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    html, body { background: ${C.bg}; }
    body, body div, body input, body textarea, body button { font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
    * { -webkit-tap-highlight-color: transparent; }
    input:focus, textarea:focus { outline: none; border-color: ${C.accent} !important; background: #fff !important; box-shadow: 0 0 0 3px ${C.accent}22; }
    [role=button], [role=tab] { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease; }
    [role=button]:active, [role=tab]:active { transform: scale(0.97); }
    ::-webkit-scrollbar { width: 10px; height: 10px; } ::-webkit-scrollbar-thumb { background: #d8d5cd; border-radius: 10px; border: 3px solid ${C.bg}; }
  `;
  document.head.appendChild(st);
}
