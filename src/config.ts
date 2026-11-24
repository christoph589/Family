/**
 * Supabase-Verbindung. Der "anon public"-Schlüssel ist öffentlich und darf in die App
 * (Schutz kommt über Row Level Security). NIEMALS den service_role-Schlüssel eintragen.
 * Leer gelassen läuft die App wie bisher nur lokal auf einem Gerät.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://daxgmedegpauhzzfvygz.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRheGdtZWRlZ3BhdWh6emZ2eWd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1NDY4MDYsImV4cCI6MjExMTEyMjgwNn0.KWLai4E92k-uKHbGrkJLyu3FS20OGwRHG3jRCKU5cKk';
