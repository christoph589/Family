-- Nachtrag 4: Leserechte für die Server-Funktion "familie" (KI, Kalender-Abo).
-- Neuere Supabase-Projekte geben neue Tabellen auch der Server-Rolle nicht automatisch frei.
-- Die Server-Rolle ist nur in der Edge Function verfügbar, nie in der App.
grant usage on schema public to service_role;
grant select, update on public.families to service_role;
grant select on public.members, public.family_state to service_role;
