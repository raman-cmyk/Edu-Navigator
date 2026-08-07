-- 0001 — Extensions, enums, tables, indexes
-- Authoritative source: docs/01-data-model.md and src/types/domain.ts
-- Postgres via Supabase. RLS is enabled in 0002. Timestamps are timestamptz default now().

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- Supabase local always provides the `extensions` schema; create defensively.
create schema if not exists extensions;

create extension if not exists pgcrypto  with schema extensions; -- crypt(), gen_salt(), gen_random_uuid()
create extension if not exists "uuid-ossp" with schema extensions; -- uuid_generate_v4() (available if callers prefer it)
create extension if not exists vector    with schema extensions; -- pgvector: vector(1536) + ivfflat

-- ---------------------------------------------------------------------------
-- Enums (verbatim from docs/01-data-model.md, mirrored by src/types/domain.ts)
-- ---------------------------------------------------------------------------
create type verification_tier   as enum ('grey','green','gold','agent');
create type journey_stage       as enum ('deciding','applying','visa','landing','living');
create type post_kind           as enum ('question','experience');
create type visa_outcome        as enum ('approved','refused','pending','not_applied');
create type verification_status as enum ('pending','approved','rejected','more_info');
create type doc_kind            as enum ('offer_letter','visa_grant','coe','student_id','degree','transcript','address_proof');
create type report_reason       as enum ('agent_as_student','outcome_guarantee','spam','abuse','misinformation','other');
create type mod_action          as enum ('none','removed','labeled_agent','warned','banned');
create type confidence          as enum ('none','low','medium','high');

-- ---------------------------------------------------------------------------
-- Core tables
-- Note: profiles <-> cities <-> posts form a reference cycle; the cities ->
-- posts FK (basics_post_id) is added after posts exists.
-- ---------------------------------------------------------------------------

-- cities (basics_post_id FK added later)
create table cities (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  country        text not null default 'AU',
  is_active      boolean not null default true,
  basics_post_id uuid
);

-- universities
create table universities (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,
  name                    text not null,
  city_id                 uuid references cities(id),
  country                 text not null default 'AU',
  is_regional             boolean not null default false,
  annual_tuition_aud      numeric,
  commission_aud          numeric,                 -- null => never rendered in shortlist (doc 01 rule)
  commission_source       text,
  commission_updated_at   timestamptz,
  ranking_tier            text check (ranking_tier in ('go8','mid','regional','private')),
  nepali_student_estimate int,
  data_confidence         confidence not null default 'none' -- recomputed by trigger (0003)
);

-- profiles (extends auth.users)
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  handle            text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name      text,
  tier              verification_tier not null default 'grey',
  stage             journey_stage not null default 'deciding',
  city_id           uuid references cities(id),
  university_id     uuid references universities(id),
  grad_year         int,
  course_name       text,
  target_country    text not null default 'AU',
  lang              text not null default 'ne' check (lang in ('ne','en')),
  helpfulness_score int not null default 0,
  is_agent          boolean not null default false,
  banned_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index profiles_handle_idx  on profiles (handle);
create index profiles_tier_idx    on profiles (tier);
create index profiles_city_id_idx on profiles (city_id);

-- courses
create table courses (
  id                          uuid primary key default gen_random_uuid(),
  university_id               uuid not null references universities(id) on delete cascade,
  name                        text not null,
  field                       text not null check (field in
    ('it','nursing','business','engineering','cookery','aged_care',
     'accounting','public_health','data','construction','other')),
  duration_months             int,
  annual_tuition_aud          numeric,
  min_gpa_pct                 numeric,
  max_backlogs                int,
  min_ielts                   numeric,
  min_ielts_band              numeric,
  on_skilled_occupation_list  boolean not null default false
);
create index courses_university_id_idx on courses (university_id);
create index courses_field_idx         on courses (field);

-- shortlist_runs (anonymous-friendly; created before posts for the FK)
create table shortlist_runs (
  id         uuid primary key default gen_random_uuid(),
  share_slug text unique not null,
  user_id    uuid references profiles(id) on delete set null,
  inputs     jsonb not null,
  results    jsonb not null,
  verdict    text,
  confidence confidence not null default 'none',
  created_at timestamptz not null default now()
);

