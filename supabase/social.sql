-- ============================================================
--  Pulse – Etappe 3: Benutzernamen, Feed, Kudos, Kommentare, Benachrichtigungen
--
--  Nach schema.sql ausführen (SQL Editor → New query → einfügen → Run).
--  Kann gefahrlos mehrmals ausgeführt werden; bestehende Daten bleiben.
-- ============================================================

-- ---------- Benutzername (@name), über den man gefunden wird ----------
alter table public.profiles add column if not exists username text;
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_.]{3,20}$');
create unique index if not exists profiles_username_idx on public.profiles (username);

-- ---------- Kudos ----------
create table if not exists public.kudos (
  workout_owner uuid not null,
  workout_id    text not null,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (workout_owner, workout_id, user_id),
  foreign key (workout_owner, workout_id) references public.workouts (user_id, id) on delete cascade
);
create index if not exists kudos_workout_idx on public.kudos (workout_id);

-- ---------- Kommentare ----------
create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  workout_owner uuid not null,
  workout_id    text not null,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  body          text not null check (char_length(btrim(body)) between 1 and 500),
  created_at    timestamptz not null default now(),
  foreign key (workout_owner, workout_id) references public.workouts (user_id, id) on delete cascade
);
create index if not exists comments_workout_idx on public.comments (workout_id, created_at);

-- ---------- Benachrichtigungen (werden nur von Triggern angelegt) ----------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,  -- Empfänger
  actor      uuid not null references auth.users on delete cascade,  -- wer es ausgelöst hat
  type       text not null check (type in ('follow', 'kudos', 'comment')),
  workout_id text,
  comment_id uuid references public.comments on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Darf der aktuelle Nutzer dieses Training sehen?
create or replace function public.can_see_workout(owner uuid, wid text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workouts w
                 where w.user_id = owner and w.id = wid and public.can_see(w.user_id, w.visibility));
$$;

create or replace function public.notify_social()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'follows' then
    insert into public.notifications (user_id, actor, type) values (new.following, new.follower, 'follow');
  elsif tg_table_name = 'kudos' and new.user_id <> new.workout_owner then
    insert into public.notifications (user_id, actor, type, workout_id)
      values (new.workout_owner, new.user_id, 'kudos', new.workout_id);
  elsif tg_table_name = 'comments' and new.user_id <> new.workout_owner then
    insert into public.notifications (user_id, actor, type, workout_id, comment_id)
      values (new.workout_owner, new.user_id, 'comment', new.workout_id, new.id);
  end if;
  return new;
end $$;

drop trigger if exists notify_follow on public.follows;
create trigger notify_follow after insert on public.follows for each row execute function public.notify_social();
drop trigger if exists notify_kudos on public.kudos;
create trigger notify_kudos after insert on public.kudos for each row execute function public.notify_social();
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments for each row execute function public.notify_social();

-- Kudos zurücknehmen entfernt auch die Benachrichtigung
create or replace function public.unnotify_kudos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
   where type = 'kudos' and actor = old.user_id and user_id = old.workout_owner and workout_id = old.workout_id;
  return old;
end $$;
drop trigger if exists unnotify_kudos on public.kudos;
create trigger unnotify_kudos after delete on public.kudos for each row execute function public.unnotify_kudos();

-- ---------- Row Level Security ----------
alter table public.kudos         enable row level security;
alter table public.comments      enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "kudos lesen" on public.kudos;
drop policy if exists "kudos geben" on public.kudos;
drop policy if exists "kudos zurücknehmen" on public.kudos;
create policy "kudos lesen" on public.kudos for select using (public.can_see_workout(workout_owner, workout_id));
create policy "kudos geben" on public.kudos for insert
  with check (user_id = auth.uid() and public.can_see_workout(workout_owner, workout_id));
create policy "kudos zurücknehmen" on public.kudos for delete using (user_id = auth.uid());

drop policy if exists "kommentare lesen" on public.comments;
drop policy if exists "kommentieren" on public.comments;
drop policy if exists "kommentar löschen" on public.comments;
create policy "kommentare lesen" on public.comments for select using (public.can_see_workout(workout_owner, workout_id));
create policy "kommentieren" on public.comments for insert
  with check (user_id = auth.uid() and public.can_see_workout(workout_owner, workout_id));
-- Löschen: wer ihn geschrieben hat, oder wem das Training gehört
create policy "kommentar löschen" on public.comments for delete
  using (user_id = auth.uid() or workout_owner = auth.uid());

drop policy if exists "eigene benachrichtigungen" on public.notifications;
drop policy if exists "benachrichtigungen gelesen" on public.notifications;
drop policy if exists "benachrichtigungen löschen" on public.notifications;
create policy "eigene benachrichtigungen" on public.notifications for select using (user_id = auth.uid());
create policy "benachrichtigungen gelesen" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "benachrichtigungen löschen" on public.notifications for delete using (user_id = auth.uid());

-- ---------- Rechte ----------
grant select on public.kudos, public.comments to anon;
grant select, insert, delete on public.kudos, public.comments to authenticated;
grant select, update (read_at), delete on public.notifications to authenticated;
grant execute on function public.can_see_workout(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
