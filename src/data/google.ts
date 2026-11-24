/**
 * Google-Kalender im Web-Test: über die claude.ai-Verbindung "Google Calendar"
 * des Betrachters (Artifact-Fähigkeit "mcp"), nur lesen. In der nativen App
 * kommt später expo-calendar (Gerätekalender von iPhone/Android).
 */
const SERVER = 'Google Calendar';
type Mcp = { callTool: (server: string, tool: string, input?: unknown) => Promise<{ payload?: any }> };

let mcpPromise: Promise<Mcp | null> | null = null;
export function getMcp(): Promise<Mcp | null> {
  if (!mcpPromise) {
    const c = (globalThis as any).claude;
    mcpPromise = c?.use ? Promise.resolve(c.use('mcp')).catch(() => null) : Promise.resolve(null);
  }
  return mcpPromise;
}

export interface GCal { id: string; name: string }
export interface GEvent { id: string; title: string; date: string; time?: string; allDay: boolean }

export const GOOGLE_ERROR: Record<string, string> = {
  server_not_connected: 'Google Kalender ist in claude.ai nicht verbunden (Einstellungen › Konnektoren).',
  needs_reauth: 'Google Kalender bitte in claude.ai neu verbinden (Einstellungen › Konnektoren).',
  not_granted: 'Der Zugriff auf Google Kalender wurde für diese Seite nicht erlaubt.',
  blocked_by_policy: 'Google Kalender ist für dieses Konto gesperrt.',
};

export async function listCalendars(): Promise<GCal[]> {
  const mcp = await getMcp();
  if (!mcp) throw { code: 'unavailable' };
  const res = await mcp.callTool(SERVER, 'list_calendars', { pageSize: 50 });
  const items: any[] = res.payload?.calendars ?? res.payload?.items ?? [];
  return items.map(c => ({ id: String(c.id ?? ''), name: String(c.summaryOverride ?? c.summary ?? c.id ?? '') })).filter(c => c.id);
}

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export async function listWeek(calendarId: string, from: string, to: string): Promise<GEvent[]> {
  const mcp = await getMcp();
  if (!mcp) throw { code: 'unavailable' };
  const res = await mcp.callTool(SERVER, 'list_events', { calendarId, startTime: `${from}T00:00:00`, endTime: `${to}T23:59:59`, pageSize: 100, orderBy: 'startTime' });
  const items: any[] = res.payload?.events ?? [];
  return items.filter(e => e?.status !== 'cancelled').map(e => {
    const dt = e?.start?.dateTime ? new Date(e.start.dateTime) : null;
    return {
      id: String(e.id),
      title: String(e.summary ?? '(ohne Titel)').slice(0, 120),
      date: dt ? local(dt) : String(e?.start?.date ?? ''),
      time: dt ? `${pad(dt.getHours())}:${pad(dt.getMinutes())}` : undefined,
      allDay: !dt,
    };
  }).filter(e => e.date);
}
