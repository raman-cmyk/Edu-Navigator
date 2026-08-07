import { describe, it, expect } from 'vitest';
import { groupLakh, formatNPR, formatAUD, toNepaliDigits, relativeTime } from './format';

/*
 * The NPR lakh/crore grouping is load-bearing and Intl cannot do it for en-NP.
 * docs/04 and docs/08 T0.4 call it out explicitly: NPR 4250000 → 42,50,000.
 */
describe('groupLakh', () => {
  it('groups the last three digits, then pairs (lakh/crore)', () => {
    expect(groupLakh(4250000)).toBe('42,50,000');
    expect(groupLakh(100000)).toBe('1,00,000');
    expect(groupLakh(999)).toBe('999');
    expect(groupLakh(1000)).toBe('1,000');
    expect(groupLakh(10000000)).toBe('1,00,00,000'); // 1 crore
  });
});

describe('formatNPR', () => {
  it('prefixes NPR and groups correctly', () => {
    expect(formatNPR(4250000)).toBe('NPR 42,50,000');
  });
  it('renders an em dash for null (never a fabricated 0)', () => {
    expect(formatNPR(null)).toBe('—');
    expect(formatNPR(undefined)).toBe('—');
  });
});

describe('formatAUD', () => {
  it('uses western grouping for the foreign currency', () => {
    expect(formatAUD(3200)).toBe('AUD 3,200');
    expect(formatAUD(284000)).toBe('AUD 284,000');
  });
});

describe('toNepaliDigits', () => {
  it('maps ASCII digits to Devanagari', () => {
    expect(toNepaliDigits(2024)).toBe('२०२४');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-07T12:00:00Z').getTime();
  it('renders English relative time', () => {
    expect(relativeTime('2026-08-07T06:00:00Z', 'en', now)).toBe('6 hours ago');
  });
  it('renders Nepali relative time with Devanagari digits', () => {
    expect(relativeTime('2026-08-07T06:00:00Z', 'ne', now)).toBe('६ घण्टा अघि');
  });
});
