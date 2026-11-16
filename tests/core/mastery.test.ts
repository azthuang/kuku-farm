import { describe, it, expect } from 'vitest';
import { applyAnswer, starsOf, challengeWeight, weightedPick, cropWeights, pickCrop } from '../../src/core/mastery';
import { cropPool } from '../../src/core/levels';

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
  it('cropWeights', () => {
    const w = cropWeights(3, 0);
    [1, 0.7, 0.49].forEach((v, i) => expect(w[i]).toBeCloseTo(v));
    cropWeights(9, 3).forEach(v => expect(v).toBeCloseTo(1));
  });
  it('pickCrop', () => {
    expect(pickCrop(cropPool(2), 0, () => 0)).toBe('wheat');
    expect(pickCrop(cropPool(2), 0, () => 0.99)).toBe('carrot');
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
