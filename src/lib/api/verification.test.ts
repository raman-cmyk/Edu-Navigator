import { describe, it, expect } from 'vitest';
import { slaHoursRemaining } from './verification';

/*
 * The 24h SLA is the trust bottleneck (docs/01, docs/05 §admin/verify). The
 * admin queue sorts oldest-first and shows a countdown; a breach must read as a
 * breach (negative remaining).
 */
describe('slaHoursRemaining', () => {
  const now = new Date('2026-08-07T12:00:00Z').getTime();

  it('returns hours left for a fresh request', () => {
    const submitted = new Date(now - 2 * 3_600_000).toISOString();
    expect(slaHoursRemaining(submitted, now)).toBeCloseTo(22, 5);
  });

  it('goes negative once past 24h (breached)', () => {
    const submitted = new Date(now - 30 * 3_600_000).toISOString();
    expect(slaHoursRemaining(submitted, now)).toBeLessThan(0);
  });

  it('is ~0 exactly at the deadline', () => {
    const submitted = new Date(now - 24 * 3_600_000).toISOString();
    expect(Math.abs(slaHoursRemaining(submitted, now))).toBeLessThan(0.001);
  });
});
