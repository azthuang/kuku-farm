import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHICKEN_PALETTES, recolor } from '../../src/scenes/recolor';

function px(rgb: number, a = 255): number[] {
  return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, a];
}

/** Decode an 8-bit RGBA PNG and return its distinct opaque colors as 0xRRGGBB. */
function pngColors(file: string): Set<number> {
  const b = readFileSync(file);
  let p = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      expect(d[8]).toBe(8);
      expect(d[9]).toBe(6);
    }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  let prev = Buffer.alloc(stride);
  const colors = new Set<number>();
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const u = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let v = row[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += u;
      else if (ft === 3) v += (a + u) >> 1;
      else if (ft === 4) {
        const pp = a + u - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - u);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      if (cur[x * 4 + 3] > 0) colors.add((cur[x * 4] << 16) | (cur[x * 4 + 1] << 8) | cur[x * 4 + 2]);
    }
    prev = cur;
  }
  return colors;
}

describe('recolor', () => {
  it('swaps only listed colors and keeps alpha', () => {
    const data = new Uint8ClampedArray([...px(0xefe9e7, 200), ...px(0x9e3e37), ...px(0xb7b3b2)]);
    recolor(data, [
      [0xefe9e7, 0x112233],
      [0xb7b3b2, 0x445566],
    ]);
    expect(Array.from(data)).toEqual([...px(0x112233, 200), ...px(0x9e3e37), ...px(0x445566)]);
  });

  it('leaves fully transparent pixels alone', () => {
    const data = new Uint8ClampedArray(px(0xefe9e7, 0));
    recolor(data, [[0xefe9e7, 0x112233]]);
    expect(Array.from(data)).toEqual(px(0xefe9e7, 0));
  });

  it('empty swaps change nothing', () => {
    const data = new Uint8ClampedArray(px(0xefe9e7));
    recolor(data, []);
    expect(Array.from(data)).toEqual(px(0xefe9e7));
  });
});

describe('CHICKEN_PALETTES', () => {
  const colors = pngColors('public/assets/ranch/chicken_walk.png');

  it('white is the untouched original', () => {
    expect(CHICKEN_PALETTES.white).toEqual([]);
  });

  it.each(['brown', 'black'] as const)('%s: every from exists in the sprite and none repeats', (name) => {
    const froms = CHICKEN_PALETTES[name].map(([f]) => f);
    expect(froms.length).toBeGreaterThan(0);
    for (const f of froms) expect(colors.has(f)).toBe(true);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('keeps the light to dark ordering of the feathers', () => {
    const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
    for (const name of ['brown', 'black'] as const) {
      const sorted = [...CHICKEN_PALETTES[name]].sort((a, b) => lum(b[0]) - lum(a[0]));
      const tos = sorted.map(([, t]) => lum(t));
      for (let i = 1; i < tos.length; i++) expect(tos[i]).toBeLessThan(tos[i - 1]);
    }
  });
});
