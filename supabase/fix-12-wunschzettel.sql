-- fix-12: Wunschzettel mit Teilen-Link
-- Kinder tragen Wünsche ein, Eltern geben frei. Freigegebene Wünsche können über einen
-- geheimen Link ohne Anmeldung angesehen und reserviert werden (Oma, Paten, Freunde).
-- Der Link zeigt nur Vorname, Wunsch, Link, Preis, Hinweis und ob er schon reserviert ist.
-- Keine Fotos, keine anderen Familiendaten.
-- Reservierungen liegen in einer eigenen Tabelle. Nur Eltern sehen, wer was reserviert hat,
-- Kinder nicht (auch nicht technisch, da es keine Leserechte für Mitglieder gibt).
-- Einmal komplett im Supabase SQL Editor ausführen.

create table if not exists public.wish_shares (
  token text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id text not null,
  created_at timestamptz not null default now(),
  unique (family_id, child_id)
);
alter table public.wish_shares enable row level security;

create table if not exists public.wish_reservations (
  family_id uuid not null references public.families(id) on delete cascade,
  wish_id text not null,
  child_id text not null,
  name text,
  key text not null,
  by_parent boolean not null default false,
  at timestamptz not null default now(),
  primary key (family_id, wish_id)
);
alter table public.wish_reservations enable row level security;
-- Keine Policies: Zugriff nur über die Funktionen unten.
revoke all on public.wish_shares, public.wish_reservations from anon, authenticated;

-- Wunsch aus dem Familienstand holen, nur wenn freigegeben und für dieses Kind
create or replace function public.wish_find(fid uuid, child text, wid text)
returns jsonb language sql stable security definer set search_path = public as $$
  select w from public.family_state s, jsonb_array_elements(coalesce(s.data->'wishes', '[]'::jsonb)) w
   where s.family_id = fid and w->>'id' = wid and w->>'childId' = child
     and w->>'status' = 'frei' and coalesce((w->>'done')::boolean, false) = false
   limit 1;
$$;

-- Eltern: Links der Familie lesen ('get'), einschalten ('on'), erneuern ('new'), abschalten ('off')
create or replace function public.wish_share(fid uuid, child text, mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  if mode in ('off', 'new') then delete from public.wish_shares where family_id = fid and child_id = child; end if;
  if mode in ('on', 'new') then
    insert into public.wish_shares (token, family_id, child_id)
    values (replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), fid, child)
    on conflict (family_id, child_id) do nothing;
  end if;
  return coalesce((select jsonb_object_agg(child_id, token) from public.wish_shares where family_id = fid), '{}'::jsonb);
end $$;

-- Eltern: alle Reservierungen der Familie
create or replace function public.wish_reserved(fid uuid)
returns table (wish_id text, child_id text, name text, by_parent boolean, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  return query select r.wish_id, r.child_id, r.name, r.by_parent, r.at from public.wish_reservations r where r.family_id = fid;
end $$;

-- Eltern: selbst reservieren ("Wir schenken das") oder eine Reservierung aufheben
create or replace function public.wish_parent_set(fid uuid, child text, wid text, reserve boolean, who text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  if reserve then
    insert into public.wish_reservations (family_id, wish_id, child_id, name, key, by_parent)
    values (fid, wid, child, left(nullif(trim(who), ''), 40), replace(gen_random_uuid()::text, '-', ''), true)
    on conflict (family_id, wish_id) do nothing;
  else
    delete from public.wish_reservations where family_id = fid and wish_id = wid;
  end if;
end $$;

-- Öffentlich: Liste zum Link. Liefert null, wenn der Link nicht (mehr) gilt.
create or replace function public.wish_public(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sh public.wish_shares;
  d jsonb;
  kid text;
begin
  select * into sh from public.wish_shares where token = tok;
  if not found then return null; end if;
  select data into d from public.family_state where family_id = sh.family_id;
  select split_part(trim(c->>'name'), ' ', 1) into kid from jsonb_array_elements(coalesce(d->'children', '[]'::jsonb)) c where c->>'id' = sh.child_id;
  if kid is null then return null; end if;
  return jsonb_build_object(
    'name', kid,
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w->>'id',
        'title', left(w->>'title', 120),
        'link', case when w->>'link' ~* '^https?://[^\s]+$' then left(w->>'link', 500) end,
        'cents', w->'cents',
        'prio', coalesce((w->>'prio')::int, 1),
        'note', left(w->>'note', 200),
        'reserved', exists (select 1 from public.wish_reservations r where r.family_id = sh.family_id and r.wish_id = w->>'id')
      ) order by coalesce((w->>'prio')::int, 1) desc, w->>'at')
      from jsonb_array_elements(coalesce(d->'wishes', '[]'::jsonb)) w
      where w->>'childId' = sh.child_id and w->>'status' = 'frei' and coalesce((w->>'done')::boolean, false) = false
    ), '[]'::jsonb)
  );
end $$;

-- Öffentlich: reservieren. Gibt einen Schlüssel zurück, mit dem der Gast wieder freigeben kann.
create or replace function public.wish_reserve(tok text, wid text, who text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  sh public.wish_shares;
  k text := replace(gen_random_uuid()::text, '-', '');
  got text;
begin
  select * into sh from public.wish_shares where token = tok;
  if not found then raise exception 'link_off'; end if;
  if public.wish_find(sh.family_id, sh.child_id, wid) is null then raise exception 'no_wish'; end if;
  insert into public.wish_reservations (family_id, wish_id, child_id, name, key)
  values (sh.family_id, wid, sh.child_id, left(nullif(trim(who), ''), 40), k)
  on conflict (family_id, wish_id) do nothing
  returning key into got;
  if got is null then raise exception 'taken'; end if;
  return got;
end $$;

-- Öffentlich: eigene Reservierung zurücknehmen (nur mit dem Schlüssel von oben)
create or replace function public.wish_release(tok text, wid text, k text)
returns boolean language plpgsql security definer set search_path = public as $$
declare sh public.wish_shares; n int;
begin
  select * into sh from public.wish_shares where token = tok;
  if not found then return false; end if;
  delete from public.wish_reservations where family_id = sh.family_id and wish_id = wid and key = k;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.wish_find(uuid, text, text) from public, anon, authenticated;
revoke all on function public.wish_share(uuid, text, text) from public, anon;
revoke all on function public.wish_reserved(uuid) from public, anon;
revoke all on function public.wish_parent_set(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.wish_share(uuid, text, text) to authenticated;
grant execute on function public.wish_reserved(uuid) to authenticated;
grant execute on function public.wish_parent_set(uuid, text, text, boolean, text) to authenticated;
grant execute on function public.wish_public(text) to anon, authenticated;
grant execute on function public.wish_reserve(text, text, text) to anon, authenticated;
grant execute on function public.wish_release(text, text, text) to anon, authenticated;

-- Kontrolle: sollte drei Zeilen mit "ok" zeigen
select 'ok' as wunschzettel from pg_proc where proname in ('wish_share', 'wish_public', 'wish_reserve');
