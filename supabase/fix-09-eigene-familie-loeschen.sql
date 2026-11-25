-- Nachtrag 9: Operator darf auch Familien löschen, in denen er selbst Mitglied ist (z. B. doppelt angelegte).
-- Schutz: Der Name muss exakt eingetippt werden. Die Familie, in der das Gerät gerade angemeldet ist, sperrt die App.
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
  delete from public.families where id = fid;
end $$;
grant execute on function public.op_delete_family(uuid, text) to authenticated;
