import { describe, it, expect } from 'vitest';
import { formatMs } from '../../src/ui/format';

describe('formatMs', () => {
  it('formats m:ss and rounds up partial seconds', () => {
    expect(formatMs(300_000)).toBe('5:00');
    expect(formatMs(299_001)).toBe('5:00');
    expect(formatMs(299_000)).toBe('4:59');
    expect(formatMs(61_000)).toBe('1:01');
    expect(formatMs(9_500)).toBe('0:10');
    expect(formatMs(1)).toBe('0:01');
    expect(formatMs(0)).toBe('0:00');
    expect(formatMs(-5)).toBe('0:00');
  });
});
