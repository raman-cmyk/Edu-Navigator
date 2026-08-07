# 09 — Seed Data

Two kinds. **Dev seed** makes local development possible. **Launch seed** is real content from real people and is not fake.

---

# Part 1 — Dev seed

`supabase/seed/` — loaded by `supabase db reset`. All fake, clearly marked.

## Cities (4)

```
sydney     | Sydney    | AU | active
melbourne  | Melbourne | AU | active
adelaide   | Adelaide  | AU | active
brisbane   | Brisbane  | AU | active
```

No others. Adding a fifth in dev leads to adding a fifth in prod.

## Universities (~40)

Real Australian universities, real tuition (public), **placeholder commissions clearly marked** `commission_source = 'DEV_PLACEHOLDER'`.

Coverage needed for testing:
- 3-4 Go8 (high cost, metro, low fit for typical profile)
- ~20 mid-tier metro
- ~12 regional (drives PR pathway = Yes)
- 4-5 private/VET providers (cookery, aged care — the high-volume segment)

**Include 2 universities with `commission_aud = NULL`** so the "drop from results" path is exercised.

## Courses (~200)

Per university, 4-6 courses across: `it`, `nursing`, `business`, `engineering`, `cookery`, `aged_care`, `accounting`, `public_health`, `data`, `construction`.

Vary `min_gpa_pct` (50-75), `max_backlogs` (0-8), `min_ielts` (5.5-7.0), `on_skilled_occupation_list`.

## Profiles (~60)

| Tier | Count | Purpose |
|---|---|---|
| grey | 20 | Test locked reply box, ask-only |
| green | 20 | Verified students, spread across 4 cities |
| gold | 15 | Alumni, with `grad_year` |
| agent | 3 | Test agent labeling and post blocking |
| admin | 2 | Queue testing |

Names from a Nepali name list. Handles lowercase. Mix of `lang: 'ne'` and `'en'`.

## Posts (~120)

Distribution matters more than volume:

| Stage | Count | Include |
|---|---|---|
| deciding | 25 | Some with no answers (test unanswered boost) |
| applying | 30 | |
| visa | 35 | Highest traffic stage in reality |
| landing | 15 | City-tagged |
| living | 15 | |

**Required test cases:**
- 10 posts with `verified_answer_count = 0` and `created_at` under 24h — must dominate feed
- 3 threads with 18+ answers — triggers thread summary
- 5 anonymous posts
- 5 posts with attached `shortlist_run_id`
- 8 `kind = 'experience'` posts with full `experience_data`
- 2 posts that read negative ("I regret coming here") — **must not be flagged by moderation.** This is a regression test for trust rule 5.

## Experience data

The 8 experience posts must produce enough `university_data_points` that:
- 1 university reaches `high` confidence (20+ points)
- 2 reach `medium` (5-19)
- 3 reach `low` (1-4)
- The rest are `none` — so "Insufficient data" renders in dev

**Melbourne must have n ≥ 5 living-cost points** and **Adelaide must have n < 5**, so both branches of the city cost panel are visible locally.

## Commission ledger

One row per university with a commission. 3 with a `rebate_pct` set.

## Shortlist runs (3)

Pre-computed and frozen, covering:
1. Strong profile, high confidence
2. Weak profile (5 backlogs, 3-year gap, low budget) — many rejections
3. Low-confidence profile — verdict must say the list is provisional

## Friction log (~40 entries)

Across 6 weeks, weighted so `sop` and `document_chase` top the rollup. Lets the V2-selection screen be tested with realistic shape.

---

# Part 2 — Launch seed

**This is not fake data.** It is real content from real alumni, gathered manually before launch.

## Why this phase exists

A community that opens empty dies and does not recover. First impression is one shot. Phase 0 is not optional and does not get compressed when the build runs late.

## Target: 100 verified alumni

| City | Target |
|---|---|
| Melbourne | 35 |
| Sydney | 30 |
| Adelaide | 20 |
| Brisbane | 15 |

Sourcing: personal network, NRNA chapters, existing Nepali student Facebook groups, university Nepali societies, LinkedIn.

**Offer them:** founding badge (permanent, visually distinct), moderator rights, direct line to the founder, name on a founders page.

**Ask them for:** 3 honest posts each before launch.

## Target: 300 posts before public launch

| Type | Count | Notes |
|---|---|---|
| Experience posts with full structured data | 100 | These make the shortlist tool real |
| Visa experiences (approved + refused) | 60 | Refusals are as valuable as approvals |
| City basics (4 pinned) | 4 | Written by long-term residents |
| Cost breakdowns | 40 | Real monthly spend, itemized |
| Job/work experiences | 40 | Real hourly rates, how they got hired |
| Failure and regret posts | 20 | **Actively solicit these.** Their presence is the proof of honesty. |
| University reviews | 36 | Including "would not choose again" |

## Content rules for seeding

**Do not write posts on behalf of alumni.** Ghost-written seed content reads as fake and poisons the premise. If someone won't write it, don't fabricate it.

**Do not remove negative content.** If a founding alum says the whole thing was a mistake, that post is more valuable than ten positive ones.

**Do not seed with agents.** Obvious, but the temptation exists when volume is short.

## Data confidence gate

The shortlist tool should not go public until at least **10 universities reach `medium` confidence** and **all 4 cities have n ≥ 5 living-cost points.**

Below that, the tool renders "Insufficient data" too often and looks broken rather than honest.

If the gate isn't met at launch date, launch the community first and hold the shortlist tool. The community generates the data the tool needs — that dependency is real and shouldn't be forced.

## Ordering

```
Month 1-2   Recruit 100 alumni, verify manually
Month 2-3   Collect 300 posts, write 4 city basics
Month 3     Check data confidence gate
Month 4     Open publicly
```

---

## Loading dev seed

```bash
supabase db reset          # migrations + seed
npm run seed:embeddings    # backfill vectors for seeded posts
```

Seeded posts need embeddings or search returns nothing locally and looks broken.
