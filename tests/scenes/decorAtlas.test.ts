import { describe, expect, it } from 'vitest';
import { DECOR_LPC_FRAMES, DECOR_LPC_SIZE } from '../../src/scenes/decorAtlas';

describe('decoration atlas (LPC)', () => {
  it('has the eight LPC decorations (the pond too), each inside the image', () => {
    expect(Object.keys(DECOR_LPC_FRAMES).sort()).toEqual(['bluebells', 'bush', 'flowers', 'mushroom', 'pond', 'roses', 'sunflowers', 'tree']);
    for (const [id, [x, y, w, h]] of Object.entries(DECOR_LPC_FRAMES)) {
      expect(x >= 0 && y >= 0 && w > 0 && h > 0, id).toBe(true);
      expect(x + w <= DECOR_LPC_SIZE.w && y + h <= DECOR_LPC_SIZE.h, id).toBe(true);
    }
  });
});

import { DECOR_MADE_FRAMES, DECOR_MADE_SIZE, SPECIAL_FRAMES } from '../../src/scenes/decorMadeAtlas';
import { DECOR_ORDER, SPECIAL_ORDER } from '../../src/core/decor';
import { DECOR_LPC_FRAMES as LPC } from '../../src/scenes/decorAtlas';

describe('decoration atlas (generated)', () => {
  it('draws every decoration the LPC sheets do not, the three pigeon poses and all five specials', () => {
    const drawn = new Set([...Object.keys(LPC), ...Object.keys(DECOR_MADE_FRAMES)]);
    for (const id of DECOR_ORDER) if (id !== 'pigeons') expect(drawn.has(id), id).toBe(true);
    for (const p of ['pigeon0', 'pigeon1', 'pigeon2']) expect(p in DECOR_MADE_FRAMES, p).toBe(true);
    expect(Object.keys(SPECIAL_FRAMES).sort()).toEqual([...SPECIAL_ORDER].sort());
  });

  it('also has the rocket and its launch pad apart, each the size of the whole, so the rocket can lift off', () => {
    expect(DECOR_MADE_FRAMES.rocketBody.slice(2)).toEqual(SPECIAL_FRAMES.rocket.slice(2));
    expect(DECOR_MADE_FRAMES.rocketPad.slice(2)).toEqual(SPECIAL_FRAMES.rocket.slice(2));
  });

  it('keeps every frame inside the image', () => {
    for (const [id, [x, y, w, h]] of Object.entries({ ...DECOR_MADE_FRAMES, ...SPECIAL_FRAMES })) {
      expect(x >= 0 && y >= 0 && w > 0 && h > 0, id).toBe(true);
      expect(x + w <= DECOR_MADE_SIZE.w && y + h <= DECOR_MADE_SIZE.h, id).toBe(true);
    }
  });
});
