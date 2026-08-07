/*
 * Normalization — GPA → percentage, and English test → IELTS equivalent.
 * Pure functions. See docs/06-shortlist-engine.md section 1.
 *
 * Courses store IELTS minimums, so every test is converted to an IELTS-
 * equivalent overall band before the hard filters run. If no test was
 * supplied, callers proceed but mark the whole result provisional.
 */

import type { EnglishTest } from '../../types/domain';

/** Clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Convert an academic score to a percentage.
 *
 * - 4.0-scale GPA (incl. NEB) → `gpa × 25`
 * - TU / PU percentages are already %, returned unchanged
 *
 * Heuristic: a value ≤ 4 is treated as a 4.0 GPA; anything larger is already
 * a percentage. This matches the intake form, which normalizes before storing
 * `score_pct`, but keeps the pure helper usable and testable on raw input.
 */
export function gpaToPercent(score: number, scale: '4.0' | 'percent' = score <= 4 ? '4.0' : 'percent'): number {
  if (scale === '4.0') return clamp(score * 25, 0, 100);
  return clamp(score, 0, 100);
}

/** PTE Academic → IELTS overall equivalent. `ielts ≈ 0.075 × pte + 1.0`. */
export function pteToIelts(pte: number): number {
  return clamp(0.075 * pte + 1.0, 4.0, 9.0);
}

/** Duolingo English Test → IELTS overall equivalent. `ielts ≈ 0.055 × det + 0.5`. */
export function duolingoToIelts(det: number): number {
  return clamp(0.055 * det + 0.5, 4.0, 9.0);
}

/**
 * TOEFL iBT → IELTS overall, using the standard ETS/IELTS concordance bands.
 * The concordance is published as score ranges; we pick the IELTS band each
 * TOEFL range maps to. Values above/below the table clamp to 9.0 / 4.0.
 */
const TOEFL_IELTS_CONCORDANCE: ReadonlyArray<{ min: number; max: number; ielts: number }> = [
  { min: 118, max: 120, ielts: 9.0 },
  { min: 115, max: 117, ielts: 8.5 },
  { min: 110, max: 114, ielts: 8.0 },
  { min: 102, max: 109, ielts: 7.5 },
  { min: 94, max: 101, ielts: 7.0 },
  { min: 79, max: 93, ielts: 6.5 },
  { min: 60, max: 78, ielts: 6.0 },
  { min: 46, max: 59, ielts: 5.5 },
  { min: 35, max: 45, ielts: 5.0 },
  { min: 32, max: 34, ielts: 4.5 },
  { min: 0, max: 31, ielts: 4.0 },
];

export function toeflToIelts(toefl: number): number {
  for (const band of TOEFL_IELTS_CONCORDANCE) {
    if (toefl >= band.min && toefl <= band.max) return band.ielts;
  }
  // Above the highest listed range → top band; below → floor.
  return toefl > 120 ? 9.0 : 4.0;
}

/**
 * Convert any supported English test to its IELTS overall equivalent.
 * Returns null when no test / no score was supplied — callers must then
 * skip the IELTS hard filter and mark the result provisional.
 */
export function toIeltsEquivalent(
  test: EnglishTest | null | undefined,
  overall: number | null | undefined
): number | null {
  if (!test || overall === null || overall === undefined || Number.isNaN(overall)) {
    return null;
  }
  switch (test) {
    case 'ielts':
      return clamp(overall, 0, 9.0);
    case 'pte':
      return pteToIelts(overall);
    case 'duolingo':
      return duolingoToIelts(overall);
    case 'toefl':
      return toeflToIelts(overall);
    default:
      return null;
  }
}
