import { describe, it, expect } from 'vitest';
import { COUNT_MAX_MS, countTiming } from '../../src/ui/timing';

describe('countTiming', () => {
  it('keeps every step readable and the whole count under 12 s', () => {
    for (let a = 1; a <= 9; a++) {
      const t = countTiming(a);
      expect(t.minMs).toBeGreaterThanOrEqual(500);
      expect(t.minMs).toBeLessThanOrEqual(t.speechMaxMs);
      expect(t.speechMaxMs).toBeLessThanOrEqual(1500);
      expect(a * Math.max(t.minMs, t.speechMaxMs)).toBeLessThanOrEqual(COUNT_MAX_MS);
    }
  });

  it('gives small blocks the full speech wait and shortens big ones', () => {
    expect(countTiming(2)).toEqual({ minMs: 800, speechMaxMs: 1500 });
    expect(countTiming(9)).toEqual({ minMs: 800, speechMaxMs: 1333 });
  });
});
