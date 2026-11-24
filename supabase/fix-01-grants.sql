-- Nachtrag 1: Leserechte für angemeldete Geräte.
-- Neuere Supabase-Projekte geben neue Tabellen nicht mehr automatisch für die App frei.
-- Row Level Security sorgt weiterhin dafür, dass jede Familie nur ihre eigenen Daten sieht.
grant usage on schema public to anon, authenticated;
grant select on public.families, public.members, public.family_state to authenticated;
grant delete on public.members to authenticated;
grant execute on function public.create_family(text, jsonb) to authenticated;
grant execute on function public.join_family(text, text, text) to authenticated;
grant execute on function public.save_state(uuid, integer, jsonb) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_parent(uuid) to authenticated;
