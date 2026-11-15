import { describe, it, expect } from 'vitest';
import { createNewState } from '../../src/core/state';
import { isRipe, msUntilRipe, harvestCell, refreshGrowing, rebaseClock } from '../../src/core/field';

describe('field', () => {
  it('new state and regrow cycle', () => {
    const s = createNewState(1000);
    expect(s.unlocked).toBe(1);
    expect(s.inventory.carrot).toBe(0);
    expect(isRipe(s, 2, 3, 1000)).toBe(true);
    harvestCell(s, 2, 3, 1000);
    expect(isRipe(s, 2, 3, 1000 + 299_999)).toBe(false);
    expect(msUntilRipe(s, 2, 3, 1000 + 100_000)).toBe(200_000);
    expect(isRipe(s, 2, 3, 1000 + 300_000)).toBe(true);
    refreshGrowing(s, 1000 + 300_000);
    expect(s.growing['2,3']).toBeUndefined();
  });

  it('rebases growing timestamps when the clock goes backwards', () => {
    const t = createNewState(10_000);
    harvestCell(t, 1, 1, 10_000);
    t.lastSeenAt = 10_000;
    expect(rebaseClock(t, 4_000)).toBe(true);
    expect(msUntilRipe(t, 1, 1, 4_000)).toBe(300_000);
    expect(t.lastSeenAt).toBe(4_000);
    expect(rebaseClock(t, 5_000)).toBe(false);
    expect(t.lastSeenAt).toBe(5_000);
  });

  it('clamps far-future growing timestamps so a cell ripens within one regrow', () => {
    const now = 1_000_000;
    const tenYears = 10 * 365 * 24 * 3600 * 1000;
    const s = createNewState(now);
    s.growing['3,4'] = now + tenYears;
    refreshGrowing(s, now);
    expect(s.growing['3,4']).toBe(now + 300_000);
    expect(isRipe(s, 3, 4, now + 300_000)).toBe(true);
  });

  it('rebaseClock also clamps far-future timestamps', () => {
    const s = createNewState(10_000);
    s.lastSeenAt = 10_000;
    s.growing['1,1'] = 10_000 + 10 * 365 * 24 * 3600 * 1000;
    rebaseClock(s, 4_000);
    expect(msUntilRipe(s, 1, 1, 4_000)).toBe(300_000);
    s.growing['1,2'] = 5_000 + 10 * 365 * 24 * 3600 * 1000;
    rebaseClock(s, 5_000); // clock did not go backwards
    expect(msUntilRipe(s, 1, 2, 5_000)).toBe(300_000);
  });
});
