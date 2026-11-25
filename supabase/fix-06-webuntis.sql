-- Nachtrag 6: Zugangsschlüssel für WebUntis (und später andere Dienste) pro Familie.
-- Nur die Server-Funktion "familie" kommt an diese Tabelle, die App selbst nie (keine Richtlinie = kein Zugriff).
-- Der Schlüssel liegt zusätzlich verschlüsselt darin.
create table if not exists public.family_secrets (
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, kind)
);
alter table public.family_secrets enable row level security;
revoke all on public.family_secrets from anon, authenticated;
grant select, insert, update, delete on public.family_secrets to service_role;
