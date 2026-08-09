# 10 — Launch & Deployment

How to deploy Baato and what still needs humans before public launch. This
complements `08-build-plan.md` (which defines the ship gates).

---

## Deploy the frontend (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 |
| SPA fallback | `public/_redirects` (`/* /index.html 200`) — already in the repo |

Environment variables (Pages → Settings → Environment variables):

```
VITE_SUPABASE_URL         = https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY    = <anon key>          # RLS is the real guard
VITE_PLAUSIBLE_DOMAIN     = baato.app           # optional, cookieless
VITE_SENTRY_DSN           = <dsn>               # optional
```

Never put a service-role, Claude, Viber, or Resend key here — those are Edge
Function secrets only (`no API keys in the client`, docs/03).

The build fails in CI if the performance budget is exceeded
(`npm run check:budget`): entry < 500 KB gz, any route chunk < 150 KB gz,
CSS < 100 KB gz.

---

## Deploy the backend (Supabase)

```bash
supabase link --project-ref <ref>
supabase db push                 # applies supabase/migrations/* in order
supabase functions deploy shortlist search embed summarize-thread \
  moderate verify-review notify
```

Function secrets (never client-side):

```bash
supabase secrets set CLAUDE_API_KEY=... EMBEDDINGS_API_KEY=... \
  VIBER_API_KEY=... RESEND_API_KEY=...
```

Storage: the `verification-docs` bucket is created by migration `0005` and is
private — access only via 5-minute signed URLs from an admin-authenticated
function.

Schedules (cron):
- `embed` — every 5 minutes (embedding backfill)
- `notify` — for digests; also invoked by DB webhooks
- `moderate` — DB webhook on `posts` / `answers` insert

Admin role is set server-side only, in `auth.users.raw_app_meta_data.role =
'admin'` — never client-writable.

---

## M8 status

| Task | Status |
|---|---|
| T8.1 PWA (installable, offline reads, write queue, offline banner) | Done — `vite-plugin-pwa`, `lib/offlineQueue`, `OfflineBanner` |
| T8.2 Performance budget (CI-enforced) | Done — `scripts/check-bundle-budget.mjs` in CI |
| T8.3 Accessibility floor | Done — see checklist below |
| T8.4 Nepali content pass | **Pending — needs a native speaker** (see below) |
| T8.5 Seed content load (100 alumni, 300 posts) | **Pending — Phase 0 ops work, not code** |
| T8.6 Analytics + errors | Done — cookieless Plausible + env-gated error hook |

### Accessibility checklist (T8.3)

- [x] Visible keyboard focus everywhere (`:focus-visible`, 2px `--focus`, offset)
- [x] Skip-to-content link (first focusable element, `SkipLink`)
- [x] Touch targets ≥ 44×44 (buttons, nav, form controls)
- [x] `lang` attribute switches with the language toggle (Devanagari SRs)
- [x] Badges are never colour-only — tier is always spelled out
- [x] `prefers-reduced-motion` disables transitions
- [x] Body contrast ≥ 4.5:1 (`--stone` on `--paper` = 4.6:1, verified)
- [ ] Full screen-reader pass on every screen (recommended pre-launch)

---

## Human-gated before public launch — do not fake

**T8.4 — Nepali native pass.** Every string ships in `ne.json`, but the Nepali
was written by the build, not a native speaker. Nepali is the *primary* voice
(docs/04), so a native review is required before launch. This is not a QA task.
Track the review in a shared sheet; correct `src/i18n/ne.json` in place. Strings
most worth scrutiny: the shortlist verdict/rejection copy, verification and
moderation messages, and the reciprocity banners.

**T8.5 — Seed content (Phase 0).** A community that opens empty dies. Recruit
~100 verified alumni and gather ~300 honest posts *from real people* before
opening (docs/09 Part 2). Do not ghost-write posts, do not remove negative ones,
do not seed with agents. The dev seed (`supabase/seed/seed.sql`) is fake and
clearly marked — it is for development only and must never reach production.

**Data-confidence gate.** Hold the public shortlist tool until ≥ 10 universities
reach `medium` confidence and all 4 cities have ≥ 5 living-cost points (docs/09).
Below that, launch the community first; it generates the data the tool needs.

---

## Ship gates (from docs/08)

| Gate | Requirement | Code status |
|---|---|---|
| Shortlist public | M0–M2, 8 denial tests | Built |
| Community private beta | M3–M4, 100 alumni verified | Built (alumni = ops) |
| Public launch | M5–M8, 300 seed posts, Nepali pass | Built; content + Nepali pending |
