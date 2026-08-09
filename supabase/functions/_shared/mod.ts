/*
 * Shared helpers for the AI Edge Functions (embed / search / summarize-thread).
 *
 * Deno runtime only. Nothing here touches the browser or imports from src/.
 * Kept dependency-free so each function stays trivially deployable — Supabase's
 * esbuild bundler resolves this relative `../_shared/mod.ts` import at deploy
 * time (same mechanism the `shortlist` function already relies on for its
 * cross-folder imports).
 *
 * The three trust-relevant invariants enforced here:
 *   1. AI is never load-bearing — every helper degrades to null/[] on failure.
 *   2. No unchecked AI output ships — `postCheckText` gates every summary.
 *   3. No secret ever leaves the function — keys come from Deno.env only.
 */

// deno-lint-ignore-file no-explicit-any

// ---- CORS + JSON ----

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---- Script detection ----

/**
 * True if the string contains any Devanagari codepoint (U+0900–U+097F).
 * Drives FTS config selection (`simple` vs `english`) and vector weighting:
 * the `english` tsvector config mangles Devanagari, so Nepali queries lean
 * harder on the embedding side. See docs/03 § Search implementation.
 */
export function hasDevanagari(s: string): boolean {
  return /[ऀ-ॿ]/.test(s);
}

// ---- Reciprocal Rank Fusion ----

/**
 * Reciprocal Rank Fusion over any number of ranked id lists.
 *
 * Each list is an array of ids in descending relevance (best first, rank 1).
 * A document's fused score is the sum over lists of 1 / (k + rank), with the
 * standard k = 60 damping constant. Ids absent from a list simply contribute
 * nothing from that list. Returns a Map<id, fusedScore>.
 *
 * RRF is used because lexical ts_rank and cosine distance live on completely
 * different scales; rank position is the only comparable signal.
 */
export const RRF_K = 60;

export function reciprocalRankFusion(
  lists: string[][],
  k: number = RRF_K
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      const rank = i + 1; // 1-based
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

// ---- Tier weighting ----

/**
 * Verification-tier multiplier applied AFTER fusion (docs/03):
 *   gold 1.5 · green 1.3 · grey 1.0.
 * A gold alum's older answer outranks a grey user's newer one — always.
 * `agent` and anything unknown fall back to grey (1.0): never boosted.
 */
export function tierWeight(tier: string | null | undefined): number {
  switch (tier) {
    case 'gold':
      return 1.5;
    case 'green':
      return 1.3;
    default:
      return 1.0; // grey, agent, null, unknown
  }
}

// ---- Banned-word post-check (docs/07 § Universal rules) ----

/**
 * The banned output list. No AI response may contain any of these.
 * Multi-word phrases and the literal "100%" are matched as substrings;
 * single words are matched on word boundaries so e.g. "journeyman" or an
 * unrelated "certain" inside "certainty" is handled by the phrase form.
 */
export const BANNED_WORDS: string[] = [
  'guaranteed',
  'assured',
  '100%',
  'definitely will',
  'certain to',
  'dream',
  'unlock',
  'empower',
  'seamless',
  'journey',
];

function bannedPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-boundary wrap only where the edge char is a word char, so "100%"
  // and multi-word phrases still match cleanly.
  const left = /^\w/.test(term) ? '\\b' : '';
  const right = /\w$/.test(term) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, 'i');
}

const BANNED_PATTERNS: Array<{ term: string; re: RegExp }> = BANNED_WORDS.map((term) => ({
  term,
  re: bannedPattern(term),
}));

export interface PostCheckResult {
  ok: boolean;
  reason?: string;
  term?: string;
}

/**
 * Trust rule 3 enforced mechanically. Returns the first banned term found so
 * the caller can name it in a retry ("do not use the word X"). On the second
 * failure the caller omits the summary rather than shipping unchecked text.
 */
export function postCheckText(text: string): PostCheckResult {
  for (const { term, re } of BANNED_PATTERNS) {
    if (re.test(text)) {
      return { ok: false, reason: `banned word: ${term}`, term };
    }
  }
  return { ok: true };
}

