/*
 * Hard filters (docs/06 §2) and fit score (docs/06 §3).
 * Pure. The fit score is a weighted sum of seven 0-100 components, normalized
 * by the (possibly reweighted) total weight so it always lands in 0-100.
 */

import type {
  ShortlistInput,
  Course,
  University,
  CostBreakdown,
  Priority,
} from '../../types/domain';

/** Why a course was dropped by the hard filters (used by rejection selection). */
export type FilterReason =
  | 'ok'
  | 'gpa'
  | 'backlogs'
  | 'ielts'
  | 'ielts_band'
  | 'no_commission'
  | 'inactive'
  | 'field';

/**
 * Hard eligibility gates. Returns 'ok' when the course passes, otherwise the
 * first failing gate. `ieltsEquiv` is null when no test was supplied — the two
 * IELTS gates are then skipped (result becomes provisional).
 */
export function hardFilter(
  input: ShortlistInput,
  course: Course,
  university: University,
  ieltsEquiv: number | null
): FilterReason {
  // Trust rule 2: if we can't state what we earn, we don't show it.
  if (university.commission_aud === null || university.commission_aud === undefined) {
    return 'no_commission';
  }
  if (university.is_active === false) return 'inactive';
  if (input.field !== 'other' && course.field !== input.field) return 'field';
  if (course.min_gpa_pct > input.score_pct) return 'gpa';
  if (course.max_backlogs < input.backlogs) return 'backlogs';
  if (ieltsEquiv !== null && course.min_ielts > ieltsEquiv) return 'ielts';
  if (
    input.english_min_band !== undefined &&
    course.min_ielts_band > input.english_min_band
  ) {
    return 'ielts_band';
  }
  return 'ok';
}

// ---- Fit components ----

interface Component {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Community score: scaled Nepali-student estimate, capped at 100. */
function communityScore(estimate: number | null | undefined): number {
  if (!estimate || estimate <= 0) return 0;
  // ~1,000 students → full marks. Cap so a mega-campus doesn't dominate.
  return clamp(estimate / 10, 0, 100);
}

/** Budget fit: 100 at/under budget, linear to 0 at 1.4× budget. */
function budgetScore(input: ShortlistInput, cost: CostBreakdown): number {
  if (cost.total_npr === null) return 50; // unknown cost → neutral, result flagged
  const total = cost.total_npr;
  const budget = input.budget_npr;
  if (total <= budget) return 100;
  const ceiling = budget * 1.4;
  if (total >= ceiling) return 0;
  return clamp((100 * (ceiling - total)) / (ceiling - budget), 0, 100);
}

/** English fit: 100 if ≥ required+0.5; 70 at exactly required; 0 below. */
function englishScore(ieltsEquiv: number | null, required: number): number {
  if (ieltsEquiv === null) return 70; // no test → provisional, treated as meeting
  if (ieltsEquiv >= required + 0.5) return 100;
  if (ieltsEquiv >= required) return 70;
  return 0;
}

/** Gap tolerance: 100 at zero gaps; −15/yr; +20 back if worked/studied. */
function gapScore(input: ShortlistInput): number {
  let s = 100 - 15 * input.gap_years;
  if (input.gap_reason === 'worked' || input.gap_reason === 'studied') s += 20;
  return clamp(s, 0, 100);
}

/** PR alignment: 100 if on-list AND regional; 60 if one; 20 if neither. */
function prAlignmentScore(course: Course, university: University): number {
  const onList = course.on_skilled_occupation_list;
  const regional = university.is_regional;
  if (onList && regional) return 100;
  if (onList || regional) return 60;
  return 20;
}

const RANKING_BONUS: Record<string, number> = { go8: 15, mid: 8, regional: 0, private: 0 };

export interface FitResult {
  fit_score: number;
  fit_reason: string;
  /** Plain label of the lowest-scoring component — the main constraint. */
  weakest: string;
}

/**
 * Compute the fit score and a one-line plain reason.
 *
 * @param ieltsEquiv IELTS-equivalent overall band, or null if no test supplied.
 */
export function scoreCourse(
  input: ShortlistInput,
  course: Course,
  university: University,
  cost: CostBreakdown,
  ieltsEquiv: number | null
): FitResult {
  const academic = clamp(50 + (input.score_pct - course.min_gpa_pct) * 3, 0, 100);
  const budget = budgetScore(input, cost);
  const english = englishScore(ieltsEquiv, course.min_ielts);
  const backlog = 100 * (1 - input.backlogs / Math.max(1, course.max_backlogs));
  const gap = gapScore(input);
  const pr = prAlignmentScore(course, university);
  const community = communityScore(university.nepali_student_estimate);

  // Base weights (sum to 100).
  const weights = {
    academic: 25,
    budget: 25,
    english: 15,
    backlog: 10,
    gap: 10,
    pr: 10,
    community: 5,
  };

  // Priority modifiers (docs/06 §3).
  applyPriorityWeights(weights, input.priority);

  const components: Component[] = [
    { key: 'academic', label: 'academic headroom', score: clamp(academic, 0, 100), weight: weights.academic },
    { key: 'budget', label: 'budget fit', score: clamp(budget, 0, 100), weight: weights.budget },
    { key: 'english', label: 'English fit', score: clamp(english, 0, 100), weight: weights.english },
    { key: 'backlog', label: 'backlog tolerance', score: clamp(backlog, 0, 100), weight: weights.backlog },
    { key: 'gap', label: 'gap tolerance', score: clamp(gap, 0, 100), weight: weights.gap },
    { key: 'pr', label: 'PR alignment', score: clamp(pr, 0, 100), weight: weights.pr },
    { key: 'community', label: 'Nepali community', score: clamp(community, 0, 100), weight: weights.community },
  ];

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  let fit = totalWeight > 0 ? weighted / totalWeight : 0;

  // Ranking priority adds a flat prestige bonus after the weighted sum.
  if (input.priority === 'ranking') {
    fit += RANKING_BONUS[university.ranking_tier] ?? 0;
  }
  // NOTE — 'fastest' would add a bonus for the nearest intake with a makeable
  // deadline, but the catalog has no intake/deadline data, so no bonus is added
  // (documented spec gap). Ranking still falls back to fit order.

  const fit_score = clamp(Math.round(fit), 0, 100);
  const weighted2 = components.filter((c) => c.weight > 0);
  const weakestComp = weighted2.reduce((a, b) => (b.score < a.score ? b : a));
  const fit_reason = buildReason(components);

  return { fit_score, fit_reason, weakest: weakestComp.label };
}

function applyPriorityWeights(
  weights: {
    academic: number;
    budget: number;
    english: number;
    backlog: number;
    gap: number;
    pr: number;
    community: number;
  },
  priority: Priority
): void {
  switch (priority) {
    case 'cheapest':
      weights.budget = 40;
      weights.academic = 15;
      break;
    case 'pr':
      weights.pr = 30;
      weights.community = 10;
      weights.budget = 15;
      break;
    case 'ranking':
    case 'fastest':
      // handled as additive bonuses / no-op weight change
      break;
  }
}

/** One-line plain reason naming the strongest driver and the main constraint. */
function buildReason(components: Component[]): string {
  const weighted = [...components].filter((c) => c.weight > 0);
  const strongest = weighted.reduce((a, b) => (b.score > a.score ? b : a));
  const weakest = weighted.reduce((a, b) => (b.score < a.score ? b : a));
  if (strongest.key === weakest.key) {
    return `Even across the board — ${strongest.label} at ${Math.round(strongest.score)}.`;
  }
  return `Strong ${strongest.label}; the main constraint is ${weakest.label}.`;
}
