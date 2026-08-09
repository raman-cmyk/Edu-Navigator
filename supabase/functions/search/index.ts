/*
 * Supabase Edge Function: search
 *
 * Hybrid FTS + pgvector search with an optional AI summary
 * (docs/03 § Search implementation, docs/07 § 2 Search summary).
 *
 * POST { query, filters?, lang? }
 *
 * Pipeline:
 *   1. Detect script. Devanagari (U+0900–U+097F) → `simple` FTS config +
 *      heavier vector weight; else `english`.
 *   2. Lexical: ts_rank over posts.search_tsv (removed_at is null).
 *   3. Semantic: embed the query, order by embedding <=> $vec (cosine).
 *   4. Merge with Reciprocal Rank Fusion (k=60), apply the per-script list
 *      weights, then multiply by author tier weight (gold 1.5 / green 1.3 /
 *      grey 1.0). A gold alum's older answer outranks a grey user's newer one.
 *   5. Apply filters post-merge.
 *   6. Summarize the top ~8 threads with Claude Haiku, post-checked; cite [n].
 *   7. 24h cache keyed by hash(query + top_thread_ids).
 *
 * AI is never load-bearing: if Claude is down/unconfigured the summary is null
 * and the ranked results still return. If the embeddings provider is down, the
 * search degrades to lexical-only.
 *
 * RPC-vs-fallback assumption
 * --------------------------
 * PostgREST cannot express `ts_rank(...)` or the `<=>` operator directly, so we
 * PREFER two Postgres functions (to be added in a later migration — this layer
 * does NOT own migrations):
 *
 *   search_posts(query text, config text) returns table(id uuid, lex_rank real)
 *       -- select id, ts_rank(search_tsv, plainto_tsquery(config, query)) ...
 *       -- from posts where search_tsv @@ plainto_tsquery(config, query)
 *       --   and removed_at is null order by lex_rank desc limit 50
 *
 *   match_posts(query_embedding vector, k int) returns table(id uuid, distance real)
 *       -- select id, embedding <=> query_embedding from posts
 *       -- where embedding is not null and removed_at is null
 *       -- order by embedding <=> query_embedding limit k
 *
 * If either RPC is absent we fall back:
 *   - lexical  → supabase-js `.textSearch(..., { type: 'plain', config })`,
 *                ranked ORDINALLY by created_at desc (no true ts_rank score).
 *   - semantic → skipped entirely (PostgREST can't order by `<=>`), so search
 *                is lexical-only until match_posts exists. Logged, not fatal.
 *
 * Secrets (CLAUDE_API_KEY, EMBEDDINGS_API_KEY, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY) come from Deno.env only.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CORS_HEADERS,
  embedText,
  generateCheckedSummary,
  hasDevanagari,
  hashKey,
  json,
  reciprocalRankFusion,
  tierWeight,
  toPgVector,
  TtlCache,
} from '../_shared/mod.ts';

const CANDIDATE_LIMIT = 50; // per-branch candidate cap
const RESULTS_LIMIT = 20; // rows returned to the client
const SUMMARY_THREADS = 8; // top threads fed to the summary model
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // docs/07 § 2

// Per-script fusion weights. English: balanced. Devanagari: lean on vectors,
// because the `english` tsvector config mangles Devanagari and even `simple`
// FTS is weaker for it — embeddings handle Nepali reasonably (docs/03).
const WEIGHTS = {
  english: { lex: 1.0, vec: 1.0 },
  devanagari: { lex: 0.6, vec: 1.4 },
};

// Best-effort per-instance cache. PRODUCTION: move to a durable store
// (Deno KV / an ai_summary_cache table) so the 24h TTL holds across the
// ephemeral, horizontally-scaled edge instances. See _shared TtlCache note.
interface CachedSummary {
  text: string;
  sources: { postId: string; title: string }[];
}
const summaryCache = new TtlCache<CachedSummary>(CACHE_TTL_MS);

// docs/07 § 2 system prompt (verbatim intent).
const SEARCH_SUMMARY_SYSTEM = [
  'Summarize what verified Nepali students have said about this question.',
  '',
  'Rules:',
  '- Only use the provided threads. Add nothing from your own knowledge.',
  '- Cite by thread number: [1], [2]. Every claim needs a citation.',
  '- Where verified students disagree, say so. Do not pick a side.',
  "- If the threads don't actually answer the question, say that plainly and suggest the student ask it.",
  '- 2-4 sentences. Plain language.',
  '- Never promise or predict a visa outcome.',
].join('\n');

interface Filters {
  stage?: string;
  country?: string;
  university?: string; // university_id
  city?: string; // city_id
  tier?: string;
  verifiedOnly?: boolean;
  since?: string; // ISO date/time
}

function langInstruction(lang?: string): string {
  // docs/07: generate in the user's lang; for `ne` write directly in Nepali.
  return lang === 'ne'
    ? '\n\nWrite the summary in Nepali (Devanagari). Generate directly in Nepali; do not write English first.'
    : '\n\nWrite the summary in English.';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');
  const EMBEDDINGS_API_KEY = Deno.env.get('EMBEDDINGS_API_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'server_misconfigured' }, 500);

  // ---- Validate input ----
  let query: string;
  let filters: Filters;
  let lang: string | undefined;
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
    filters = (body?.filters ?? {}) as Filters;
    lang = typeof body?.lang === 'string' ? body.lang : undefined;
    if (!query || query.length > 500) {
      return json({ error: 'invalid_input', message: 'query must be 1-500 chars' }, 400);
    }
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const devanagari = hasDevanagari(query);
  const ftsConfig = devanagari ? 'simple' : 'english';
  const weights = devanagari ? WEIGHTS.devanagari : WEIGHTS.english;

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---- 2. Lexical branch ----
    let lexIds: string[] = [];
    const lexRpc = await supabase.rpc('search_posts', { query, config: ftsConfig });
    if (!lexRpc.error && Array.isArray(lexRpc.data)) {
      lexIds = lexRpc.data.map((r: any) => r.id as string);
    } else {
      // Fallback: PostgREST full-text match, ordinal rank by recency.
      // (No true ts_rank score until search_posts() exists.)
      const lexFallback = await supabase
        .from('posts')
        .select('id')
        .is('removed_at', null)
        .textSearch('search_tsv', query, { type: 'plain', config: ftsConfig })
        .order('created_at', { ascending: false })
        .limit(CANDIDATE_LIMIT);
      if (lexFallback.error) {
        console.error('[search] lexical fallback failed:', lexFallback.error.message);
      } else {
        lexIds = (lexFallback.data ?? []).map((r: any) => r.id as string);
      }
    }

    // ---- 3. Semantic branch ----
    let vecIds: string[] = [];
    if (EMBEDDINGS_API_KEY) {
      const qVec = await embedText(EMBEDDINGS_API_KEY, query);
      if (qVec) {
        const vecRpc = await supabase.rpc('match_posts', {
          query_embedding: toPgVector(qVec),
          k: CANDIDATE_LIMIT,
        });
        if (!vecRpc.error && Array.isArray(vecRpc.data)) {
          vecIds = vecRpc.data.map((r: any) => r.id as string);
        } else {
          // No PostgREST expression for `<=>`; semantic is skipped until
          // match_posts() exists. Search degrades to lexical-only.
          console.warn('[search] match_posts RPC unavailable; lexical-only this request');
        }
      }
    }

    if (lexIds.length === 0 && vecIds.length === 0) {
      return json({ summary: null, results: [] });
    }

    // ---- 4. Reciprocal Rank Fusion + tier weighting ----
    const lexScores = reciprocalRankFusion([lexIds]);
    const vecScores = reciprocalRankFusion([vecIds]);
    const candidateIds = new Set<string>([...lexIds, ...vecIds]);

    // Fetch candidate rows with author tier/handle/display_name.
    const { data: rows, error: rowsErr } = await supabase
      .from('posts')
      .select(
        'id, title, body, stage, city_id, created_at, author_id, verified_answer_count, upvote_count, author:profiles(handle, display_name, tier)'
      )
      .in('id', [...candidateIds]);
    if (rowsErr) {
      console.error('[search] candidate fetch failed:', rowsErr.message);
      return json({ error: 'search_failed' }, 503);
    }
    const rowById = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r]));

    // Tags for university/country filters.
    let tagsByPost = new Map<string, { university_id: string | null; country: string | null }[]>();
    if (filters.university || filters.country) {
      const { data: tagRows } = await supabase
        .from('post_tags')
        .select('post_id, university_id, country')
        .in('post_id', [...candidateIds]);
      tagsByPost = new Map();
      for (const t of tagRows ?? []) {
        const arr = tagsByPost.get(t.post_id) ?? [];
        arr.push({ university_id: t.university_id, country: t.country });
        tagsByPost.set(t.post_id, arr);
      }
    }

    // Fuse scores and apply the author tier multiplier.
    const scored: { id: string; score: number }[] = [];
    for (const id of candidateIds) {
      const row = rowById.get(id);
      if (!row) continue; // dropped between branch + fetch (e.g. removed)
      const fused = weights.lex * (lexScores.get(id) ?? 0) + weights.vec * (vecScores.get(id) ?? 0);
      const authorTier = row.author?.tier ?? null;
      scored.push({ id, score: fused * tierWeight(authorTier) });
    }

    // ---- 5. Apply filters post-merge ----
    const sinceTs = filters.since ? Date.parse(filters.since) : NaN;
    const filtered = scored.filter(({ id }) => {
      const row = rowById.get(id);
      if (filters.stage && row.stage !== filters.stage) return false;
      if (filters.city && row.city_id !== filters.city) return false;
      if (filters.tier && (row.author?.tier ?? null) !== filters.tier) return false;
      if (filters.verifiedOnly && !['green', 'gold'].includes(row.author?.tier ?? '')) return false;
      if (!Number.isNaN(sinceTs) && Date.parse(row.created_at) < sinceTs) return false;
      if (filters.university || filters.country) {
        const tags = tagsByPost.get(id) ?? [];
        if (filters.university && !tags.some((t) => t.university_id === filters.university)) return false;
        if (filters.country && !tags.some((t) => t.country === filters.country)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => b.score - a.score);

    const results = filtered.slice(0, RESULTS_LIMIT).map(({ id }) => {
      const row = rowById.get(id);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        stage: row.stage,
        city_id: row.city_id,
        created_at: row.created_at,
        verified_answer_count: row.verified_answer_count,
        upvote_count: row.upvote_count,
        author: {
          handle: row.author?.handle ?? null,
          display_name: row.author?.display_name ?? null,
          tier: row.author?.tier ?? 'grey',
        },
      };
    });

    // ---- 6/7. Summary (cached, post-checked, non-load-bearing) ----
    let summary: { text: string; sources: { postId: string; title: string }[]; generated: true } | null =
      null;

    const topThreads = filtered.slice(0, SUMMARY_THREADS).map(({ id }) => rowById.get(id));
    if (CLAUDE_API_KEY && topThreads.length > 0) {
      const cacheKey = hashKey([query, lang ?? 'en', ...topThreads.map((t) => t.id)]);
      const cached = summaryCache.get(cacheKey);
      if (cached) {
        summary = { text: cached.text, sources: cached.sources, generated: true };
      } else {
        // Pull verified answers for the top threads (only green/gold count).
        const topIds = topThreads.map((t) => t.id);
        const { data: answerRows } = await supabase
          .from('answers')
          .select('post_id, body, author:profiles(tier)')
          .in('post_id', topIds)
          .is('removed_at', null)
          .limit(200);
        const verifiedByPost = new Map<string, string[]>();
        for (const a of answerRows ?? []) {
          if (!['green', 'gold'].includes((a as any).author?.tier ?? '')) continue;
          const arr = verifiedByPost.get((a as any).post_id) ?? [];
          if (arr.length < 3) arr.push(((a as any).body ?? '').slice(0, 400));
          verifiedByPost.set((a as any).post_id, arr);
        }

        const sources = topThreads.map((t, i) => ({ n: i + 1, postId: t.id, title: t.title }));
        const payload = {
          question: query,
          threads: topThreads.map((t, i) => ({
            n: i + 1,
            title: t.title,
            verified_answers: verifiedByPost.get(t.id) ?? [],
          })),
        };

        const text = await generateCheckedSummary(
          CLAUDE_API_KEY,
          SEARCH_SUMMARY_SYSTEM + langInstruction(lang),
          JSON.stringify(payload)
        );
        if (text) {
          const src = sources.map((s) => ({ postId: s.postId, title: s.title }));
          summaryCache.set(cacheKey, { text, sources: src });
          summary = { text, sources: src, generated: true };
        }
      }
    }

    return json({ summary, results });
  } catch (err) {
    console.error('[search] unexpected error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'internal_error' }, 500);
  }
});
