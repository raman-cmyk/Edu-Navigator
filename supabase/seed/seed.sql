-- ===========================================================================
-- DEV SEED — Baato / Edu Navigator
-- Authoritative source: docs/09-seed-data.md (Part 1 — Dev seed).
--
-- *** ALL DATA IN THIS FILE IS FAKE / FOR LOCAL DEVELOPMENT ONLY. ***
-- Universities and tuition are real public figures, but every commission is a
-- PLACEHOLDER (commission_source = 'DEV_PLACEHOLDER'). All profiles, posts,
-- answers, experiences, votes and ledger rows are fabricated.
--
-- Loaded by `supabase db reset`. Runs as the postgres superuser, so it bypasses
-- RLS and column grants. It DOES fire the 0003 triggers (answer/vote counters,
-- experience -> data_points fan-out, confidence recompute).
--
-- Deterministic IDs (md5(...)::uuid) keep the seed re-runnable and let rows
-- cross-reference each other without RETURNING plumbing. `on conflict do nothing`
-- guards the parts that can collide.
--
-- ASSUMPTION: the local stack allows inserting into auth.users. This is true for
-- the Supabase local dev stack (postgres superuser). If a hardened environment
-- forbids it, everything from "PROFILES" down depends on those rows.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- CITIES (exactly 4, all active — do not add a fifth)
-- ---------------------------------------------------------------------------
insert into cities (id, slug, name, country, is_active) values
  (md5('city:sydney')::uuid,    'sydney',    'Sydney',    'AU', true),
  (md5('city:melbourne')::uuid, 'melbourne', 'Melbourne', 'AU', true),
  (md5('city:adelaide')::uuid,  'adelaide',  'Adelaide',  'AU', true),
  (md5('city:brisbane')::uuid,  'brisbane',  'Brisbane',  'AU', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- UNIVERSITIES (~41: 4 go8, 20 mid, 12 regional, 5 private)
-- Real AU institutions + real public tuition. Commissions are DEV placeholders.
-- Exactly 2 have commission_aud = NULL (victoria-university, federation-university)
-- so the "drop from shortlist results" path is exercised.
-- Some regional/private institutions are assigned to one of the 4 seed cities
-- (their nearest metro study hub) — a dev simplification; is_regional still
-- drives the PR pathway regardless of city.
-- ---------------------------------------------------------------------------
insert into universities
  (id, slug, name, city_id, country, is_regional, annual_tuition_aud, commission_aud, commission_source, commission_updated_at, ranking_tier, nepali_student_estimate)
select
  md5('uni:' || slug)::uuid, slug, name, md5('city:' || city_slug)::uuid, 'AU', is_regional,
  tuition, commission,
  case when commission is null then null else 'DEV_PLACEHOLDER' end,
  case when commission is null then null else now() end,
  ranking_tier, nepali_est
from (values
  -- Go8 (4)
  ('university-of-melbourne',            'University of Melbourne',            'melbourne', false, 48000, 8000,  'go8',      1200),
  ('monash-university',                  'Monash University',                  'melbourne', false, 46000, 7500,  'go8',      1400),
  ('university-of-sydney',              'University of Sydney',               'sydney',    false, 49000, 8200,  'go8',      1100),
  ('university-of-adelaide',            'University of Adelaide',             'adelaide',  false, 45000, 7000,  'go8',       600),
  -- Mid-tier metro (20) — victoria-university has NULL commission
  ('rmit-university',                   'RMIT University',                    'melbourne', false, 38000, 6000,  'mid',      1600),
  ('deakin-university',                 'Deakin University',                  'melbourne', false, 37000, 6500,  'mid',      1500),
  ('la-trobe-university',              'La Trobe University',                'melbourne', false, 35000, 6200,  'mid',      1300),
  ('swinburne-university-of-technology','Swinburne University of Technology', 'melbourne', false, 34000, 5800,  'mid',       900),
  ('victoria-university',              'Victoria University',                'melbourne', false, 33000, null,   'mid',       800),
  ('university-of-technology-sydney',  'University of Technology Sydney',    'sydney',    false, 40000, 6800,  'mid',      1700),
  ('macquarie-university',             'Macquarie University',               'sydney',    false, 39000, 6600,  'mid',      1200),
  ('western-sydney-university',        'Western Sydney University',          'sydney',    false, 34000, 6000,  'mid',      1400),
  ('australian-catholic-university',   'Australian Catholic University',     'sydney',    false, 32000, 5500,  'mid',       700),
  ('university-of-queensland',         'University of Queensland',           'brisbane',  false, 44000, 7000,  'mid',      1000),
  ('queensland-university-of-technology','Queensland University of Technology','brisbane', false, 38000, 6300,  'mid',      1100),
  ('griffith-university',             'Griffith University',                'brisbane',  false, 36000, 6100,  'mid',      1250),
  ('university-of-south-australia',    'University of South Australia',      'adelaide',  false, 35000, 5900,  'mid',       850),
  ('flinders-university',             'Flinders University',                'adelaide',  false, 34000, 5700,  'mid',       650),
  ('curtin-university',               'Curtin University',                  'brisbane',  false, 36000, 6000,  'mid',       950),
  ('murdoch-university',              'Murdoch University',                 'adelaide',  false, 33000, 5600,  'mid',       500),
  ('edith-cowan-university',          'Edith Cowan University',             'adelaide',  false, 33000, 5500,  'mid',       550),
  ('university-of-canberra',          'University of Canberra',             'sydney',    false, 34000, 5800,  'mid',       600),
  ('bond-university',                'Bond University',                   'brisbane',  false, 42000, 6500,  'mid',       300),
  ('university-of-notre-dame-australia','University of Notre Dame Australia','sydney',   false, 33000, 5400,  'mid',       250),
  -- Regional (12) — federation-university has NULL commission
  ('university-of-newcastle',         'University of Newcastle',            'sydney',    true,  33000, 6000,  'regional',  700),
  ('university-of-wollongong',        'University of Wollongong',           'sydney',    true,  34000, 6200,  'regional',  750),
  ('charles-sturt-university',        'Charles Sturt University',           'sydney',    true,  30000, 5500,  'regional',  500),
  ('southern-cross-university',       'Southern Cross University',          'brisbane',  true,  29000, 5300,  'regional',  450),
  ('university-of-new-england',       'University of New England',          'sydney',    true,  28000, 5200,  'regional',  350),
  ('cquniversity',                   'CQUniversity',                       'brisbane',  true,  30000, 5400,  'regional',  600),
  ('university-of-southern-queensland','University of Southern Queensland', 'brisbane',  true,  29000, 5300,  'regional',  400),
  ('james-cook-university',           'James Cook University',              'brisbane',  true,  33000, 5800,  'regional',  550),
  ('university-of-the-sunshine-coast','University of the Sunshine Coast',   'brisbane',  true,  30000, 5400,  'regional',  300),
  ('federation-university-australia', 'Federation University Australia',    'melbourne', true,  28000, null,   'regional',  400),
  ('charles-darwin-university',       'Charles Darwin University',          'adelaide',  true,  29000, 5300,  'regional',  350),
  ('university-of-tasmania',          'University of Tasmania',             'melbourne', true,  31000, 5600,  'regional',  500),
  -- Private / VET (5)
  ('torrens-university-australia',    'Torrens University Australia',       'adelaide',  false, 28000, 4500,  'private',   400),
  ('kaplan-business-school',          'Kaplan Business School',             'melbourne', false, 26000, 4200,  'private',   350),
  ('william-angliss-institute',       'William Angliss Institute',          'melbourne', false, 22000, 3800,  'private',   600),
  ('tafe-queensland',                'TAFE Queensland',                    'brisbane',  false, 20000, 3500,  'private',   500),
  ('box-hill-institute',             'Box Hill Institute',                 'melbourne', false, 21000, 3600,  'private',   450)
) as u(slug, name, city_slug, is_regional, tuition, commission, ranking_tier, nepali_est)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- COURSES (~205: 5 per university across all fields, varied gates)
-- Field + gate values are derived from a per-university hash so they vary but
-- stay deterministic. All 11 fields appear across the set.
-- ---------------------------------------------------------------------------
insert into courses
  (id, university_id, name, field, duration_months, annual_tuition_aud,
   min_gpa_pct, max_backlogs, min_ielts, min_ielts_band, on_skilled_occupation_list)
select
  md5('course:' || u.slug || ':' || n)::uuid,
  u.id,
  initcap(fld.field) || ' Program ' || n,
  fld.field,
  case when fld.field in ('cookery','aged_care') then 12 else 24 end,
  u.annual_tuition_aud,
  50 + ((h + n * 7) % 26),                       -- min_gpa_pct 50..75
  (h + n) % 9,                                   -- max_backlogs 0..8
  5.5 + 0.5 * ((h + n) % 4),                     -- min_ielts 5.5..7.0
  5.0 + 0.5 * (n % 3),                           -- min_ielts_band 5.0..6.0
  ((h + n) % 2) = 0                              -- on_skilled_occupation_list
from (
  select uu.*, ('x' || substr(md5(uu.slug), 1, 4))::bit(16)::int as h
  from universities uu
) u
cross join generate_series(1, 5) as n
cross join lateral (
  select (array['it','nursing','business','engineering','cookery','aged_care',
                'accounting','public_health','data','construction','other'])
         [ ((u.h + n) % 11) + 1 ] as field
) fld
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PROFILES (~60) via auth.users. The 0002 on_auth_user_created trigger creates
-- the base profile (grey/deciding); we then promote tiers/city/etc as postgres.
--   users  1-20 grey  | 21-40 green | 41-55 gold | 56-58 agent | 59-60 admin
-- Admins carry raw_app_meta_data.role='admin' (is_admin() reads this).
-- ---------------------------------------------------------------------------
do $$
declare
  i int;
  uid uuid;
  first_names text[] := array[
    'Aarav','Sita','Bikash','Anjali','Prakash','Sunita','Ramesh','Puja','Nabin','Gita',
    'Kiran','Sarita','Deepak','Manisha','Suresh','Rekha','Bhola','Laxmi','Hari','Kabita'];
  last_names text[] := array['Sharma','Thapa','Gurung','Adhikari','Shrestha','Karki','Poudel','Rai','Magar','Bhandari'];
begin
  for i in 1..60 loop
    uid := md5('user:' || i)::uuid;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated',
      'seed_user_' || i || '@dev.local',
      extensions.crypt('password123', extensions.gen_salt('bf')),
      now(),
      case when i in (59,60)
           then '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb
           else '{"provider":"email","providers":["email"]}'::jsonb end,
      jsonb_build_object(
        'handle', 'seeduser' || i,
        'display_name', first_names[((i-1) % 20) + 1] || ' ' || last_names[((i-1) % 10) + 1],
        'lang', case when i % 2 = 0 then 'en' else 'ne' end
      ),
      now(), now()
    ) on conflict (id) do nothing;
  end loop;
