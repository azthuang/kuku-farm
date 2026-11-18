import { describe, expect, it } from 'vitest';
import { BIG_SPOTS, DECOR_SPOTS, bigBox, bigFoot, createBusy, spotBox } from '../../src/scenes/decorLayout';
import { LOT_IN_CELL, footprint, lotRect, overlaps, propBox, sceneryLayout, segDist, type Rect } from '../../src/scenes/ranchScenery';
import { SPOT_IDS, spotLot } from '../../src/core/decor';

const LOTS = Array.from({ length: 6 }, (_, i) => lotRect(i));
const layout = sceneryLayout(LOTS);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const boxPathGap = (b: Rect): number => Math.min(...layout.paths.map(s => Math.min(
  segDist(s, b.x, b.y), segDist(s, b.x + b.w, b.y), segDist(s, b.x, b.y + b.h), segDist(s, b.x + b.w, b.y + b.h),
  segDist(s, b.x + b.w / 2, b.y + b.h / 2),
)));
/** Distance from a point to the stream's centre line. */
const riverGap = (x: number, y: number): number => {
  let best = Infinity;
  for (let i = 1; i < layout.river.length; i++) {
    const a = layout.river[i - 1];
    const b = layout.river[i];
    best = Math.min(best, segDist({ x0: a.x, y0: a.y, x1: b.x, y1: b.y }, x, y));
  }
  return best;
};

describe('decoration spots', () => {
  it('LOT_IN_CELL is unchanged by the move', () => {
    expect(LOT_IN_CELL).toEqual({ x: 30, y: 80, w: 540, h: 440 });
    expect(lotRect(3)).toEqual({ x: 630, y: 680, w: 540, h: 440 });
  });

  it('spots stay in their own page, off pens, paths and each other', () => {
    for (const s of SPOT_IDS) {
      const p = DECOR_SPOTS[s];
      const b = spotBox(s);
      const lot = spotLot(s);
      const cell = { x: (lot % 2) * 600, y: Math.floor(lot / 2) * 600, w: 600, h: 600 };
      expect(b.x >= cell.x && b.x + b.w <= cell.x + cell.w && b.y >= cell.y && b.y + b.h <= cell.y + cell.h, s).toBe(true);
      for (const r of LOTS) expect(overlaps(b, r), s).toBe(false);
      expect(boxPathGap(b), s).toBeGreaterThan(layout.pathHalf);
      expect(p.x).toBe(b.x + b.w / 2);
    }
    for (const a of SPOT_IDS) for (const b of SPOT_IDS) {
      if (a < b) expect(overlaps(spotBox(a), spotBox(b)), `${a} ${b}`).toBe(false);
    }
  });

  it('big spots sit in the side strips, clear of the stream, the paths and the farmhouse', () => {
    expect(BIG_SPOTS).toHaveLength(2);
    const house = layout.props.find(p => p.kind === 'farmhouse')!;
    for (const slot of [0, 1] as const) {
      const b = bigBox(slot);
      expect(b.x + b.w <= 0 || b.x >= 1200, `slot ${slot}`).toBe(true);
      expect(b.x >= -300 && b.x + b.w <= 1500 && b.y >= 0 && b.y + b.h <= 1800, `slot ${slot}`).toBe(true);
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        expect(riverGap(x, y), `slot ${slot}`).toBeGreaterThan(layout.riverHalf);
      }
      expect(boxPathGap(b), `slot ${slot}`).toBeGreaterThan(layout.pathHalf);
      expect(overlaps(b, propBox(house)), `slot ${slot}`).toBe(false);
      for (const r of layout.petRest) expect(dist(r.spot, BIG_SPOTS[slot])).toBeGreaterThan(120);
    }
  });

  it('the scenery leaves the ordinary spots wholly open', () => {
    for (const p of layout.props) {
      for (const s of SPOT_IDS) expect(overlaps(propBox(p), spotBox(s)), `${p.kind} at ${p.x},${p.y}`).toBe(false);
    }
  });

  it('a big spot keeps its feet clear and nothing stands in front of it (trees may rise behind)', () => {
    for (const p of layout.props) {
      for (const slot of [0, 1] as const) {
        expect(overlaps(footprint(p), bigFoot(slot)), `${p.kind} at ${p.x},${p.y}`).toBe(false);
        if (p.y > BIG_SPOTS[slot].y - 10) expect(overlaps(propBox(p), bigBox(slot)), `${p.kind} at ${p.x},${p.y}`).toBe(false);
      }
    }
  });
});

describe('one show at a time', () => {
  it('a second start while the first still runs is refused; after it ends it starts again', () => {
    const busy = createBusy();
    expect(busy.start('rocket', 4000, 1000)).toBe(true);
    expect(busy.busy('rocket', 2000)).toBe(true);
    expect(busy.start('rocket', 4000, 4999)).toBe(false);
    expect(busy.busy('rocket', 5000)).toBe(false);
    expect(busy.start('rocket', 4000, 5000)).toBe(true);
  });

  it('keys are independent', () => {
    const busy = createBusy();
    busy.start('rocket', 4000, 0);
    expect(busy.start('1-1', 1600, 10)).toBe(true);
    expect(busy.busy('ufo', 10)).toBe(false);
  });

  it('clear ends every show (a new scene, an import)', () => {
    const busy = createBusy();
    busy.start('rocket', 4000, 0);
    busy.clear();
    expect(busy.busy('rocket', 1)).toBe(false);
  });
});
