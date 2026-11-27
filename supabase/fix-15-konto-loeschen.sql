-- Nachtrag 15: Konto in der App löschen (Pflicht für den App Store, Guideline 5.1.1(v), und DSGVO Art. 17).
-- Einmal im Supabase SQL Editor ausführen.
--
-- delete_my_account():
--   1. Für jede Familie, in der das Konto Elternteil ist:
--        - ist es das letzte Eltern-Konto (ohne Support-Zugänge), wird die ganze Familie gelöscht.
--          Alles hängt per "on delete cascade" an families: Familienstand, Sicherungen, Fotos,
--          Geheimnisse (iCloud/Google/WebUntis), Push, Wunschzettel, KI-Nutzung.
--          Die anonymen Kindergeräte dieser Familie werden mit gelöscht.
--        - sonst nur die eigene Mitgliedschaft.
--   2. Das eigene Konto (auth.users) wird gelöscht.
-- Schutz: Die App verlangt vorher Eltern-PIN und das Wort LÖSCHEN.
create or replace function public.delete_my_account(confirm text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  f record;
  kids uuid[];
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if confirm is distinct from 'LÖSCHEN' then raise exception 'confirm_mismatch'; end if;

  for f in select family_id from public.members where user_id = me and role = 'eltern' and until is null loop
    if not exists (select 1 from public.members where family_id = f.family_id and role = 'eltern' and until is null and user_id <> me) then
      -- anonyme Kindergeräte, die nur in dieser Familie hängen, mit entfernen
      select coalesce(array_agg(m.user_id), '{}') into kids
        from public.members m join auth.users u on u.id = m.user_id
       where m.family_id = f.family_id and m.role = 'kind' and coalesce(u.is_anonymous, false)
         and not exists (select 1 from public.members o where o.user_id = m.user_id and o.family_id <> f.family_id);
      delete from public.families where id = f.family_id;
      delete from auth.users where id = any(kids);
    else
      delete from public.members where family_id = f.family_id and user_id = me;
    end if;
  end loop;

  delete from public.members where user_id = me;
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