end $$;

-- Promote tiers / attach city / university / grad_year (postgres bypasses the
-- column revokes that block self-service tier changes).
-- green (21-40): verified students spread across the 4 cities
update profiles p
  set tier = 'green',
      stage = (array['applying','visa','landing','living'])[(g % 4) + 1]::journey_stage,
      city_id = (array[md5('city:sydney')::uuid, md5('city:melbourne')::uuid,
                       md5('city:adelaide')::uuid, md5('city:brisbane')::uuid])[(g % 4) + 1]
from generate_series(21, 40) g
where p.id = md5('user:' || g)::uuid;

-- gold (41-55): alumni with grad_year
update profiles p
  set tier = 'gold',
      stage = 'living',
      grad_year = 2018 + (g % 6),
      city_id = (array[md5('city:sydney')::uuid, md5('city:melbourne')::uuid,
                       md5('city:adelaide')::uuid, md5('city:brisbane')::uuid])[(g % 4) + 1],
      university_id = md5('uni:university-of-melbourne')::uuid
from generate_series(41, 55) g
where p.id = md5('user:' || g)::uuid;

-- agents (56-58): labeled, not banned
update profiles p
  set tier = 'agent', is_agent = true
from generate_series(56, 58) g
where p.id = md5('user:' || g)::uuid;

