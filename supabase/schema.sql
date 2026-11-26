-- ============================================================
--  Pulse – Datenbank für Konten, Sync und geteilte Splits
--
--  Einmal im Supabase-Dashboard ausführen:
--  SQL Editor → New query → alles einfügen → Run
--  Das Skript kann gefahrlos mehrmals ausgeführt werden.
--
--  Sicherheit: Jede Tabelle hat Row Level Security (RLS).
--  Jeder darf nur seine eigenen Daten ändern. Lesen dürfen andere nur,
--  was öffentlich ist (bzw. für Follower freigegeben).
-- ============================================================

-- ---------- Profile ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  visibility   text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Profil automatisch anlegen, sobald sich jemand registriert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  nullif(new.raw_user_meta_data ->> 'name', ''),
                  split_part(new.email, '@', 1), ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Folgen (für „Nur Follower“ und den Feed, siehe social.sql) ----------
create table if not exists public.follows (
  follower   uuid not null references auth.users on delete cascade,
  following  uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);

-- Darf der aktuelle Nutzer Inhalte von „owner“ mit Sichtbarkeit „vis“ sehen?
create or replace function public.can_see(owner uuid, vis text)
returns boolean language sql stable security definer set search_path = '' as $$
  select owner = auth.uid()
      or vis = 'public'
      or (vis = 'followers' and exists (
            select 1 from public.follows f where f.follower = auth.uid() and f.following = owner));
$$;

-- ---------- Trainings, Cardio, Splits (Daten der App als JSON) ----------
create table if not exists public.workouts (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'private')),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists workouts_date_idx on public.workouts (date desc);

create table if not exists public.cardio (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  date       date not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.splits (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  id           text not null,
  ref          text generated always as (user_id::text || ':' || id) stored,
  is_public    boolean not null default false,
  data         jsonb not null,
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists splits_ref_idx on public.splits (ref);

-- ---------- Fortschritt pro Split (für „Entdecken“) ----------
-- split_ref: Vorlage (z. B. 'tpl-ppl') oder geteilter Split ('<user_id>:<split_id>')
create table if not exists public.split_results (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  split_ref  text not null check (char_length(split_ref) <= 80),
  stats      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, split_ref)
);

-- ---------- Row Level Security ----------
alter table public.profiles      enable row level security;
alter table public.follows       enable row level security;
alter table public.workouts      enable row level security;
alter table public.cardio        enable row level security;
alter table public.splits        enable row level security;
alter table public.split_results enable row level security;

drop policy if exists "profiles lesen" on public.profiles;
drop policy if exists "eigenes profil anlegen" on public.profiles;
drop policy if exists "eigenes profil ändern" on public.profiles;
create policy "profiles lesen" on public.profiles for select using (true);
create policy "eigenes profil anlegen" on public.profiles for insert with check (id = auth.uid());
create policy "eigenes profil ändern" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "follows lesen" on public.follows;
drop policy if exists "selbst folgen" on public.follows;
drop policy if exists "selbst entfolgen" on public.follows;
create policy "follows lesen" on public.follows for select using (true);
create policy "selbst folgen" on public.follows for insert with check (follower = auth.uid());
create policy "selbst entfolgen" on public.follows for delete using (follower = auth.uid());

drop policy if exists "trainings lesen" on public.workouts;
drop policy if exists "eigene trainings schreiben" on public.workouts;
create policy "trainings lesen" on public.workouts for select using (public.can_see(user_id, visibility));
create policy "eigene trainings schreiben" on public.workouts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "eigenes cardio" on public.cardio;
create policy "eigenes cardio" on public.cardio for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "splits lesen" on public.splits;
drop policy if exists "eigene splits schreiben" on public.splits;
create policy "splits lesen" on public.splits for select using (is_public or user_id = auth.uid());
create policy "eigene splits schreiben" on public.splits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ergebnisse lesen" on public.split_results;
drop policy if exists "eigene ergebnisse schreiben" on public.split_results;
create policy "ergebnisse lesen" on public.split_results for select using (
  public.can_see(user_id, coalesce((select p.visibility from public.profiles p where p.id = split_results.user_id), 'private')));
create policy "eigene ergebnisse schreiben" on public.split_results for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Rechte für die App (anon = nicht angemeldet) ----------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.follows, public.workouts, public.splits, public.split_results to anon;
grant select, insert, update, delete on public.profiles, public.follows, public.workouts, public.cardio,
  public.splits, public.split_results to authenticated;
grant execute on function public.can_see(uuid, text) to anon, authenticated;

-- Schema-Cache der API neu laden, damit die Tabellen sofort sichtbar sind
notify pgrst, 'reload schema';
