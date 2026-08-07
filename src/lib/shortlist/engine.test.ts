/*
 * Unit tests for the pure shortlist engine. Vitest.
 * Run: npx vitest run src/lib/shortlist
 */

import { describe, it, expect } from 'vitest';
import type {
  ShortlistInput,
  Course,
  University,
  CostBreakdown,
  UniversityResult,
} from '../../types/domain';
import type { Catalog } from './catalog';
import {
  gpaToPercent,
  pteToIelts,
  duolingoToIelts,
  toeflToIelts,
  toIeltsEquivalent,
} from './normalize';
import { hardFilter, scoreCourse } from './score';
import { computeCost } from './cost';
import { computeVisa } from './visa';
import { computePr } from './pr';
import { rankResults } from './rank';
import { selectRejections } from './rejections';
import type { RejectionCandidate } from './rejections';
import { computeOverallConfidence } from './confidence';
import { postCheckVerdict, buildDeterministicVerdict } from './verdict';
import { runShortlist } from './index';

// ---- Fixtures ----

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    id: 'c1',
    university_id: 'u1',
    name: 'Master of IT',
    field: 'it',
    duration_months: 24,
    annual_tuition_aud: 35000,
    min_gpa_pct: 60,
    max_backlogs: 2,
    min_ielts: 6.0,
    min_ielts_band: 5.5,
    on_skilled_occupation_list: false,
    ...over,
  };
}

function makeUni(over: Partial<University> = {}): University {
  return {
    id: 'u1',
    slug: 'uni-one',
    name: 'University One',
    city_id: 'melbourne',
    country: 'AU',
    is_regional: false,
    is_active: true,
    annual_tuition_aud: 35000,
    commission_aud: 4000,
    commission_source: 'contract',
    commission_updated_at: null,
    ranking_tier: 'mid',
    nepali_student_estimate: 500,
    data_confidence: 'medium',
    ...over,
  };
}

function makeInput(over: Partial<ShortlistInput> = {}): ShortlistInput {
  return {
    qualification: 'bachelors',
    score_pct: 70,
    board: 'TU',
    backlogs: 0,
    gap_years: 0,
    english_test: 'ielts',
    english_overall: 7.0,
    budget_npr: 6_000_000,
    has_collateral: true,
    field: 'it',
    priority: 'fastest',
    ...over,
  };
}

function makeCost(over: Partial<CostBreakdown> = {}): CostBreakdown {
  return {
    tuition_aud: 70000,
    living_aud: 24000,
    oshc_aud: 1300,
    visa_aud: 1600,
    flights_aud: 900,
    forex_loss_aud: 2445,
    total_aud: 97800,
    total_npr: 5_000_000,
    living_confidence: 'medium',
    living_sample_size: 8,
    ...over,
  };
}

function makeResult(over: Partial<UniversityResult> = {}): UniversityResult {
  return {
    university_id: 'u1',
    university_name: 'University One',
    university_slug: 'uni-one',
    city_name: 'Melbourne',
    ranking_tier: 'mid',
    is_regional: false,
    course_id: 'c1',
    course_name: 'Master of IT',
    fit_score: 70,
    fit_reason: 'Strong academic headroom; the main constraint is budget fit.',
    cost: makeCost(),
    visa_band: 'Moderate',
    visa_reasons: ['ok'],
    pr_pathway: 'No',
    pr_reason: 'not on list',
    nepali_student_estimate: 500,
    commission_aud: 4000,
    commission_npr: 352000,
    rebate_pct: null,
    data_confidence: 'medium',
    data_points: 8,
    verdict: 'Fit 70.',
    ...over,
  };
}

// ---- 1. Normalization ----

describe('normalize', () => {
  it('converts a 4.0 GPA to percentage (×25)', () => {
    expect(gpaToPercent(3.2)).toBe(80);
    expect(gpaToPercent(4.0)).toBe(100);
  });

  it('passes through TU/PU percentages unchanged', () => {
    expect(gpaToPercent(72)).toBe(72);
    expect(gpaToPercent(72, 'percent')).toBe(72);
  });

  it('converts PTE to IELTS (0.075×pte+1.0)', () => {
    expect(pteToIelts(65)).toBeCloseTo(5.875, 3);
  });

  it('converts Duolingo to IELTS (0.055×det+0.5)', () => {
    expect(duolingoToIelts(120)).toBeCloseTo(7.1, 3);
  });

  it('converts TOEFL iBT via the concordance table', () => {
    expect(toeflToIelts(95)).toBe(7.0);
    expect(toeflToIelts(60)).toBe(6.0);
    expect(toeflToIelts(118)).toBe(9.0);
  });

  it('returns null IELTS-equivalent when no test supplied (provisional path)', () => {
    expect(toIeltsEquivalent(null, undefined)).toBeNull();
    expect(toIeltsEquivalent('pte', 65)).toBeCloseTo(5.875, 3);
  });
});