-- posts
create table posts (
  id                    uuid primary key default gen_random_uuid(),
  author_id             uuid not null references profiles(id) on delete cascade,
  kind                  post_kind not null,
  stage                 journey_stage not null,
  city_id               uuid references cities(id),
  title                 text not null check (char_length(title) between 10 and 200),
  body                  text,
  is_anonymous          boolean not null default false,
  shortlist_run_id      uuid references shortlist_runs(id) on delete set null,
  answer_count          int not null default 0,
  verified_answer_count int not null default 0,
  upvote_count          int not null default 0,
  search_tsv            tsvector generated always as
                          (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored,
  embedding             extensions.vector(1536),
  is_pinned             boolean not null default false,
  removed_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index posts_stage_created_idx on posts (stage, created_at desc);
create index posts_city_created_idx  on posts (city_id, created_at desc);
create index posts_search_tsv_idx    on posts using gin (search_tsv);
create index posts_embedding_idx     on posts using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- Close the cities -> posts cycle now that posts exists.
alter table cities
  add constraint cities_basics_post_id_fkey
  foreign key (basics_post_id) references posts(id) on delete set null;

-- post_tags (many-to-many for country/university tags)
create table post_tags (
  post_id       uuid not null references posts(id) on delete cascade,
  university_id uuid references universities(id) on delete cascade,
  country       text
);
create index post_tags_post_id_idx on post_tags (post_id);

-- experience_data (structured fields on kind='experience' posts)
create table experience_data (
  post_id            uuid primary key references posts(id) on delete cascade,
  university_id      uuid not null references universities(id),
  course_id          uuid references courses(id),
  intake             text,
  total_paid_npr     numeric,
  monthly_living_aud numeric,
  parttime_hourly_aud numeric,
  visa_outcome       visa_outcome,
  refusal_reason     text,
  would_choose_again text check (would_choose_again in ('yes','no','unsure'))
);

-- answers (one level of nesting only — enforced in RLS 0002 and trigger 0003)
create table answers (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references posts(id) on delete cascade,
  author_id        uuid not null references profiles(id) on delete cascade,
  body             text not null,
  parent_answer_id uuid references answers(id) on delete cascade,
  is_marked_helpful boolean not null default false,
  upvote_count     int not null default 0,
  removed_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index answers_post_id_idx on answers (post_id);
create index answers_parent_idx  on answers (parent_answer_id);

-- votes (value = 1 only; no downvotes in V1)
create table votes (
  user_id     uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','answer')),
  target_id   uuid not null,
  value       smallint not null default 1 check (value = 1),
  primary key (user_id, target_type, target_id)
);

-- saves
create table saves (
  user_id    uuid not null references profiles(id) on delete cascade,
  post_id    uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ---------------------------------------------------------------------------
-- Verification tables
-- ---------------------------------------------------------------------------
create table verification_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  requested_tier    verification_tier not null,
  requested_city_id uuid references cities(id),
  doc_kind          doc_kind not null,
  storage_path      text not null,
  redaction_applied boolean not null default false,
  status            verification_status not null default 'pending',
  reviewer_id       uuid references profiles(id),
  reviewer_note     text,
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz
);
create index verification_requests_status_idx on verification_requests (status, submitted_at);

-- ---------------------------------------------------------------------------
-- Shortlist aggregation + transparency
-- ---------------------------------------------------------------------------
create table university_data_points (
  university_id   uuid not null references universities(id) on delete cascade,
  metric          text not null check (metric in
    ('total_cost_npr','monthly_living_aud','hourly_aud','visa_approved','visa_refused','choose_again')),
  value           numeric,
  source_post_id  uuid references posts(id) on delete set null,
  contributor_tier verification_tier not null,
  created_at      timestamptz not null default now()
);
create index university_data_points_uni_idx    on university_data_points (university_id);
create index university_data_points_metric_idx on university_data_points (metric);

create table commission_ledger (
  id             uuid primary key default gen_random_uuid(),
  university_id  uuid not null references universities(id) on delete cascade,
  amount_aud     numeric,
  rebate_pct     numeric,
  effective_from date,
  note           text
);
create index commission_ledger_uni_idx on commission_ledger (university_id);

-- ---------------------------------------------------------------------------
-- Moderation & ops
-- ---------------------------------------------------------------------------
create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','answer','profile')),
  target_id   uuid not null,
  reason      report_reason not null,
  note        text,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);

-- Append-only audit trail (no update/delete policy in 0002).
create table moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references profiles(id),
  target_type  text not null check (target_type in ('post','answer','profile')),
  target_id    uuid not null,
  action       mod_action not null,
  reason       text,
  created_at   timestamptz not null default now()
);

create table friction_log (
  id          uuid primary key default gen_random_uuid(),
  ops_user_id uuid references profiles(id),
  task_type   text not null check (task_type in
    ('sop','document_chase','noc_run','translation','visa_prep','uni_application','other')),
  student_ref text,
  minutes     int,
  note        text,
  logged_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- Per-kind delivery-channel booleans. Push cap (2/user/day) is enforced in the
-- Edge Function, not here (doc 01).
create table notification_prefs (
  user_id                    uuid primary key references profiles(id) on delete cascade,
  new_answer_in_app          boolean not null default true,
  new_answer_viber           boolean not null default false,
  new_answer_email           boolean not null default false,
  verified_answer_in_app     boolean not null default true,
  verified_answer_viber      boolean not null default false,
  verified_answer_email      boolean not null default false,
  helpful_marked_in_app      boolean not null default true,
  helpful_marked_viber       boolean not null default false,
  helpful_marked_email       boolean not null default false,
  verification_update_in_app boolean not null default true,
  verification_update_viber  boolean not null default false,
  verification_update_email  boolean not null default true,
  reciprocity_in_app         boolean not null default true,
  reciprocity_viber          boolean not null default false,
  reciprocity_email          boolean not null default false
);
