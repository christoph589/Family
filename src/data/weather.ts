import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Wetter für Heute und Wand, mit Anziehtipp für Kinder.
 * Quelle: Bright Sky (offene Daten des Deutschen Wetterdienstes), ohne Schlüssel, ohne Konto.
 * Gesendet werden nur die Koordinaten des Wohnorts, kein Gerätestandort.
 * Den Ort sucht die App einmal beim Eintragen über OpenStreetMap (Nominatim).
 */
export type WeatherPlace = { name: string; lat: number; lon: number; off?: boolean };

type Hour = { date: string; h: number; temp: number; feels: number; rain: number; prob: number; wind: number; icon: string; cond: string };

export type WeatherTip = {
  /** "Heute" oder "Morgen früh" */
  label: string;
  icon: string;
  /** Temperatur auf dem Schulweg (morgens) bzw. jetzt */
  temp: number;
  min: number;
  max: number;
  /** Kurz für die Wand, z. B. "Winterjacke, Mütze, Handschuhe" */
  short: string;
  /** Einzelne Tipps mit Emoji, für Kinder lesbar */
  lines: string[];
  place: string;
};

const ICON: Record<string, string> = {
  'clear-day': '☀️', 'clear-night': '🌙', 'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️', cloudy: '☁️',
  fog: '🌫️', wind: '💨', rain: '🌧️', sleet: '🌨️', snow: '❄️', hail: '🌨️', thunderstorm: '⛈️',
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; };

/** Gefühlte Temperatur bei Wind (Windchill, gilt nur bis 10 °C und ab 5 km/h). */
export function feelsLike(t: number, wind: number) {
  if (t > 10 || wind < 5) return t;
  const v = Math.pow(wind, 0.16);
  return Math.round((13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v) * 10) / 10;
}

/** Ort suchen: Postleitzahl oder Ortsname. Liefert den besten Treffer in Deutschland, Österreich oder der Schweiz. */
export async function findPlace(q: string): Promise<WeatherPlace | null> {
  const query = q.trim();
  if (!query) return null;
  const p = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '1', countrycodes: 'de,at,ch', 'accept-language': 'de' });
  if (/^\d{4,5}$/.test(query)) p.set('postalcode', query); else p.set('q', query);
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + p.toString());
  if (!r.ok) throw new Error('Ortssuche gerade nicht erreichbar');
  const j = await r.json();
  const hit = Array.isArray(j) ? j[0] : null;
  if (!hit) return null;
  const a = hit.address ?? {};
  const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? String(hit.display_name ?? query).split(',')[0];
  const name = a.postcode && /^\d/.test(query) ? `${a.postcode} ${town}` : town;
  return { name, lat: Math.round(Number(hit.lat) * 100) / 100, lon: Math.round(Number(hit.lon) * 100) / 100 };
}

/** Stündliche Vorhersage für heute und morgen holen. */
async function loadHours(lat: number, lon: number): Promise<Hour[]> {
  const now = new Date();
  const p = new URLSearchParams({ lat: String(lat), lon: String(lon), date: isoOf(now), last_date: isoOf(plusDays(now, 2)), tz: 'Europe/Berlin' });
  const r = await fetch('https://api.brightsky.dev/weather?' + p.toString());
  if (!r.ok) throw new Error('Wetter gerade nicht erreichbar');
  const j = await r.json();
  return (j.weather ?? []).filter((w: any) => typeof w.temperature === 'number').map((w: any) => {
    const ts = String(w.timestamp);
    const wind = Number(w.wind_speed ?? 0);
    return {
      date: ts.slice(0, 10), h: Number(ts.slice(11, 13)), temp: w.temperature, feels: feelsLike(w.temperature, wind),
      rain: Number(w.precipitation ?? 0), prob: Number(w.precipitation_probability ?? (w.precipitation > 0.1 ? 60 : 0)),
      wind, icon: String(w.icon ?? ''), cond: String(w.condition ?? ''),
    };
  });
}

