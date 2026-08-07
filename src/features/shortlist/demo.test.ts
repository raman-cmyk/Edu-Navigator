import { describe, it, expect } from 'vitest';
import { runDemoShortlist } from './demo';
import type { ShortlistInput } from '@/types/domain';

/*
 * Guards the runnable demo path (mock catalog + real engine). Not a re-test of
 * the engine (that lives in src/lib/shortlist/engine.test.ts) — it asserts the
 * demo catalog exercises the trust-rule branches the public flow must show.
 */
const base: ShortlistInput = {
  qualification: 'bachelors',
  score_pct: 68,
  board: 'TU',
  backlogs: 1,
  gap_years: 1,
  gap_reason: 'worked',
  english_test: 'ielts',
  english_overall: 6.5,
  english_min_band: 6.0,
  budget_npr: 4_500_000,
  has_collateral: true,
  field: 'it',
  priority: 'pr',
};

describe('runDemoShortlist', () => {
  it('returns ranked matches with commission always attached', () => {
    const out = runDemoShortlist(base, 'test-slug');
    expect(out.matches.length).toBeGreaterThan(0);
    for (const m of out.matches) {
      expect(typeof m.commission_aud).toBe('number');
      expect(m.commission_aud).toBeGreaterThan(0);
    }
  });

  it('never surfaces the null-commission university (trust rule 2)', () => {
    const out = runDemoShortlist(base, 'test-slug');
    const ids = [...out.matches, ...out.rejections].map((r) => r.university_id);
    expect(ids).not.toContain('privateco');
  });

  it('renders "Insufficient data" (null total) for a city with < 5 samples', () => {
    // Adelaide has 3 samples in the mock catalog.
    const out = runDemoShortlist(base, 'test-slug');
    const adelaide = out.matches.find((m) => m.city_name === 'Adelaide');
    if (adelaide) {
      expect(adelaide.cost.total_npr).toBeNull();
      expect(adelaide.cost.living_confidence).toBe('none');
    }
  });

  it('marks the list provisional when no English test was taken', () => {
    const out = runDemoShortlist({ ...base, english_test: null, english_overall: undefined }, 's');
    expect(out.provisional).toBe(true);
  });

  it('freezes the share slug into the result', () => {
    expect(runDemoShortlist(base, 'abc123').share_slug).toBe('abc123');
  });
});