-- admins (59-60): gold tier for display; admin power comes from app_metadata
update profiles p
  set tier = 'gold', grad_year = 2016
from generate_series(59, 60) g
where p.id = md5('user:' || g)::uuid;

-- ---------------------------------------------------------------------------
-- SHORTLIST RUNS (3 frozen) — created before posts (posts reference them)
--   1: strong profile, high confidence
--   2: weak profile (5 backlogs, gap, low budget) — many rejections
--   3: low-confidence profile — verdict flags the list as provisional
-- ---------------------------------------------------------------------------
insert into shortlist_runs (id, share_slug, user_id, inputs, results, verdict, confidence, created_at) values
  (md5('run:1')::uuid, 'strong-abc123', md5('user:21')::uuid,
   '{"qualification":"bachelors","score_pct":78,"board":"TU","backlogs":0,"gap_years":0,"english_test":"ielts","english_overall":7.0,"budget_npr":6000000,"has_collateral":true,"field":"data","priority":"pr"}'::jsonb,
   '{"matches":6,"rejections":2,"top":"university-of-melbourne"}'::jsonb,
   'Strong profile. You clear the gates at most metro options and several regional universities that carry a real PR pathway. This list is dependable.',
   'high', now() - interval '3 days'),
  (md5('run:2')::uuid, 'weak-def456', md5('user:22')::uuid,
   '{"qualification":"plus2","score_pct":52,"board":"NEB","backlogs":5,"gap_years":3,"gap_reason":"worked","english_test":"ielts","english_overall":6.0,"budget_npr":2500000,"has_collateral":false,"field":"cookery","priority":"cheapest"}'::jsonb,
   '{"matches":2,"rejections":9,"top":"william-angliss-institute"}'::jsonb,
   'This is a hard profile. Five backlogs and a three-year gap fail most gates, and the budget rules out metro tuition. Two VET options remain realistic; treat the rest as rejections, not near-misses.',
   'medium', now() - interval '2 days'),
  (md5('run:3')::uuid, 'lowconf-ghi789', null,
   '{"qualification":"bachelors","score_pct":68,"board":"PU","backlogs":2,"gap_years":1,"english_test":null,"budget_npr":4000000,"has_collateral":true,"field":"nursing","priority":"ranking"}'::jsonb,
   '{"matches":4,"rejections":3,"note":"no_english_test"}'::jsonb,
   'Provisional list. You have not entered an English score, so band gates are estimated and living-cost data is thin for your target cities. Re-run once you have an IELTS/PTE result before relying on this.',
   'low', now() - interval '1 day')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- POSTS (120): deciding 1-25, applying 26-55, visa 56-90, landing 91-105, living 106-120
