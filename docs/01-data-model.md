# 01 — Data Model

Postgres via Supabase. Every table has RLS enabled. Timestamps are `timestamptz`, default `now()`.

## Enums

```sql
create type verification_tier as enum ('grey','green','gold','agent');
create type journey_stage    as enum ('deciding','applying','visa','landing','living');
create type post_kind        as enum ('question','experience');
create type visa_outcome     as enum ('approved','refused','pending','not_applied');
create type verification_status as enum ('pending','approved','rejected','more_info');
create type doc_kind         as enum ('offer_letter','visa_grant','coe','student_id','degree','transcript','address_proof');
create type report_reason    as enum ('agent_as_student','outcome_guarantee','spam','abuse','misinformation','other');
create type mod_action       as enum ('none','removed','labeled_agent','warned','banned');
create type confidence       as enum ('none','low','medium','high');
```

---

## Core tables

### `profiles`
Extends `auth.users`. One row per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `handle` | text unique | lowercase, 3-20 chars |
| `display_name` | text | |
| `tier` | verification_tier | default `grey` |
| `stage` | journey_stage | self-declared, editable |
| `city_id` | uuid FK → cities | null until city-verified |
| `university_id` | uuid FK → universities | null unless verified |
| `grad_year` | int | for gold badge display |
| `course_name` | text | |
| `target_country` | text | default `AU` |
| `lang` | text | `ne` \| `en`, default `ne` |
| `helpfulness_score` | int | computed, default 0 |
| `is_agent` | bool | default false, set by admin only |
| `banned_at` | timestamptz | null = active |
| `created_at` | timestamptz | |

Index: `handle`, `tier`, `city_id`.

**Badge string** is derived, never stored: `{tier} · {city} · {university} '{grad_year}`.

---

### `cities`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | `sydney`, `melbourne`, `adelaide`, `brisbane` |
| `name` | text | |
| `country` | text | `AU` |
| `is_active` | bool | only active cities render |
| `basics_post_id` | uuid FK → posts | pinned "City basics" |

V1 seeds exactly four, all `is_active = true`. Do not add more without an explicit decision.

---

### `universities`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | |
| `name` | text | |
| `city_id` | uuid FK | |
| `country` | text | |
| `is_regional` | bool | drives PR points in Australia |
| `annual_tuition_aud` | numeric | official, scraped |
| `commission_aud` | numeric | **required for shortlist rendering** |
| `commission_source` | text | contract reference |
| `commission_updated_at` | timestamptz | |
| `ranking_tier` | text | `go8` \| `mid` \| `regional` \| `private` |
| `nepali_student_estimate` | int | nullable |
| `data_confidence` | confidence | computed from `university_data_points` count |

**Rule:** if `commission_aud` is null, the university does not appear in shortlist results. No exceptions.

---

### `courses`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `university_id` | uuid FK |
| `name` | text |
| `field` | text (`it`, `nursing`, `business`, `engineering`, `cookery`, `aged_care`, `accounting`, `public_health`, `data`, `construction`, `other`) |
| `duration_months` | int |
| `annual_tuition_aud` | numeric |
| `min_gpa_pct` | numeric |
| `max_backlogs` | int |
| `min_ielts` | numeric |
| `min_ielts_band` | numeric |
| `on_skilled_occupation_list` | bool |

---

## Community tables

### `posts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `author_id` | uuid FK → profiles | |
| `kind` | post_kind | `question` \| `experience` |
| `stage` | journey_stage | |
| `city_id` | uuid FK | null unless posted to a city room |
| `title` | text | required, 10-200 chars |
| `body` | text | |
| `is_anonymous` | bool | default false — badge shows, name hidden |
| `shortlist_run_id` | uuid FK | optional attachment |
| `answer_count` | int | denormalized |
| `verified_answer_count` | int | denormalized — drives "unanswered" state |
| `upvote_count` | int | denormalized |
| `search_tsv` | tsvector | generated |
| `embedding` | vector(1536) | for semantic search |
| `is_pinned` | bool | |
| `removed_at` | timestamptz | soft delete, moderation only |
| `created_at` | timestamptz | |

Indexes: `(stage, created_at desc)`, `(city_id, created_at desc)`, GIN on `search_tsv`, ivfflat on `embedding`.

**Unanswered** = `verified_answer_count = 0`. This drives feed ranking and notification routing.

---

### `post_tags`
Many-to-many for country/university tags.

| Column | Type |
|---|---|
| `post_id` | uuid FK |
| `university_id` | uuid FK nullable |
| `country` | text nullable |

---

### `experience_data`
Structured fields attached to `kind = 'experience'` posts. **This is how the shortlist tool gets real data.**

| Column | Type | Notes |
|---|---|---|
| `post_id` | uuid PK FK | |
| `university_id` | uuid FK | |
| `course_id` | uuid FK nullable | |
| `intake` | text | e.g. `2024-07` |
| `total_paid_npr` | numeric | nullable |
| `monthly_living_aud` | numeric | nullable |
| `parttime_hourly_aud` | numeric | nullable |
| `visa_outcome` | visa_outcome | |
| `refusal_reason` | text | nullable |
| `would_choose_again` | text | `yes` \| `no` \| `unsure` |

