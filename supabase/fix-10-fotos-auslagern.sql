-- fix-10: Fotos aus dem Familienspeicher auslagern
-- Problem: Alle Fotos (Unterlagen, Klassenarbeiten, Essen, Profilbilder) lagen als Text im
-- gemeinsamen Familienstand. Der wurde so groß, dass das Laden abbricht ("statement timeout").
-- Lösung: Große Bilder kommen in eine eigene Tabelle. Im Familienstand steht nur noch ein
-- kurzer Verweis "ph:<id>". Die App lädt ein Bild erst, wenn es gezeigt wird.
-- Nichts wird gelöscht außer Bildern, auf die nichts mehr verweist (z. B. nach dem automatischen
-- Löschen der KI-Fotos).
-- Einmal komplett im Supabase SQL Editor ausführen.

create table if not exists public.family_photos (
  family_id uuid not null references public.families(id) on delete cascade,
  id text not null,
  data text not null,
  created_at timestamptz not null default now(),
  primary key (family_id, id)
);
alter table public.family_photos enable row level security;
drop policy if exists "Mitglieder sehen Fotos" on public.family_photos;
create policy "Mitglieder sehen Fotos" on public.family_photos for select using (public.is_member(family_id));
grant select on public.family_photos to authenticated;

-- Ersetzt jedes große Bild (data:...) im JSON durch "ph:<md5>" und legt es in family_photos ab.
create or replace function public.ph_extract(fid uuid, j jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text := jsonb_typeof(j);
  s text; h text; r jsonb;
begin
  if t = 'string' then
    s := j #>> '{}';
    if length(s) > 6000 and left(s, 5) = 'data:' then
      h := md5(s);
      insert into public.family_photos (family_id, id, data) values (fid, h, s) on conflict do nothing;
      return to_jsonb('ph:' || h);
    end if;
    return j;
  elsif t = 'object' then
    select coalesce(jsonb_object_agg(k, public.ph_extract(fid, v)), '{}'::jsonb) into r from jsonb_each(j) as e(k, v);
    return r;
  elsif t = 'array' then
    select coalesce(jsonb_agg(public.ph_extract(fid, v) order by n), '[]'::jsonb) into r from jsonb_array_elements(j) with ordinality as e(v, n);
    return r;
  end if;
  return j;
end $$;

-- Speichern: Bilder auslagern, verwaiste Bilder entfernen.
create or replace function public.save_state(fid uuid, expected integer, new_data jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v integer;
  clean jsonb;
  txt text;
begin
  if not public.is_member(fid) then raise exception 'not_member'; end if;
  clean := public.ph_extract(fid, new_data);
  update public.family_state
     set data = clean, version = version + 1, updated_at = now()
   where family_id = fid and version = expected
  returning version into v;
  if v is null then raise exception 'conflict'; end if;
  txt := clean::text;
  delete from public.family_photos p where p.family_id = fid and p.created_at < now() - interval '10 minutes' and position(('ph:' || p.id) in txt) = 0;
  return v;
end $$;

-- Einmalig: bestehende Familien umstellen (dauert bei großen Daten einige Sekunden).
set statement_timeout = '5min';
update public.family_state set data = public.ph_extract(family_id, data), version = version + 1, updated_at = now();

-- Kontrolle: Größe des Familienstands danach (sollte jetzt klein sein, unter 1 MB)
select f.name, pg_size_pretty(length(s.data::text)::bigint) as familienstand,
       (select count(*) from public.family_photos p where p.family_id = s.family_id) as fotos
  from public.family_state s join public.families f on f.id = s.family_id;
