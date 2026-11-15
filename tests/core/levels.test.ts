import { describe, it, expect } from 'vitest';
import { LEVEL_ORDER, CROP_BY_ROW, unlockedRows, nextRow } from '../../src/core/levels';

describe('levels', () => {
  it('has the unlock order', () => {
    expect(LEVEL_ORDER).toEqual([1, 2, 5, 4, 8, 3, 6, 7, 9]);
  });
  it('crop values follow unlock order', () => {
    expect([1, 2, 5, 4, 8, 3, 6, 7, 9].map((r) => CROP_BY_ROW[r].value)).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('maps crops', () => {
    expect(CROP_BY_ROW[2]).toMatchObject({ id: 'carrot', emoji: '🥕', name: '紅蘿蔔' });
    expect(CROP_BY_ROW[9]).toMatchObject({ id: 'watermelon', emoji: '🍉', name: '西瓜' });
  });
  it('unlockedRows and nextRow', () => {
    expect(unlockedRows(1)).toEqual([1]);
    expect(unlockedRows(3)).toEqual([1, 2, 5]);
    expect(nextRow(3)).toBe(4);
    expect(nextRow(9)).toBeNull();
  });
});
