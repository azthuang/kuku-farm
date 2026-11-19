/**
 * Frame rects (x, y, w, h) in public/assets/decor/lpc.png: decorations cut from the LPC farm,
 * plant and tree sheets credited in CREDITS.md (CC-BY-SA 3.0). Generated with the atlas.
 */
export const DECOR_LPC_FRAMES = {
  bluebells: [207, 2, 67, 40],
  bush: [276, 2, 59, 40],
  flowers: [2, 2, 67, 42],
  mushroom: [382, 2, 64, 45],
  pond: [448, 2, 64, 38],
  roses: [137, 2, 68, 38],
  sunflowers: [71, 2, 64, 35],
  tree: [337, 2, 43, 50],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const DECOR_LPC_SIZE = { w: 514, h: 54 } as const;
