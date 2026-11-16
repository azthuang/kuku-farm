import { describe, expect, it } from 'vitest';
import {
  BLADE_HUB, SCENERY_SCALE, SCENERY_WORLD, crossesPageEdge, isBig, isTree, isUnderstory, onPath, overlaps, propBox,
  sceneryLayout, segDist, type Prop, type Rect,
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

  describe('clusters', () => {
    const members = (i: number): Prop[] => layout.props.filter(p => p.cluster === i);
    const dist = (p: Prop, c: { x: number; y: number }): number => Math.hypot(p.x - c.x, p.y - c.y);

    it('puts every plant in a cluster of one kind (or two related ones), at least two to a patch', () => {
      const free = layout.props.filter(p => p.cluster === undefined).map(p => p.kind);
      expect(free.every(k => !isBig(k) && !isUnderstory(k) && !k.startsWith('fl') && !k.startsWith('tiny'))).toBe(true);
      layout.clusters.forEach((c, i) => {
        const m = members(i);
        expect(c.kinds.length).toBeLessThanOrEqual(2);
        expect(m.every(p => c.kinds.includes(p.kind)), c.kinds.join('/')).toBe(true);
        if (!c.kinds.some(isUnderstory)) expect(m.length, c.kinds.join('/')).toBeGreaterThanOrEqual(2);
      });
    });

    it('keeps each cluster nearer its own centre than any other cluster', () => {
      layout.clusters.forEach((c, i) => {
        const m = members(i);
        const own = m.reduce((s, p) => s + dist(p, c), 0) / m.length;
        const other = m.reduce((s, p) => s + Math.min(...layout.clusters.filter((_, j) => j !== i).map(o => dist(p, o))), 0) / m.length;
        expect(own, c.kinds.join('/')).toBeLessThan(other);
      });
    });

    it('lets trees of one grove overlap without stacking trunks', () => {
      const trees = layout.props.filter(p => isTree(p.kind));
      expect(trees.length).toBeGreaterThanOrEqual(8);
      let overlapping = 0;
      for (const a of trees) {
        for (const b of trees) {
          if (a === b) continue;
          if (overlaps(propBox(a), propBox(b))) overlapping++;
          expect(Math.abs(a.x - b.x) > 20 || Math.abs(a.y - b.y) > 40, `${a.kind} ${a.x},${a.y} / ${b.kind} ${b.x},${b.y}`).toBe(true);
        }
      }
      expect(overlapping).toBeGreaterThan(0);
    });

    it('never leaves a big tree standing alone', () => {
      const trees = layout.props.filter(p => isTree(p.kind));
      for (const t of trees) {
        expect(trees.some(o => o !== t && dist(o, t) < 260), `${t.kind} at ${t.x},${t.y}`).toBe(true);
      }
    });

    it('grows mushrooms and stumps only in the shade of a grove', () => {
      const trees = layout.props.filter(p => isTree(p.kind));
      const under = layout.props.filter(p => isUnderstory(p.kind));
      expect(under.length).toBeGreaterThan(0);
      for (const u of under) expect(trees.some(t => dist(u, t) < 220), `${u.kind} at ${u.x},${u.y}`).toBe(true);
    });

    it('keeps trees out of the grid between the pens (they line the side strips)', () => {
      for (const t of layout.props.filter(p => isBig(p.kind))) {
        const b = propBox(t);
        expect(b.x + b.w <= 0 || b.x >= 1200, `${t.kind} at ${t.x},${t.y}`).toBe(true);
      }
    });
  });
});