// ---- 2. Hard filters ----

describe('hardFilter', () => {
  it('drops a course when min_gpa_pct exceeds the applicant score', () => {
    const r = hardFilter(makeInput({ score_pct: 55 }), makeCourse({ min_gpa_pct: 60 }), makeUni(), 7.0);
    expect(r).toBe('gpa');
  });

  it('drops a course when backlogs exceed the course cap', () => {
    const r = hardFilter(makeInput({ backlogs: 5 }), makeCourse({ max_backlogs: 2 }), makeUni(), 7.0);
    expect(r).toBe('backlogs');
  });

  it('drops a course when IELTS-equivalent is below the minimum', () => {
    const r = hardFilter(makeInput(), makeCourse({ min_ielts: 7.5 }), makeUni(), 6.0);
    expect(r).toBe('ielts');
  });

  it('skips the IELTS gate when no test was supplied', () => {
    const r = hardFilter(makeInput(), makeCourse({ min_ielts: 7.5 }), makeUni(), null);
    expect(r).toBe('ok');
  });

  it('drops a course when min_ielts_band exceeds the applicant band', () => {
    const r = hardFilter(makeInput({ english_min_band: 5.0 }), makeCourse({ min_ielts_band: 6.0 }), makeUni(), 7.0);
    expect(r).toBe('ielts_band');
  });

  it('drops a course whose field does not match (and field !== other)', () => {
    const r = hardFilter(makeInput({ field: 'it' }), makeCourse({ field: 'nursing' }), makeUni(), 7.0);
    expect(r).toBe('field');
  });

  it('keeps any field when the applicant field is "other"', () => {
    const r = hardFilter(makeInput({ field: 'other' }), makeCourse({ field: 'nursing' }), makeUni(), 7.0);
    expect(r).toBe('ok');
  });

  it('drops a university whose commission_aud is null (trust rule 2)', () => {
    const r = hardFilter(makeInput(), makeCourse(), makeUni({ commission_aud: null }), 7.0);
    expect(r).toBe('no_commission');
  });

  it('drops an inactive university', () => {
    const r = hardFilter(makeInput(), makeCourse(), makeUni({ is_active: false }), 7.0);
    expect(r).toBe('inactive');
  });
});

// ---- 3. Fit score ----

describe('scoreCourse', () => {
  it('computes the weighted fit with base weights (academic headroom math)', () => {
    // score 70, min 60 → academic 80; all others 100 except community (500→50).
    const fit = scoreCourse(
      makeInput({ priority: 'fastest' }),
      makeCourse({ min_gpa_pct: 60, on_skilled_occupation_list: true }),
      makeUni({ is_regional: true, nepali_student_estimate: 500 }),
      makeCost({ total_npr: 5_000_000 }),
      7.0
    );
    expect(fit.fit_score).toBe(93);
  });

  it('budget fit falls to 0 at 1.4× budget', () => {
    const base = {
      input: makeInput({ priority: 'fastest', budget_npr: 1_000_000 }),
      course: makeCourse({ min_gpa_pct: 60, on_skilled_occupation_list: true }),
      uni: makeUni({ is_regional: true, nepali_student_estimate: 500 }),
    };
    const atBudget = scoreCourse(base.input, base.course, base.uni, makeCost({ total_npr: 1_000_000 }), 7.0);
    const at14x = scoreCourse(base.input, base.course, base.uni, makeCost({ total_npr: 1_400_000 }), 7.0);
    expect(atBudget.fit_score).toBe(93);
    expect(at14x.fit_score).toBe(68); // 25-point budget component fully removed
  });
});

// ---- 4. Cost ----

describe('computeCost', () => {
  it('returns null total_npr and "none" confidence when city sample_size < 5', () => {
    const cost = computeCost(makeCourse(), { median_monthly_aud: 2000, sample_size: 3 }, 88);
    expect(cost.total_npr).toBeNull();
    expect(cost.living_confidence).toBe('none');
    expect(cost.living_aud).toBe(0);
  });

  it('computes a real total_npr when the city has enough samples', () => {
    const cost = computeCost(
      makeCourse({ duration_months: 24, annual_tuition_aud: 35000 }),
      { median_monthly_aud: 2000, sample_size: 8 },
      88
    );
    // tuition 70000 + living 48000 + oshc 1300 + visa 1600 + flights 900 = 121800
    expect(cost.total_aud).toBe(121800);
    expect(cost.total_npr).toBeCloseTo(121800 * 88 * 1.025, 0);
    expect(cost.living_confidence).toBe('medium');
  });
});

// ---- 5. Visa ----

