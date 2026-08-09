-- 0007 — M6: notification prefs (jsonb) + gold-alumni city history.

-- The app stores per-kind, per-channel prefs as a single jsonb blob so the kind
-- set can evolve without a migration per kind (the flat columns from 0001 stay
-- for backward compatibility but the app reads/writes `prefs`).
alter table notification_prefs
  add column if not exists prefs jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- profile_cities — cities a user has held a (past) verification for. Lets gold
-- alumni post in a city room they've lived in, so Adelaide/Brisbane aren't empty
-- at launch (docs/02 "Known V1 gap", docs/08 T6.1). Written only by the
-- verify-review Edge Function (service role) when a city tag is granted.
create table if not exists profile_cities (
  user_id     uuid not null references profiles(id) on delete cascade,
  city_id     uuid not null references cities(id),
  verified_at timestamptz not null default now(),
  primary key (user_id, city_id)
);

alter table profile_cities enable row level security;

-- Public read (city history is as public as the badge it backs).
create policy profile_cities_read on profile_cities for select using (true);
-- No client insert/update/delete policy: service-role only.

-- Can the current user post in this city by virtue of past residence? Only
-- gold alumni, and only for a city they hold history in.
create or replace function has_city_history(target_city uuid) returns boolean
language sql stable security definer as $$
  select coalesce(
    (select p.tier = 'gold'
       from profiles p
      where p.id = auth.uid())
    and exists (
      select 1 from profile_cities pc
      where pc.user_id = auth.uid() and pc.city_id = target_city
    ),
    false)
$$;

-- Widen the city-posting restriction to include gold city-history. Still
-- RESTRICTIVE so it ANDs with the insert policies (a plain policy would never
-- restrict). Replacing the policy in a new migration — 0002 is never edited.
drop policy if exists posts_city_restriction on posts;
create policy posts_city_restriction on posts
  as restrictive
  for insert with check (
    city_id is null
    or is_in_city(city_id)
    or has_city_history(city_id)
    or is_admin()
  );
