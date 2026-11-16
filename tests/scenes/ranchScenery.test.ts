import { describe, expect, it } from 'vitest';
import {
  BLADE_HUB, SCENERY_SCALE, SCENERY_WORLD, crossesPageEdge, onPath, overlaps, propBox, sceneryLayout, segDist, type Rect,
} from '../../src/scenes/ranchScenery';
import { SCENERY_FRAMES } from '../../src/scenes/sceneryAtlas';

// Same geometry as RanchScene: 600-wide cells on a 2 × 3 grid, the lot inset (30, 80, 540, 440).
const cell = (i: number): Rect => ({ x: (i % 2) * 600 + 30, y: Math.floor(i / 2) * 600 + 80, w: 540, h: 440 });
const LOTS = [0, 1, 2, 3, 4].map(cell);
const LATER = cell(5);
const layout = sceneryLayout(LOTS, LATER);

const inside = (b: Rect, r: Rect): boolean => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;

describe('ranch scenery layout', () => {
  it('is the same every time', () => {
    expect(sceneryLayout(LOTS, LATER)).toEqual(layout);
  });

  it('keeps every prop inside the overview world', () => {
    for (const p of layout.props) expect(inside(propBox(p), SCENERY_WORLD), `${p.kind} at ${p.x},${p.y}`).toBe(true);
  });

  it('never puts a prop on a pen or the 之後擴建 plot (only its sign)', () => {
    for (const p of layout.props) {
      const b = propBox(p);
      for (const r of LOTS) expect(overlaps(b, r), `${p.kind} at ${p.x},${p.y}`).toBe(false);
      if (p.kind === 'sign') expect(inside(b, LATER)).toBe(true);
      else expect(overlaps(b, LATER), `${p.kind} at ${p.x},${p.y}`).toBe(false);
    }
  });

  it('never cuts a prop in half at a care page edge', () => {
    for (const p of layout.props) expect(crossesPageEdge(propBox(p)), `${p.kind} at ${p.x},${p.y}`).toBe(false);
  });

  it('keeps props off the paths (the path starts at the farmhouse door)', () => {
    for (const p of layout.props) {
      if (p.kind === 'farmhouse') continue;
      expect(onPath(p, layout.paths, 0), `${p.kind} at ${p.x},${p.y}`).toBe(false);
    }
  });

  it('runs paths around the pens and up to each gate, never into a pen', () => {
    for (const s of layout.paths) {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = s.x0 + (s.x1 - s.x0) * t;
        const y = s.y0 + (s.y1 - s.y0) * t;
        for (const r of [...LOTS, LATER]) {
          expect(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h, `path point ${x},${y}`).toBe(false);
        }
      }
    }
    // every pen's gate (bottom middle of its fence) is on a path
    for (const r of LOTS) {
      expect(layout.paths.some(s => segDist(s, r.x + r.w / 2, r.y + r.h) < 1)).toBe(true);
    }
  });

  it('turns the windmill blades in the side strip, clear of the pens', () => {
    const size = SCENERY_FRAMES.blade0[2] * SCENERY_SCALE;
    const blades: Rect = {
      x: layout.hub.x - BLADE_HUB.x * SCENERY_SCALE, y: layout.hub.y - BLADE_HUB.y * SCENERY_SCALE, w: size, h: size,
    };
    expect(inside(blades, SCENERY_WORLD)).toBe(true);
    for (const r of [...LOTS, LATER]) expect(overlaps(blades, r)).toBe(false);
    expect(blades.x).toBeGreaterThanOrEqual(1200);
  });
});