--   * posts 1-10  : created < 24h ago, no answers -> verified_answer_count = 0 (feed boost)
--   * posts 56-58 : 18 answers each -> thread-summary trigger
--   * posts 106-113: kind='experience' with full experience_data
--   * anonymous: 3, 17, 44, 88, 110
--   * shortlist attached: 5, 10, 15, 20, 25
--   * posts 115, 116: negative/regret content — MUST NOT be flagged (trust rule 5)
-- Question authors: users 1-55 (never agents/admins-only); experience authors: green (21-40).
-- ---------------------------------------------------------------------------
insert into posts
  (id, author_id, kind, stage, city_id, title, body, is_anonymous, shortlist_run_id, created_at)
select
  md5('post:' || g)::uuid,
  case when g between 106 and 113
       then md5('user:' || (21 + (g % 20)) )::uuid          -- experience: green
       else md5('user:' || (((g - 1) % 55) + 1) )::uuid     -- question: any non-agent
  end,
  case when g between 106 and 113 then 'experience' else 'question' end::post_kind,
  case
    when g <= 25 then 'deciding'
    when g <= 55 then 'applying'
    when g <= 90 then 'visa'
    when g <= 105 then 'landing'
    else 'living'
  end::journey_stage,
  case
    when g between 91 and 120
      then (array[md5('city:sydney')::uuid, md5('city:melbourne')::uuid,
                  md5('city:adelaide')::uuid, md5('city:brisbane')::uuid])[(g % 4) + 1]
    else null
  end,
  case
    when g = 115 then 'Honestly, I regret coming here — read before you decide'
    when g = 116 then 'I regret coming here: the reality no agent will tell you'
    else 'Seed question ' || g || ' about studying and living in Australia'
  end,
  case
    when g = 115 then 'This is a fabricated dev post that reads negative on purpose. The whole move has felt like a mistake for me financially. Posting the honest version.'
    when g = 116 then 'Another intentionally negative dev post. If I could go back I would not choose this path. Sharing so others go in with eyes open.'
    else 'Fabricated dev body for local testing. Details about stage, budget and expectations go here.'
  end,
  g in (3, 17, 44, 88, 110),
  case g when 5 then md5('run:1')::uuid when 10 then md5('run:2')::uuid
         when 15 then md5('run:3')::uuid when 20 then md5('run:1')::uuid
         when 25 then md5('run:2')::uuid else null end,
  case when g <= 10 then now() - (g || ' hours')::interval
       else now() - (g || ' days')::interval end
