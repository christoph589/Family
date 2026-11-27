import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'home' | 'cal' | 'book' | 'star' | 'wallet' | 'food' | 'heart' | 'search' | 'check' | 'cart' | 'chev' | 'user';

/** Einfache Linien-Icons (statt Emojis) für Navigation und Listen. */
export function Icon({ name, size = 22, color = '#23262b', stroke = 1.8, fill }: { name: IconName; size?: number; color?: string; stroke?: number; fill?: boolean }) {
  const p = { stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const f = fill ? { fill: color } : {};
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'home' && <Path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" {...p} />}
      {name === 'cal' && <><Rect x="3" y="5" width="18" height="16" rx="2" {...p} /><Path d="M3 10h18M8 3v4M16 3v4" {...p} /></>}
      {name === 'book' && <Path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6" {...p} />}
      {name === 'star' && <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" {...p} {...f} />}
      {name === 'wallet' && <><Rect x="3" y="6" width="18" height="14" rx="2" {...p} /><Path d="M3 10h18M16 15h2" {...p} /></>}
      {name === 'food' && <Path d="M7 3v8M4 3v5a3 3 0 006 0V3M7 11v10M17 3c-2 2-2 6 0 8v10" {...p} />}
      {name === 'heart' && <Path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z" {...p} {...f} />}
      {name === 'search' && <><Circle cx="11" cy="11" r="7" {...p} /><Path d="M20 20l-4-4" {...p} /></>}
      {name === 'check' && <Path d="M5 12l5 5 9-10" {...p} />}
      {name === 'cart' && <><Path d="M3 4h3l2.5 11h9.5L20 8H7" {...p} /><Circle cx="9.5" cy="19" r="1.3" {...p} /><Circle cx="17" cy="19" r="1.3" {...p} /></>}
      {name === 'chev' && <Path d="M9 5l7 7-7 7" {...p} />}
      {name === 'user' && <><Circle cx="12" cy="8" r="4" {...p} /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...p} /></>}
    </Svg>
  );
}
