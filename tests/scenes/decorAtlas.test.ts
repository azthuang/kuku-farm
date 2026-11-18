import { describe, expect, it } from 'vitest';
import { DECOR_LPC_FRAMES, DECOR_LPC_SIZE } from '../../src/scenes/decorAtlas';

describe('decoration atlas (LPC)', () => {
  it('has the six LPC decorations (the pumpkins are drawn: the LPC ones look like tomatoes), each inside the image', () => {
    expect(Object.keys(DECOR_LPC_FRAMES).sort()).toEqual(['beehive', 'bush', 'flowers', 'hay', 'sunflowers', 'tree']);
    for (const [id, [x, y, w, h]] of Object.entries(DECOR_LPC_FRAMES)) {
      expect(x >= 0 && y >= 0 && w > 0 && h > 0, id).toBe(true);
      expect(x + w <= DECOR_LPC_SIZE.w && y + h <= DECOR_LPC_SIZE.h, id).toBe(true);
    }
  });
});
