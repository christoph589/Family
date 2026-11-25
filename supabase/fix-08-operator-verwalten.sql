-- Nachtrag 8: Operator kann Familien umbenennen und löschen (ohne in die Inhalte zu schauen).
-- Voraussetzung: Nachtrag 7. Einmal im SQL Editor ausführen.

create or replace function public.op_rename(fid uuid, new_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  if char_length(trim(new_name)) not between 1 and 80 then raise exception 'bad_name'; end if;
  update public.families set name = trim(new_name) where id = fid;
  update public.family_state set data = jsonb_set(data, '{family,name}', to_jsonb(trim(new_name))), version = version + 1, updated_at = now()
   where family_id = fid and data ? 'family';
end $$;

-- Löscht die Familie mit allen Daten (Mitglieder, Stand, Freigaben, Schlüssel). Zur Sicherheit muss der Name genau stimmen.
create or replace function public.op_delete_family(fid uuid, confirm_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  n text;
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  select name into n from public.families where id = fid;
  if n is null then raise exception 'unknown_family'; end if;
  if n <> confirm_name then raise exception 'name_mismatch'; end if;
  if exists (select 1 from public.members m where m.family_id = fid and m.user_id = auth.uid() and m.until is null) then raise exception 'own_family'; end if;
  delete from public.families where id = fid;
end $$;

grant execute on function public.op_rename(uuid, text) to authenticated;
grant execute on function public.op_delete_family(uuid, text) to authenticated;

-- Operator darf jede Familie öffnen (Entscheidung 25.11.2026). Zugang gilt 4 Stunden, jeder Besuch wird protokolliert
-- und der Familie unter Einstellungen › Familie angezeigt.
create or replace function public.op_enter(fid uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := now() + interval '4 hours';
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  perform public.support_cleanup();
  if not exists (select 1 from public.families where id = fid) then raise exception 'unknown_family'; end if;
  insert into public.members as mm (family_id, user_id, role, until) values (fid, auth.uid(), 'eltern', t)
  on conflict (family_id, user_id) do update set until = case when mm.until is null then null else excluded.until end;
  insert into public.support_log (family_id, operator) values (fid, auth.uid());
  return t;
end $$;
