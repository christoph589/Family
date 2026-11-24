import { Platform, StyleSheet } from 'react-native';

// Farben: ruhiger, heller Grund, kräftiges Violett-Indigo als Markenfarbe, Koralle als zweiter Akzent
export const C = {
  bg: '#f3f4fa', surface: '#ffffff', surface2: '#eef0f8', fg: '#121527', muted: '#6b7088', line: '#e4e6f0',
  accent: '#5b4cf0', accent2: '#ff6a5c', accentSoft: '#ecebff',
  ok: '#14a05a', okSoft: '#dcf7e8', warn: '#d48806', warnSoft: '#fff1d6', danger: '#e5364b',
};

export const FONT = Platform.OS === 'web' ? "'Plus Jakarta Sans', -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" : undefined;
const shadow = (y: number, blur: number, a: number) => (Platform.OS === 'web'
  ? ({ boxShadow: `0 1px 2px rgba(18,21,39,0.04), 0 ${y}px ${blur}px rgba(18,21,39,${a})` } as any)
  : { shadowColor: '#121527', shadowOpacity: a * 1.5, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y / 2 }, elevation: 3 });
export const SHADOW = { sm: shadow(4, 12, 0.05), md: shadow(10, 30, 0.08), lg: shadow(18, 48, 0.14) };
/** Farbverlauf im Browser, auf dem Handy die erste Farbe. */
export const grad = (a: string, b: string, deg = 135) => (Platform.OS === 'web' ? ({ backgroundColor: a, backgroundImage: `linear-gradient(${deg}deg, ${a}, ${b})` } as any) : { backgroundColor: a });

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 18, gap: 18, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 24, padding: 20, gap: 14, ...SHADOW.sm },
  h1: { fontSize: 30, fontWeight: '800', color: C.fg, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: '800', color: C.fg, letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20 },
  text: { color: C.fg, fontSize: 16, lineHeight: 22 },
  input: { borderWidth: 1.5, borderColor: 'transparent', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.fg, backgroundColor: C.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: -0.1 },
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
    input:focus, textarea:focus { outline: none; border-color: ${C.accent} !important; background: #fff !important; box-shadow: 0 0 0 4px ${C.accent}22; }
    [role=button], [role=tab] { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease; }
    [role=button]:active, [role=tab]:active { transform: scale(0.97); }
    ::-webkit-scrollbar { width: 10px; height: 10px; } ::-webkit-scrollbar-thumb { background: #d5d8e6; border-radius: 10px; border: 3px solid ${C.bg}; }
  `;
  document.head.appendChild(st);
}
