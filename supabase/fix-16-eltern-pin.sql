-- fix-16: Eltern-PIN nur noch verschlüsselt auf dem Server
-- Einmal komplett im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach laufen.
-- Voraussetzung: fix-13 (Sicherheit) ist schon gelaufen.
--
-- Was sich ändert:
--  1. Die Eltern-PIN und die eigenen PINs von Oma, Opa usw. stehen nicht mehr im Familienstand,
--     den jedes Gerät der Familie lesen kann. Sie liegen nur noch als bcrypt-Hash in family_pins,
--     an die keine App herankommt.
--  2. Geprüft wird auf dem Server (pin_check). Gegen Raten: pro Gerät höchstens 5 falsche Versuche
--     in 15 Minuten und 20 pro Tag, alle Kindergeräte zusammen höchstens 30 pro Tag.
--  3. Bestehende PINs werden übernommen, niemand wird ausgesperrt. Danach werden sie aus dem
--     Familienstand und aus den automatischen Sicherungen (fix-13) gelöscht.
--  4. Alte App-Versionen, die noch eine PIN mitschicken: save_state übernimmt sie nur, wenn es noch
--     keine gibt, und entfernt sie immer.
-- Die Server-Funktion "familie" muss dafür NICHT neu deployt werden.

do $$ begin
  if not exists (select 1 from pg_class where relname = 'family_state_history') then
    raise exception 'Bitte zuerst fix-13-sicherheit.sql ausführen.';
  end if;
end $$;

create extension if not exists pgcrypto with schema extensions;

-- 1. Tabellen -----------------------------------------------------------------------
create table if not exists public.family_pins (
  family_id uuid not null references public.families(id) on delete cascade,
  who text not null,            -- 'admin' = Eltern-PIN, sonst ID der Person (z. B. Oma)
  hash text not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, who)
);
alter table public.family_pins enable row level security;
revoke all on public.family_pins from anon, authenticated;

