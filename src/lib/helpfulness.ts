import type { HelpfulnessInputs } from '@/types/domain';

/*
 * Helpfulness score (docs B7 / docs/05 §profile). Computed from answers marked
 * helpful by askers, upvotes from verified users, and structured data
 * contributed — NOT raw post count. Quantity isn't the goal; being useful is.
 *
 * Weights: an asker marking an answer helpful is the strongest signal; a
 * verified upvote is a moderate one; contributing structured experience data
 * (which makes the shortlist tool real) is rewarded between the two.
 */
export const HELPFULNESS_WEIGHTS = {
  answers_marked_helpful: 5,
  structured_contributions: 3,
  verified_upvotes: 2,
} as const;

export function computeHelpfulness(inputs: HelpfulnessInputs): number {
  return Math.round(
    inputs.answers_marked_helpful * HELPFULNESS_WEIGHTS.answers_marked_helpful +
      inputs.structured_contributions * HELPFULNESS_WEIGHTS.structured_contributions +
      inputs.verified_upvotes * HELPFULNESS_WEIGHTS.verified_upvotes,
  );
}

/** Next verification tier and what unlocks it — shown on the own-profile page. */
export function nextTier(tier: string): { next: string | null; how: string } {
  switch (tier) {
    case 'grey':
      return { next: 'green', how: 'Upload an offer letter, CoE, or visa grant.' };
    case 'green':
      return { next: 'gold', how: 'Upload your degree certificate once you graduate.' };
    default:
      return { next: null, how: '' };
  }
}
