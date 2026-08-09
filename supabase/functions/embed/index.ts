/*
 * Supabase Edge Function: embed
 *
 * Cron-triggered every 5 minutes (docs/03 § Edge Functions, docs/07 § Embeddings).
 * Backfills `posts.embedding` for posts where it is still null: embeds
 * `title || '\n' || body` truncated to 8000 chars via an OpenAI-compatible
 * embeddings API (text-embedding-3-small, 1536 dims — any 1536-dim provider
 * works, see EMBEDDINGS_API_URL/EMBEDDINGS_MODEL in _shared/mod.ts) and writes
 * each vector back with the service-role client.
 *
 * Runs entirely server-side. EMBEDDINGS_API_KEY, SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY come from Deno.env and NEVER the client.
 *
 * Degrades cleanly: a per-row embedding failure is skipped (it stays null and
 * is retried on the next 5-min tick); if the embeddings provider is entirely
 * unconfigured the function reports that and embeds nothing rather than erroring.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS_HEADERS, embedText, json, toPgVector } from '../_shared/mod.ts';

// How many null-embedding posts to process per invocation. Kept modest so one
// tick stays well inside the function timeout and provider rate limits; the
// backlog drains across successive 5-min ticks.
const BATCH_SIZE = 50;

// docs/07: embed title + body, truncated to 8000 chars.
const MAX_CHARS = 8000;

// Small concurrency window so a batch of 50 doesn't serialize into a timeout,
// without hammering the provider.
const CONCURRENCY = 5;

function buildInput(title: string | null, body: string | null): string {
  const combined = `${title ?? ''}\n${body ?? ''}`;
  return combined.slice(0, MAX_CHARS);
}

async function embedInPool<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    results.push(...(await Promise.all(slice.map(worker))));
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  // POST from Supabase cron scheduler; reject other verbs.
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const EMBEDDINGS_API_KEY = Deno.env.get('EMBEDDINGS_API_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'server_misconfigured' }, 500);
  }
  if (!EMBEDDINGS_API_KEY) {
    // Not an error — the feature is simply not configured. Nothing to embed.
    return json({ ok: true, embedded: 0, note: 'embeddings_unconfigured' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pull the next batch of un-embedded, live posts. Oldest first so nothing
    // starves. removed_at filter: never spend embedding budget on soft-deleted
    // posts (they never surface in search).
    const { data: posts, error: selErr } = await supabase
      .from('posts')
      .select('id, title, body')
      .is('embedding', null)
      .is('removed_at', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (selErr) {
      console.error('[embed] select failed:', selErr.message);
      return json({ error: 'select_failed' }, 503);
    }
    if (!posts || posts.length === 0) {
      return json({ ok: true, embedded: 0, note: 'nothing_to_embed' });
    }

    // Embed with a small concurrency window.
    const embedded = await embedInPool(posts, CONCURRENCY, async (post: any) => {
      const input = buildInput(post.title, post.body);
      const vec = await embedText(EMBEDDINGS_API_KEY, input);
      return { id: post.id as string, vec };
    });

    // Write successes back one row at a time (pgvector literal). Partial
    // failures are tolerated: a null vec means the provider hiccuped on that
    // row — leave embedding null so the next tick retries it.
    let updated = 0;
    let failed = 0;
    for (const { id, vec } of embedded) {
      if (!vec) {
        failed++;
        continue;
      }
      const { error: updErr } = await supabase
        .from('posts')
        .update({ embedding: toPgVector(vec) })
        .eq('id', id);
      if (updErr) {
        console.error(`[embed] update ${id} failed:`, updErr.message);
        failed++;
      } else {
        updated++;
      }
    }

    return json({
      ok: true,
      selected: posts.length,
      embedded: updated,
      failed,
      // Signal whether the caller should tick again sooner than 5 min.
      remaining_likely: posts.length === BATCH_SIZE,
    });
  } catch (err) {
    console.error('[embed] unexpected error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'internal_error' }, 500);
  }
});
