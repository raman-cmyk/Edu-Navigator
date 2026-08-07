import { describe, it, expect } from 'vitest';
import { rankFeed, sortRoom, scorePost } from './ranking';
import type { FeedPost, AuthorSummary, JourneyStage } from '@/types/domain';

/*
 * Guards the feed's core behavior (docs/03, docs/08 T3.1): an unanswered
 * question under 24h must outrank a highly-upvoted answered one. An unanswered
 * question is a bug — the feed exists to route it to answerers.
 */
const NOW = new Date('2026-08-07T12:00:00Z').getTime();
const author = (tier: AuthorSummary['tier']): AuthorSummary => ({
  id: 't', handle: 't', display_name: 'T', tier, city: null, university: null, grad_year: null,
});

function post(over: Partial<FeedPost>): FeedPost {
  return {
    id: Math.random().toString(36).slice(2),
    author_id: 't',
    kind: 'question',
    stage: 'visa',
    city_id: null,
    title: 't',
    body: null,
    is_anonymous: false,
    shortlist_run_id: null,
    answer_count: 0,
    verified_answer_count: 0,
    upvote_count: 0,
    is_pinned: false,
    removed_at: null,
    created_at: new Date(NOW - 3 * 3_600_000).toISOString(),
    author: author('green'),
    city_name: null,
    university_tags: [],
    country_tags: [],
    ...over,
  };
}

describe('rankFeed', () => {
  it('ranks a fresh unanswered question above a highly-upvoted answered one', () => {
    const unanswered = post({ id: 'unanswered', verified_answer_count: 0, upvote_count: 1, created_at: new Date(NOW - 2 * 3_600_000).toISOString() });
    const answered = post({ id: 'answered', verified_answer_count: 5, upvote_count: 200, created_at: new Date(NOW - 2 * 3_600_000).toISOString() });
    const ranked = rankFeed([answered, unanswered], { stage: 'visa', country: 'AU' }, NOW);
    expect(ranked[0].id).toBe('unanswered');
  });

  it('does not boost an unanswered question older than 24h', () => {
    const old = post({ verified_answer_count: 0, created_at: new Date(NOW - 30 * 3_600_000).toISOString() });
    expect(scorePost(old, {}, NOW)).toBeLessThan(3.0);
  });

  it('puts pinned posts first regardless of score', () => {
    const pinned = post({ id: 'pin', is_pinned: true, verified_answer_count: 9, created_at: new Date(NOW - 100 * 3_600_000).toISOString() });
    const hot = post({ id: 'hot', verified_answer_count: 0 });
    expect(rankFeed([hot, pinned], {}, NOW)[0].id).toBe('pin');
  });

  it('boosts posts matching the viewer stage', () => {
    const p = post({ stage: 'living' as JourneyStage });
    expect(scorePost(p, { stage: 'living' }, NOW)).toBeGreaterThan(scorePost(p, { stage: 'visa' }, NOW));
  });
});

describe('sortRoom', () => {
  const a = post({ id: 'a', verified_answer_count: 0, created_at: new Date(NOW - 1 * 3_600_000).toISOString() });
  const b = post({ id: 'b', verified_answer_count: 3, created_at: new Date(NOW - 5 * 3_600_000).toISOString() });

  it('unanswered sort shows only unanswered, newest first', () => {
    const out = sortRoom([a, b], 'unanswered', {}, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a');
  });

  it('new sort orders by recency', () => {
    expect(sortRoom([b, a], 'new', {}, NOW)[0].id).toBe('a');
  });
});
