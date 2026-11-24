-- Nachtrag 2: geheimer Abo-Link für den Familienkalender (iPhone, Mac, Google, Outlook)
alter table public.families add column if not exists ics_token text unique;

-- Gibt den Abo-Schlüssel zurück und legt ihn bei Bedarf an. renew = true erzeugt einen neuen
-- (der alte Link funktioniert dann nicht mehr). Nur für Eltern.
create or replace function public.calendar_token(fid uuid, renew boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  t text;
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  select ics_token into t from public.families where id = fid;
  if t is null or renew then
    t := encode(gen_random_bytes(24), 'hex');
    update public.families set ics_token = t where id = fid;
  end if;
  return t;
end $$;

revoke all on function public.calendar_token(uuid, boolean) from anon;
grant execute on function public.calendar_token(uuid, boolean) to authenticated;
