/**
 * Frame rects (x, y, w, h) in public/assets/decor/lpc.png: decorations cut from the LPC farm,
 * plant and tree sheets credited in CREDITS.md (CC-BY-SA 3.0). Generated with the atlas.
 */
export const DECOR_LPC_FRAMES = {
  beehive: [223, 2, 31, 39],
  bush: [91, 2, 32, 32],
  flowers: [2, 2, 43, 42],
  hay: [170, 2, 51, 69],
  sunflowers: [47, 2, 42, 31],
  tree: [125, 2, 43, 50],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const DECOR_LPC_SIZE = { w: 256, h: 73 } as const;
