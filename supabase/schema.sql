-- Familienplaner: Datenbank für Supabase (Region Frankfurt)
-- Einmal komplett im Supabase SQL Editor ausführen (SQL Editor > New query > Einfügen > Run).
-- Jede Familie sieht nur ihre eigenen Daten (Row Level Security).
--
-- Aufbau:
--   families      Familie mit Beitrittscode für Kindergeräte
--   members       Wer gehört zu welcher Familie (Eltern-Konto oder Kindergerät)
--   family_state  Der komplette Familienstand als JSON, mit Versionsnummer gegen
--                 gleichzeitiges Überschreiben (Pad und Kindergerät gleichzeitig)
--   Speicher      Bucket "photos" für Fotos von Heft und Tafel

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('eltern', 'kind')),
  child_id text, -- bei Kindergeräten: welches Kind
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.family_state (
  family_id uuid primary key references public.families(id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Hilfsfunktionen -----------------------------------------------------------

create or replace function public.is_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.is_parent(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid() and role = 'eltern');
$$;

-- 8 Zeichen ohne leicht verwechselbare Zeichen (kein 0/O, 1/I/L)
create or replace function public.new_join_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

-- Eltern legen eine Familie an (eingeloggt mit E-Mail).
create or replace function public.create_family(fname text, initial jsonb)
returns table (family_id uuid, join_code text)
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  loop
    code := public.new_join_code();
    exit when not exists (select 1 from public.families f where f.join_code = code);
  end loop;
  insert into public.families (name, join_code) values (fname, code) returning id into fid;
  insert into public.members (family_id, user_id, role) values (fid, auth.uid(), 'eltern');
  insert into public.family_state (family_id, data) values (fid, initial);
  return query select fid, code;
end $$;

-- Ein Gerät tritt mit dem Code bei: Kindergerät (child) oder zweites Eltern-Konto.
create or replace function public.join_family(code text, as_role text, child text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if as_role not in ('eltern', 'kind') then raise exception 'bad_role'; end if;
  -- Eltern-Geräte brauchen ein echtes Konto, Kindergeräte dürfen anonym sein
  if as_role = 'eltern' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'parent_needs_account';
  end if;
  select id into fid from public.families where join_code = upper(trim(code));
  if fid is null then
    perform pg_sleep(1); -- bremst Raten
    raise exception 'unknown_code';
  end if;
  insert into public.members (family_id, user_id, role, child_id)
  values (fid, auth.uid(), as_role, case when as_role = 'kind' then child end)
  on conflict (family_id, user_id) do update set role = excluded.role, child_id = excluded.child_id;
  return fid;
end $$;

-- Speichern mit Versionsprüfung: schlägt fehl, wenn inzwischen ein anderes Gerät gespeichert hat.
create or replace function public.save_state(fid uuid, expected integer, new_data jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  update public.family_state
     set data = new_data, version = version + 1, updated_at = now()
   where family_id = fid and version = expected
  returning version into v;
  if v is null then raise exception 'conflict'; end if;
  return v;
end $$;

-- Eltern können einen neuen Code erzeugen (alter wird ungültig).
create or replace function public.rotate_join_code(fid uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  loop
    code := public.new_join_code();
    exit when not exists (select 1 from public.families f where f.join_code = code);
  end loop;
  update public.families set join_code = code where id = fid;
  return code;
end $$;

-- Zugriffsschutz ---------------------------------------------------------------

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.family_state enable row level security;

drop policy if exists fam_read on public.families;
create policy fam_read on public.families for select using (public.is_member(id));

drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select using (public.is_member(family_id));

drop policy if exists mem_delete on public.members;
create policy mem_delete on public.members for delete using (public.is_parent(family_id));

drop policy if exists state_read on public.family_state;
create policy state_read on public.family_state for select using (public.is_member(family_id));
-- Schreiben nur über save_state(), deshalb keine insert/update-Policy.

revoke all on function public.create_family(text, jsonb) from anon;
revoke all on function public.save_state(uuid, integer, jsonb) from anon;
revoke all on function public.rotate_join_code(uuid) from anon;

-- Live-Abgleich zwischen Geräten
do $$ begin
  alter publication supabase_realtime add table public.family_state;
exception when duplicate_object then null; end $$;

-- Fotos ---------------------------------------------------------------------
-- Pfad: <family_id>/<datei>.jpg

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