Only writable by `green`/`gold` authors. Feeds `university_data_points`.

---

### `answers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `post_id` | uuid FK | |
| `author_id` | uuid FK | |
| `body` | text | |
| `parent_answer_id` | uuid FK nullable | **one level only** — reject depth > 1 |
| `is_marked_helpful` | bool | set by post author |
| `upvote_count` | int | |
| `removed_at` | timestamptz | |
| `created_at` | timestamptz | |

**RLS: insert allowed only when author tier is `green` or `gold`.** This is the core mechanic. See `02-rls-policies.md`.

---

### `votes`

| Column | Type |
|---|---|
| `user_id` | uuid FK |
| `target_type` | text (`post` \| `answer`) |
| `target_id` | uuid |
| `value` | smallint (1 only — no downvotes in V1) |

PK: `(user_id, target_type, target_id)`.

No downvotes. Downvotes suppress honest negative experiences, which violates trust rule 5.

---

### `saves`
`(user_id, post_id, created_at)`. PK on the pair.

---

## Verification tables

### `verification_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `requested_tier` | verification_tier | `green` \| `gold` |
| `requested_city_id` | uuid FK nullable | for city tag |
| `doc_kind` | doc_kind | |
| `storage_path` | text | Supabase Storage, private bucket |
| `redaction_applied` | bool | must be true before submit |
| `status` | verification_status | default `pending` |
| `reviewer_id` | uuid FK nullable | |
| `reviewer_note` | text | shown to user on rejection |
| `submitted_at` | timestamptz | |
| `reviewed_at` | timestamptz | |

**SLA: 24h.** Admin queue sorts oldest first with countdown.

Storage bucket `verification-docs` is private. Signed URLs only, 5-minute expiry, admin role only.

---

## Shortlist tables

### `shortlist_runs`
Anonymous-friendly — no auth required.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `share_slug` | text unique | short, URL-safe, permanent |
| `user_id` | uuid FK nullable | null for anonymous runs |
| `inputs` | jsonb | the 7 answers |
| `results` | jsonb | full computed output, frozen at run time |
| `verdict` | text | AI-written honest paragraph |
| `confidence` | confidence | overall |
| `created_at` | timestamptz | |

Results are **frozen**, not recomputed on view. A shared link must show what the sharer saw.

---

### `university_data_points`
Aggregation source for shortlist accuracy.

| Column | Type |
|---|---|
| `university_id` | uuid FK |
| `metric` | text (`total_cost_npr`, `monthly_living_aud`, `hourly_aud`, `visa_approved`, `visa_refused`, `choose_again`) |
| `value` | numeric |
| `source_post_id` | uuid FK |
| `contributor_tier` | verification_tier |
| `created_at` | timestamptz |

**Only `green`/`gold` contributions count.** Confidence tiers:

| Data points | Confidence |
|---|---|
| 0 | `none` → render "Insufficient data" |
| 1-4 | `low` |
| 5-19 | `medium` |
| 20+ | `high` |

---

### `commission_ledger`
Public. Powers the transparency page.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `university_id` | uuid FK |
| `amount_aud` | numeric |
| `rebate_pct` | numeric |
| `effective_from` | date |
| `note` | text |

Readable by everyone, including anonymous. This is the point.

---

## Moderation & ops

### `reports`
`id`, `reporter_id`, `target_type`, `target_id`, `reason` (report_reason), `note`, `status`, `created_at`.

### `moderation_actions`
`id`, `moderator_id`, `target_type`, `target_id`, `action` (mod_action), `reason`, `created_at`.

Append-only. Never delete. This is the audit trail.

### `friction_log`
The doc that picks V2.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `ops_user_id` | uuid FK |
| `task_type` | text (`sop`, `document_chase`, `noc_run`, `translation`, `visa_prep`, `uni_application`, `other`) |
| `student_ref` | text |
| `minutes` | int |
| `note` | text |
| `logged_at` | timestamptz |

Weekly rollup by `task_type` sum(minutes). Highest total is the next thing built.

---

## Notifications

### `notifications`
`id`, `user_id`, `kind`, `payload` jsonb, `read_at`, `created_at`.

### `notification_prefs`
`user_id` PK, then per-kind booleans for `in_app` / `viber` / `email`.

**Hard cap: 2 push per user per day.** Enforced in the Edge Function, not just in prefs.

---

## Denormalized counter maintenance

Use triggers, not application code:

- `answers` insert/soft-delete → update `posts.answer_count` and `posts.verified_answer_count`
- `votes` insert/delete → update target `upvote_count`
- `experience_data` insert → insert rows into `university_data_points`
- `university_data_points` insert → recompute `universities.data_confidence`

---

## Views

### `v_unanswered_questions`
`posts` where `kind='question'` and `verified_answer_count = 0` and `removed_at is null`, ordered by `created_at desc`. Drives feed boost and the reciprocity notification.

### `v_answer_rate`
Rolling 7-day: share of questions receiving a verified answer within 24h. The North Star metric.

### `v_city_costs`
Median `monthly_living_aud` per city with sample size. Renders on city room only when n >= 5.
