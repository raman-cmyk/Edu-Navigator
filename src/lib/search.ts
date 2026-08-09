import type { FeedPost, SearchFilters, VerificationTier } from '@/types/domain';

/*
 * Client-side search ranking (demo) + shared helpers.
 *
 * Production search is hybrid FTS + pgvector with reciprocal rank fusion in the
 * `search` Edge Function (docs/03). This module is a faithful demo approximation
 * — lexical overlap × tier weight — that preserves the load-bearing rule:
 * verified content always outranks unverified, and a gold alum's older post
 * beats a grey user's newer one.
 */

const TIER_WEIGHT: Record<VerificationTier, number> = {
  gold: 1.5,
  green: 1.3,
  grey: 1.0,
  agent: 0.5,
};

/** Devanagari detection by Unicode range — drives FTS config choice in prod. */
export function isDevanagari(q: string): boolean {
  return /[ऀ-ॿ]/.test(q);
}

export function tierWeight(tier: VerificationTier): number {
  return TIER_WEIGHT[tier];
}

function terms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
}

function lexicalScore(text: string, ts: string[]): number {
  const hay = text.toLowerCase();
  return ts.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
}

function passesFilters(p: FeedPost, f: SearchFilters): boolean {
  if (f.verifiedOnly && !(p.author.tier === 'green' || p.author.tier === 'gold')) return false;
  if (f.stage && p.stage !== f.stage) return false;
  if (f.tier && p.author.tier !== f.tier) return false;
  if (f.city && p.city_id !== f.city) return false;
  if (f.country && !p.country_tags.includes(f.country)) return false;
  if (f.university && !p.university_tags.includes(f.university)) return false;
  if (f.since && new Date(p.created_at).getTime() < new Date(f.since).getTime()) return false;
  return true;
}

export function rankSearch(posts: FeedPost[], query: string, filters: SearchFilters = {}): FeedPost[] {
  const ts = terms(query);
  return posts
    .filter((p) => passesFilters(p, filters))
    .map((p) => {
      const lex = lexicalScore(`${p.title} ${p.body ?? ''}`, ts);
      // Unmatched posts (lex 0) only survive when the query is empty (browse).
      const base = ts.length === 0 ? 1 : lex;
      return { p, score: base * tierWeight(p.author.tier) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