create table if not exists public.pin_attempts (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null,
  parent boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists pin_attempts_user on public.pin_attempts (family_id, user_id, at);
create index if not exists pin_attempts_fam on public.pin_attempts (family_id, at);
alter table public.pin_attempts enable row level security;
revoke all on public.pin_attempts from anon, authenticated;

-- 2. Interne Helfer -------------------------------------------------------------------
create or replace function public.pin_hash(p text)
returns text language sql volatile set search_path = public, extensions as $$
  select crypt(p, gen_salt('bf', 10));
$$;

-- Entfernt alle PINs aus einem Familienstand
create or replace function public.pin_strip(st jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
begin
  if st is null or jsonb_typeof(st) <> 'object' then return st; end if;
  if jsonb_typeof(st -> 'family') = 'object' and (st -> 'family') ? 'parentPin' then
    st := jsonb_set(st, '{family}', (st -> 'family') - 'parentPin');
  end if;
  if jsonb_typeof(st -> 'parents') = 'array' then
    st := jsonb_set(st, '{parents}', (
      select coalesce(jsonb_agg(case when jsonb_typeof(x) = 'object' then x - 'pin' else x end order by n), '[]'::jsonb)
        from jsonb_array_elements(st -> 'parents') with ordinality as t(x, n)));
  end if;
  return st;
end $$;

-- Übernimmt Klartext-PINs aus einem Stand (nur wenn es für diese Person noch keine gibt) und entfernt sie
create or replace function public.pin_absorb(fid uuid, st jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  p text;
  e jsonb;
begin
  if st is null or jsonb_typeof(st) <> 'object' then return st; end if;
  p := st #>> '{family,parentPin}';
  if p ~ '^\d{4}$' then
    insert into public.family_pins (family_id, who, hash) values (fid, 'admin', public.pin_hash(p)) on conflict do nothing;
  end if;
  if jsonb_typeof(st -> 'parents') = 'array' then
    for e in select x from jsonb_array_elements(st -> 'parents') as t(x) loop
      if jsonb_typeof(e) = 'object' and (e ->> 'pin') ~ '^\d{4}$' and coalesce(e ->> 'id', '') not in ('', 'admin', 'any') then
        insert into public.family_pins (family_id, who, hash) values (fid, e ->> 'id', public.pin_hash(e ->> 'pin')) on conflict do nothing;
      end if;
    end loop;
  end if;
  return public.pin_strip(st);
end $$;

revoke all on function public.pin_hash(text) from public, anon, authenticated;
revoke all on function public.pin_strip(jsonb) from public, anon, authenticated;
revoke all on function public.pin_absorb(uuid, jsonb) from public, anon, authenticated;

-- 3. PIN prüfen -------------------------------------------------------------------------
-- target: 'admin' = nur Eltern-PIN, 'any' = Eltern-PIN oder PIN eines anderen Erwachsenen,
--         sonst Person-ID = deren eigene PIN oder die Eltern-PIN.
-- Antwort: {res: ok|wrong|locked|unset, who?, wait? (Sekunden), left? (Versuche bis zur Pause)}
create or replace function public.pin_check(fid uuid, pin text, target text default 'any')
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid();
  par boolean;
  f15 int; f24 int; fam int;
  first15 timestamptz; first24 timestamptz; firstfam timestamptz;
  h_admin text;
  hit text;
begin
  if me is null or not public.is_member(fid) then raise exception 'not_member'; end if;
  par := public.is_parent(fid);

  select count(*) filter (where a.at > now() - interval '15 minutes'), count(*),
         min(a.at) filter (where a.at > now() - interval '15 minutes'), min(a.at)
    into f15, f24, first15, first24
    from public.pin_attempts a where a.family_id = fid and a.user_id = me and a.at > now() - interval '1 day';
  if f15 >= 5 then
    return jsonb_build_object('res', 'locked', 'wait', ceil(extract(epoch from first15 + interval '15 minutes' - now())));
  end if;
  if f24 >= 20 then
    return jsonb_build_object('res', 'locked', 'wait', ceil(extract(epoch from first24 + interval '1 day' - now())));
  end if;
  if not par then
    select count(*), min(a.at) into fam, firstfam
      from public.pin_attempts a where a.family_id = fid and not a.parent and a.at > now() - interval '1 day';
    if fam >= 30 then
      return jsonb_build_object('res', 'locked', 'wait', ceil(extract(epoch from firstfam + interval '1 day' - now())));
    end if;
  end if;

  select p.hash into h_admin from public.family_pins p where p.family_id = fid and p.who = 'admin';
  if h_admin is null then return jsonb_build_object('res', 'unset'); end if;

  if pin ~ '^\d{4}$' then
    if coalesce(target, 'any') = 'any' then
      select p.who into hit from public.family_pins p
       where p.family_id = fid and p.who <> 'admin' and p.hash = crypt(pin, p.hash) limit 1;
    elsif target <> 'admin' then
      select p.who into hit from public.family_pins p
       where p.family_id = fid and p.who = target and p.hash = crypt(pin, p.hash);
    end if;
    if hit is null and h_admin = crypt(pin, h_admin) then hit := 'admin'; end if;
  end if;

  if hit is not null then return jsonb_build_object('res', 'ok', 'who', hit); end if;

  insert into public.pin_attempts (family_id, user_id, parent) values (fid, me, par);
  delete from public.pin_attempts a where a.at < now() - interval '2 days';
  perform pg_sleep(0.5);
  return jsonb_build_object('res', 'wrong', 'left', greatest(0, 4 - f15));
end $$;
revoke all on function public.pin_check(uuid, text, text) from public, anon;
grant execute on function public.pin_check(uuid, text, text) to authenticated;

-- 4. Eltern-PIN ändern (mit der bisherigen). Gibt es noch keine, darf ein Eltern-Konto sie festlegen.
create or replace function public.pin_set(fid uuid, old_pin text, new_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  if new_pin !~ '^\d{4}$' then raise exception 'bad_pin'; end if;
  if exists (select 1 from public.family_pins p where p.family_id = fid and p.who = 'admin') then
    r := public.pin_check(fid, old_pin, 'admin');
    if r ->> 'res' <> 'ok' then return r; end if;
  elsif not public.is_parent(fid) then
    raise exception 'not_parent';
  end if;
  insert into public.family_pins (family_id, who, hash) values (fid, 'admin', public.pin_hash(new_pin))
  on conflict (family_id, who) do update set hash = excluded.hash, updated_at = now();
  return jsonb_build_object('res', 'ok');
end $$;
revoke all on function public.pin_set(uuid, text, text) from public, anon;
grant execute on function public.pin_set(uuid, text, text) to authenticated;

-- 5. Eigene PIN einer Person (Oma, Opa …) setzen oder löschen, nur mit der Eltern-PIN
create or replace function public.pin_set_person(fid uuid, admin_pin text, person text, new_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  if coalesce(person, '') in ('', 'admin', 'any') then raise exception 'bad_person'; end if;
  if new_pin is not null and new_pin <> '' and new_pin !~ '^\d{4}$' then raise exception 'bad_pin'; end if;
  r := public.pin_check(fid, admin_pin, 'admin');
  if r ->> 'res' <> 'ok' then return r; end if;
  if coalesce(new_pin, '') = '' then
    delete from public.family_pins p where p.family_id = fid and p.who = person;
  else
    insert into public.family_pins (family_id, who, hash) values (fid, person, public.pin_hash(new_pin))
    on conflict (family_id, who) do update set hash = excluded.hash, updated_at = now();
  end if;
  return jsonb_build_object('res', 'ok');
end $$;
revoke all on function public.pin_set_person(uuid, text, text, text) from public, anon;
grant execute on function public.pin_set_person(uuid, text, text, text) to authenticated;

-- 6. Wer hat eine PIN? (ohne Hashes) ------------------------------------------------------
create or replace function public.pin_status(fid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  return jsonb_build_object(
    'admin', exists (select 1 from public.family_pins p where p.family_id = fid and p.who = 'admin'),
    'people', coalesce((select jsonb_agg(p.who) from public.family_pins p where p.family_id = fid and p.who <> 'admin'), '[]'::jsonb));
end $$;
revoke all on function public.pin_status(uuid) from public, anon;
grant execute on function public.pin_status(uuid) to authenticated;

-- 7. Speichern und Familie anlegen: PINs nie mehr im Stand ---------------------------------
-- (wie fix-13, zusätzlich pin_absorb)
create or replace function public.save_state(fid uuid, expected integer, new_data jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v integer;
  clean jsonb;
  txt text;
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  if jsonb_typeof(new_data) <> 'object' then raise exception 'bad_data'; end if;
  clean := public.pin_absorb(fid, public.ph_extract(fid, new_data));
  txt := clean::text;
  if octet_length(txt) > 8000000 then raise exception 'too_big'; end if;
  update public.family_state
     set data = clean, version = version + 1, updated_at = now()
   where family_id = fid and version = expected
  returning version into v;
  if v is null then raise exception 'conflict'; end if;
  delete from public.family_photos p where p.family_id = fid and p.created_at < now() - interval '10 minutes' and position(('ph:' || p.id) in txt) = 0;
  update public.members set last_seen = now()
   where family_id = fid and user_id = auth.uid() and (last_seen is null or last_seen < now() - interval '10 minutes');
  return v;
end $$;
grant execute on function public.save_state(uuid, integer, jsonb) to authenticated;
revoke all on function public.save_state(uuid, integer, jsonb) from anon;

create or replace function public.create_family(fname text, initial jsonb)
returns table (family_id uuid, join_code text)
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'parent_needs_account'; end if;
  if (select count(*) from public.members m where m.user_id = auth.uid() and m.role = 'eltern' and m.until is null) >= 5 then
    raise exception 'too_many_families';
  end if;
  loop
    code := public.new_join_code();
    exit when not exists (select 1 from public.families f where f.join_code = code);
  end loop;
  insert into public.families (name, join_code) values (fname, code) returning id into fid;
  insert into public.members (family_id, user_id, role) values (fid, auth.uid(), 'eltern');
  insert into public.family_state (family_id, data) values (fid, public.pin_absorb(fid, initial));
  return query select fid, code;
end $$;
grant execute on function public.create_family(text, jsonb) to authenticated;
revoke all on function public.create_family(text, jsonb) from anon;

-- 8. Bestehende Familien umstellen ------------------------------------------------------------
-- Erst übernehmen und aus dem Stand löschen (Version +1, damit offene Geräte neu laden) ...
update public.family_state
   set data = public.pin_absorb(family_id, data), version = version + 1, updated_at = now()
 where data #> '{family,parentPin}' is not null
    or jsonb_path_exists(data, '$.parents[*].pin');
-- ... dann auch aus den automatischen Sicherungen, die der Trigger eben noch mit PIN angelegt hat.
update public.family_state_history
   set data = public.pin_strip(data)
 where data #> '{family,parentPin}' is not null
    or jsonb_path_exists(data, '$.parents[*].pin');

-- Kontrolle: "pins" = Familien mit verschlüsselter Eltern-PIN, "klartext" muss 0 sein
select (select count(*) from public.family_pins where who = 'admin') as pins,
       (select count(*) from public.family_state where data #> '{family,parentPin}' is not null or jsonb_path_exists(data, '$.parents[*].pin'))
     + (select count(*) from public.family_state_history where data #> '{family,parentPin}' is not null or jsonb_path_exists(data, '$.parents[*].pin')) as klartext;
