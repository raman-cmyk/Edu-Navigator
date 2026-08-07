/*
 * Verdict — deterministic fallback template + the post-check that every AI
 * verdict must pass. See docs/06 §10. The AI verdict is generated in the Edge
 * Function; this module is the single source of truth for the fallback and the
 * safety check, both reused there.
 */

import type { Confidence } from '../../types/domain';

/** Words/phrases that are never allowed in a verdict (docs/06 §10). */
export const BANNED_WORDS: readonly string[] = [
  'guaranteed',
  'assured',
  '100%',
  'definitely will',
  'certain to',
  'dream',
  'unlock',
  'empower',
  'seamless',
  'journey',
];

export interface VerdictParams {
  /** Plain strength word, e.g. "competitive", "borderline", "a stretch". */
  strength: string;
  country: string;
  /** Plain name of the weakest component, e.g. "your budget". */
  weakest_component: string;
  /** Number of verified students behind the numbers. */
  verified_students: number;
  /** Pre-formatted cost, e.g. "NPR 42,50,000" or "Insufficient data". */
  cost_text: string;
  confidence: Confidence;
}

/** The provisional-ness note the confidence level requires. */
function confidenceNote(confidence: Confidence): string {
  if (confidence === 'none' || confidence === 'low') {
    return 'This list is provisional — the underlying data is thin, so treat it as a starting point.';
  }
  return `Confidence is ${confidence}, based on verified student reports.`;
}

/**
 * Build the deterministic fallback verdict. Shipped only when the AI verdict
 * fails the post-check twice. Contains no banned words; every number in it
 * (the verified-student count and any digits inside cost_text) must be present
 * in the caller's allowed-numbers set.
 */
export function buildDeterministicVerdict(p: VerdictParams): string {
  return (
    `Your profile is ${p.strength} for ${p.country}. ` +
    `The main constraint is ${p.weakest_component}. ` +
    `Based on ${p.verified_students} verified students, your realistic total cost is ${p.cost_text}. ` +
    `${confidenceNote(p.confidence)}`
  );
}

export interface PostCheckResult {
  ok: boolean;
  reason?: string;
}

/** Extract number-like tokens (grouped, decimal, or percent) from text. */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((m) => parseFloat(m.replace(/,/g, '')));
}

/**
 * Verify a verdict is shippable:
 *  (a) contains no banned word/phrase, and
 *  (b) every numeral in it appears in the allowed-numbers set — no number may
 *      appear that wasn't computed (trust rule 1).
 *
 * @param text           the verdict text to check
 * @param allowedNumbers every number the engine actually computed
 */
export function postCheckVerdict(
  text: string,
  allowedNumbers: Iterable<number>
): PostCheckResult {
  const lower = text.toLowerCase();
  for (const banned of BANNED_WORDS) {
    if (lower.includes(banned.toLowerCase())) {
      return { ok: false, reason: `banned word: "${banned}"` };
    }
  }

  const allowed = new Set<number>();
  for (const n of allowedNumbers) allowed.add(n);

  for (const n of extractNumbers(text)) {
    if (!allowed.has(n)) {
      return { ok: false, reason: `unverified number: ${n}` };
    }
  }

  return { ok: true };
}
