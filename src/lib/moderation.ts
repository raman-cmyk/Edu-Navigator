import type { Confidence } from '@/types/domain';

/*
 * Deterministic moderation heuristic — exactly two rules (docs/07 §4).
 *
 * The real check is Claude Haiku in the `moderate` Edge Function; this is the
 * fallback when Claude is down (AI is never load-bearing) and the demo flagger.
 * It is conservative on purpose: only a clear OUTCOME GUARANTEE reaches high
 * confidence (the only thing ever auto-removed). Everything else queues for a
 * human. Anger, criticism, regret, and failure stories are NEVER flagged —
 * that honesty is the product (trust rule 5).
 */

export interface ModerationResult {
  rule1: boolean; // outcome guarantee
  rule2: boolean; // agent / commercial promotion posing as a student
  confidence: Confidence;
  quote: string | null;
}

const NEGATORS = /\b(no|not|never|can'?t|cannot|don'?t|doesn'?t|won'?t|without|no one|nobody)\b/i;

// Clear promises of an outcome — high confidence, the only auto-remove trigger.
const RULE1_STRONG: RegExp[] = [
  /\b(visa|pr|admission|approval|scholarship)\s+(is\s+)?guaranteed\b/i,
  /\bguarantee(d|s)?\s+(you\s+)?(a\s+|the\s+|your\s+)?(visa|pr|admission|approval|success|scholarship)\b/i,
  /\byou\s+will\s+(definitely|certainly|surely|100%)\s+(get|be|receive)\b/i,
  /\b100%\s*(approval|success|guarantee|visa|pr)\b/i,
  /\bapply\s+through\s+us\b[^.]*\bguarantee/i,
];

// Commercial promotion / agent patterns — always QUEUE, never auto-remove.
const RULE2: RegExp[] = [
  /\bdm\s+me\b/i,
  /\b(contact|message|call|whatsapp|viber)\s+(us|me)\b/i,
  /\bbest\s+(rates?|price|deal)\b/i,
  /\bapply\s+through\s+us\b/i,
  /\bfree\s+counsel+ing\b/i,
  /\+977[\s-]?\d{7,10}\b/,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // email address
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** True when a promise word appears but is negated ("no one can guarantee"). */
function isNegated(text: string, quote: string): boolean {
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  if (idx < 0) return false;
  const window = text.slice(Math.max(0, idx - 30), idx);
  return NEGATORS.test(window);
}

export function moderateText(text: string): ModerationResult {
  const strong = firstMatch(text, RULE1_STRONG);
  const rule1 = Boolean(strong) && !isNegated(text, strong!);

  // A bare "guarantee" is a weak signal — queue at medium, don't auto-remove.
  const bareGuarantee = /\bguarantee/i.test(text);
  const weakRule1 = !rule1 && bareGuarantee && !isNegated(text, 'guarantee');

  const rule2Quote = firstMatch(text, RULE2);
  const rule2 = Boolean(rule2Quote);

  let confidence: Confidence = 'none';
  if (rule1) confidence = 'high';
  else if (weakRule1 || rule2) confidence = 'medium';

  return {
    rule1: rule1 || weakRule1,
    rule2,
    confidence,
    quote: strong ?? rule2Quote ?? (weakRule1 ? 'guarantee' : null),
  };
}

/** Should this be auto-removed? ONLY a high-confidence outcome guarantee. */
export function shouldAutoRemove(r: ModerationResult): boolean {
  return r.rule1 && r.confidence === 'high';
}
