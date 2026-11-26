-- ============================================================
--  Pulse – Profil-Statistik: Skips, Ruhetage, Streak und Rekorde
--  für Follower sichtbar (nach schema.sql und social.sql ausführen).
--
--  SQL Editor → New query → alles einfügen → Run. Mehrfach ausführbar.
--
--  Wer die Zeile lesen darf, folgt der Profil-Sichtbarkeit:
--  Öffentlich = alle, Nur Follower = Follower, Privat = nur man selbst.
-- ============================================================

create table if not exists public.profile_stats (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  marks      jsonb not null default '{}'::jsonb,   -- { "2026-11-20": "skip" | "rest", ... } letzte 12 Monate
  records    jsonb not null default '[]'::jsonb,   -- [{ exId, name, kg | reps, set }]
  streak     jsonb not null default '{}'::jsonb,   -- { current, longest, weeks, skips }
  updated_at timestamptz not null default now()
);

-- Darf der aktuelle Nutzer das Profil von „owner“ sehen?
create or replace function public.can_see_profile(owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_see(owner, coalesce((select p.visibility from public.profiles p where p.id = owner), 'private'));
$$;

alter table public.profile_stats enable row level security;

drop policy if exists "statistik lesen" on public.profile_stats;
create policy "statistik lesen" on public.profile_stats for select using (public.can_see_profile(user_id));

drop policy if exists "eigene statistik schreiben" on public.profile_stats;
create policy "eigene statistik schreiben" on public.profile_stats for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.profile_stats to authenticated;
grant select on public.profile_stats to anon;
grant execute on function public.can_see_profile(uuid) to anon, authenticated;
