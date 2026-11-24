/**
 * Schulferien und Feiertage je Bundesland über die OpenHolidays API (openholidaysapi.org,
 * kostenlos, ohne Schlüssel). Die Termine werden in den Familiendaten gespeichert,
 * damit alle Geräte sie haben, auch ohne eigenen Abruf.
 */
export const STATES: { code: string; name: string }[] = [
  { code: 'DE-BW', name: 'Baden-Württemberg' }, { code: 'DE-BY', name: 'Bayern' }, { code: 'DE-BE', name: 'Berlin' },
  { code: 'DE-BB', name: 'Brandenburg' }, { code: 'DE-HB', name: 'Bremen' }, { code: 'DE-HH', name: 'Hamburg' },
  { code: 'DE-HE', name: 'Hessen' }, { code: 'DE-MV', name: 'Mecklenburg-Vorpommern' }, { code: 'DE-NI', name: 'Niedersachsen' },
  { code: 'DE-NW', name: 'Nordrhein-Westfalen' }, { code: 'DE-RP', name: 'Rheinland-Pfalz' }, { code: 'DE-SL', name: 'Saarland' },
  { code: 'DE-SN', name: 'Sachsen' }, { code: 'DE-ST', name: 'Sachsen-Anhalt' }, { code: 'DE-SH', name: 'Schleswig-Holstein' },
  { code: 'DE-TH', name: 'Thüringen' },
];

export interface HolidayRange { name: string; from: string; to: string; kind: 'ferien' | 'feiertag' }

type Api = { startDate: string; endDate: string; name?: { language: string; text: string }[]; nationwide?: boolean; subdivisions?: { code: string }[] };

async function get(kind: 'SchoolHolidays' | 'PublicHolidays', state: string, from: string, to: string): Promise<HolidayRange[]> {
  const url = `https://openholidaysapi.org/${kind}?countryIsoCode=DE&subdivisionCode=${state}&validFrom=${from}&validTo=${to}&languageIsoCode=DE`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Ferien konnten nicht geladen werden (${r.status}).`);
  const list = (await r.json()) as Api[];
  return list
    // nur landesweite Termine, keine, die nur für einzelne Städte gelten
    .filter(h => h.nationwide || !h.subdivisions?.length || h.subdivisions.some(sd => sd.code === state))
    .map(h => ({
      name: h.name?.find(n => n.language === 'DE')?.text ?? h.name?.[0]?.text ?? (kind === 'PublicHolidays' ? 'Feiertag' : 'Ferien'),
      from: h.startDate, to: h.endDate, kind: kind === 'PublicHolidays' ? 'feiertag' as const : 'ferien' as const,
    }));
}

/** Lädt dieses und nächstes Jahr. */
export async function loadHolidays(state: string): Promise<{ ranges: HolidayRange[]; validTo: string }> {
  const y = new Date().getFullYear();
  const from = `${y}-01-01`, to = `${y + 1}-12-31`;
  const [a, b] = await Promise.all([get('SchoolHolidays', state, from, to), get('PublicHolidays', state, from, to)]);
  return { ranges: [...a, ...b].sort((x, z) => x.from.localeCompare(z.from)), validTo: to };
}
