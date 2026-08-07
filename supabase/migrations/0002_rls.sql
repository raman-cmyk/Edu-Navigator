-- 0002 — Row Level Security
-- Authoritative source: docs/02-rls-policies.md
-- The trust rules are enforced HERE, not in the UI. The 8 denial behaviors in
-- docs/02 "Testing requirement" are load-bearing — see tests/rls/denial.test.ts.

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table
-- ---------------------------------------------------------------------------
alter table profiles              enable row level security;
alter table cities                enable row level security;
alter table universities          enable row level security;
alter table courses               enable row level security;
alter table shortlist_runs        enable row level security;
alter table posts                 enable row level security;
alter table post_tags             enable row level security;
alter table experience_data       enable row level security;
alter table answers               enable row level security;
alter table votes                 enable row level security;
alter table saves                 enable row level security;
alter table verification_requests enable row level security;
alter table university_data_points enable row level security;
alter table commission_ledger     enable row level security;
alter table reports               enable row level security;
alter table moderation_actions    enable row level security;
alter table friction_log          enable row level security;
alter table notifications         enable row level security;
alter table notification_prefs    enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (verbatim from docs/02)
-- ---------------------------------------------------------------------------
create or replace function auth_tier() returns verification_tier
language sql stable security definer set search_path = public as $$
  select tier from profiles where id = auth.uid()
$$;

create or replace function can_answer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select tier in ('green','gold') and banned_at is null
     from profiles where id = auth.uid()),
    false)
$$;

create or replace function is_in_city(target_city uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select city_id = target_city from profiles where id = auth.uid()),
    false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select raw_app_meta_data->>'role' = 'admin' from auth.users where id = auth.uid()),
    false)
$$;

