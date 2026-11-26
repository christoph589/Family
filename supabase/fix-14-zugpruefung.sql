-- Schulzug in Echtzeit: Ergebnis der Prüfung pro Familie, Zug und Tag.
-- Einmal im SQL Editor ausführen. Die Prüfung läuft im bestehenden 5-Minuten-Zeitplan (fix-05), nichts weiter zu tun.
create table if not exists public.train_status (
  family_id uuid not null references public.families(id) on delete cascade,
  route_id text not null,
  date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, route_id, date)
);
alter table public.train_status enable row level security;
grant select, insert, update, delete on public.train_status to service_role;
