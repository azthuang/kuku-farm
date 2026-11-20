/**
 * Frame rects (x, y, w, h) in public/assets/decor/made.png: decorations and specials generated
 * with the Antigravity CLI image model and reduced to pixel art for this project (no third-party
 * art). Generated with the atlas.
 */
export const DECOR_MADE_FRAMES = {
  scarecrow: [55, 2, 52, 60],
  well: [109, 2, 41, 60],
  pumpkins: [152, 2, 51, 44],
  pigeon0: [750, 2, 14, 14],
  pigeon1: [766, 2, 20, 12],
  pigeon2: [788, 2, 13, 14],
  // the rocket in two parts, each the whole rocket's size: it lifts off and leaves its pad behind
  rocketBody: [805, 2, 77, 150],
  rocketPad: [884, 2, 77, 150],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const SPECIAL_FRAMES = {
  xmasTree: [205, 2, 109, 150],
  balloon: [316, 2, 99, 150],
  rocket: [417, 2, 77, 150],
  ufo: [496, 2, 125, 86],
  dino: [623, 2, 125, 138],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const DECOR_MADE_SIZE = { w: 963, h: 154 } as const;