-- ---------------------------------------------------------------------------
-- Profile auto-creation on signup (per docs/03 architecture: tier='grey',
-- stage='deciding', lang from user metadata). Runs as definer so the insert
-- succeeds under RLS.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle, display_name, tier, stage, lang)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'handle', ''), 'user_' || left(replace(new.id::text,'-',''), 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    'grey',
    'deciding',
    coalesce(nullif(new.raw_user_meta_data->>'lang', ''), 'ne')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_read on profiles
  for select using (true);

create policy profiles_update_own on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Column protection: these are NEVER self-set. Written only by the verification
-- Edge Function via the service role (which bypasses RLS and column grants).
revoke update (tier, city_id, university_id, grad_year,
               is_agent, banned_at, helpfulness_score)
  on profiles from authenticated;

-- A table-level UPDATE grant (Supabase grants broad privileges to `authenticated`
-- by default) would UNION over the column REVOKE above and make it a no-op. So
-- revoke table-level UPDATE and re-grant UPDATE on ONLY the self-editable
-- columns. Now a client update touching tier/city_id/... is rejected by
-- Postgres for lack of column privilege — the load-bearing denial in docs/02.
revoke update on profiles from authenticated;
grant update (handle, display_name, stage, course_name, target_country, lang)
  on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create policy posts_read on posts
  for select using (removed_at is null);

-- ask a question: any signed-in, non-banned, non-agent user
create policy posts_insert_question on posts
  for insert with check (
    auth.uid() = author_id
    and kind = 'question'
    and (select banned_at is null from profiles where id = auth.uid())
    and (select is_agent = false from profiles where id = auth.uid())
  );

-- share an experience: verified only
create policy posts_insert_experience on posts
  for insert with check (
    auth.uid() = author_id
    and kind = 'experience'
    and can_answer()
  );

-- City rooms: only city-verified members (or admin) may post there.
-- RESTRICTIVE so it ANDs with the permissive insert policies above. As a plain
-- permissive policy it would only ADD permission (policies OR together) and the
-- "non-city member posts in city room -> denied" behavior would silently break.
create policy posts_city_restriction on posts
  as restrictive
  for insert with check (
    city_id is null or is_in_city(city_id) or is_admin()
  );

create policy posts_update_own on posts
  for update using (
    author_id = auth.uid()
    and created_at > now() - interval '30 minutes'
    and removed_at is null
  );

-- ---------------------------------------------------------------------------
-- answers — the most important policy in the product
-- ---------------------------------------------------------------------------
create policy answers_read on answers
  for select using (removed_at is null);

create policy answers_insert_verified_only on answers
  for insert with check (
    auth.uid() = author_id
    and can_answer()
    and (select is_agent = false from profiles where id = auth.uid())
    and (
      parent_answer_id is null
      -- one level only: the parent must itself be a root answer. Written as a
      -- correlated NOT EXISTS so `answers.parent_answer_id` (the NEW row) is not
      -- shadowed by the subquery's own column of the same name.
      or not exists (
        select 1 from answers parent
        where parent.id = answers.parent_answer_id
          and parent.parent_answer_id is not null
      )
    )
  );

create policy answers_update_own on answers
  for update using (
    author_id = auth.uid()
    and created_at > now() - interval '30 minutes'
  );

-- ---------------------------------------------------------------------------
-- experience_data
-- ---------------------------------------------------------------------------
create policy expdata_read on experience_data
  for select using (true);

create policy expdata_insert on experience_data
  for insert with check (
    can_answer()
    and exists (
      select 1 from posts p
      where p.id = post_id and p.author_id = auth.uid() and p.kind = 'experience'
    )
  );

-- ---------------------------------------------------------------------------
-- votes  (value = 1 only; no downvotes)
-- ---------------------------------------------------------------------------
create policy votes_read on votes for select using (true);

create policy votes_insert on votes
  for insert with check (
    user_id = auth.uid()
    and value = 1
    and (select banned_at is null from profiles where id = auth.uid())
  );

create policy votes_delete_own on votes
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- verification_requests
-- ---------------------------------------------------------------------------
create policy vr_read_own on verification_requests
  for select using (user_id = auth.uid() or is_admin());

create policy vr_insert_own on verification_requests
  for insert with check (
    user_id = auth.uid()
    and redaction_applied = true
    and status = 'pending'
  );

create policy vr_admin_update on verification_requests
  for update using (is_admin());

-- ---------------------------------------------------------------------------
-- shortlist_runs — read-only for clients; insert is service-role only
-- (there is deliberately NO insert policy, so authenticated/anon inserts fail).
-- ---------------------------------------------------------------------------
create policy shortlist_read on shortlist_runs
  for select using (true);

-- ---------------------------------------------------------------------------
-- universities / courses / cities / commission_ledger — public read, admin write
-- ---------------------------------------------------------------------------
create policy public_read on universities      for select using (true);
create policy public_read on courses           for select using (true);
create policy public_read on cities            for select using (is_active or is_admin());
create policy public_read on commission_ledger for select using (true);

-- ---------------------------------------------------------------------------
-- university_data_points — public read; insert via trigger only (definer)
-- ---------------------------------------------------------------------------
create policy udp_read on university_data_points for select using (true);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy reports_insert on reports
  for insert with check (reporter_id = auth.uid());

create policy reports_read on reports
  for select using (reporter_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- moderation_actions — append-only audit trail (no update/delete policy)
-- ---------------------------------------------------------------------------
create policy modactions_read on moderation_actions
  for select using (is_admin());

create policy modactions_insert on moderation_actions
  for insert with check (is_admin());

-- ---------------------------------------------------------------------------
-- friction_log
-- ---------------------------------------------------------------------------
create policy friction_ops on friction_log
  for all using (is_admin() or ops_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications / notification_prefs (insert is service-role only)
-- ---------------------------------------------------------------------------
create policy notif_read_own on notifications
  for select using (user_id = auth.uid());

create policy notif_update_own on notifications
  for update using (user_id = auth.uid()); -- read_at only

create policy prefs_own on notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- post_tags / saves — not specified in docs/02. Minimal, non-weakening
-- policies so the app can function (no denial behavior depends on these).
-- ---------------------------------------------------------------------------
create policy posttags_read on post_tags for select using (true);

create policy posttags_insert on post_tags
  for insert with check (
    exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

create policy saves_own on saves
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
