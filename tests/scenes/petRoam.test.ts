import { describe, expect, it } from 'vitest';
import { buildRoamGraph, nearestNode, route } from '../../src/scenes/petRoam';
import { SCENERY_WORLD, overlaps, propBox, sceneryLayout, type Rect } from '../../src/scenes/ranchScenery';

// Same geometry as RanchScene: the six plots in page order on a 2 × 3 grid.
const cell = (i: number): Rect => ({ x: (i % 2) * 600 + 30, y: Math.floor(i / 2) * 600 + 80, w: 540, h: 440 });
const LOTS = [0, 1, 2, 3, 4, 5].map(cell);
const layout = sceneryLayout(LOTS);
const W = SCENERY_WORLD;
const BOUNDS: Rect = { x: W.x + 40, y: W.y + 40, w: W.w - 80, h: W.h - 80 };
const g = buildRoamGraph(layout.paths, BOUNDS, layout.petRest);

const strictlyInside = (x: number, y: number, r: Rect): boolean => x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1;

describe('pet roaming network', () => {
  it('is one connected network that stays inside the world', () => {
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const m of g.adj[q.shift()!]) if (!seen.has(m)) { seen.add(m); q.push(m); }
    expect(seen.size).toBe(g.nodes.length);
    for (const n of g.nodes) {
      expect(n.x >= BOUNDS.x && n.x <= BOUNDS.x + BOUNDS.w && n.y >= BOUNDS.y && n.y <= BOUNDS.y + BOUNDS.h).toBe(true);
    }
  });

  it('never walks through a pen, the field plot or a building', () => {
    // the farmhouse door path starts on its doorstep (the bottom 16 units of the sprite)
    const solid = layout.props.filter(p => p.kind === 'farmhouse' || p.kind === 'mill').map(propBox)
      .map(b => ({ ...b, h: b.h - 16 }));
    g.adj.forEach((ns, i) => {
      for (const j of ns) {
        const a = g.nodes[i];
        const b = g.nodes[j];
        expect(a.x === b.x || a.y === b.y, 'axis aligned').toBe(true);
        for (let t = 0; t <= 1; t += 0.05) {
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          for (const r of LOTS) expect(strictlyInside(x, y, r), `${x},${y}`).toBe(false);
          for (const r of solid) expect(overlaps({ x, y: y - 10, w: 1, h: 10 }, r, -6), `${x},${y}`).toBe(false);
        }
      }
    });
  });

  it('reaches every resting spot (door, big tree, mill) from anywhere', () => {
    expect(g.rest).toHaveLength(3);
    for (const r of g.rest) {
      const path = route(g, 0, r);
      expect(path[0]).toBe(0);
      expect(path[path.length - 1]).toBe(r);
      for (let i = 1; i < path.length; i++) expect(g.adj[path[i - 1]]).toContain(path[i]);
    }
    expect(nearestNode(g, g.nodes[5].x + 3, g.nodes[5].y - 2)).toBe(5);
  });
});
