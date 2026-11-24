-- Familienplaner: Tageszähler für die KI (Test erstellen, Vokabeln vom Foto lesen)
-- Einmal im Supabase Dashboard > SQL Editor ausführen.
alter table public.families add column if not exists ai_day date;
alter table public.families add column if not exists ai_count int not null default 0;