describe('computeVisa', () => {
  it('clamps to Low with negative modifiers and returns reasons', () => {
    const v = computeVisa(
      makeInput({ gap_years: 4, gap_reason: 'family', backlogs: 5, has_collateral: false }),
      makeUni(),
      makeCost({ total_npr: 12_000_000 }),
      undefined,
      6.0,
      6.0
    );
    expect(v.band).toBe('Low');
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it('reaches High with regional + strong English and no negatives', () => {
    const v = computeVisa(
      makeInput({ budget_npr: 10_000_000 }),
      makeUni({ is_regional: true }),
      makeCost({ total_npr: 5_000_000 }),
      undefined,
      7.0,
      6.0
    );
    expect(v.band).toBe('High');
  });
});

// ---- 6. PR pathway ----

describe('computePr', () => {
  it('returns Yes for on-list + regional', () => {
    const r = computePr(makeCourse({ on_skilled_occupation_list: true }), makeUni({ is_regional: true }));
    expect(r.pathway).toBe('Yes');
  });

  it('returns Weak for on-list metro oversupplied field (accounting)', () => {
    const r = computePr(
      makeCourse({ field: 'accounting', on_skilled_occupation_list: true }),
      makeUni({ is_regional: false })
    );
    expect(r.pathway).toBe('Weak');
  });

  it('returns No when not on the occupation list', () => {
    const r = computePr(makeCourse({ on_skilled_occupation_list: false }), makeUni());
    expect(r.pathway).toBe('No');
  });
});

// ---- 7. Ranking / diversity ----

describe('rankResults', () => {
  it('allows at most 2 courses per university', () => {
    const results = [1, 2, 3, 4, 5].map((n) =>
      makeResult({ course_id: `c${n}`, university_id: 'u1', fit_score: 90 - n })
    );
    const ranked = rankResults(results, makeInput());
    expect(ranked.filter((r) => r.university_id === 'u1').length).toBeLessThanOrEqual(2);
  });

  it('includes at least one regional result when priority is pr', () => {
    const metro = [1, 2, 3, 4].map((n) =>
      makeResult({ course_id: `m${n}`, university_id: `um${n}`, fit_score: 95, is_regional: false })
    );
    const regional = makeResult({
      course_id: 'r1',
      university_id: 'ur1',
      fit_score: 40,
      is_regional: true,
    });
    const ranked = rankResults([...metro, regional], makeInput({ priority: 'pr' }));
    expect(ranked.some((r) => r.is_regional)).toBe(true);
  });
});

// ---- 8. Rejections ----

describe('selectRejections', () => {
  function candidate(over: Partial<RejectionCandidate> = {}): RejectionCandidate {
    return {
      university_id: 'u9',
      university_name: 'Pricey University',
      course_id: 'c9',
      course_name: 'MBA',
      fit_score: 40,
      commission_aud: 3200,
      commission_npr: 281600,
      budget_npr: 4_000_000,
      cost_total_npr: 6_200_000,
      visa_band: 'Moderate',
      pr_pathway: 'No',
      median_grad_salary_aud: 52000,
      would_choose_again_no: 0,
      would_choose_again_total: 0,
      fx_rate: 88,
      ...over,
    };
  }

  it('states the forgone commission and a numeric loan-year reason', () => {
    const out = selectRejections([candidate(), candidate({ university_id: 'u8', course_id: 'c8' }), candidate({ university_id: 'u7', course_id: 'c7' })]);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0].reason).toContain('AUD 3,200');
    expect(out[0].reason).toMatch(/\d+ years/);
    expect(out[0].commission_aud).toBe(3200);
  });

  it('prefers higher-commission candidates first', () => {
    const out = selectRejections([
      candidate({ university_id: 'lo', course_id: 'lo', commission_aud: 1000 }),
      candidate({ university_id: 'hi', course_id: 'hi', commission_aud: 9000 }),
      candidate({ university_id: 'mid', course_id: 'mid', commission_aud: 5000 }),
    ]);
    expect(out[0].commission_aud).toBe(9000);
  });
});

// ---- 9. Overall confidence ----

describe('computeOverallConfidence', () => {
  it('is none with no city cost data', () => {
    expect(computeOverallConfidence([20, 20, 20], false)).toBe('none');
  });
  it('is none with fewer than 3 universities carrying data', () => {
    expect(computeOverallConfidence([10, 10], true)).toBe('none');
  });
  it('is low when the median data points is below 5', () => {
    expect(computeOverallConfidence([1, 2, 3, 4], true)).toBe('low');
  });
  it('is medium for a median of 5-19', () => {
    expect(computeOverallConfidence([10, 10, 10], true)).toBe('medium');
  });
  it('is high for a median of 20+', () => {
    expect(computeOverallConfidence([20, 25, 30], true)).toBe('high');
  });
});

// ---- 10. Verdict post-check ----

