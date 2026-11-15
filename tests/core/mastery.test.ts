import { describe, it, expect } from 'vitest';
import { applyAnswer, starsOf, goldenChance, challengeWeight, weightedPick } from '../../src/core/mastery';

describe('mastery', () => {
  it('applyAnswer', () => {
    expect(applyAnswer(0, 'basic', true, true)).toBe(1);
    expect(applyAnswer(0, 'challenge', true, true)).toBe(2);
    expect(applyAnswer(5, 'challenge', true, true)).toBe(6);
    expect(applyAnswer(3, 'basic', false, true)).toBe(2);
    expect(applyAnswer(0, 'basic', false, true)).toBe(0);
    expect(applyAnswer(3, 'basic', true, false)).toBe(3);
    expect(applyAnswer(3, 'basic', false, false)).toBe(3);
  });
  it('starsOf', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(starsOf)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
  it('goldenChance', () => {
    expect([0, 1, 2, 3].map(goldenChance)).toEqual([0, 0, 0.1, 0.3]);
  });
  it('challengeWeight', () => {
    expect(challengeWeight(0)).toBe(7);
    expect(challengeWeight(6)).toBe(1);
  });
  it('weightedPick', () => {
    expect(weightedPick(['a', 'b'], [7, 1], () => 0.8)).toBe(0);
    expect(weightedPick(['a', 'b'], [7, 1], () => 0.9)).toBe(1);
    expect(weightedPick(['a'], [1], () => 0.999)).toBe(0);
  });
});
