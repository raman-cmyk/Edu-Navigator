import type { ShortlistInput, ShortlistOutput } from '@/types/domain';
import { runShortlist } from '@/lib/shortlist';
import { buildDemoCatalog } from './mockCatalog';

/*
 * DEMO-ONLY shortlist runner.
 *
 * In production the real scoring runs server-side in the `shortlist` Edge
 * Function so the algorithm and commission data can't be tampered with. This
 * module exists ONLY so the public flow is runnable locally without a backend —
 * and it uses the SAME pure engine (src/lib/shortlist) against a mock catalog,
 * so demo behaviour matches production behaviour. No duplicated scoring logic.
 */
export function runDemoShortlist(input: ShortlistInput, slug: string): ShortlistOutput {
  return runShortlist(input, buildDemoCatalog(), slug);
}
