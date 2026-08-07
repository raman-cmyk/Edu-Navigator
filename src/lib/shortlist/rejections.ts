/*
 * Rejections — "the marketing" (docs/06 §9).
 *
 * Select 3-5 universities that PASS the hard filters (so we would genuinely
 * earn from them) but score poorly. Prefer high-commission ones — the point
 * lands harder. Every rejection carries a concrete numeric reason AND states
 * the commission being forgone. That honesty is the whole product.
 */

import type { RejectionResult, VisaBand, PrPathway } from '../../types/domain';
import { formatNPR, formatAUD } from '../format';

/** Assume ~12% of gross graduate salary can service the loan each year. */
const REPAYMENT_FRACTION = 0.12;
/** A course scoring at/above this is a "match", not a rejection candidate. */
const POOR_FIT_MAX = 65;
const COST_OVER_BUDGET = 1.3;
const CHOOSE_AGAIN_MIN_SAMPLE = 3;
const CHOOSE_AGAIN_BAD_RATIO = 0.3;
const MIN_REJECTIONS = 3;
const MAX_REJECTIONS = 5;

export interface RejectionCandidate {
  university_id: string;
  university_name: string;
  course_id: string;
  course_name: string;
  fit_score: number;
  commission_aud: number;
  commission_npr: number;
  budget_npr: number;
  cost_total_npr: number | null;
  visa_band: VisaBand;
  pr_pathway: PrPathway;
  median_grad_salary_aud: number | null;
  would_choose_again_no: number;
  would_choose_again_total: number;
  fx_rate: number;
}

/** The commission clause appended to every rejection reason. */
function commissionClause(commission_aud: number): string {
  return `We'd earn ${formatAUD(commission_aud)} if you enrolled — skip it anyway.`;
}

/**
 * Build a concrete numeric reason for one candidate, or null if none applies.
 * Trigger priority follows the docs/06 §9 table.
 */
function buildReason(c: RejectionCandidate): string | null {
  // 1. Cost > 1.3× budget → loan repayment years from median grad salary.
  if (
    c.cost_total_npr !== null &&
    c.cost_total_npr > c.budget_npr * COST_OVER_BUDGET &&
    c.median_grad_salary_aud !== null &&
    c.median_grad_salary_aud > 0
  ) {
    const salaryNpr = c.median_grad_salary_aud * c.fx_rate;
    const years = Math.round(c.cost_total_npr / (salaryNpr * REPAYMENT_FRACTION));
    return (
      `${formatNPR(c.cost_total_npr)} total, average graduate earns ${formatAUD(c.median_grad_salary_aud)}, ` +
      `loan repayment runs ${years} years. ${commissionClause(c.commission_aud)}`
    );
  }

  // 2. Poor would-choose-again ratio.
  if (
    c.would_choose_again_total >= CHOOSE_AGAIN_MIN_SAMPLE &&
    c.would_choose_again_no / c.would_choose_again_total >= CHOOSE_AGAIN_BAD_RATIO
  ) {
    return (
      `Of ${c.would_choose_again_total} verified Nepali graduates, ${c.would_choose_again_no} said they ` +
      `wouldn't choose it again. ${commissionClause(c.commission_aud)}`
    );
  }

  // 3. PR = No.
  if (c.pr_pathway === 'No') {
    return (
      `This course doesn't lead to PR. ${formatNPR(c.cost_total_npr)} total for a degree that stops at ` +
      `graduation. ${commissionClause(c.commission_aud)}`
    );
  }

  // 4. Visa odds Low → the specific profile mismatch.
  if (c.visa_band === 'Low') {
    return (
      `Visa odds are Low for your profile here, so the money is at real risk. ` +
      `${commissionClause(c.commission_aud)}`
    );
  }

  return null;
}

/**
 * Choose 3-5 rejections from candidates that passed hard filters but scored
 * poorly, preferring high commission. Returns [] if none qualify.
 */
export function selectRejections(candidates: RejectionCandidate[]): RejectionResult[] {
  const eligible = candidates
    .filter((c) => c.fit_score <= POOR_FIT_MAX)
    // Prefer high commission — the forgone-earnings point lands harder.
    .sort((a, b) => b.commission_aud - a.commission_aud);

  const out: RejectionResult[] = [];
  for (const c of eligible) {
    if (out.length >= MAX_REJECTIONS) break;
    const reason = buildReason(c);
    if (!reason) continue;
    out.push({
      university_id: c.university_id,
      university_name: c.university_name,
      course_name: c.course_name,
      commission_aud: c.commission_aud,
      commission_npr: c.commission_npr,
      reason,
    });
  }

  // Fewer than the minimum is acceptable — we never invent a rejection.
  return out.length >= MIN_REJECTIONS ? out.slice(0, MAX_REJECTIONS) : out;
}