// ---- Embeddings (OpenAI-compatible, 1536 dims) ----

/**
 * Embed a single text via an OpenAI-compatible embeddings API.
 *
 * Defaults to OpenAI's `text-embedding-3-small` (1536 dims), but ANY provider
 * that exposes an OpenAI-shaped `/embeddings` endpoint and returns 1536-dim
 * vectors works — override EMBEDDINGS_API_URL / EMBEDDINGS_MODEL in Deno.env.
 * The `posts.embedding` column is `vector(1536)`, so the dimensionality is
 * fixed by the schema, not by us.
 *
 * Returns null on any failure — the caller degrades (search still returns
 * lexical results; embed backfill skips the row and retries next cron tick).
 */
export const EMBED_DIMS = 1536;

export async function embedText(
  apiKey: string,
  text: string,
  opts?: { url?: string; model?: string }
): Promise<number[] | null> {
  const url = opts?.url ?? Deno.env.get('EMBEDDINGS_API_URL') ?? 'https://api.openai.com/v1/embeddings';
  const model = opts?.model ?? Deno.env.get('EMBEDDINGS_MODEL') ?? 'text-embedding-3-small';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: text, dimensions: EMBED_DIMS }),
    });
    if (!res.ok) {
      console.error(`[embed] provider ${res.status}`);
      return null;
    }
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
      console.error('[embed] unexpected embedding shape');
      return null;
    }
    return vec as number[];
  } catch (err) {
    console.error('[embed] request failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Serialize a JS number[] into the pgvector text literal `[a,b,c]`. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

// ---- Claude (Haiku) messages call ----

// docs/07: Haiku for the high-volume, low-complexity summary features.
export const HAIKU_MODEL = 'claude-haiku-4-5';

/**
 * Single-shot Claude Messages call. Returns the assistant text, or null on any
 * failure / missing key (AI never load-bearing). No stack traces surface to the
 * client — only a console log.
 */
export async function callClaude(
  apiKey: string,
  system: string,
  userContent: string,
  opts?: { model?: string; maxTokens?: number }
): Promise<string | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts?.model ?? HAIKU_MODEL,
        max_tokens: opts?.maxTokens ?? 512,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!res.ok) {
      console.error(`[claude] ${res.status}`);
      return null;
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return typeof text === 'string' ? text.trim() : null;
  } catch (err) {
    console.error('[claude] request failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Generate a summary with the two universal post-checks baked in (docs/07):
 * call Claude, run the banned-word check; on a hit, retry ONCE naming the
 * violated term; if the retry also fails, return null (omit the summary rather
 * than ship an unchecked one). Language is carried in the system prompt by the
 * caller — for `ne` the model generates directly in Nepali, never translates.
 */
export async function generateCheckedSummary(
  apiKey: string,
  system: string,
  userContent: string,
  opts?: { model?: string; maxTokens?: number }
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra =
      attempt === 0
        ? ''
        : '\n\nYour previous attempt was rejected. Do not use any of these banned words: ' +
          BANNED_WORDS.join(', ') +
          '. Rewrite the summary without them.';
    const candidate = await callClaude(apiKey, system + extra, userContent, opts);
    if (!candidate) return null; // Claude down/unconfigured — degrade
    const check = postCheckText(candidate);
    if (check.ok) return candidate;
    console.warn(`[summary] post-check failed (attempt ${attempt + 1}): ${check.reason}`);
  }
  return null; // both attempts failed the check — never ship unchecked
}

// ---- In-memory TTL cache ----

/**
 * A tiny in-memory Map cache with per-entry TTLs.
 *
 * PRODUCTION NOTE: edge instances are ephemeral and horizontally scaled, so
 * this cache is best-effort per instance only. A durable store (Deno KV, or a
 * `ai_summary_cache` table keyed by the same hash) is required to actually hit
 * the docs/07 24h TTL across instances. Structured so swapping the backend is
 * a localized change.
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

/** Stable, order-independent hash for cache keys (FNV-1a, hex). */
export function hashKey(parts: (string | number)[]): string {
  const input = parts.map(String).join('\u0000');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
