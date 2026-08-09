import { describe, it, expect } from 'vitest';
import { rankSearch, tierWeight, isDevanagari } from './search';
import type { FeedPost, AuthorSummary, VerificationTier } from '@/types/domain';

/*
 * Guards the search rule (docs/03, docs/07): verified content always outranks
 * unverified — a gold alum's 2023 post beats a grey user's post from yesterday
 * for the same query.
 */
const author = (tier: VerificationTier): AuthorSummary => ({
  id: tier, handle: tier, display_name: tier, tier, city: null, university: null, grad_year: null,
});

function post(over: Partial<FeedPost>): FeedPost {
  return {
    id: Math.random().toString(36).slice(2),
    author_id: 't', kind: 'question', stage: 'visa', city_id: null,
    title: 'gap year visa', body: 'question about gap year and visa',
    is_anonymous: false, shortlist_run_id: null, answer_count: 0,
    verified_answer_count: 0, upvote_count: 0, is_pinned: false, removed_at: null,
    created_at: new Date().toISOString(), author: author('grey'),
    city_name: null, university_tags: [], country_tags: ['AU'],
    ...over,
  };
}

describe('tierWeight', () => {
  it('orders gold > green > grey', () => {
    expect(tierWeight('gold')).toBeGreaterThan(tierWeight('green'));
    expect(tierWeight('green')).toBeGreaterThan(tierWeight('grey'));
  });
});

describe('rankSearch', () => {
  it('ranks a gold-authored 2023 post above a grey post from yesterday', () => {
    const gold = post({ id: 'gold', author: author('gold'), created_at: '2023-01-01T00:00:00Z' });
    const grey = post({ id: 'grey', author: author('grey'), created_at: new Date(Date.now() - 86_400_000).toISOString() });
    const ranked = rankSearch([grey, gold], 'gap year visa');
    expect(ranked[0].id).toBe('gold');
  });

  it('verifiedOnly filter drops grey/agent authors', () => {
    const gold = post({ id: 'gold', author: author('gold') });
    const grey = post({ id: 'grey', author: author('grey') });
    const ranked = rankSearch([gold, grey], 'gap year visa', { verifiedOnly: true });
    expect(ranked.map((p) => p.id)).toEqual(['gold']);
  });

  it('excludes posts that do not match the query', () => {
    const match = post({ id: 'm', title: 'gap year visa' });
    const noMatch = post({ id: 'n', title: 'cheapest cookery course', body: 'unrelated' });
    const ranked = rankSearch([match, noMatch], 'gap year visa');
    expect(ranked.map((p) => p.id)).toEqual(['m']);
  });
});

describe('isDevanagari', () => {
  it('detects Devanagari script', () => {
    expect(isDevanagari('भिसा')).toBe(true);
    expect(isDevanagari('visa gap year')).toBe(false);
  });
});
