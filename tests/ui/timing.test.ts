import { describe, it, expect } from 'vitest';
import { COUNT_MAX_MS, countRowTiming } from '../../src/ui/timing';

describe('countRowTiming', () => {
  it('keeps every row readable and the whole count under 8 s', () => {
    for (let a = 1; a <= 9; a++) {
      const t = countRowTiming(a);
      expect(t.minMs).toBeGreaterThanOrEqual(500);
      expect(t.minMs).toBeLessThanOrEqual(t.speechMaxMs);
      expect(t.speechMaxMs).toBeLessThanOrEqual(1500);
      expect(a * Math.max(t.minMs, t.speechMaxMs)).toBeLessThanOrEqual(COUNT_MAX_MS);
    }
  });

  it('gives small blocks the full speech wait and shortens big ones', () => {
    expect(countRowTiming(2)).toEqual({ minMs: 800, speechMaxMs: 1500 });
    expect(countRowTiming(9)).toEqual({ minMs: 800, speechMaxMs: 888 });
  });
});
