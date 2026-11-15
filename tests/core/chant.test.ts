import { describe, it, expect } from 'vitest';
import { questionText, chantText, toChineseNumber } from '../../src/core/chant';

describe('chant', () => {
  it('questionText', () => {
    expect(questionText(2, 3)).toBe('二乘三');
  });
  it('chantText', () => {
    expect(chantText(1, 1)).toBe('一一得一');
    expect(chantText(2, 3)).toBe('二三得六');
    expect(chantText(2, 5)).toBe('二五一十');
    expect(chantText(3, 4)).toBe('三四十二');
    expect(chantText(4, 5)).toBe('四五二十');
    expect(chantText(5, 5)).toBe('五五二十五');
    expect(chantText(9, 9)).toBe('九九八十一');
  });
  it('toChineseNumber', () => {
    expect([10, 12, 20, 25, 81].map(toChineseNumber)).toEqual(['一十', '十二', '二十', '二十五', '八十一']);
  });
});
