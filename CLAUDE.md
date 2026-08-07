# CLAUDE.md — Baato / Edu Navigator

Honest answers about studying abroad, for Nepali students. A verified community +
an honest university shortlist tool. **Community is the product; the consultancy
is the monetization.** Full spec in `docs/` (read `docs/00-overview.md` first).

## The five trust rules — never violate

1. **Never fabricate a data point.** "Insufficient data" always. A figure without
   its sample size is a bug (`DataFigure` enforces this in the UI).
2. **Never hide a commission.** `CommissionRow` is always visible; a university
   with `commission_aud = null` is dropped from shortlist results.
3. **Never guarantee an outcome.** Banned-word post-checks on all AI output.
4. **Never let an agent post as a student.** RLS blocks it; agents are labeled,
   not banned.
5. **Never delete an honest negative experience.** No downvotes; removal requires
   a `moderation_actions` row with a reason.

The build test for anything new: *Does this help a scared 20-year-old in
Kathmandu get an honest answer faster?* If no, it waits.

## Stack

React 18 + Vite + TS (strict) · Tailwind mapped to CSS-variable tokens ·
TanStack Query · React Router · Supabase (Postgres + Auth + Storage + RLS +
Edge Functions) · Postgres FTS + pgvector · Claude via Edge Functions (never the
client) · Cloudflare Pages. See `docs/03-architecture.md`.

## Layout

- `src/components/` — shared primitives (`TrailBar`, `Badge`, `DataFigure`,
  `CommissionRow`, `LockedReplyBox`, `Button`, `EmptyState`).
- `src/features/*` — one folder per screen area; owns its components/hooks.
- `src/lib/` — `supabase.ts`, `format.ts` (NPR lakh/crore), `api/` (typed query
  fns), `shortlist/` (the pure, unit-tested scoring engine).
- `src/i18n/` — `en.json` / `ne.json`. **Every string goes through `t()`.**
- `src/styles/tokens.css` — the single source of truth for design tokens.
- `supabase/migrations/` — sequential SQL, never edited after commit.
- `supabase/functions/` — Deno Edge Functions.
- `tests/rls/` — the eight denial tests (the product is not shippable without them).

## Conventions

- **Design tokens only** — never hard-code a color/size; use the token (via
  Tailwind or `var(--…)`). `--blaze` means *unanswered* and nothing else (the one
  exception is the Trail Bar's current segment).
- **Bilingual from the first line.** New strings land in both `en.json` and
  `ne.json`. Nepali is the primary voice; a native pass is required before launch.
- **Money is mono** (`--font-data`) and always carries a sample size.
- **Trust logic is server-side.** Shortlist scoring + commission attachment run in
  the Edge Function so they can't be tampered with. `src/lib/shortlist` is the
  single source of truth, imported by the function.
- **No API keys in the client.** Service role, Claude, Viber, Resend keys are Edge
  Function env only.
- Mobile-first; test at 360px. Performance budget in `docs/03` (CI-enforced).

## Commands

```bash
npm run dev         # vite dev server
npm run build       # tsc -b && vite build
npm run typecheck   # tsc --noEmit
npm test            # vitest (engine + format tests; RLS tests skip w/o a DB)
npm run test:rls    # the 8 denial tests (needs a local Supabase; see tests/rls)
```

Without a configured Supabase (no `.env`), the public shortlist flow runs in a
clearly-marked **demo mode** (`src/features/shortlist/demo.ts`) so the app is
runnable locally end to end.

## Build status

V1 is built milestone by milestone (see `docs/08-build-plan.md`). Shipped so far:
**M0 Foundation + M1 data layer/RLS + M2 Shortlist tool** (ship gate 1) and
**M3 Community core** (feed + ranking, thread view with the locked-reply mechanic,
composer, stage/city rooms, upvote-only votes/saves, auth/current-profile).
Verification, search, notifications, and admin land in later passes.
