/*
 * Catalog — the data the pure shortlist engine consumes.
 *
 * The Edge Function fetches all of this (universities, courses, city costs,
 * data points, commission ledger, fx rate) and passes it in. The engine never
 * touches Supabase / fetch / Claude, so it is fully unit-testable and runs
 * identically in the Edge Function bundle.
 *
 * See docs/06-shortlist-engine.md and docs/01-data-model.md.
 */

import type { University, Course } from '../../types/domain';

/** Minimal city row the engine needs (from `cities`). */
export interface CatalogCity {
  id: string;
  slug: string;
  name: string;
}

/** One city's living-cost aggregate (from view `v_city_costs`). */
export interface CityLivingCost {
  /** Median monthly living cost in AUD, or null when there is no data. */
  median_monthly_aud: number | null;
  /** Number of verified student submissions behind the median. */
  sample_size: number;
}

/**
 * A university's aggregated experience data (from `university_data_points`).
 * Every figure carries the sample size it was derived from (trust rule 1).
 */
export interface UniversityDataPoint {
  /** Total data points across all metrics — drives data_confidence. */
  count: number;
  /** Count of `would_choose_again = 'no'` responses. */
  would_choose_again_no: number;
  /** Total `would_choose_again` responses (yes + no + unsure). */
  would_choose_again_total: number;
  /** Count of refused visa data points. */
  visa_refused: number;
  /** Total visa-outcome data points (approved + refused). */
  visa_total: number;
  /** Median reported graduate salary in AUD, or null when unknown. */
  median_grad_salary_aud: number | null;
}

/** One university's commission ledger entry (from `commission_ledger`). */
export interface LedgerEntry {
  amount_aud: number;
  rebate_pct: number | null;
}

/**
 * Everything the engine reads. Records are keyed by id so the engine does
 * lookups, never scans, and missing keys are handled explicitly (drop /
 * "Insufficient data") rather than fabricated.
 */
export interface Catalog {
  universities: University[];
  courses: Course[];
  cities: CatalogCity[];
  /** Keyed by city id — from v_city_costs. */
  cityLivingCost: Record<string, CityLivingCost>;
  /** Keyed by university id — from university_data_points. */
  dataPoints: Record<string, UniversityDataPoint>;
  /** Keyed by university id — from commission_ledger. */
  ledger: Record<string, LedgerEntry>;
  /** NPR per AUD, e.g. 88. Frozen with the result. */
  fxRate: number;
}

/** Confidence tier from a raw data-point count (docs/01 confidence gate). */
export function confidenceFromCount(count: number): 'none' | 'low' | 'medium' | 'high' {
  if (count <= 0) return 'none';
  if (count < 5) return 'low';
  if (count < 20) return 'medium';
  return 'high';
}
