-- Familienplaner: Datenbank-Schema für Supabase (Region EU, z. B. Frankfurt).
-- Jede Familie sieht nur ihre eigenen Daten (Row Level Security).
-- Noch NICHT angebunden: Version 0.1 speichert lokal auf dem Gerät.

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Eltern-Konten (Supabase Auth). Kinder haben kein eigenes Konto.
create table family_members (
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'eltern' check (role in ('eltern')),
  primary key (family_id, user_id)
);

create table children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,            -- nur Vorname oder Spitzname
  grade text,
  color text not null
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('hausaufgabe','pflicht')),
  points int not null default 0 check (points >= 0),
  repeat text not null check (repeat in ('einmal','taeglich','werktags')),
  date date,
  active boolean not null default true
);

create table completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  date date not null,
  status text not null check (status in ('wartet','bestaetigt')),
  unique (task_id, date)
);

create table ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  points int not null,
  reason text not null,
  at timestamptz not null default now()
);

create table rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  cost int not null check (cost > 0)
);

create or replace function is_member(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

alter table families enable row level security;
alter table family_members enable row level security;
alter table children enable row level security;
alter table tasks enable row level security;
alter table completions enable row level security;
alter table ledger enable row level security;
alter table rewards enable row level security;

create policy fam_read on families for select using (is_member(id));
create policy mem_read on family_members for select using (user_id = auth.uid());
create policy c_all on children    for all using (is_member(family_id)) with check (is_member(family_id));
create policy t_all on tasks       for all using (is_member(family_id)) with check (is_member(family_id));
create policy k_all on completions for all using (is_member(family_id)) with check (is_member(family_id));
create policy l_all on ledger      for all using (is_member(family_id)) with check (is_member(family_id));
create policy r_all on rewards     for all using (is_member(family_id)) with check (is_member(family_id));
