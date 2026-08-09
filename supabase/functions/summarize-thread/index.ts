/*
 * Supabase Edge Function: summarize-thread
 *
 * Collapsible late-arrival summary for busy threads (docs/07 § 3).
 *
 * POST { post_id }
 *
 * Loads the post and its VERIFIED answers (green/gold authors only — unverified
 * comments never enter the summary). Only threads with more than 15 answers are
 * summarized; at or below 15 the summary is null and the answers speak for
 * themselves. Claude Haiku separates agreement from disagreement, attributes by
 * answer number [n], does not resolve disagreements, and generates in the
 * post author's language.
 *
 * The two universal post-checks apply (banned words → retry once → omit).
 * AI is never load-bearing: if Claude is down/unconfigured the summary is null
 * and the thread still renders its answers.
 *
 * Cache: keyed on post_id + answer_count, but bucketed so it regenerates only
 * about every 10 new answers (not on every single insert). In-memory per
 * instance; PRODUCTION should use a durable store (Deno KV / a cache table) so
 * the cache survives across the ephemeral edge instances.
 *
 * Secrets (CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) come from
 * Deno.env only.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  CORS_HEADERS,
  generateCheckedSummary,
  hashKey,
  json,
  TtlCache,
} from '../_shared/mod.ts';

const MIN_ANSWERS = 15; // docs/07: summarize only when a thread passes 15 answers
const REGEN_EVERY = 10; // regenerate roughly every 10 new answers
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ANSWERS_TO_MODEL = 40; // cap payload size for the model

interface CachedSummary {
  text: string;
  sources: { n: number; answerId: string }[];
}
const threadCache = new TtlCache<CachedSummary>(CACHE_TTL_MS);

// docs/07 § 3 system prompt (verbatim intent).
const THREAD_SUMMARY_SYSTEM = [
  'Summarize this discussion for someone arriving late.',
  '',
  'Rules:',
  '- Separate what verified students agree on from what they disagree on.',
  '- Attribute by answer number: [3], [7].',
  '- Do not resolve disagreements. Present both.',
  '- Do not include unverified comments.',
  '- 3-5 sentences.',
  '- Never promise or predict a visa outcome.',
].join('\n');

function langInstruction(lang?: string): string {
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
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'server_misconfigured' }, 500);

  // ---- Validate input ----
  let postId: string;
  try {
    const body = await req.json();
    postId = typeof body?.post_id === 'string' ? body.post_id.trim() : '';
    if (!postId) return json({ error: 'invalid_input', message: 'post_id required' }, 400);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load the post + its author's language.
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .select('id, title, body, answer_count, removed_at, author:profiles(lang)')
      .eq('id', postId)
      .single();
    if (postErr || !post) return json({ error: 'not_found' }, 404);
    if (post.removed_at) return json({ error: 'not_found' }, 404);

    // Gate on total answer count (docs/07 § 3).
    const answerCount = post.answer_count ?? 0;
    if (answerCount <= MIN_ANSWERS) {
      return json({ summary: null });
    }

    // AI unconfigured → degrade to null; thread still renders answers.
    if (!CLAUDE_API_KEY) return json({ summary: null });

    const lang = (post as any).author?.lang ?? 'ne';

    // Cache key: bucket the count so we regenerate only every ~REGEN_EVERY
    // answers rather than on every insert.
    const bucket = Math.floor(answerCount / REGEN_EVERY);
    const cacheKey = hashKey([postId, bucket]);
    const cached = threadCache.get(cacheKey);
    if (cached) {
      return json({ summary: { text: cached.text, sources: cached.sources, generated: true } });
    }

    // Load VERIFIED answers only (green/gold), oldest first, and number them
    // so the model's [n] attributions line up with the sources map.
    const { data: answerRows, error: ansErr } = await supabase
      .from('answers')
      .select('id, body, created_at, author:profiles(tier)')
      .eq('post_id', postId)
      .is('removed_at', null)
      .order('created_at', { ascending: true })
      .limit(500);
    if (ansErr) {
      console.error('[summarize-thread] answers fetch failed:', ansErr.message);
      return json({ error: 'load_failed' }, 503);
    }

    const verified = (answerRows ?? [])
      .filter((a: any) => ['green', 'gold'].includes(a.author?.tier ?? ''))
      .slice(0, MAX_ANSWERS_TO_MODEL);

    // Not enough verified material to summarize meaningfully → null.
    if (verified.length < 2) return json({ summary: null });

    const numbered = verified.map((a: any, i: number) => ({ n: i + 1, id: a.id, body: (a.body ?? '').slice(0, 500) }));
    const payload = {
      title: post.title,
      answers: numbered.map(({ n, body }) => ({ n, body })),
    };

    const text = await generateCheckedSummary(
      CLAUDE_API_KEY,
      THREAD_SUMMARY_SYSTEM + langInstruction(lang),
      JSON.stringify(payload)
    );
    if (!text) return json({ summary: null }); // Claude down or unchecked → omit

    const sources = numbered.map(({ n, id }) => ({ n, answerId: id }));
    threadCache.set(cacheKey, { text, sources });

    return json({ summary: { text, sources, generated: true } });
  } catch (err) {
    console.error('[summarize-thread] unexpected error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'internal_error' }, 500);
  }
});
