import { describe, it, expect } from 'vitest';
import { nextPracticeRow } from '../../src/core/practice';
import { createNewState, cellKey } from '../../src/core/state';
import { LEVEL_ORDER } from '../../src/core/levels';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function allClearedState() {
  const s = createNewState(0);
  s.unlocked = 9;
  for (const r of LEVEL_ORDER) {
    s.cleared[r] = ALL;
    for (const b of ALL) s.mastery[cellKey(r, b)] = 6;
  }
  return s;
}

describe('nextPracticeRow', () => {
  it('new game -> row 1', () => {
    expect(nextPracticeRow(createNewState(0))).toBe(1);
  });
  it('unlocked 3 with row 5 partly cleared -> 5', () => {
    const s = createNewState(0);
    s.unlocked = 3;
    s.cleared = { 1: ALL, 2: ALL, 5: [1, 2, 3] };
    expect(nextPracticeRow(s)).toBe(5);
  });
  it('just unlocked 3 levels -> the new row 5', () => {
    const s = createNewState(0);
    s.unlocked = 3;
    s.cleared = { 1: ALL, 2: ALL };
    expect(nextPracticeRow(s)).toBe(5);
  });
  it('all unlocked and cleared -> row with fewest stars', () => {
    const s = allClearedState();
    s.mastery[cellKey(4, 3)] = 0;
    expect(nextPracticeRow(s)).toBe(4);
  });
  it('tie -> earliest in LEVEL_ORDER', () => {
    const s = allClearedState();
    s.mastery[cellKey(7, 1)] = 0;
    s.mastery[cellKey(5, 1)] = 0;
    expect(nextPracticeRow(s)).toBe(5);
  });
});
