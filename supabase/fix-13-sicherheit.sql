-- fix-13: Sicherheit (Prüfung vom 26.11.2026)
-- Einmal komplett im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach laufen.
-- Voraussetzung: fix-10 (Fotos auslagern) ist schon gelaufen.
--
-- Was sich ändert:
--  1. Familiencode raten wird gebremst: höchstens 10 falsche Versuche pro Gerät und Stunde.
--  2. Neue Familien nur noch mit echtem Konto (E-Mail, Google, Apple), nicht anonym.
--     Schützt vor fremden Leuten, die sich massenhaft Familien anlegen und die KI auf deine Kosten nutzen.
--  3. Den Familiencode und den Kalender-Abo-Schlüssel sehen nur noch Eltern, nicht mehr Kindergeräte.
--  4. Eltern sehen alle verbundenen Geräte und können einzelne entfernen (verlorenes Handy, alte Einladung).
--  5. Automatische Sicherung des Familienstands: stündlich für 2 Tage, danach eine pro Tag für 30 Tage.
--     Wenn etwas kaputt- oder gelöscht wird, lässt sich ein älterer Stand zurückholen.
--  6. Speichern lehnt riesige Datenmengen ab (über 8 MB), damit niemand die Datenbank vollschreiben kann.
--  7. KI-Tageslimit wird ohne Lücke gezählt (vorher ließ es sich mit vielen gleichzeitigen Aufrufen überlisten).
--  8. Interne Hilfsfunktionen sind von außen nicht mehr aufrufbar.

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'ph_extract') then
    raise exception 'Bitte zuerst fix-10-fotos-auslagern.sql ausführen.';
  end if;
end $$;

