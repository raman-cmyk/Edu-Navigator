/*
 * Visa odds — three honest bands only: High / Moderate / Low.
 * Never a percentage: we don't have the sample size to justify one, and a fake
 * precise number is worse than an honest band. See docs/06 section 5.
 *
 * Start at Moderate, apply the exact modifier table, clamp to three bands, and
 * ALWAYS return the reasons (plain sentences) — the band alone is not shippable.
 */

import type { ShortlistInput, VisaBand, CostBreakdown } from '../../types/domain';
import type { University } from '../../types/domain';
import type { UniversityDataPoint } from './catalog';

const BANDS: VisaBand[] = ['Low', 'Moderate', 'High'];
const REFUSAL_RATE_HIGH = 0.3; // >30% refusals in the data points
const REFUSAL_MIN_SAMPLE = 3; // need at least this many visa data points to act

export interface VisaAssessment {
  band: VisaBand;
  reasons: string[];
}

/**
 * @param input     the normalized applicant profile
 * @param university the university (regional flag)
 * @param cost       computed cost (for budget-coverage checks)
 * @param dataPoint  aggregated experience data (for refusal rate); may be absent
 * @param ieltsEquiv IELTS-equivalent overall band, or null if no test yet
 * @param requiredIelts the course's min IELTS (used for the +1 English signal)
 */
export function computeVisa(
  input: ShortlistInput,
  university: University,
  cost: CostBreakdown,
  dataPoint: UniversityDataPoint | undefined,
  ieltsEquiv: number | null,
  requiredIelts: number
): VisaAssessment {
  let index = 1; // Moderate
  const reasons: string[] = [];

  // −1: gap years ≥ 3 not explained by work/study
  const explained = input.gap_reason === 'worked' || input.gap_reason === 'studied';
  if (input.gap_years >= 3 && !explained) {
    index -= 1;
    reasons.push(
      `Your ${input.gap_years}-year study gap is not explained by work or study, which officers scrutinise.`
    );
  } else if (input.gap_years >= 1 && explained) {
    reasons.push(
      `Your ${input.gap_years}-year gap is explained by ${input.gap_reason}, which helps.`
    );
  }

  // −1: backlogs ≥ 5
  if (input.backlogs >= 5) {
    index -= 1;
    reasons.push(`${input.backlogs} academic backlogs weaken the academic-record test.`);
  }

  // Budget-coverage signals use the real total (skip when cost is unknown).
  if (cost.total_npr !== null && cost.total_npr > 0) {
    const coverage = input.budget_npr / cost.total_npr;
    // −1: budget < 80% of total cost
    if (coverage < 0.8) {
      index -= 1;
      reasons.push(
        `Your budget covers ${Math.round(coverage * 100)}% of total cost, below the level officers expect.`
      );
    } else if (coverage < 1) {
      reasons.push(
        `Your budget covers ${Math.round(coverage * 100)}% of total cost, which officers will question.`
      );
    }
    // −1: no collateral and budget < total
    if (!input.has_collateral && coverage < 1) {
      index -= 1;
      reasons.push('No collateral shown and budget falls short of total cost — a financial-capacity risk.');
    }
  } else {
    reasons.push('Total cost is unknown for this city, so financial capacity cannot be assessed.');
  }

  // −1: university refusal rate high in the data points
  if (dataPoint && dataPoint.visa_total >= REFUSAL_MIN_SAMPLE) {
    const rate = dataPoint.visa_refused / dataPoint.visa_total;
    if (rate > REFUSAL_RATE_HIGH) {
      index -= 1;
      reasons.push(
        `${dataPoint.visa_refused} of ${dataPoint.visa_total} verified students here were refused a visa.`
      );
    }
  }

  // +1: English ≥ required + 1.0
  if (ieltsEquiv !== null && ieltsEquiv >= requiredIelts + 1.0) {
    index += 1;
    reasons.push('Your English score is a full band above the course requirement, a strong signal.');
  }

  // +1: regional university (extra points, lower perceived overstay risk)
  if (university.is_regional) {
    index += 1;
    reasons.push('A regional university carries a lower perceived overstay risk.');
  }

  // NOTE — the modifier table also lists "prior qualification directly related"
  // (+1) and "course field unrelated to prior qualification" (−1). The current
  // ShortlistInput carries the *target* field but no prior-qualification field,
  // so relatedness cannot be determined without fabricating signal (trust rule 1).
  // These two modifiers are intentionally not applied until a prior-field input
  // exists. See report note on resolved spec ambiguity.

  const clamped = Math.max(0, Math.min(2, index));
  const band = BANDS[clamped];

  if (reasons.length === 0) {
    reasons.push('No strong positive or negative signals — a typical, moderate-risk profile.');
  }

  return { band, reasons };
}
