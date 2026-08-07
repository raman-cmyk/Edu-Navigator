/*
 * Ranking + diversity constraints. See docs/06 §8.
 *
 * Sort by fit, then shape the list so it's usable rather than five versions of
 * the same campus:
 *   - max 2 courses per university
 *   - at least 2 results under 80% of budget
 *   - at least 1 regional result when priority = 'pr'
 *   - return 8-12 results
 */

import type { UniversityResult, ShortlistInput } from '../../types/domain';

const MAX_PER_UNIVERSITY = 2;
const MAX_RESULTS = 12; // target 8-12; the floor is best-effort (can't invent results)
const CHEAP_FRACTION = 0.8;
const MIN_CHEAP = 2;

function byFitDesc(a: UniversityResult, b: UniversityResult): number {
  if (b.fit_score !== a.fit_score) return b.fit_score - a.fit_score;
  // Stable tiebreak: prefer the higher commission (never hidden, docs/06 §7).
  return b.commission_aud - a.commission_aud;
}

function isCheap(r: UniversityResult, budget: number): boolean {
  return r.cost.total_npr !== null && r.cost.total_npr <= budget * CHEAP_FRACTION;
}

/**
 * Ensure at least `min` items matching `pred` appear in `selected`, pulling the
 * highest-fit matching candidates from `pool` and displacing the lowest-fit
 * non-matching selected items. Never exceeds MAX_RESULTS.
 */
function ensureConstraint(
  selected: UniversityResult[],
  pool: UniversityResult[],
  pred: (r: UniversityResult) => boolean,
  min: number
): void {
  const have = () => selected.filter(pred).length;
  const inSelected = (r: UniversityResult) => selected.some((s) => s.course_id === r.course_id);

  const candidates = pool.filter((r) => pred(r) && !inSelected(r)).sort(byFitDesc);

  for (const cand of candidates) {
    if (have() >= min) break;
    if (selected.length < MAX_RESULTS) {
      selected.push(cand);
      continue;
    }
    // Full — displace the lowest-fit selected item that does NOT match pred.
    let worstIdx = -1;
    for (let i = 0; i < selected.length; i++) {
      if (pred(selected[i])) continue;
      if (worstIdx === -1 || selected[i].fit_score < selected[worstIdx].fit_score) worstIdx = i;
    }
    if (worstIdx === -1) break; // everything already matches; nothing to swap
    selected[worstIdx] = cand;
  }
}

export function rankResults(
  results: UniversityResult[],
  input: ShortlistInput
): UniversityResult[] {
  const sorted = [...results].sort(byFitDesc);

  // Cap to 2 courses per university, preserving fit order.
  const perUni = new Map<string, number>();
  const capped: UniversityResult[] = [];
  for (const r of sorted) {
    const n = perUni.get(r.university_id) ?? 0;
    if (n >= MAX_PER_UNIVERSITY) continue;
    perUni.set(r.university_id, n + 1);
    capped.push(r);
  }

  // Take the top up to MAX_RESULTS.
  const selected = capped.slice(0, MAX_RESULTS);

  // Diversity: at least 2 cheap results.
  ensureConstraint(selected, capped, (r) => isCheap(r, input.budget_npr), MIN_CHEAP);

  // Diversity: at least 1 regional when the priority is PR.
  if (input.priority === 'pr') {
    ensureConstraint(selected, capped, (r) => r.is_regional, 1);
  }

  // Keep it sorted and clamp to the 12-result ceiling. The 8-result floor is
  // best-effort — we never fabricate results to reach it.
  selected.sort(byFitDesc);
  return selected.slice(0, MAX_RESULTS);
}
