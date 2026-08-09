import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SearchFilters, SearchResponse, AISummary } from '@/types/domain';
import { rankSearch } from '@/lib/search';
import { posts as demoPosts } from './mockCommunity';

/*
 * Search access. Production posts to the `search` Edge Function (hybrid FTS +
 * vector, RRF, tier weighting, Haiku summary with citations, 24h cache). Demo
 * ranks the in-memory posts and returns a clearly-labeled NON-AI summary
 * (generated:false) drawn only from the results — no fabricated claims.
 */
export async function searchPosts(
  query: string,
  filters: SearchFilters = {},
  lang: 'ne' | 'en' = 'en',
): Promise<SearchResponse> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.functions.invoke('search', {
      body: { query, filters, lang },
    });
    if (error) throw error;
    return data as SearchResponse;
  }

  const results = rankSearch(demoPosts, query, filters);
  const summary = buildDemoSummary(query, results);
  return { summary, results };
}

/*
 * A demo, non-AI summary. It only points at the results below — it invents
 * nothing. `generated: false` so the UI labels it as not AI-generated.
 */
function buildDemoSummary(query: string, results: ReturnType<typeof rankSearch>): AISummary | null {
  if (!query.trim() || results.length === 0) return null;
  const verified = results.filter((p) => p.author.tier === 'green' || p.author.tier === 'gold');
  const top = (verified.length ? verified : results).slice(0, 3);
  if (top.length === 0) return null;
  return {
    text:
      verified.length > 0
        ? `Verified students have discussed this. The threads below are the real answers — read them.`
        : `Nobody verified has answered this yet. The closest threads are below; consider asking it yourself.`,
    sources: top.map((p) => ({ postId: p.id, title: p.title })),
    generated: false,
  };
}
