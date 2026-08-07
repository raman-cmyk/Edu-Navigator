# 03 — Architecture

## Principle

Boring stack, one dev can run it, works on a cheap Android over 4G in Kathmandu.

No microservices. No Kubernetes. No separate search service. Postgres does more than you think.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast builds, small bundles |
| PWA | `vite-plugin-pwa` | Installable, no app store friction, offline reads |
| Styling | Tailwind + CSS custom properties | Tokens in CSS vars, see `04-design-system.md` |
| Server state | TanStack Query | Caching, offline, optimistic updates |
| Routing | React Router | |
| Backend | Supabase | Postgres + Auth + Storage + RLS + Edge Functions |
| Search | Postgres FTS + pgvector | No Elasticsearch. No Algolia. |
| AI | Claude API via Edge Functions | **Never called from the client** |
| Hosting | Cloudflare Pages | Cheap, fast POPs near Nepal |
| Notifications | Viber Business API + Resend | Viber is primary. Nepal runs on Viber. |
| Analytics | Plausible (self-host or cloud) | No Google Analytics — trust product, don't leak users |
| Errors | Sentry | |

**Not using:** Redux, Next.js, GraphQL, Prisma, Elasticsearch, WhatsApp, Firebase.

---

## Repo layout

```
/
├── CLAUDE.md
├── docs/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/           shared UI primitives
│   │   ├── Badge.tsx
│   │   ├── PostCard.tsx
│   │   ├── TrailBar.tsx      the signature element
│   │   └── ...
│   ├── features/
│   │   ├── feed/
│   │   ├── thread/
│   │   ├── compose/
│   │   ├── search/
│   │   ├── shortlist/
│   │   ├── verify/
│   │   ├── profile/
│   │   ├── city/
│   │   └── admin/
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── api/              typed query fns per domain
│   │   ├── ranking.ts
│   │   └── format.ts         NPR/AUD formatting, dates
│   ├── hooks/
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en.json
│   │   └── ne.json
│   ├── styles/
│   │   ├── tokens.css
│   │   └── globals.css
│   └── types/
│       ├── supabase.ts       generated
│       └── domain.ts
├── supabase/
│   ├── migrations/           0001_*.sql, sequential, never edited
│   ├── functions/
│   │   ├── shortlist/
│   │   ├── search/
│   │   ├── summarize-thread/
│   │   ├── moderate/
│   │   ├── verify-review/
│   │   └── notify/
│   └── seed/
└── tests/
    └── rls/                  the 8 denial tests
```

Each `features/*` folder holds its own components, hooks, and types. Shared things graduate to `components/` or `lib/` only when used by 2+ features.

---

## Data flow

```
Client (React)
  │
  ├─ reads ──────────→ Supabase PostgREST (RLS enforced)
  │
  ├─ simple writes ──→ Supabase PostgREST (RLS enforced)
  │
  └─ privileged ─────→ Edge Function (service role)
                          ├─ shortlist scoring
                          ├─ semantic search
                          ├─ thread summarize
                          ├─ moderation check
                          ├─ verification approve
                          └─ notification send
                              │
                              └─→ Claude API / Viber / Resend
```

**Rule: no API keys in the client.** Claude API key, Viber key, Resend key, service role key — all Edge Function env only.

**Rule: no business logic in the client that affects trust.** Shortlist scoring runs server-side so the algorithm and commission figures can't be tampered with.

---

## Edge Functions

| Function | Trigger | Does |
|---|---|---|
| `shortlist` | POST from public tool | Scores universities, calls Claude for the verdict, writes `shortlist_runs`, returns share slug |
| `search` | POST from search page | Embeds query, hybrid FTS + vector search, calls Claude for the summary |
| `summarize-thread` | Called when thread > 15 answers | Generates collapsible summary with source links |
| `moderate` | DB webhook on post/answer insert | Checks for outcome guarantees and agent patterns, flags to queue |
| `verify-review` | Admin action | Sets tier/city on profile via service role, sends notification |
| `notify` | Cron + DB webhooks | Routes notifications, enforces the 2/day cap |
| `embed` | Cron, every 5 min | Backfills embeddings for new posts |

All functions: input validated with Zod, structured error responses, no stack traces leaked.

---

## Search implementation

Hybrid. Neither approach alone is enough.

