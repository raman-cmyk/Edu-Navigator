-- 0004 — Views
-- Authoritative source: docs/01-data-model.md "Views".

-- ---------------------------------------------------------------------------
-- v_unanswered_questions
-- Questions with no verified answer. Drives feed boost + reciprocity nudge.
-- ---------------------------------------------------------------------------
create or replace view v_unanswered_questions as
select *
from posts
where kind = 'question'
  and verified_answer_count = 0
  and removed_at is null
order by created_at desc;

-- ---------------------------------------------------------------------------
-- v_answer_rate  (North Star)
-- Rolling 7-day: share of questions that received a VERIFIED answer within 24h
-- of being asked. Verified answer = author tier green/gold, not removed.
-- ---------------------------------------------------------------------------
create or replace view v_answer_rate as
with recent as (
  select p.id, p.created_at
  from posts p
  where p.kind = 'question'
    and p.removed_at is null
    and p.created_at > now() - interval '7 days'
),
answered as (
  select r.id
  from recent r
  where exists (
    select 1
    from answers a
    join profiles pr on pr.id = a.author_id
    where a.post_id = r.id
      and a.removed_at is null
      and pr.tier in ('green','gold')
      and a.created_at <= r.created_at + interval '24 hours'
  )
)
select
  (select count(*) from recent)   as total_questions,
  (select count(*) from answered) as answered_within_24h,
  case
    when (select count(*) from recent) = 0 then 0
    else round((select count(*) from answered)::numeric
               / (select count(*) from recent), 4)
  end as answer_rate;

-- ---------------------------------------------------------------------------
-- v_city_costs
-- Median monthly_living_aud per city with sample size. UI renders the city
-- room panel only when sample_size >= 5. Only green/gold contributions count.
-- ---------------------------------------------------------------------------
create or replace view v_city_costs as
select
  c.id   as city_id,
  c.slug,
  c.name,
  percentile_cont(0.5) within group (order by udp.value) as median_monthly_living_aud,
  count(*) as sample_size
from cities c
join universities u on u.city_id = c.id
join university_data_points udp
  on udp.university_id = u.id
 and udp.metric = 'monthly_living_aud'
 and udp.contributor_tier in ('green','gold')
group by c.id, c.slug, c.name;

-- Views run with the definer's rights by default; underlying read policies are
-- public for these tables, so expose the views to the API roles explicitly.
grant select on v_unanswered_questions, v_answer_rate, v_city_costs to anon, authenticated;
