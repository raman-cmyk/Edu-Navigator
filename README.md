# बाटो · Baato — Edu Navigator

**Honest answers about studying abroad, from students who actually went.**

Baato is two things a Nepali student can't get anywhere else, in one place:

1. **A verified community** — every contributor's status is checked by document.
   Anyone can ask; only verified students can answer. Agents are labeled, not
   hidden.
2. **An honest shortlist tool** — free, no signup. Seven questions in; a ranked
   list of Australian universities out, with the real total cost in NPR, honest
   visa odds, PR pathway, and **exactly what we earn in commission from each** —
   including the universities you should *not* apply to.

The full product spec lives in [`docs/`](./docs) — start with
[`docs/00-overview.md`](./docs/00-overview.md).

## Status

Built in milestones (see [`docs/08-build-plan.md`](./docs/08-build-plan.md)).
This repository currently implements **ship gate 1**:

- **M0 — Foundation:** Vite + React + TS scaffold, design-token system, bilingual
  (ne/en) i18n, NPR lakh/crore formatter, PWA config.
- **M1 — Data layer:** full Postgres schema, RLS policies, counter triggers,
  views, dev seed, and the eight RLS denial tests.
- **M2 — Shortlist tool:** the pure scoring engine (unit-tested), the `shortlist`
  Edge Function, and the public screens — `/shortlist`, `/s/:slug`,
  `/commissions`, `/methodology`.
- **M3 — Community core:** auth + current-profile, feed ranking (unanswered
  boosted), the signature `PostCard`, thread view with verified-answers-first and
  the locked-reply mechanic, the ask/experience composer with duplicate-check,
  stage rooms, city rooms (cost panel gated at n≥5), and upvote-only votes/saves.
  Runs against a demo data layer locally (with a tier switcher) or Supabase.
- **M4 — Verification:** the `/verify` flow (tier picker → upload → client-side
  canvas redaction → review), the admin queue at `/admin/verify` (oldest-first,
  24h SLA countdown, reason templates), the `verify-review` Edge Function (the
  only path that writes tier/city onto a profile), and the post-approval
  conversion that routes a freshly-verified student to unanswered questions in
  their city.
- **M5 — Search & AI:** the `/search` screen (natural-language input, filters,
  verified-only toggle, a labeled AI summary above the results), the hybrid
  `search` Edge Function (FTS + pgvector, reciprocal rank fusion, tier
  weighting), the `embed` backfill and `summarize-thread` functions, and the
  `search_posts` / `match_posts` SQL RPCs. Search runs in demo locally and
  degrades gracefully when the AI/embeddings keys aren't set.

- **M6 — Profiles & notifications:** own (`/me`) and others' (`/u/:handle`)
  profiles with a helpfulness score (quality over post count) and "Ask [name]"
  routing to a public post (no DMs); `/notifications` grouped by day; `/settings`
  with granular per-kind/per-channel notification prefs (defaulting to less);
  the `notify` Edge Function enforcing the hard 2-push/day cap; and `profile_cities`
  so gold alumni can post in a city room they've lived in.

- **M7 — Moderation & admin:** the `moderate` Edge Function (exactly two rules —
  outcome-guarantee auto-remove at high confidence, agent-promotion queue-only,
  everything else stays up) with a deterministic, unit-tested fallback that never
  flags anger or failure stories; the moderation queue with an immutable action
  log; the friction log with its V2-picking weekly rollup; and the data console
  (answer-rate North Star, data confidence by university, commission editor).

Remaining: **M8** — PWA/performance/accessibility polish, the Nepali content
pass, and launch prep.

## Quick start

```bash
npm install
cp .env.example .env      # optional — the app runs in demo mode without it
npm run dev               # http://localhost:5173
```

Without Supabase credentials the public shortlist flow runs in a clearly-marked
**demo mode** so you can click through it end to end. With a Supabase project
configured, it calls the real Edge Function and reads frozen results from the
database.

### With a local Supabase

```bash
supabase start
supabase db reset         # applies migrations + loads supabase/seed/seed.sql
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (scoring engine + formatters) |
| `npm run test:rls` | The 8 RLS denial tests (needs a local Supabase) |

## The trust rules

Never fabricate a data point · never hide a commission · never guarantee an
outcome · never let an agent post as a student · never delete an honest negative
experience. These are enforced in code (RLS + Edge Functions + UI components),
not just in policy. See [`CLAUDE.md`](./CLAUDE.md).
