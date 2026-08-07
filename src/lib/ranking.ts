import type { FeedPost, JourneyStage, VerificationTier } from '@/types/domain';
import { hoursSince } from './format';

/*
 * Feed ranking. Mirrors the formula in docs/03-architecture.md. In production
 * this runs server-side in a Postgres function for consistency; this module is
 * the single, testable source of truth the client and any server port share.
 *
 * An unanswered question is a bug in this product — it gets the largest single
 * boost. The feed's main job is routing unanswered questions to people who can
 * answer them.
 */

const TIER_WEIGHT: Record<VerificationTier, number> = {
  gold: 1.0,
  green: 0.7,
  grey: 0.2,
  agent: 0.0,
};

export interface Viewer {
  stage?: JourneyStage | null;
  country?: string | null;
}

export function scorePost(post: FeedPost, viewer: Viewer, now = Date.now()): number {
  const ageHours = hoursSince(post.created_at, now);
  const isUnanswered = post.verified_answer_count === 0;

  const unansweredBoost = isUnanswered && ageHours < 24 ? 3.0 : 0;
  const recency = Math.exp(-ageHours / 36) * 1.0;
  // We only track total upvotes client-side; treat them as the verified proxy.
  const engagement = Math.log(1 + post.upvote_count) * 0.5;
  const stageMatch = viewer.stage && post.stage === viewer.stage ? 0.8 : 0;
  const countryMatch =
    viewer.country && post.country_tags.includes(viewer.country) ? 0.4 : 0;
  const authorTier = TIER_WEIGHT[post.author.tier] * 0.3;

  return unansweredBoost + recency + engagement + stageMatch + countryMatch + authorTier;
}

/** Rank for the home feed: score descending, pinned first. */
export function rankFeed(posts: FeedPost[], viewer: Viewer, now = Date.now()): FeedPost[] {
  return [...posts].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return scorePost(b, viewer, now) - scorePost(a, viewer, now);
  });
}

/** Room sorts (docs/05 §stage room): Hot / New / Unanswered. */
export function sortRoom(
  posts: FeedPost[],
  sort: 'hot' | 'new' | 'unanswered',
  viewer: Viewer,
  now = Date.now(),
): FeedPost[] {
  const pinnedFirst = (a: FeedPost, b: FeedPost, cmp: number) =>
    a.is_pinned !== b.is_pinned ? (a.is_pinned ? -1 : 1) : cmp;

  if (sort === 'new') {
    return [...posts].sort((a, b) =>
      pinnedFirst(a, b, new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    );
  }
  if (sort === 'unanswered') {
    return [...posts]
      .filter((p) => p.verified_answer_count === 0)
      .sort((a, b) =>
        pinnedFirst(a, b, new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
  }
  // hot
  return [...posts].sort((a, b) => pinnedFirst(a, b, scorePost(b, viewer, now) - scorePost(a, viewer, now)));
}
