-- Nachtrag 7: Operator-Ansicht und Support-Zugang.
-- Einmal im Supabase SQL Editor ausführen. Danach die letzte Zeile mit der eigenen E-Mail ausführen.
--
-- operators       Wer die Übersicht aller Familien sehen darf (nur Name und Zahlen, keine Inhalte)
-- support_access  Eine Familie gibt Support für eine begrenzte Zeit frei
-- support_log     Wann ein Operator in einer Familie war (sieht die Familie selbst)
-- members.until   Zeitlich begrenzte Mitgliedschaft für den Support. Läuft automatisch ab.

create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.operators enable row level security;
revoke all on public.operators from anon, authenticated;

create table if not exists public.support_access (
  family_id uuid primary key references public.families(id) on delete cascade,
  until timestamptz not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.support_access enable row level security;
revoke all on public.support_access from anon, authenticated;

create table if not exists public.support_log (
  id bigserial primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  operator uuid references auth.users(id) on delete set null,
  at timestamptz not null default now()
);
alter table public.support_log enable row level security;
revoke all on public.support_log from anon, authenticated;

alter table public.members add column if not exists until timestamptz;

-- Mitgliedschaft zählt nur, solange sie nicht abgelaufen ist
create or replace function public.is_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid() and (until is null or until > now()));
$$;
create or replace function public.is_parent(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid() and role = 'eltern' and (until is null or until > now()));
$$;
create or replace function public.is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operators where user_id = auth.uid());
$$;

-- Abgelaufene Support-Zugänge aufräumen
create or replace function public.support_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.members where until is not null and until <= now();
  delete from public.support_access where until <= now();
$$;

-- Eltern schalten den Support-Zugang ein (hours > 0) oder aus (hours = 0)
create or replace function public.set_support(fid uuid, hours integer)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
begin
  if not public.is_parent(fid) then raise exception 'not_parent'; end if;
  perform public.support_cleanup();
  if hours <= 0 then
    delete from public.support_access where family_id = fid;
    delete from public.members where family_id = fid and until is not null;
    return null;
  end if;
  t := now() + make_interval(hours => least(hours, 72));
  insert into public.support_access (family_id, until, granted_by) values (fid, t, auth.uid())
  on conflict (family_id) do update set until = excluded.until, granted_by = excluded.granted_by, granted_at = now();
  update public.members set until = t where family_id = fid and until is not null;
  return t;
end $$;

-- Familie sieht: Freigabe bis wann, und die letzten Besuche
create or replace function public.support_status(fid uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_member(fid) then jsonb_build_object(
    'until', (select until from public.support_access where family_id = fid and until > now()),
    'visits', coalesce((select jsonb_agg(at order by at desc) from (select at from public.support_log where family_id = fid order by at desc limit 5) v), '[]'::jsonb)
  ) end;
$$;

-- Operator: alle Familien, nur Kennzahlen, keine Inhalte
create or replace function public.op_families()
returns table (id uuid, name text, created_at timestamptz, parents bigint, kids bigint, children integer, updated_at timestamptz, ai_today integer, support_until timestamptz, mine boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  perform public.support_cleanup();
  return query
  select f.id, f.name, f.created_at,
    (select count(*) from public.members m where m.family_id = f.id and m.role = 'eltern' and m.until is null),
    (select count(*) from public.members m where m.family_id = f.id and m.role = 'kind'),
    coalesce(jsonb_array_length(s.data -> 'children'), 0),
    s.updated_at,
    case when f.ai_day = (now() at time zone 'Europe/Berlin')::date then f.ai_count else 0 end,
    (select a.until from public.support_access a where a.family_id = f.id and a.until > now()),
    exists (select 1 from public.members m where m.family_id = f.id and m.user_id = auth.uid() and m.until is null)
  from public.families f left join public.family_state s on s.family_id = f.id
  order by s.updated_at desc nulls last;
end $$;

-- Operator betritt eine Familie, nur mit gültiger Freigabe. Die Mitgliedschaft endet mit der Freigabe.
create or replace function public.op_enter(fid uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  perform public.support_cleanup();
  select until into t from public.support_access where family_id = fid and until > now();
  if t is null then raise exception 'no_support_access'; end if;
  insert into public.members as mm (family_id, user_id, role, until) values (fid, auth.uid(), 'eltern', t)
  on conflict (family_id, user_id) do update set until = case when mm.until is null then null else excluded.until end;
  insert into public.support_log (family_id, operator) values (fid, auth.uid());
  return t;
end $$;

grant execute on function public.is_operator() to authenticated;
grant execute on function public.set_support(uuid, integer) to authenticated;
grant execute on function public.support_status(uuid) to authenticated;
grant execute on function public.op_families() to authenticated;
grant execute on function public.op_enter(uuid) to authenticated;
revoke execute on function public.support_cleanup() from anon, authenticated;

-- Zum Schluss: sich selbst als Operator eintragen (E-Mail anpassen, dann nur diese Zeile ausführen)
-- insert into public.operators (user_id) select id from auth.users where email = 'DEINE@EMAIL.DE' on conflict do nothing;