```sql
-- 1. lexical
select id, ts_rank(search_tsv, plainto_tsquery('english', $1)) as lex_score
from posts where search_tsv @@ plainto_tsquery('english', $1)

-- 2. semantic
select id, 1 - (embedding <=> $2) as vec_score
from posts order by embedding <=> $2 limit 50
```

Merge with reciprocal rank fusion, then apply the verification weight:

```
final = rrf_score × tier_weight
tier_weight: gold 1.5, green 1.3, grey 1.0
```

A gold alum's 2023 answer outranks a grey user's answer from yesterday. Always.

**Nepali search:** Devanagari doesn't work with the `english` FTS config. Use `simple` config for `ne` queries and lean harder on vector search — embeddings handle Nepali reasonably. Detect script by Unicode range.

---

## Feed ranking

Implemented in `lib/ranking.ts`, applied server-side in a Postgres function for consistency.

```
score =
  (unanswered_boost)          × 3.0   if verified_answer_count = 0 and age < 24h
+ (recency_decay)             × 1.0   exp(-age_hours / 36)
+ (verified_engagement)       × 0.5   log(1 + upvotes_from_verified)
+ (stage_match)               × 0.8   if post.stage = user.stage
+ (country_match)             × 0.4   if post targets user's country
+ (author_tier_weight)        × 0.3   gold 1.0, green 0.7, grey 0.2
```

**Unanswered questions get the largest single boost.** An unanswered question is a bug in this product. The feed's main job is routing them to people who can answer.

---

## Performance budget

Hard limits. CI fails if exceeded.

| Metric | Budget |
|---|---|
| Initial JS bundle | < 500 KB gzipped |
| First Contentful Paint (4G, mid Android) | < 1.5s |
| Time to Interactive | < 3s |
| Largest route chunk | < 150 KB |
| Fonts | < 120 KB total (subset Devanagari + Latin) |

Tactics:
- Route-level code splitting on every feature folder
- Devanagari and Latin fonts subset with `pyftsubset`, `font-display: swap`
- Images: WebP, lazy, explicit dimensions
- Feed virtualized past 30 items
- TanStack Query `staleTime` 60s on feed, 5min on static data
- No moment.js, no lodash — native `Intl` and small utils

---

## Offline (PWA)

| Content | Strategy |
|---|---|
| App shell | Precache |
| Feed (last viewed) | Stale-while-revalidate |
| Thread (last 20 viewed) | Cache-first, 24h |
| Shortlist result | Cache-first, permanent (results are frozen anyway) |
| Writes | Queue in IndexedDB, replay on reconnect, optimistic UI |

Offline banner: "You're offline. Reading works, posting will send when you're back."

---

## i18n

`react-i18next`. **Every string goes through `t()` from the first commit.** Retrofitting bilingual is a multi-week disaster.

```
src/i18n/en.json
src/i18n/ne.json
```

Keys namespaced by feature: `feed.unanswered`, `verify.upload.title`.

Rules:
- Default language `ne` for users with a Nepal IP, `en` otherwise. Always overridable.
- Numbers: NPR uses lakh/crore grouping in `ne`, standard in `en`. Write a formatter, don't use raw `Intl` for NPR.
- Dates: relative in both ("२ घण्टा अघि" / "2 hours ago")
- Thread auto-translate is on-demand only, via Edge Function. Never automatic — it costs money and mangles nuance.

---

## Auth

Supabase Auth. Methods in V1:
- Phone OTP (primary — Nepali users have phones, not always email)
- Email magic link (secondary)

No password auth. No social login in V1 (Google/Facebook add tracking concerns for a trust product).

On first sign-in, create `profiles` row via trigger with `tier = 'grey'`, `stage = 'deciding'`, `lang` from browser.

---

## Environments

| Env | Supabase | Host |
|---|---|---|
| Local | Supabase CLI, Docker | `vite dev` |
| Staging | Separate project | Cloudflare preview |
| Prod | Separate project | `baato.app` (or final domain) |

Migrations run via `supabase db push` in CI on merge to `main`. Never applied by hand in prod.

---

## Security notes

- RLS on every table, no exceptions (see `02-rls-policies.md`)
- Verification docs in private bucket, signed URLs 5-min expiry, admin only
- Rate limit shortlist Edge Function: 10/hour per IP (it's public and calls Claude)
- Rate limit post/answer insert: 10/hour per user
- Admin role in `auth.users.raw_app_meta_data`, never client-writable
- No PII in analytics events
- Users can export and delete all their data (settings screen)
