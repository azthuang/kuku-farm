import type { SpeciesId } from '../core/species';

type Swaps = ReadonlyArray<readonly [number, number]>;

/** Exact-match palette swap on RGBA pixel data. Alpha is never touched. */
export function recolor(
  data: Uint8ClampedArray,
  swaps: ReadonlyArray<readonly [from: number, to: number]>,
): void {
  if (swaps.length === 0) return;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    for (const [from, to] of swaps) {
      if (rgb === from) {
        data[i] = (to >> 16) & 255;
        data[i + 1] = (to >> 8) & 255;
        data[i + 2] = to & 255;
        break;
      }
    }
  }
}

/**
 * Per-species coat palettes, keyed by the colour names in SPECIES[s].colors. The first
 * colour of each species is the original art (no swaps). Each other coat maps the fur/hide
 * shades to shades of its own colour in the same light-to-dark order so the shading
 * survives; outlines (0x222121, and 0x3a3737 where it is the outline), eyes, snouts, hooves,
 * udders and horns are left alone.
 *
 * chicken: feathers 0xefe9e7 / 0xb7b3b2 / 0x827c7c.
 * cow: whites 0xefe9e7 / 0xd2cdcb, shadow 0x827c7c, patches 0x3a3737.
 * pig: skin 0xfdd5b7 / 0xd29e84.
 * sheep and llama: wool 0xefe9e7 / 0xdbd2ca / 0xb7b3b2 / 0x827c7c.
 */
export const PALETTES: Record<SpeciesId, Record<string, Swaps>> = {
  chicken: {
    白: [],
    棕: [
      [0xefe9e7, 0xd9a566],
      [0xb7b3b2, 0xb27a45],
      [0x827c7c, 0x82552f],
    ],
    黑: [
      [0xefe9e7, 0x6e6a74],
      [0xb7b3b2, 0x504c58],
      [0x827c7c, 0x423e4a],
    ],
  },
  cow: {
    黑白花: [],
    棕白花: [[0x3a3737, 0x7a4a2a]],
    奶油色淡花: [
      [0xefe9e7, 0xf7ecd0],
      [0xd2cdcb, 0xe2d0a8],
      [0x827c7c, 0xb09a72],
      [0x3a3737, 0xd4b480],
    ],
  },
  pig: {
    粉紅: [],
    棕: [
      [0xfdd5b7, 0xc08a58],
      [0xd29e84, 0x93603a],
    ],
    黑: [
      [0xfdd5b7, 0x5e5a66],
      [0xd29e84, 0x423e4c],
    ],
  },
  sheep: {
    白: [],
    灰: [
      [0xefe9e7, 0xbcbcc2],
      [0xdbd2ca, 0xa6a5ad],
      [0xb7b3b2, 0x8c8b94],
      [0x827c7c, 0x6c6b74],
    ],
    黑: [
      [0xefe9e7, 0x686470],
      [0xdbd2ca, 0x58545f],
      [0xb7b3b2, 0x48444f],
      [0x827c7c, 0x38353f],
    ],
  },
  llama: {
    白: [],
    淺棕: [
      [0xefe9e7, 0xdcb98e],
      [0xdbd2ca, 0xcba479],
      [0xb7b3b2, 0xb08659],
      [0x827c7c, 0x7e5a38],
    ],
    深棕: [
      [0xefe9e7, 0x86644a],
      [0xdbd2ca, 0x765640],
      [0xb7b3b2, 0x63462f],
      [0x827c7c, 0x4a3322],
    ],
  },
};

/** The chicken coats under the scene's English keys (RanchScene still uses these). */
export const CHICKEN_PALETTES: Record<'white' | 'brown' | 'black', Swaps> = {
  white: PALETTES.chicken['白'],
  brown: PALETTES.chicken['棕'],
  black: PALETTES.chicken['黑'],
};
