/*
 * Real total cost, in NPR — the number consultancies never give honestly.
 * Pure. See docs/06-shortlist-engine.md section 4.
 *
 * Living cost comes ONLY from verified student submissions (v_city_costs).
 * If a city has fewer than 5 samples we return confidence 'none' and a null
 * total_npr so the UI renders "Insufficient data" — we never substitute an
 * official university estimate (they are systematically understated; using
 * them would violate trust rule 1).
 */

import type { Course, CostBreakdown } from '../../types/domain';
import type { CityLivingCost } from './catalog';
import { confidenceFromCount } from './catalog';

const OSHC_ANNUAL_AUD = 650; // Subclass 500 health cover, approx, flagged estimate
const VISA_FEE_AUD = 1600; // Subclass 500 application charge
const FLIGHTS_AUD = 900; // one way + one return
const FOREX_SPREAD = 0.025; // realistic bank spread on the FX conversion
const MIN_CITY_SAMPLES = 5;

/**
 * Compute the honest total cost for a course.
 *
 * @param course    the course (tuition, duration)
 * @param cityCost  the living-cost aggregate for the university's city
 * @param fxRate    NPR per AUD, frozen with the result
 */
export function computeCost(
  course: Course,
  cityCost: CityLivingCost | undefined,
  fxRate: number
): CostBreakdown {
  const years = course.duration_months / 12;

  const tuition_aud = course.annual_tuition_aud * years;
  const oshc_aud = OSHC_ANNUAL_AUD * years;
  const visa_aud = VISA_FEE_AUD;
  const flights_aud = FLIGHTS_AUD;

  const sample_size = cityCost?.sample_size ?? 0;
  const median = cityCost?.median_monthly_aud ?? null;
  const hasLiving = median !== null && sample_size >= MIN_CITY_SAMPLES;

  const living_aud = hasLiving ? median * course.duration_months : 0;

  const total_aud = tuition_aud + living_aud + oshc_aud + visa_aud + flights_aud;
  const forex_loss_aud = total_aud * FOREX_SPREAD;

  // Without verified living data the total is not a real number — say so.
  const total_npr = hasLiving ? total_aud * fxRate * (1 + FOREX_SPREAD) : null;

  return {
    tuition_aud,
    living_aud,
    oshc_aud,
    visa_aud,
    flights_aud,
    forex_loss_aud,
    total_aud,
    total_npr,
    // Cost spec: fewer than 5 samples is always 'none' (not 'low'); otherwise
    // grade by the sample size (medium 5-19, high 20+).
    living_confidence: hasLiving ? confidenceFromCount(sample_size) : 'none',
    living_sample_size: sample_size,
  };
}