from generate_series(1, 120) g
on conflict (id) do nothing;

-- Pin a "city basics" post per city (basics_post_id).
update cities set basics_post_id = md5('post:91')::uuid  where slug = 'sydney';
update cities set basics_post_id = md5('post:92')::uuid  where slug = 'melbourne';
update cities set basics_post_id = md5('post:93')::uuid  where slug = 'adelaide';
update cities set basics_post_id = md5('post:94')::uuid  where slug = 'brisbane';

-- ---------------------------------------------------------------------------
-- ANSWERS
-- Three 18-answer threads on visa posts 56/57/58 (all authors green/gold, so
-- verified_answer_count is driven up by the 0003 trigger). Scattered single
-- answers on posts 26-45. One nested (depth-1) reply. Posts 1-10 stay answerless.
-- ---------------------------------------------------------------------------
insert into answers (id, post_id, author_id, body, parent_answer_id, created_at)
select
  md5('ans:' || p || ':' || n)::uuid,
  md5('post:' || p)::uuid,
  md5('user:' || (21 + ((p + n) % 35)) )::uuid,   -- 21..55 green/gold
  'Verified dev answer #' || n || ' on thread ' || p,
  null,
  now() - (n || ' hours')::interval
from (values (56), (57), (58)) as t(p)
cross join generate_series(1, 18) as n
on conflict (id) do nothing;

insert into answers (id, post_id, author_id, body, parent_answer_id, created_at)
select
  md5('ans:s:' || g)::uuid,
  md5('post:' || g)::uuid,
  md5('user:' || (21 + (g % 30)) )::uuid,
  'A helpful verified reply on post ' || g,
  null,
  now() - interval '2 days'
from generate_series(26, 45) g
on conflict (id) do nothing;

