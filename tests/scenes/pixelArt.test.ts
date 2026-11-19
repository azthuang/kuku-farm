import { describe, it, expect, vi } from 'vitest';

// Phaser needs a real canvas; outlined() does not touch it.
vi.mock('phaser', () => ({ default: {} }));

import { outlined } from '../../src/scenes/pixelArt';

describe('outlined', () => {
  it('pads the picture by one pixel and rings every filled pixel with the outline (not corners)', () => {
    expect(outlined(['R'])).toEqual(['.o.', 'oRo', '.o.']);
    expect(outlined(['R.', '.R'])).toEqual([
      '.o..',
      'oRo.',
      '.oRo',
      '..o.',
    ]);
  });
});
