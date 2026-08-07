# RLS denial tests

These are the **8 load-bearing denial tests** from `docs/02-rls-policies.md`
("Testing requirement"). Each asserts that a write is **denied** (returns an
error), not merely that some write is permitted. Per the spec: if these do not
exist and pass, the product is not shippable.

| # | Behavior | Enforced by |
|---|----------|-------------|
| 1 | grey user answer insert | `answers_insert_verified_only` (`can_answer()`) |
| 2 | agent post insert | `posts_insert_question/experience` (`is_agent = false`) |
| 3 | self-set own tier to gold | column `REVOKE UPDATE (tier, …)` on `profiles` |
| 4 | non-city member posts in city room | `posts_city_restriction` (RESTRICTIVE) |
| 5 | verification without redaction | `vr_insert_own` (`redaction_applied = true`) |
| 6 | client `shortlist_runs` insert | no insert policy (service-role only) |
| 7 | answer nested two levels deep | RLS check + `enforce_answer_depth()` trigger |
| 8 | downvote (`value = -1`) | `votes_insert` (`value = 1`) + CHECK constraint |

## Running locally

You need a running local Supabase stack with the migrations and seed loaded.

```bash
# From the repo root
supabase start            # boots Postgres/Auth/Storage locally
supabase db reset         # applies supabase/migrations/* and supabase/seed/seed.sql

# Copy the keys printed by:
supabase status

export SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=<anon key from `supabase status`>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>

npm run test:rls          # vitest run tests/rls
```

## Behavior without a local DB

The suite is wrapped in `describe.skipIf(!process.env.SUPABASE_URL)`. When the
env vars are absent (e.g. a plain `npm test` on a laptop or in a CI job that
doesn't provision Supabase) the suite is **skipped, not failed**, keeping the
default test run green. CI that provisions a Supabase instance should export the
three variables above so the tests actually run.

## How the suite sets itself up

`beforeAll` uses the **service role** to:

1. create a throwaway city the test users are *not* verified for,
2. create three auth users via `auth.admin.createUser` (the
   `on_auth_user_created` trigger auto-creates their `profiles` row as `grey`),
   then promote two of them to `green` / `agent` with a service-role update
   (which bypasses the column revokes), and
3. sign each user in with the anon key to get an RLS-scoped client.

Each test then performs the forbidden write **as the scoped user** and asserts
an error is returned. `afterAll` best-effort deletes the created users and city.
