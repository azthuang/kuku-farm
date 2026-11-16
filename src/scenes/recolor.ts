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
 * chicken_walk.png (LPC farm animals) uses three white/grey feather shades,
 * light to dark: 0xefe9e7, 0xb7b3b2, 0x827c7c. The outline/eyes (0x3a3737,
 * 0x222121), comb (0xc84141, 0x9e3e37, 0x5c1f1a) and beak/feet (0xcf7b49)
 * are left alone. Each variant maps the three feather shades to three shades
 * of its own color in the same light-to-dark order so the shading survives.
 * White = original (no swaps).
 */
export const CHICKEN_PALETTES: Record<'white' | 'brown' | 'black', ReadonlyArray<readonly [number, number]>> = {
  white: [],
  brown: [
    [0xefe9e7, 0xd9a566],
    [0xb7b3b2, 0xb27a45],
    [0x827c7c, 0x82552f],
  ],
  black: [
    [0xefe9e7, 0x6e6a74],
    [0xb7b3b2, 0x504c58],
    [0x827c7c, 0x423e4a],
  ],
};
