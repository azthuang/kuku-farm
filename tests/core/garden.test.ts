import { describe, it, expect } from 'vitest';
import { gardenOf } from '../../src/core/garden';
import { createNewState } from '../../src/core/state';

describe('garden', () => {
  it('a new game: only row 1 is open, every plant a sprout, row 1 glows', () => {
    const g = gardenOf(createNewState(0));
    expect(g.rows.map((r) => r.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(g.rows.map((r) => r.unlocked)).toEqual([true, false, false, false, false, false, false, false, false]);
    expect(g.rows[0].stars).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(g.rows[0].crop).toBe('wheat');
    expect(g.rows[4].crop).toBe('corn');
    expect(g).toMatchObject({ grown: 0, total: 81, glowRow: 1 });
  });

  it('plant size follows the stars of that fact; locked rows stay bare', () => {
    const s = createNewState(0);
    s.unlocked = 3; // rows 1, 2, 5
    s.mastery['2,4'] = 6; // 3 stars
    s.mastery['2,5'] = 4; // 2 stars
    s.mastery['5,9'] = 3; // 1 star
    s.mastery['3,3'] = 6; // row 3 is locked: not shown
    const g = gardenOf(s);
    expect(g.rows[1].stars).toEqual([0, 0, 0, 3, 2, 0, 0, 0, 0]);
    expect(g.rows[4].stars[8]).toBe(1);
    expect(g.rows[2]).toMatchObject({ unlocked: false, grown: 0 });
    expect(g.rows[2].stars.every((x) => x === 0)).toBe(true);
    expect(g.rows[1].grown).toBe(1);
    expect(g.grown).toBe(1);
  });

  it('glows the same row as the field', () => {
    const s = createNewState(0);
    s.unlocked = 2;
    expect(gardenOf(s).glowRow).toBe(2);
  });
});
