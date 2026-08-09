import { describe, it, expect } from 'vitest';
import { moderateText, shouldAutoRemove } from './moderation';

/*
 * The load-bearing regression (docs/07 §4, docs/08 T7.1, trust rule 5):
 * anger, regret, and failure stories must NEVER be flagged. Only a clear
 * outcome guarantee is auto-removed; commercial promotion only queues.
 */
describe('moderateText — never flags honest negatives', () => {
  const negatives = [
    'going abroad was the worst decision I made',
    'I regret coming here, it was a mistake for me',
    'Honestly the loan pressure broke me for a year',
    'I got my visa approved in 3 weeks', // experience, not a promise
    'The university lied about job prospects and I would not choose it again',
  ];
  for (const text of negatives) {
    it(`does not flag: "${text.slice(0, 32)}…"`, () => {
      const r = moderateText(text);
      expect(r.rule1).toBe(false);
      expect(r.rule2).toBe(false);
    });
  }

  it('does not flag a negated guarantee ("no one can guarantee a visa")', () => {
    expect(moderateText('No one can guarantee a visa, be careful').rule1).toBe(false);
  });
});

describe('moderateText — flags real violations', () => {
  it('flags an outcome guarantee at high confidence (auto-remove)', () => {
    const r = moderateText('Apply through us — visa guaranteed!');
    expect(r.rule1).toBe(true);
    expect(r.confidence).toBe('high');
    expect(shouldAutoRemove(r)).toBe(true);
  });

  it('flags "you will definitely get approved"', () => {
    expect(moderateText('You will definitely get approved if you apply now').rule1).toBe(true);
  });

  it('flags agent promotion (rule 2) but never auto-removes it', () => {
    const r = moderateText('DM me for guidance, best rates in town');
    expect(r.rule2).toBe(true);
    expect(shouldAutoRemove(r)).toBe(false);
  });

  it('flags a contact phone number as rule 2', () => {
    expect(moderateText('Call us +977 9812345678 to enrol').rule2).toBe(true);
  });
});
