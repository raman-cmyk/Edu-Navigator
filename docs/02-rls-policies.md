# 02 — RLS Policies

Every table has RLS enabled. The trust rules are enforced here, not just in the UI.

```sql
alter table <every_table> enable row level security;
```

---

## Helper functions

```sql
-- current user's verification tier
create or replace function auth_tier() returns verification_tier
language sql stable security definer as $$
  select tier from profiles where id = auth.uid()
$$;

-- can this user answer? the core mechanic
create or replace function can_answer() returns boolean
language sql stable security definer as $$
  select coalesce(
    (select tier in ('green','gold') and banned_at is null
     from profiles where id = auth.uid()),
    false)
$$;

-- is this user verified for a given city?
create or replace function is_in_city(target_city uuid) returns boolean
language sql stable security definer as $$
  select coalesce(
    (select city_id = target_city from profiles where id = auth.uid()),
    false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer as $$
  select coalesce(
    (select raw_app_meta_data->>'role' = 'admin' from auth.users where id = auth.uid()),
    false)
$$;
```

Admin role lives in `auth.users.raw_app_meta_data`, set server-side only. Never writable by the client.

---

## `profiles`

```sql
-- everyone reads profiles (badges are public by design)
create policy profiles_read on profiles
  for select using (true);

-- users update only their own, and only safe columns
create policy profiles_update_own on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());
```

**Column protection.** `tier`, `city_id`, `university_id`, `grad_year`, `is_agent`, `banned_at`, `helpfulness_score` must never be self-set. Revoke them:

```sql
revoke update (tier, city_id, university_id, grad_year,
               is_agent, banned_at, helpfulness_score)
  on profiles from authenticated;
```

These are written only by the verification Edge Function using the service role. A user who can set their own tier can bypass the entire product.

---

## `posts`

```sql
-- read: everyone including anonymous. content is the advertisement.
create policy posts_read on posts
  for select using (removed_at is null);

-- ask a question: any signed-in, non-banned user
create policy posts_insert_question on posts
  for insert with check (
    auth.uid() = author_id
    and kind = 'question'
    and (select banned_at is null from profiles where id = auth.uid())
    and (select is_agent = false from profiles where id = auth.uid())
  );

-- share an experience: verified only
create policy posts_insert_experience on posts
  for insert with check (
    auth.uid() = author_id
    and kind = 'experience'
    and can_answer()
  );

-- city rooms: only city-verified members may post there
create policy posts_city_restriction on posts
  for insert with check (
    city_id is null or is_in_city(city_id) or is_admin()
  );

-- edit own within 30 min, no stage/kind changes after
create policy posts_update_own on posts
  for update using (
    author_id = auth.uid()
    and created_at > now() - interval '30 minutes'
    and removed_at is null
  );
```

**Note on agents.** `is_agent = true` blocks post insert entirely. Agents get read + report only. They are labeled, not banned, so students can see who they are.

**Known V1 gap:** city rooms will be thin at launch. Allow `gold` users to post in any city they hold a past verification for. Track past cities in a `profile_cities` join table if this becomes necessary — do not loosen the policy globally.

---

## `answers` — the most important policy in the product

```sql
create policy answers_read on answers
  for select using (removed_at is null);

create policy answers_insert_verified_only on answers
  for insert with check (
    auth.uid() = author_id
    and can_answer()
    and (select is_agent = false from profiles where id = auth.uid())
    and (
      parent_answer_id is null
      or (select parent_answer_id is null from answers a where a.id = parent_answer_id)
    )
  );

create policy answers_update_own on answers
  for update using (
    author_id = auth.uid()
    and created_at > now() - interval '30 minutes'
  );
```

Three things enforced at once:
1. Only `green`/`gold` can answer — the core mechanic
2. Agents cannot answer at all
3. Reply nesting is capped at one level

The UI shows a locked reply box for `grey` users. **The UI check is cosmetic.** This policy is the real enforcement. Do not ship with only the UI check.

---

## `experience_data`

```sql
create policy expdata_read on experience_data
  for select using (true);

create policy expdata_insert on experience_data
  for insert with check (
    can_answer()
    and exists (
      select 1 from posts p
      where p.id = post_id and p.author_id = auth.uid() and p.kind = 'experience'
    )
  );
```