describe('postCheckVerdict', () => {
  it('accepts a clean verdict whose numbers are all allowed', () => {
    const text = 'Your profile is workable for Australia. Based on 8 verified students, cost is NPR 50,00,000.';
    const res = postCheckVerdict(text, [8, 5000000]);
    expect(res.ok).toBe(true);
  });

  it('rejects an invented number not in the allowed set', () => {
    const text = 'Based on 8 verified students, cost is NPR 99,99,999.';
    const res = postCheckVerdict(text, [8]);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('unverified number');
  });

  it('rejects a banned word', () => {
    const text = 'Your visa is guaranteed for Australia.';
    const res = postCheckVerdict(text, []);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('banned word');
  });
});

// ---- 11. Integration ----

describe('runShortlist', () => {
  function catalog(): Catalog {
    const universities: University[] = [
      makeUni({ id: 'u-metro', slug: 'metro', name: 'Metro U', city_id: 'melbourne', commission_aud: 4000 }),
      makeUni({
        id: 'u-regional',
        slug: 'regional',
        name: 'Regional U',
        city_id: 'melbourne',
        is_regional: true,
        ranking_tier: 'regional',
        commission_aud: 5000,
      }),
      makeUni({ id: 'u-null', slug: 'nullco', name: 'No Commission U', city_id: 'melbourne', commission_aud: null }),
      makeUni({ id: 'u-inactive', slug: 'inactive', name: 'Closed U', city_id: 'melbourne', is_active: false, commission_aud: 3000 }),
    ];
    const courses: Course[] = [
      makeCourse({ id: 'c-metro-1', university_id: 'u-metro', field: 'it', min_gpa_pct: 55 }),
      makeCourse({ id: 'c-metro-2', university_id: 'u-metro', field: 'it', name: 'Grad Dip IT', min_gpa_pct: 55 }),
      makeCourse({ id: 'c-regional', university_id: 'u-regional', field: 'it', min_gpa_pct: 55, on_skilled_occupation_list: true }),
      makeCourse({ id: 'c-null', university_id: 'u-null', field: 'it', min_gpa_pct: 55 }),
      makeCourse({ id: 'c-inactive', university_id: 'u-inactive', field: 'it', min_gpa_pct: 55 }),
    ];
    return {
      universities,
      courses,
      cities: [{ id: 'melbourne', slug: 'melbourne', name: 'Melbourne' }],
      cityLivingCost: { melbourne: { median_monthly_aud: 2000, sample_size: 8 } },
      dataPoints: {
        'u-metro': { count: 10, would_choose_again_no: 1, would_choose_again_total: 10, visa_refused: 1, visa_total: 10, median_grad_salary_aud: 60000 },
        'u-regional': { count: 6, would_choose_again_no: 0, would_choose_again_total: 6, visa_refused: 0, visa_total: 6, median_grad_salary_aud: 55000 },
      },
      ledger: {
        'u-metro': { amount_aud: 4000, rebate_pct: 10 },
        'u-regional': { amount_aud: 5000, rebate_pct: null },
      },
      fxRate: 88,
    };
  }

  it('drops null-commission and inactive universities from results', () => {
    const out = runShortlist(makeInput({ field: 'it' }), catalog(), 'slug123');
    const ids = out.matches.map((m) => m.university_id);
    expect(ids).not.toContain('u-null');
    expect(ids).not.toContain('u-inactive');
    expect(out.matches.length).toBeGreaterThan(0);
  });

  it('produces a deterministic verdict mentioning the country and a valid slug', () => {
    const out = runShortlist(makeInput({ field: 'it' }), catalog(), 'slug123');
    expect(out.share_slug).toBe('slug123');
    expect(out.verdict).toContain('Australia');
    expect(out.npr_aud_rate).toBe(88);
  });

  it('marks the run provisional when no English test was supplied', () => {
    const out = runShortlist(
      makeInput({ field: 'it', english_test: null, english_overall: undefined }),
      catalog(),
      's2'
    );
    expect(out.provisional).toBe(true);
  });

  it('caps each university at 2 courses in the ranked matches', () => {
    const out = runShortlist(makeInput({ field: 'it' }), catalog(), 's3');
    const metroCount = out.matches.filter((m) => m.university_id === 'u-metro').length;
    expect(metroCount).toBeLessThanOrEqual(2);
  });
});

// ---- 12. Deterministic verdict builder ----

describe('buildDeterministicVerdict', () => {
  it('fills the template and passes its own post-check', () => {
    const text = buildDeterministicVerdict({
      strength: 'workable',
      country: 'Australia',
      weakest_component: 'your budget',
      verified_students: 8,
      cost_text: 'NPR 50,00,000',
      confidence: 'medium',
    });
    expect(text).toContain('workable');
    const res = postCheckVerdict(text, [8, 5000000]);
    expect(res.ok).toBe(true);
  });
});