-- One nested reply (depth 1) to test threading + the depth cap.
insert into answers (id, post_id, author_id, body, parent_answer_id, created_at)
values (md5('ans:nested')::uuid, md5('post:56')::uuid, md5('user:22')::uuid,
        'Replying to the answer above (depth 1).', md5('ans:56:1')::uuid, now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- VOTES (value = 1). Fires upvote_count triggers.
-- ---------------------------------------------------------------------------
insert into votes (user_id, target_type, target_id, value)
select md5('user:' || u)::uuid, 'post', md5('post:' || p)::uuid, 1
from generate_series(1, 10) u
cross join (values (56), (57), (58)) as t(p)
on conflict do nothing;

insert into votes (user_id, target_type, target_id, value)
select md5('user:' || u)::uuid, 'answer', md5('ans:56:' || a)::uuid, 1
from generate_series(1, 5) u
cross join generate_series(1, 3) a
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- EXPERIENCE DATA (8 posts, 106-113) — all attached to University of Melbourne.
-- Each row fires explode_experience_data(): up to 5 university_data_points rows
-- (total_cost_npr, monthly_living_aud, hourly_aud, visa_*, choose_again),
-- contributor_tier carried from the green author. 8 posts -> ~40 points for
-- Melbourne => HIGH confidence, and 8 monthly_living_aud rows => Melbourne
-- city living-cost n = 8 (>= 5, panel renders).
-- ---------------------------------------------------------------------------
insert into experience_data
  (post_id, university_id, course_id, intake, total_paid_npr, monthly_living_aud,
   parttime_hourly_aud, visa_outcome, refusal_reason, would_choose_again)
select
  md5('post:' || g)::uuid,
  md5('uni:university-of-melbourne')::uuid,
  md5('course:university-of-melbourne:1')::uuid,
  '2024-07',
  4000000 + (g * 50000),
  1400 + (g * 40),                                   -- varied monthly living for a real median
  28 + (g % 5),
  case when g % 4 = 0 then 'refused' else 'approved' end::visa_outcome,
  case when g % 4 = 0 then 'Insufficient funds evidence' else null end,
  (array['yes','no','unsure'])[(g % 3) + 1]
from generate_series(106, 113) g
on conflict (post_id) do nothing;

-- ---------------------------------------------------------------------------
-- UNIVERSITY DATA POINTS (direct) — set the remaining confidence tiers.
-- Melbourne already HIGH from experience data above. These add:
--   medium (5-19): UTS (12), University of Queensland (8)
--   low (1-4):     RMIT (4), University of Adelaide (3 living), Griffith (2)
--   everyone else: none
-- Adelaide's 3 rows use metric monthly_living_aud so Adelaide city living-cost
-- n = 3 (< 5, "not enough data" branch). Non-Melbourne totals otherwise use
-- total_cost_npr so they do NOT inflate any city's living-cost sample.
-- source_post_id points at a real (experience) post; contributor_tier = green.
-- ---------------------------------------------------------------------------
insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
select md5('uni:university-of-technology-sydney')::uuid, 'total_cost_npr',
       3500000 + (n * 10000), md5('post:106')::uuid, 'green'
from generate_series(1, 12) n;

insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
select md5('uni:university-of-queensland')::uuid, 'total_cost_npr',
       3600000 + (n * 10000), md5('post:107')::uuid, 'green'
from generate_series(1, 8) n;

insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
select md5('uni:rmit-university')::uuid, 'total_cost_npr',
       3400000 + (n * 10000), md5('post:108')::uuid, 'green'
from generate_series(1, 4) n;

insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
select md5('uni:university-of-adelaide')::uuid, 'monthly_living_aud',
       1450 + (n * 30), md5('post:109')::uuid, 'green'
from generate_series(1, 3) n;

insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
select md5('uni:griffith-university')::uuid, 'total_cost_npr',
       3300000 + (n * 10000), md5('post:110')::uuid, 'green'
from generate_series(1, 2) n;

-- ---------------------------------------------------------------------------
-- COMMISSION LEDGER — one row per university that has a commission; 3 rebates.
-- ---------------------------------------------------------------------------
insert into commission_ledger (id, university_id, amount_aud, rebate_pct, effective_from, note)
select
  md5('ledger:' || slug)::uuid,
  id,
  commission_aud,
  case when slug in ('university-of-melbourne','rmit-university','university-of-technology-sydney')
       then 5.0 else null end,
  date '2025-01-01',
  'DEV placeholder ledger row'
from universities
where commission_aud is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- FRICTION LOG (~40 entries across ~6 weeks). Weighted so `sop` and
-- `document_chase` top the weekly rollup (the V2-selection screen).
-- Logged by the two admin/ops users (59, 60).
-- ---------------------------------------------------------------------------
insert into friction_log (id, ops_user_id, task_type, student_ref, minutes, note, logged_at)
select
  md5('friction:' || n)::uuid,
  md5('user:' || case when n % 2 = 0 then 59 else 60 end)::uuid,
  (array['sop','sop','sop','document_chase','document_chase',
         'noc_run','translation','visa_prep','uni_application','other'])[(n % 10) + 1],
  'STU-' || (1000 + n),
  20 + ((n * 3) % 120),
  'Fabricated ops friction entry',
  now() - ((n % 42) || ' days')::interval
from generate_series(1, 40) n
on conflict (id) do nothing;

commit;

-- Reminder (docs/09): run `npm run seed:embeddings` after reset to backfill
-- post embeddings, or semantic search returns nothing locally.