-- 1. Familiencode: Fehlversuche zählen ----------------------------------------
create table if not exists public.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_user_at on public.join_attempts (user_id, at);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Gibt bei falschem Code null zurück (statt Fehler), damit der Fehlversuch gespeichert bleibt.
create or replace function public.join_family(code text, as_role text, child text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  fails int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if as_role not in ('eltern', 'kind') then raise exception 'bad_role'; end if;
  if as_role = 'eltern' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'parent_needs_account';
  end if;
  select count(*) into fails from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour';
  if fails >= 10 then raise exception 'too_many_attempts'; end if;
  select id into fid from public.families where join_code = upper(trim(code));
  if fid is null then
    insert into public.join_attempts (user_id) values (auth.uid());
    delete from public.join_attempts where at < now() - interval '1 day';
    perform pg_sleep(1);
    return null;
  end if;
  insert into public.members (family_id, user_id, role, child_id)
  values (fid, auth.uid(), as_role, case when as_role = 'kind' then child end)
  on conflict (family_id, user_id) do update set role = excluded.role, child_id = excluded.child_id;
  return fid;
end $$;
grant execute on function public.join_family(text, text, text) to authenticated;
revoke all on function public.join_family(text, text, text) from anon;

-- 2. Neue Familie nur mit echtem Konto -----------------------------------------
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
  insert into public.family_state (family_id, data) values (fid, initial);
  return query select fid, code;
end $$;
grant execute on function public.create_family(text, jsonb) to authenticated;
revoke all on function public.create_family(text, jsonb) from anon;

-- Familiencode mit echter Zufallsquelle statt random()
create or replace function public.new_join_code()
returns text language plpgsql set search_path = public, extensions as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
  end loop;
  return code;
end $$;

-- 3. Code und Abo-Schlüssel nur für Eltern ---------------------------------------
-- Kindergeräte dürfen die Familie weiter lesen, aber nicht mehr die Spalten join_code und ics_token.
revoke select on public.families from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'families' and column_name not in ('join_code', 'ics_token');
  execute format('grant select (%s) on public.families to authenticated', cols);
end $$;

create or replace function public.family_join_code(fid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_parent(fid) then (select join_code from public.families where id = fid) end;
$$;
revoke all on function public.family_join_code(uuid) from public, anon;
grant execute on function public.family_join_code(uuid) to authenticated;

-- 4. Geräte anzeigen und entfernen -------------------------------------------------
alter table public.members add column if not exists last_seen timestamptz;

create or replace function public.family_devices(fid uuid)
returns table (user_id uuid, role text, child_id text, email text, created_at timestamptz, last_seen timestamptz, until timestamptz, me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  return query
  select m.user_id, m.role, m.child_id, u.email::text, m.created_at, m.last_seen, m.until, m.user_id = auth.uid()
    from public.members m left join auth.users u on u.id = m.user_id
   where m.family_id = fid
   order by m.role, m.created_at;
end $$;
revoke all on function public.family_devices(uuid) from public, anon;
grant execute on function public.family_devices(uuid) to authenticated;

create or replace function public.remove_device(fid uuid, uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  if uid = auth.uid() then raise exception 'not_self'; end if;
  delete from public.members where family_id = fid and user_id = uid;
  begin
    delete from public.push_subs where family_id = fid and user_id = uid;
  exception when undefined_table then null;
  end;
end $$;
revoke all on function public.remove_device(uuid, uuid) from public, anon;
grant execute on function public.remove_device(uuid, uuid) to authenticated;

-- 5. Automatische Sicherung --------------------------------------------------------
create table if not exists public.family_state_history (
  id bigserial primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  version integer not null,
  data jsonb not null,
  at timestamptz not null default now()
);
create index if not exists fsh_family_at on public.family_state_history (family_id, at desc);
alter table public.family_state_history enable row level security;
revoke all on public.family_state_history from anon, authenticated;

create or replace function public.state_backup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.family_state_history h where h.family_id = old.family_id and h.at > now() - interval '1 hour') then
    insert into public.family_state_history (family_id, version, data) values (old.family_id, old.version, old.data);
    -- älter als 2 Tage: nur die erste Sicherung pro Tag behalten; älter als 30 Tage: weg
    delete from public.family_state_history h
     where h.family_id = old.family_id and h.at < now() - interval '2 days'
       and exists (select 1 from public.family_state_history h2 where h2.family_id = h.family_id
                    and (h2.at at time zone 'Europe/Berlin')::date = (h.at at time zone 'Europe/Berlin')::date and h2.at < h.at);
    delete from public.family_state_history h where h.family_id = old.family_id and h.at < now() - interval '30 days';
  end if;
  return new;
end $$;
revoke all on function public.state_backup() from public, anon, authenticated;
drop trigger if exists family_state_backup on public.family_state;
create trigger family_state_backup before update on public.family_state for each row execute function public.state_backup();

-- 6. Speichern: Größe begrenzen, "zuletzt aktiv" merken --------------------------
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
  clean := public.ph_extract(fid, new_data);
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

-- 7. KI-Zähler in einem Schritt (nur für den Server) --------------------------------
create or replace function public.ai_take(fid uuid, lim integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Europe/Berlin')::date;
  n integer;
begin
  update public.families
     set ai_count = case when ai_day = d then ai_count + 1 else 1 end, ai_day = d
   where id = fid and (ai_day is distinct from d or ai_count < lim)
  returning ai_count into n;
  return n; -- null = Limit erreicht
end $$;
revoke all on function public.ai_take(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, integer) to service_role;

-- 8. Interne Hilfsfunktionen sperren -------------------------------------------------
revoke all on function public.ph_extract(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.new_join_code() from public, anon, authenticated;
revoke all on function public.support_cleanup() from public, anon, authenticated;
do $$ begin
  revoke all on function public.ai_track(uuid, date, bigint, bigint, bigint) from public, anon, authenticated;
exception when undefined_function then null; end $$;

-- Kontrolle: sollte 6 Zeilen mit "ok" zeigen
select proname, 'ok' as status from pg_proc
 where proname in ('join_family', 'family_join_code', 'family_devices', 'remove_device', 'state_backup', 'ai_take')
 order by proname;
