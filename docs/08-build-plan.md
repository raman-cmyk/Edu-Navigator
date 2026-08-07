# 08 — Build Plan

Ordered. Each ticket has acceptance criteria. Don't skip ahead — later tickets assume earlier ones.

---

## Milestone 0 — Foundation (week 1-2)

### T0.1 — Repo and tooling
Vite + React 18 + TS strict, Tailwind, ESLint, Prettier, Vitest, Playwright. Cloudflare Pages connected. CI on PR.

### T0.2 — Supabase projects
Local (CLI/Docker), staging, prod. Migration workflow via `supabase db push` in CI.

### T0.3 — Design tokens
`tokens.css` from `04-design-system.md`. Fonts subset under 120KB total.

### T0.4 — i18n scaffold
`react-i18next`, `en.json`, `ne.json`, language toggle, `lang` attribute switching, NPR lakh/crore formatter.

**This must land before any screen is built.**

---

## Milestone 1 — Schema and auth (week 2-4)

### T1.1 — Core migrations
All enums and tables from `01-data-model.md`. Sequential files, never edited after commit.

### T1.2 — RLS policies
Every policy from `02-rls-policies.md`. Column revokes on `profiles`.

### T1.3 — The eight denial tests
```
grey user answer insert            → denied
agent post insert                  → denied
self-set tier to gold              → denied
non-city member posts in city room → denied
verification without redaction     → denied
client shortlist_runs insert       → denied
answer nested 2 levels             → denied
downvote (value = -1)              → denied
```
**The product is not shippable without these.**

### T1.4 — Triggers
Counter maintenance; `experience_data` → `university_data_points`; confidence recompute.

### T1.5 — Auth
Phone OTP primary, email magic link secondary. Profile row created on first sign-in with `tier='grey'`.

---

## Milestone 2 — Shortlist tool (week 4-7)

Built first because it's public, needs no community, and is the distribution engine.

### T2.1 — University data seed
40 Australian universities, ~200 courses, commissions, occupation list flags.
**Done when:** every seeded university has a non-null `commission_aud`.

### T2.2 — Scoring engine
Steps 1-9 from `06-shortlist-engine.md` as a pure, unit-tested TS module.
**Done when:** 20 unit tests cover normalization, hard filters, fit scoring, cost, visa bands, PR, ranking, rejection selection. Includes a test asserting a commission-null university is dropped.

### T2.3 — `shortlist` Edge Function
Wraps the engine. Zod input validation. Rate limit 10/hr/IP. Writes frozen result, returns slug.

### T2.4 — Verdict generation
Claude call + post-checks + fallback template per `07-ai-features.md`.

### T2.5 — `/shortlist` UI
7 steps, Trail Bar progress, localStorage draft, no auth.

### T2.6 — `/s/:slug` UI
Verdict, university cards, `CommissionRow`, `DataFigure` with sample sizes, rejection section, share.
**Done when:** a card with `confidence: 'none'` renders "Insufficient data" and no number.

### T2.7 — `/commissions` and `/methodology`
Public, anonymous-readable.

**Ship gate:** shortlist tool works end to end, publicly, for an anonymous user on a 360px screen over throttled 4G.

---

## Milestone 3 — Community core (week 7-11)

T3.1 Feed · T3.2 Thread view · T3.3 Locked reply box · T3.4 Composer · T3.5 Stage rooms · T3.6 Votes and saves.

---

## Milestone 4 — Verification (week 11-13)

T4.1 Upload flow · T4.2 Client-side redaction · T4.3 Admin queue · T4.4 `verify-review` Edge Function · T4.5 Post-approval conversion · T4.6 Badge component.

---

## Milestone 5 — Search and AI (week 13-15)

T5.1 Embedding backfill · T5.2 Hybrid search · T5.3 `search` Edge Function + summary · T5.4 `/search` UI · T5.5 Thread summary.

---

## Milestone 6 — City rooms, profiles, notifications (week 15-18)

T6.1 City rooms · T6.2 Profiles · T6.3 Helpfulness score · T6.4 Notifications (2 push/day cap) · T6.5 Notification prefs.

---

## Milestone 7 — Moderation and admin (week 18-20)

T7.1 `moderate` Edge Function · T7.2 Moderation queue · T7.3 Friction log · T7.4 Data console.

---

## Milestone 8 — Polish and launch prep (week 20-24)

T8.1 PWA · T8.2 Performance · T8.3 Accessibility · T8.4 Nepali content pass · T8.5 Seed content load · T8.6 Analytics and errors.

---

## Ship gates

| Gate | Requirement |
|---|---|
| **Shortlist public** | M0-M2 complete, 8 denial tests passing |
| **Community private beta** | M3-M4 complete, 100 alumni verified |
| **Public launch** | M5-M8 complete, 300 seed posts live, Nepali pass done |

---

## After launch — how V2 gets chosen

Not from this document. Ops logs every manual task in `/admin/friction`. At month 6, the highest total-minutes task type is what gets built. Let the pain pick the roadmap.
