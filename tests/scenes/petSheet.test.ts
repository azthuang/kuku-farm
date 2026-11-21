import { describe, it, expect } from 'vitest';
import { BREED_COLS, SHEET_COLS, SLEEP_COL, WALK_FPS, petFrame, walkCycle } from '../../src/scenes/petSheet';

describe('pet sheet layout', () => {
  it('four breeds side by side, five columns each: walk frames, then lying down', () => {
    expect(BREED_COLS).toBe(5);
    expect(SHEET_COLS).toBe(20);
    expect(SLEEP_COL).toBe(4);
    expect(petFrame(0, 0, 0)).toBe(0);
    expect(petFrame(1, 0, 0)).toBe(5);
    expect(petFrame(3, 4, 4)).toBe(4 * 20 + 15 + 4);
  });

  it('a walk is four steps (one side spread, legs passing, the other side spread, passing), six a second', () => {
    expect(walkCycle(1, 0)).toEqual([5, 6, 7, 8]);
    expect(walkCycle(2, 3)).toEqual([70, 71, 72, 73]);
    expect(WALK_FPS).toBe(6);
  });
});
