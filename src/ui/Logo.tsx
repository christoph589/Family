import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Bildmarke: Dach über drei Köpfen, darunter ein Lächeln. */
export function LogoMark({ size = 40, round = true }: { size?: number; round?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      <Defs>
        <LinearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#6252f2" /><Stop offset="1" stopColor="#8f5cf6" /></LinearGradient>
      </Defs>
      <Rect width="128" height="128" rx={round ? 30 : 0} fill="url(#lg)" />
      <Path d="M30 46 L64 20 L98 46" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="46" cy="64" r="11" fill="#ffc98f" />
      <Circle cx="82" cy="62" r="12" fill="#ff7a6b" />
      <Circle cx="64" cy="72" r="8.5" fill="#7ee0b5" />
      <Path d="M22 76 C34 104 94 104 106 76" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
    </Svg>
  );
}
