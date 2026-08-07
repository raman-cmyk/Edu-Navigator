-- 0003 — Denormalized counter maintenance + integrity triggers
-- Authoritative source: docs/01-data-model.md "Denormalized counter maintenance".
-- All counters are maintained by triggers, never by application code.
-- Functions are SECURITY DEFINER so trigger-driven writes (e.g. the
-- experience_data -> university_data_points fan-out) succeed under RLS.

-- ---------------------------------------------------------------------------
-- answers insert / soft-delete  ->  posts.answer_count + verified_answer_count
-- verified = answer author's tier is green or gold.
-- ---------------------------------------------------------------------------
create or replace function maintain_answer_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  author_verified boolean;
begin
  if tg_op = 'INSERT' then
    if new.removed_at is null then
      select tier in ('green','gold') into author_verified from profiles where id = new.author_id;
      update posts
        set answer_count = answer_count + 1,
            verified_answer_count = verified_answer_count + case when coalesce(author_verified,false) then 1 else 0 end
      where id = new.post_id;
    end if;

  elsif tg_op = 'UPDATE' then
    select tier in ('green','gold') into author_verified from profiles where id = new.author_id;
    -- transition: active -> soft-deleted
    if old.removed_at is null and new.removed_at is not null then
      update posts
        set answer_count = greatest(answer_count - 1, 0),
            verified_answer_count = greatest(verified_answer_count - case when coalesce(author_verified,false) then 1 else 0 end, 0)
      where id = new.post_id;
    -- transition: soft-deleted -> restored
    elsif old.removed_at is not null and new.removed_at is null then
      update posts
        set answer_count = answer_count + 1,
            verified_answer_count = verified_answer_count + case when coalesce(author_verified,false) then 1 else 0 end
      where id = new.post_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger trg_maintain_answer_counts
  after insert or update of removed_at on answers
  for each row execute function maintain_answer_counts();

-- ---------------------------------------------------------------------------
-- Enforce answer nesting depth = 1 (defense-in-depth; RLS also caps it in
-- answers_insert_verified_only). This also protects service-role inserts.
-- ---------------------------------------------------------------------------
create or replace function enforce_answer_depth() returns trigger
language plpgsql set search_path = public as $$
declare
  parent_has_parent boolean;
begin
  if new.parent_answer_id is not null then
    select (parent_answer_id is not null) into parent_has_parent
    from answers where id = new.parent_answer_id;
    if coalesce(parent_has_parent, false) then
      raise exception 'answer nesting is limited to one level (depth > 1 rejected)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_answer_depth
  before insert on answers
  for each row execute function enforce_answer_depth();

-- ---------------------------------------------------------------------------
-- votes insert / delete  ->  target upvote_count (posts or answers)
-- ---------------------------------------------------------------------------
create or replace function maintain_vote_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.target_type = 'post' then
      update posts   set upvote_count = upvote_count + 1 where id = new.target_id;
    elsif new.target_type = 'answer' then
      update answers set upvote_count = upvote_count + 1 where id = new.target_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.target_type = 'post' then
      update posts   set upvote_count = greatest(upvote_count - 1, 0) where id = old.target_id;
    elsif old.target_type = 'answer' then
      update answers set upvote_count = greatest(upvote_count - 1, 0) where id = old.target_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_maintain_vote_counts
  after insert or delete on votes
  for each row execute function maintain_vote_counts();

-- ---------------------------------------------------------------------------
-- experience_data insert  ->  university_data_points rows (carry contributor tier)
-- The post author's tier is carried through so only green/gold data ends up
-- counting toward confidence.
-- ---------------------------------------------------------------------------
create or replace function explode_experience_data() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ctier verification_tier;
begin
  -- contributor tier = the experience post author's tier
  select pr.tier into ctier
  from posts p join profiles pr on pr.id = p.author_id
  where p.id = new.post_id;

  if new.total_paid_npr is not null then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'total_cost_npr', new.total_paid_npr, new.post_id, ctier);
  end if;

  if new.monthly_living_aud is not null then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'monthly_living_aud', new.monthly_living_aud, new.post_id, ctier);
  end if;

  if new.parttime_hourly_aud is not null then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'hourly_aud', new.parttime_hourly_aud, new.post_id, ctier);
  end if;

  if new.visa_outcome = 'approved' then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'visa_approved', 1, new.post_id, ctier);
  elsif new.visa_outcome = 'refused' then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'visa_refused', 1, new.post_id, ctier);
  end if;

  if new.would_choose_again in ('yes','no') then
    insert into university_data_points (university_id, metric, value, source_post_id, contributor_tier)
    values (new.university_id, 'choose_again', case when new.would_choose_again = 'yes' then 1 else 0 end, new.post_id, ctier);
  end if;

  return null;
end;
$$;

create trigger trg_explode_experience_data
  after insert on experience_data
  for each row execute function explode_experience_data();

-- ---------------------------------------------------------------------------
-- university_data_points insert  ->  recompute universities.data_confidence
-- Only green/gold contributions count. Tiers: 0 none / 1-4 low / 5-19 medium / 20+ high
-- ---------------------------------------------------------------------------
create or replace function recompute_data_confidence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  c confidence;
begin
  select count(*) into n
  from university_data_points
  where university_id = new.university_id
    and contributor_tier in ('green','gold');

  c := case
         when n >= 20 then 'high'
         when n >= 5  then 'medium'
         when n >= 1  then 'low'
         else 'none'
       end::confidence;

  update universities set data_confidence = c where id = new.university_id;
  return null;
end;
$$;

create trigger trg_recompute_data_confidence
  after insert on university_data_points
  for each row execute function recompute_data_confidence();
