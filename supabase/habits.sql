-- ============================================================
--  Pulse – Habits in der Cloud (nach schema.sql, social.sql und stats.sql ausführen).
--
--  SQL Editor → New query → alles einfügen → Run. Mehrfach ausführbar.
--
--  user_habits:   alle Gewohnheiten und Haken eines Nutzers – nur für ihn selbst lesbar.
--  profile_stats.habits: kurze Zusammenfassung (Serien, Quoten) – für Follower sichtbar,
--                 nach derselben Profil-Sichtbarkeit wie Skips und Rekorde.
-- ============================================================

create table if not exists public.user_habits (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,   -- { schedule, habits, habitLog, badges }
  updated_at timestamptz not null default now()
);

alter table public.user_habits enable row level security;

drop policy if exists "eigene habits" on public.user_habits;
create policy "eigene habits" on public.user_habits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_habits to authenticated;

-- Zusammenfassung für Follower: { gym, perfect, perfectBest, list: [{ name, icon, streak, rate }] }
alter table public.profile_stats add column if not exists habits jsonb not null default '{}'::jsonb;