/** Was die Kinder anziehen sollen. Reine Rechnung, damit sie leicht zu prüfen ist. */
export function dressTip(hours: Hour[], now: Date, place = ''): WeatherTip | null {
  // Ab 16 Uhr zählt morgen früh, vorher heute
  const tomorrow = now.getHours() >= 16;
  const day = isoOf(tomorrow ? plusDays(now, 1) : now);
  const all = hours.filter(x => x.date === day);
  if (!all.length) return null;
  const fromH = tomorrow ? 7 : Math.max(7, Math.min(now.getHours(), 15));
  // Schulweg: 7 bis 8 Uhr; ist der schon vorbei, ab jetzt
  const way = all.filter(x => x.h >= fromH && x.h <= Math.max(fromH + 1, 8));
  const daytime = all.filter(x => x.h >= fromH && x.h <= 17);
  const w = way.length ? way : daytime.length ? daytime : all;
  const d = daytime.length ? daytime : all;
  const cold = Math.min(...w.map(x => x.feels));
  const min = Math.round(Math.min(...d.map(x => x.temp)));
  const max = Math.round(Math.max(...d.map(x => x.temp)));
  const rainProb = Math.max(...d.map(x => x.prob));
  const rainSum = d.reduce((a, x) => a + x.rain, 0);
  const has = (c: string) => d.some(x => x.cond === c || x.icon === c);
  const snow = has('snow') || has('sleet');
  const wet = rainProb >= 50 || rainSum >= 0.5 || has('rain');
  const sunny = d.filter(x => x.icon === 'clear-day' || x.icon === 'partly-cloudy-day').length >= Math.max(2, d.length / 2);

  const lines: string[] = [];
  const short: string[] = [];
  if (cold < 0) { lines.push('🧥 Winterjacke, 🧢 Mütze, 🧤 Handschuhe und 🧣 Schal'); short.push('Winterjacke, Mütze, Handschuhe'); }
  else if (cold < 5) { lines.push('🧥 Winterjacke und 🧢 Mütze'); short.push('Winterjacke und Mütze'); }
  else if (cold < 10) { lines.push('🧥 Warme Jacke'); short.push('Warme Jacke'); }
  else if (cold < 15) { lines.push('🧥 Leichte Jacke oder dicker Pulli'); short.push('Leichte Jacke'); }
  else if (cold < 20) { lines.push('👕 Pulli oder Sweatshirt reicht'); short.push('Pulli reicht'); }
  else { lines.push('👕 T-Shirt-Wetter'); short.push('T-Shirt'); }
  if (snow) { lines.push('❄️ Schnee möglich: Stiefel anziehen'); short.push('Stiefel'); }
  else if (wet) { lines.push(cold < 10 ? '☔ Regenjacke und wasserfeste Schuhe' : '☔ Regenjacke oder Schirm mitnehmen'); short.push('Regenjacke'); }
  if (min <= 1 && (wet || snow)) lines.push('⚠️ Es kann glatt sein. Langsam gehen!');
  if (has('thunderstorm')) lines.push('⛈️ Gewitter möglich. Bei Blitz nach drinnen.');
  if (max >= 25 && sunny) { lines.push('🧴 Sonnencreme, 🧢 Kappe und 💧 Trinkflasche'); short.push('Sonnencreme'); }
  if (max - Math.round(cold) >= 8 && max >= 15) lines.push(`🧅 Zwiebel-Look: morgens warm anziehen, mittags wird es ${max}°`);

  // Symbol: das häufigste am Tag, Regen und Schnee gewinnen
  const icons = d.map(x => x.icon);
  const pick = snow ? 'snow' : wet ? 'rain' : icons.sort((a, b) => icons.filter(x => x === b).length - icons.filter(x => x === a).length)[0];
  const at = w[0];
  return {
    label: tomorrow ? 'Morgen früh' : 'Heute', icon: ICON[pick] ?? ICON[at.icon] ?? '🌤️',
    temp: Math.round(at.temp), min, max, short: short.join(', '), lines, place,
  };
}

const cache = new Map<string, { at: number; hours: Hour[] }>();
const KEY = 'familienplaner:weather';
const TTL = 30 * 60 * 1000;

/** Anziehtipp für den Wohnort der Familie. Lädt höchstens alle 30 Minuten neu. */
export function useWeather(place?: WeatherPlace) {
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const on = !!place && !place.off && Number.isFinite(place.lat);
  const k = on ? `${place!.lat},${place!.lon}` : '';
  useEffect(() => {
    if (!on) { setHours(null); return; }
    let live = true;
    const run = async () => {
      const mem = cache.get(k);
      if (mem && Date.now() - mem.at < TTL) { setHours(mem.hours); return; }
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
        if (saved?.k === k && Date.now() - saved.at < TTL) { cache.set(k, saved); if (live) setHours(saved.hours); return; }
        if (saved?.k === k && live) setHours(saved.hours);
      } catch {}
      try {
        const hs = await loadHours(place!.lat, place!.lon);
        const entry = { at: Date.now(), hours: hs };
        cache.set(k, entry);
        AsyncStorage.setItem(KEY, JSON.stringify({ k, ...entry })).catch(() => {});
        if (live) { setHours(hs); setError(''); }
      } catch (e: any) { if (live) setError(e?.message ?? 'Wetter gerade nicht erreichbar'); }
    };
    run();
    return () => { live = false; };
  }, [k, tick]);
  // Wand-Tablets laufen den ganzen Tag: alle 10 Minuten neu rechnen (Wechsel auf "Morgen früh"), nach 30 Minuten neu laden
  useEffect(() => { if (!on) return; const t = setInterval(() => setTick(x => x + 1), 10 * 60 * 1000); return () => clearInterval(t); }, [on]);
  const tip = hours ? dressTip(hours, new Date(), place?.name) : null;
  return { tip, error: tip ? '' : error, on };
}
