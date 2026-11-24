-- Erinnerungen bei Terminen (Push aufs Handy)
-- Einmal im SQL Editor ausführen. Legt die Tabellen an und startet einen Zeitplan,
-- der alle 5 Minuten die Funktion "familie" anstößt. Schlüssel erzeugt die Funktion selbst.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text,
  private_key text,
  tick_token text not null default encode(gen_random_bytes(24), 'hex')
);
insert into public.push_config (id) values (1) on conflict do nothing;

create table if not exists public.push_subs (
  endpoint text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null,
  person_id text,
  sub jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_sent (
  family_id uuid not null references public.families(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (family_id, key)
);

-- Nur der Server darf an diese Tabellen
alter table public.push_config enable row level security;
alter table public.push_subs enable row level security;
alter table public.push_sent enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_config, public.push_subs, public.push_sent to service_role;
grant select on public.family_state, public.members to service_role;

-- Alle 5 Minuten prüfen, ob eine Erinnerung fällig ist
select cron.unschedule('familie-erinnerungen') where exists (select 1 from cron.job where jobname = 'familie-erinnerungen');
select cron.schedule('familie-erinnerungen', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://daxgmedegpauhzzfvygz.supabase.co/functions/v1/familie',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('action', 'tick', 'token', (select tick_token from public.push_config where id = 1))
  );
$$);
