import { describe, it, expect } from 'vitest';
import { applyAnswer, starsOf, challengeWeight, weightedPick, cropWeights, pickCrop, stockWeights, STOCK_MIN } from '../../src/core/mastery';
import { cropPoolForRow } from '../../src/core/levels';

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
  it('cropWeights: the row own crop (last) weighs most; more stars favour it more', () => {
    const w = cropWeights(3, 0);
    [0.4225, 0.65, 1].forEach((v, i) => expect(w[i]).toBeCloseTo(v / 2.0725));
    const w3 = cropWeights(3, 3);
    [0.1225, 0.35, 1].forEach((v, i) => expect(w3[i]).toBeCloseTo(v / 1.4725));
    // level 8 (8 crops) at 0 stars: own crop about 34% (36% before wheat and carrot got their floor)
    const w7 = cropWeights(8, 0);
    expect(w7[7] / w7.reduce((a, b) => a + b, 0)).toBeCloseTo(0.34, 2);
  });
  it('cropWeights: in pools of 4+ crops wheat and carrot never drop below 5% (feed and medicine)', () => {
    const share = (w: number[]) => w.map(x => x / w.reduce((a, b) => a + b, 0));
    for (const n of [4, 5, 6, 7, 8, 9]) {
      for (const stars of [0, 1, 2, 3]) {
        const p = share(cropWeights(n, stars));
        expect(p[0]).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(p[1]).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        // the row's own crop still weighs most
        expect(Math.max(...p)).toBe(p[n - 1]);
      }
    }
    // row 9 at 3 stars: wheat was ~0.03%, now the floor; the own crop goes from 65% to about 59%
    const p9 = share(cropWeights(9, 3));
    expect(p9[0]).toBeCloseTo(0.05);
    expect(p9[1]).toBeCloseTo(0.05);
    expect(p9[8]).toBeCloseTo(0.585, 2);
    // small pools keep the plain fall-off
    const p3 = share(cropWeights(3, 3));
    expect(p3[0]).toBeCloseTo(0.1225 / 1.4725);
  });
  it('pickCrop', () => {
    expect(pickCrop(cropPoolForRow(2), 0, () => 0)).toBe('wheat');
    expect(pickCrop(cropPoolForRow(2), 0, () => 0.99)).toBe('carrot');
    expect(pickCrop(cropPoolForRow(1), 3, () => 0.5)).toBe('wheat');
  });
  it('stockWeights: a crop weighs its share times (room left)², so a nearly full crop rarely comes', () => {
    // empty barn: shares unchanged
    expect(stockWeights([0.2, 0.3, 0.5], [0, 0, 0])).toEqual([0.2, 0.3, 0.5]);
    // half full -> a quarter; full -> only the small minimum
    const w = stockWeights([0.2, 0.3, 0.5], [0, 0.5, 1]);
    expect(w[0]).toBeCloseTo(0.2);
    expect(w[1]).toBeCloseTo(0.3 * 0.25);
    expect(w[2]).toBeCloseTo(0.5 * STOCK_MIN);
    // everything full: back to the plain shares (same ratios)
    const full = stockWeights([0.2, 0.3, 0.5], [1, 1, 1]);
    expect(full[1] / full[0]).toBeCloseTo(1.5);
    expect(full[2] / full[0]).toBeCloseTo(2.5);
    // past the cap counts as full
    expect(stockWeights([1], [1.2])[0]).toBeCloseTo(STOCK_MIN);
  });
  it('pickCrop with fullness: a full own crop gives way to the emptier ones', () => {
    const pool = cropPoolForRow(2); // wheat, carrot
    // carrot (the row's own crop) full: even a high roll lands on wheat
    expect(pickCrop(pool, 0, () => 0.9, { carrot: 1 })).toBe('wheat');
    expect(pickCrop(pool, 0, () => 0.9)).toBe('carrot');
  });
  it('weightedPick', () => {
    expect(weightedPick(['a', 'b'], [7, 1], () => 0.8)).toBe(0);
    expect(weightedPick(['a', 'b'], [7, 1], () => 0.9)).toBe(1);
    expect(weightedPick(['a'], [1], () => 0.999)).toBe(0);
  });
});
