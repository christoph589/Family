import { Text, TextStyle, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { C } from './theme';

const FRACTION = /(\d+)\s*\/\s*(\d+)/g;

/** Text mit Brüchen in echter Bruchschreibweise (Zähler über Nenner). */
export function MathText({ text, style }: { text: string; style?: TextStyle }) {
  const size = (style?.fontSize as number) ?? 16;
  const parts: (string | [string, string])[] = [];
  let last = 0;
  for (const m of text.matchAll(FRACTION)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push([m[1], m[2]]);
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.every(p => typeof p === 'string')) return <Text style={style}>{text}</Text>;
  const small: TextStyle = { ...style, fontSize: size * 0.8, lineHeight: size * 0.95, textAlign: 'center' };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {parts.flatMap((p, i) => typeof p === 'string'
        ? p.split(/(\s+)/).filter(Boolean).map((w, j) => <Text key={`${i}-${j}`} style={style}>{w}</Text>)
        : [(
          <View key={i} accessibilityLabel={`${p[0]} durch ${p[1]}`} style={{ alignItems: 'center', marginHorizontal: 3 }}>
            <Text style={small}>{p[0]}</Text>
            <View style={{ alignSelf: 'stretch', height: 1.5, backgroundColor: (style?.color as string) ?? C.fg, minWidth: size * 0.7 }} />
            <Text style={small}>{p[1]}</Text>
          </View>
        )])}
    </View>
  );
}

/** Entfernt alles, was in einer Zeichnung nichts zu suchen hat (Skripte, Links, Ereignisse). */
export function sanitizeSvg(svg: string | undefined): string | null {
  if (!svg) return null;
  const t = svg.trim();
  if (!/^<svg[\s>]/i.test(t) || t.length > 20000) return null;
  const clean = t
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(image|use|a|iframe|style)\b[\s\S]*?(\/>|<\/\1>)/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return /<script|javascript:/i.test(clean) ? null : clean;
}

export function Figure({ svg }: { svg?: string }) {
  const clean = sanitizeSvg(svg);
  if (!clean) return null;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(clean);
  const ratio = vb && +vb[1] > 0 && +vb[2] > 0 ? +vb[1] / +vb[2] : 400 / 220;
  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: C.line, alignSelf: 'stretch' }}>
      <View style={{ width: '100%', maxWidth: 420, aspectRatio: ratio, alignSelf: 'center' }}>
        <SvgXml xml={clean} width="100%" height="100%" />
      </View>
    </View>
  );
}
