/*
 * runShortlist — the pure orchestration of the shortlist engine.
 *
 * Steps 1-9 of docs/06 run here; step 10 (the AI verdict) and step 11 (freeze
 * + store) live in the Edge Function. This function attaches the DETERMINISTIC
 * fallback verdict; the Edge Function may overwrite it with a post-checked AI
 * verdict. No IO, no fetch, no Claude — fully unit-testable.
 */

import type {
  ShortlistInput,
  ShortlistOutput,
  UniversityResult,
  University,
} from '../../types/domain';
import { formatNPR } from '../format';
import type { Catalog } from './catalog';
import { confidenceFromCount } from './catalog';
import { toIeltsEquivalent } from './normalize';
import { hardFilter, scoreCourse } from './score';
import { computeCost } from './cost';
import { computeVisa } from './visa';
import { computePr } from './pr';
import { rankResults } from './rank';
import { selectRejections } from './rejections';
import type { RejectionCandidate } from './rejections';
import { computeOverallConfidence } from './confidence';
import { buildDeterministicVerdict } from './verdict';

/** Reconcile commission between the universities table and the ledger. */
function resolveCommission(
  university: University,
  ledgerAmount: number | undefined
): number {
  const uni = university.commission_aud;
  // hardFilter already dropped null-commission universities, so uni is a number.
  const base = uni as number;
  if (ledgerAmount === undefined) return base;
  if (ledgerAmount !== base) {
    // Trust rule: never overstate what we return, never understate what we take.
    // eslint-disable-next-line no-console
    console.warn(
      `[shortlist] commission mismatch for ${university.slug}: ledger ${ledgerAmount} vs table ${base} — using lower.`
    );
  }
  return Math.min(base, ledgerAmount);
}

/** Plain strength word from the best fit score. */
function strengthWord(topFit: number | null): string {
  if (topFit === null) return 'difficult to place';
  if (topFit >= 80) return 'competitive';
  if (topFit >= 60) return 'workable';
  if (topFit >= 40) return 'borderline';
  return 'a stretch';
}

export function runShortlist(
  input: ShortlistInput,
  catalog: Catalog,
  shareSlug: string
): ShortlistOutput {
  const { fxRate } = catalog;

  // Step 1 — normalize.
  const ieltsEquiv = toIeltsEquivalent(input.english_test, input.english_overall);
  const provisional = ieltsEquiv === null;

  const uniById = new Map<string, University>(catalog.universities.map((u) => [u.id, u]));
  const cityNameById = new Map<string, string>(catalog.cities.map((c) => [c.id, c.name]));

  const matchesAll: UniversityResult[] = [];
  const rejectionCandidates: RejectionCandidate[] = [];

  for (const course of catalog.courses) {
    const university = uniById.get(course.university_id);
    if (!university) continue;

    // Step 2 — hard filters (drops null-commission, inactive, mismatched field…).
    if (hardFilter(input, course, university, ieltsEquiv) !== 'ok') continue;

    // Step 4 — real cost.
    const cost = computeCost(course, catalog.cityLivingCost[university.city_id], fxRate);

    // Step 3 — fit.
    const fit = scoreCourse(input, course, university, cost, ieltsEquiv);

    // Step 5 — visa.
    const dataPoint = catalog.dataPoints[university.id];
    const visa = computeVisa(input, university, cost, dataPoint, ieltsEquiv, course.min_ielts);

    // Step 6 — PR pathway.
    const pr = computePr(course, university);

    // Step 7 — commission (required; reconciled with ledger).
    const ledger = catalog.ledger[university.id];
    const commission_aud = resolveCommission(university, ledger?.amount_aud);
    const commission_npr = commission_aud * fxRate;

    const dataCount = dataPoint?.count ?? 0;

    const result: UniversityResult = {
      university_id: university.id,
      university_name: university.name,
      university_slug: university.slug,
      city_name: cityNameById.get(university.city_id) ?? '',
      ranking_tier: university.ranking_tier,
      is_regional: university.is_regional,
      course_id: course.id,
      course_name: course.name,
      fit_score: fit.fit_score,
      fit_reason: fit.fit_reason,
      cost,
      visa_band: visa.band,
      visa_reasons: visa.reasons,
      pr_pathway: pr.pathway,
      pr_reason: pr.reason,
      nepali_student_estimate: university.nepali_student_estimate,
      commission_aud,
      commission_npr,
      rebate_pct: ledger?.rebate_pct ?? null,
      data_confidence: confidenceFromCount(dataCount),
      data_points: dataCount,
      verdict: `Fit ${fit.fit_score}. ${fit.fit_reason} Visa ${visa.band}, PR ${pr.pathway}.`,
    };

    matchesAll.push(result);

    rejectionCandidates.push({
      university_id: university.id,
      university_name: university.name,
      course_id: course.id,
      course_name: course.name,
      fit_score: fit.fit_score,
      commission_aud,
      commission_npr,
      budget_npr: input.budget_npr,
      cost_total_npr: cost.total_npr,
      visa_band: visa.band,
      pr_pathway: pr.pathway,
      median_grad_salary_aud: dataPoint?.median_grad_salary_aud ?? null,
      would_choose_again_no: dataPoint?.would_choose_again_no ?? 0,
      would_choose_again_total: dataPoint?.would_choose_again_total ?? 0,
      fx_rate: fxRate,
    });
  }

  // Step 8 — rank + diversity.
  const matches = rankResults(matchesAll, input);

  // Step 9 — rejections: passing-but-poor courses NOT already shown as matches.
  const matchedCourseIds = new Set(matches.map((m) => m.course_id));
  const rejections = selectRejections(
    rejectionCandidates.filter((c) => !matchedCourseIds.has(c.course_id))
  );

  // Overall confidence.
  const hasAnyCityCost = matches.some((m) => m.cost.total_npr !== null);
  const confidence = computeOverallConfidence(
    matches.map((m) => m.data_points),
    hasAnyCityCost
  );

  // Deterministic fallback verdict (Edge Function may replace with AI verdict).
  const top = matches[0] ?? null;
  const topFit = top ? top.fit_score : null;
  const costText = top && top.cost.total_npr !== null ? formatNPR(top.cost.total_npr) : 'Insufficient data';
  const verifiedStudents = top ? top.data_points : 0;
  const weakest = provisional
    ? 'your English test, which you have not taken yet'
    : deriveWeakestLabel(top);

  const verdict = buildDeterministicVerdict({
    strength: strengthWord(topFit),
    country: 'Australia',
    weakest_component: weakest,
    verified_students: verifiedStudents,
    cost_text: costText,
    confidence,
  });

  return {
    share_slug: shareSlug,
    verdict,
    confidence,
    npr_aud_rate: fxRate,
    matches,
    rejections,
    provisional: provisional || confidence === 'none' || confidence === 'low',
  };
}

/** Plain weakest-component label for the verdict, from the top match. */
function deriveWeakestLabel(top: UniversityResult | null): string {
  if (!top) return 'the shortage of eligible options for your profile';
  // fit_reason already ends with "the main constraint is X."
  const m = top.fit_reason.match(/main constraint is (.+?)\.?$/);
  return m ? m[1] : 'your overall profile fit';
}

// Re-export the public surface for convenient importing.
export type { Catalog } from './catalog';
export { postCheckVerdict, buildDeterministicVerdict, BANNED_WORDS } from './verdict';
