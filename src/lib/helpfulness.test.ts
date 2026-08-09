import { describe, it, expect } from 'vitest';
import { computeHelpfulness, nextTier } from './helpfulness';

/*
 * Helpfulness rewards being useful, not posting a lot (docs B7). A marked-helpful
 * answer must outweigh a raw upvote, and structured data contribution counts.
 */
describe('computeHelpfulness', () => {
  it('weights marked-helpful above verified upvotes', () => {
    const oneHelpful = computeHelpfulness({ answers_marked_helpful: 1, verified_upvotes: 0, structured_contributions: 0 });
    const oneUpvote = computeHelpfulness({ answers_marked_helpful: 0, verified_upvotes: 1, structured_contributions: 0 });
    expect(oneHelpful).toBeGreaterThan(oneUpvote);
  });

  it('rewards structured data contributions', () => {
    expect(computeHelpfulness({ answers_marked_helpful: 0, verified_upvotes: 0, structured_contributions: 2 })).toBe(6);
  });

  it('is zero for a member who posted a lot but helped no one', () => {
    expect(computeHelpfulness({ answers_marked_helpful: 0, verified_upvotes: 0, structured_contributions: 0 })).toBe(0);
  });
});

describe('nextTier', () => {
  it('points grey at green and green at gold', () => {
    expect(nextTier('grey').next).toBe('green');
    expect(nextTier('green').next).toBe('gold');
    expect(nextTier('gold').next).toBeNull();
  });
});