Only verified users, only on their own experience posts. This data feeds the shortlist — unverified input would poison it.

---

## `votes`

```sql
create policy votes_read on votes for select using (true);

create policy votes_insert on votes
  for insert with check (
    user_id = auth.uid()
    and value = 1
    and (select banned_at is null from profiles where id = auth.uid())
  );

create policy votes_delete_own on votes
  for delete using (user_id = auth.uid());
```

`value = 1` only. No downvotes — they suppress honest negative experiences.

---

## `verification_requests`

```sql
create policy vr_read_own on verification_requests
  for select using (user_id = auth.uid() or is_admin());

create policy vr_insert_own on verification_requests
  for insert with check (
    user_id = auth.uid()
    and redaction_applied = true
    and status = 'pending'
  );

create policy vr_admin_update on verification_requests
  for update using (is_admin());
```

`redaction_applied = true` is required at the DB level. A document submitted without redaction confirmation is rejected by Postgres, not by a form validator.

### Storage bucket `verification-docs`

Private. No public policy. Access only via signed URLs generated by an admin-authenticated Edge Function, 5-minute expiry. Users cannot re-read their own uploaded documents after submission.

---

## `shortlist_runs`

```sql
-- anyone with the share slug can read. that's the point.
create policy shortlist_read on shortlist_runs
  for select using (true);
```

**Insert is service-role only.** The client never writes a shortlist run. The scoring happens in an Edge Function so the algorithm and the commission data can't be tampered with client-side.

---

## `universities`, `courses`, `cities`, `commission_ledger`

```sql
create policy public_read on universities for select using (true);
create policy public_read on courses       for select using (true);
create policy public_read on cities        for select using (is_active or is_admin());
create policy public_read on commission_ledger for select using (true);
```

Write: admin only, via service role.

**`commission_ledger` is readable by anonymous users.** That is deliberate and load-bearing. It is the transparency claim made verifiable.

---

## `university_data_points`

```sql
create policy udp_read on university_data_points for select using (true);
```

Insert via trigger from `experience_data` only. No direct client insert — the trigger runs as definer and carries the contributor tier through.

---

## `reports`

```sql
create policy reports_insert on reports
  for insert with check (reporter_id = auth.uid());

create policy reports_read on reports
  for select using (reporter_id = auth.uid() or is_admin());
```

---

## `moderation_actions`

```sql
create policy modactions_read on moderation_actions
  for select using (is_admin());

create policy modactions_insert on moderation_actions
  for insert with check (is_admin());
```

Append-only. No update, no delete policy — the audit trail must be immutable.

---

## `friction_log`

```sql
create policy friction_ops on friction_log
  for all using (is_admin() or ops_user_id = auth.uid());
```

---

## `notifications` / `notification_prefs`

```sql
create policy notif_read_own on notifications
  for select using (user_id = auth.uid());

create policy notif_update_own on notifications
  for update using (user_id = auth.uid());  -- read_at only

create policy prefs_own on notification_prefs
  for all using (user_id = auth.uid());
```

Notification insert is service-role only.

---

## Trust rules → enforcement map

| Rule | Where enforced |
|---|---|
| 1. Never fabricate data | Shortlist Edge Function returns `confidence: none` → UI renders "Insufficient data". Never a number. |
| 2. Never hide commission | `universities.commission_aud is null` → excluded from results by the Edge Function query |
| 3. Never guarantee outcomes | Moderation AI flag + banned phrase list, checked on insert via Edge Function |
| 4. No agents posting as students | `is_agent` check in `posts_insert_*` and `answers_insert_verified_only` |
| 5. Never delete honest negatives | No downvotes; `removed_at` requires a `moderation_actions` row with a reason; no hard delete |

---

## Testing requirement

Every policy needs a test that asserts **denial**, not just permission. The critical ones:

```
grey user attempts answer insert           → denied
agent attempts post insert                 → denied
user attempts to set own tier to gold      → denied (column revoked)
non-city member posts in city room         → denied
verification submitted without redaction   → denied
client attempts shortlist_runs insert      → denied
answer nested two levels deep              → denied
downvote (value = -1)                      → denied
```

If these eight tests don't exist and pass, the product is not shippable.
