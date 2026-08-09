-- 0006 — search RPCs for the hybrid `search` Edge Function.
--
-- PostgREST cannot express ts_rank(...) or the pgvector <=> operator directly,
-- so the Edge Function calls these two functions (docs/03 §Search). Without
-- them search degrades to lexical-only via the function's documented fallback;
-- with them it runs the full hybrid FTS + vector ranking.

-- Lexical: true ts_rank over the generated tsvector. `config` is 'english' for
-- Latin queries and 'simple' for Devanagari (the Edge Function detects script).
create or replace function search_posts(query text, config text default 'english')
returns table (id uuid, lex_rank real)
language sql
stable
as $$
  select p.id,
         ts_rank(p.search_tsv, plainto_tsquery(config::regconfig, query)) as lex_rank
  from posts p
  where p.removed_at is null
    and p.search_tsv @@ plainto_tsquery(config::regconfig, query)
  order by lex_rank desc
  limit 50
$$;

-- Semantic: nearest neighbours by cosine distance over the 1536-dim embedding.
create or replace function match_posts(query_embedding vector(1536), k int default 50)
returns table (id uuid, distance real)
language sql
stable
as $$
  select p.id,
         (p.embedding <=> query_embedding) as distance
  from posts p
  where p.embedding is not null
    and p.removed_at is null
  order by p.embedding <=> query_embedding
  limit k
$$;
