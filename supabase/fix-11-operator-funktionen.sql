-- Nachtrag 11: Operator schaltet Funktionen pro Familie, Plan, eigenes KI-Limit, echte KI-Kosten.
-- Einmal komplett im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach laufen.
--
-- families.features  {"lernen": false, ...}  false = Funktion für die Familie aus. Fehlt ein Eintrag, ist sie an.
-- families.plan      'free' | 'pro' | 'test' | 'intern'
-- families.ai_limit  eigenes KI-Tageslimit (leer = Standard 30)
-- ai_usage           KI-Verbrauch pro Familie und Tag (Aufrufe, Tokens, Kosten in Mikro-Dollar)
-- Familien können diese Spalten lesen (für die Anzeige), aber nicht ändern.

alter table public.families add column if not exists features jsonb not null default '{}'::jsonb;
alter table public.families add column if not exists plan text not null default 'free';
alter table public.families add column if not exists ai_limit integer;

create table if not exists public.ai_usage (
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  tok_in bigint not null default 0,
  tok_out bigint not null default 0,
  micro bigint not null default 0,
  primary key (family_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Nur die Server-Funktion schreibt den Verbrauch
create or replace function public.ai_track(fid uuid, d date, tin bigint, tout bigint, micro bigint)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_usage as u (family_id, day, calls, tok_in, tok_out, micro) values (fid, d, 1, tin, tout, micro)
  on conflict (family_id, day) do update set calls = u.calls + 1, tok_in = u.tok_in + excluded.tok_in,
    tok_out = u.tok_out + excluded.tok_out, micro = u.micro + excluded.micro;
$$;
revoke execute on function public.ai_track(uuid, date, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ai_track(uuid, date, bigint, bigint, bigint) to service_role;

-- Operator ändert Schalter, Plan und KI-Limit
create or replace function public.op_set_family(fid uuid, feats jsonb, new_plan text, new_limit integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  if new_plan not in ('free', 'pro', 'test', 'intern') then raise exception 'bad_plan'; end if;
  update public.families set features = coalesce(feats, '{}'::jsonb), plan = new_plan,
    ai_limit = case when new_limit is null or new_limit < 0 then null else least(new_limit, 1000) end
  where id = fid;
end $$;
grant execute on function public.op_set_family(uuid, jsonb, text, integer) to authenticated;

-- Übersicht erweitert um Schalter, Plan, Limit und KI-Verbrauch der letzten 7 und 30 Tage
drop function if exists public.op_families();
create or replace function public.op_families()
returns table (id uuid, name text, created_at timestamptz, parents bigint, kids bigint, children integer, updated_at timestamptz,
  ai_today integer, support_until timestamptz, mine boolean, done7 integer, features text[],
  flags jsonb, plan text, ai_limit integer, ai7 integer, ai30 integer, usd7 numeric, usd30 numeric, usd_today numeric)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'not_operator'; end if;
  perform public.support_cleanup();
  return query
  select f.id, f.name, f.created_at,
    (select count(*) from public.members m where m.family_id = f.id and m.role = 'eltern' and m.until is null),
    (select count(*) from public.members m where m.family_id = f.id and m.role = 'kind'),
    public.jlen(s.data -> 'children'),
    s.updated_at,
    case when f.ai_day = (now() at time zone 'Europe/Berlin')::date then f.ai_count else 0 end,
    (select a.until from public.support_access a where a.family_id = f.id and a.until > now()),
    exists (select 1 from public.members m where m.family_id = f.id and m.user_id = auth.uid() and m.until is null),
    (select count(*)::int from jsonb_array_elements(case when jsonb_typeof(s.data -> 'completions') = 'array' then s.data -> 'completions' else '[]'::jsonb end) e
      where e ->> 'date' >= to_char(now() - interval '7 days', 'YYYY-MM-DD')),
    array_remove(array[
      case when public.jlen(s.data -> 'events') > 0 then 'kalender' end,
      case when coalesce(s.data -> 'money', '{}'::jsonb) <> '{}'::jsonb then 'geld' end,
      case when public.jlen(s.data -> 'topics') + public.jlen(s.data -> 'worksheets') > 0 then 'lernen' end,
      case when public.jlen(s.data -> 'vocab') > 0 then 'vokabeln' end,
      case when public.jlen(s.data -> 'meals') > 0 then 'essen' end,
      case when s.data -> 'settings' ? 'icloud' or s.data -> 'settings' ? 'untis' or public.jlen(s.data -> 'settings' -> 'feeds') > 0 then 'sync' end
    ], null),
    f.features, f.plan, f.ai_limit,
    (select coalesce(sum(u.calls), 0)::int from public.ai_usage u where u.family_id = f.id and u.day > (now() at time zone 'Europe/Berlin')::date - 7),
    (select coalesce(sum(u.calls), 0)::int from public.ai_usage u where u.family_id = f.id and u.day > (now() at time zone 'Europe/Berlin')::date - 30),
    (select coalesce(sum(u.micro), 0) / 1e6 from public.ai_usage u where u.family_id = f.id and u.day > (now() at time zone 'Europe/Berlin')::date - 7),
    (select coalesce(sum(u.micro), 0) / 1e6 from public.ai_usage u where u.family_id = f.id and u.day > (now() at time zone 'Europe/Berlin')::date - 30),
    (select coalesce(sum(u.micro), 0) / 1e6 from public.ai_usage u where u.family_id = f.id and u.day = (now() at time zone 'Europe/Berlin')::date)
  from public.families f left join public.family_state s on s.family_id = f.id
  order by s.updated_at desc nulls last;
end $$;
grant execute on function public.op_families() to authenticated;
