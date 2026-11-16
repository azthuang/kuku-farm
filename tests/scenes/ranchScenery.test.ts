import { describe, expect, it } from 'vitest';
import {
  FLOWERS, SCENERY_SCALE, SCENERY_WORLD, WHEEL_SHEET_CLOCKWISE, crossesPageEdge, isAfloat, isBig, isFlower, isTree,
  isUnderstory, isWater, isWaterside, lineDist, onPath, overlaps, propBox, sceneryLayout, segDist, wheelFrameOrder,
  type Prop, type Rect,
} from '../../src/scenes/ranchScenery';
import { GATE, drawRun, gateRect } from '../../src/scenes/ranchArt';
import { SPECIES, SPECIES_ORDER } from '../../src/core/species';
import { SCENERY_FRAMES } from '../../src/scenes/sceneryAtlas';

// Same geometry as RanchScene: 600-wide cells on a 2 × 3 grid, the lot inset (30, 80, 540, 440).
const cell = (i: number): Rect => ({ x: (i % 2) * 600 + 30, y: Math.floor(i / 2) * 600 + 80, w: 540, h: 440 });
// The six plots in page order: the garden (cell 0), then the five pens.
const LOTS = [0, 1, 2, 3, 4, 5].map(cell);
const layout = sceneryLayout(LOTS);

const inside = (b: Rect, r: Rect): boolean => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;

describe('ranch scenery layout', () => {
  it('is the same every time', () => {
    expect(sceneryLayout(LOTS)).toEqual(layout);
  });

  it('keeps every prop inside the overview world', () => {
    for (const p of layout.props) expect(inside(propBox(p), SCENERY_WORLD), `${p.kind} at ${p.x},${p.y}`).toBe(true);
  });

  it('never puts a prop on the garden or a pen', () => {
    for (const p of layout.props) {
      const b = propBox(p);
      for (const r of LOTS) expect(overlaps(b, r), `${p.kind} at ${p.x},${p.y}`).toBe(false);
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
        for (const r of LOTS) {
          expect(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h, `path point ${x},${y}`).toBe(false);
        }
      }
    }
    // every pen's gate (bottom middle of its fence) is on a path
    for (const r of LOTS) {
      expect(layout.paths.some(s => segDist(s, r.x + r.w / 2, r.y + r.h) < 1)).toBe(true);
    }
  });

  describe('the stream', () => {
    const toRiver = (x: number, y: number): number => lineDist(layout.river, x, y);

    it('flows from the top of the world to the bottom inside the right strip, clear of the pens', () => {
      expect(layout.river[0].y).toBeLessThanOrEqual(0);
      expect(layout.river[layout.river.length - 1].y).toBeGreaterThanOrEqual(SCENERY_WORLD.h);
      // every water tile corner, with the bank tiles around it, lies east of the grid
      for (let j = 0; j < 30; j++) {
        for (let i = 0; i < 30; i++) {
          if (!isWater(i, j)) continue;
          const x = SCENERY_WORLD.x + i * 32 * SCENERY_SCALE;
          expect(x - 32 * SCENERY_SCALE, `corner ${i},${j}`).toBeGreaterThanOrEqual(1200);
          expect(x + 32 * SCENERY_SCALE, `corner ${i},${j}`).toBeLessThanOrEqual(SCENERY_WORLD.x + SCENERY_WORLD.w);
        }
      }
      for (const r of LOTS) {
        for (const c of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
          expect(toRiver(c[0], c[1])).toBeGreaterThan(layout.riverHalf + 20);
        }
      }
    });

    it('carries every path over the water on a bridge', () => {
      let crossings = 0;
      for (const s of layout.paths) {
        let wet = false;
        for (let t = 0; t <= 1; t += 0.002) {
          const x = s.x0 + (s.x1 - s.x0) * t;
          const y = s.y0 + (s.y1 - s.y0) * t;
          const w = toRiver(x, y) <= layout.riverHalf;
          if (w) expect(layout.bridges.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h), `path over water at ${x},${y}`).toBe(true);
          if (w && !wet) crossings++;
          wet = w;
        }
      }
      expect(crossings).toBe(layout.bridges.length);
      expect(crossings).toBeGreaterThanOrEqual(1);
    });

    it('turns the water wheel with the stream: its dipped paddles move the way the water runs', () => {
      // At the bend the water runs east, so the bottom of the wheel moves east: anticlockwise.
      expect(layout.wheelFlow).toEqual({ dx: 1, dy: 0 });
      const order = wheelFrameOrder(layout.wheelFlow);
      const sheetOrder = [0, 1, 2, 3];
      expect(WHEEL_SHEET_CLOCKWISE).toBe(true);
      expect(order).toEqual([...sheetOrder].reverse());
      expect(wheelFrameOrder({ dx: -1 })).toEqual(sheetOrder);
    });

    it('turns the water wheel in the stream beside the mill', () => {
      expect(toRiver(layout.wheel.x, layout.wheel.y - 30)).toBeLessThan(layout.riverHalf);
      const mill = layout.props.find(p => p.kind === 'mill');
      expect(mill).toBeDefined();
      if (mill) expect(Math.abs(mill.x - layout.wheel.x)).toBeLessThan(120);
      expect(layout.wheel.x - 64).toBeGreaterThanOrEqual(1200);
    });

    it('keeps land plants out of the water, with reeds on the banks and lily pads afloat', () => {
      for (const p of layout.props) {
        const d = toRiver(p.x, p.y);
        if (isAfloat(p.kind)) expect(toRiver(p.x, p.y - propBox(p).h / 2), p.kind).toBeLessThan(layout.riverHalf);
        else if (isWaterside(p.kind)) expect(d, p.kind).toBeLessThan(layout.riverHalf + 60);
        else if (p.kind !== 'mill') expect(d, `${p.kind} at ${p.x},${p.y}`).toBeGreaterThan(layout.riverHalf);
      }
      expect(layout.props.some(p => isWaterside(p.kind))).toBe(true);
      expect(layout.props.some(p => isAfloat(p.kind))).toBe(true);
    });
  });

  describe('hierarchy and density', () => {
    const trees = layout.props.filter(p => isTree(p.kind));
    const area = (p: Prop): number => propBox(p).w * propBox(p).h;

    it('makes the farmhouse tree the biggest tree on the map, by the house', () => {
      const hero = layout.props.find(p => p.kind === 'heroTree');
      expect(hero).toBeDefined();
      if (!hero) return;
      for (const t of trees) if (t !== hero) expect(area(hero)).toBeGreaterThan(area(t) * 1.4);
      const house = layout.props.find(p => p.kind === 'farmhouse');
      expect(house && Math.hypot(hero.x - house.x, hero.y - house.y)).toBeLessThan(650);
    });

    it('packs the bottom-left wood densely and leaves the lawn before the farmhouse door open', () => {
      const W = SCENERY_WORLD;
      const inRect = (p: Prop, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      const wood: Rect = { x: W.x, y: 1100, w: 300, h: 700 };
      // greenery per unit of ground: the sprites' areas (overlapping woods count more than once)
      const plants = layout.props.filter(p => p.cluster !== undefined);
      const cover = (ps: Prop[]): number => ps.reduce((s, p) => s + area(p), 0);
      const inWood = cover(plants.filter(p => inRect(p, wood)));
      const free = W.w * W.h - LOTS.reduce((s, r) => s + r.w * r.h, 0);
      expect(inWood / (wood.w * wood.h)).toBeGreaterThan(3 * (cover(plants) / free));
      const door: Rect = { x: W.x + 90, y: 380, w: 120, h: 150 };
      expect(plants.filter(p => inRect(p, door))).toEqual([]);
    });

    it('keeps the lawn beside the paths open except for edge flowers and stones', () => {
      for (const p of layout.props) {
        if (p.cluster === undefined || isAfloat(p.kind)) continue;
        const k = p.kind;
        const edgy = isFlower(k) || k.startsWith('rock');
        if (!edgy) expect(onPath(p, layout.paths, 30), `${k} at ${p.x},${p.y}`).toBe(false);
      }
    });
  });

  describe('clusters', () => {
    const members = (i: number): Prop[] => layout.props.filter(p => p.cluster === i);
    const dist = (p: Prop, c: { x: number; y: number }): number => Math.hypot(p.x - c.x, p.y - c.y);

    it('puts every plant in a cluster of one kind (or two related ones), at least two to a patch', () => {
      const free = layout.props.filter(p => p.cluster === undefined).map(p => p.kind);
      // only the farmhouse's tree and loose meadow flowers grow outside a cluster
      expect(free.every(k => k === 'heroTree' || isFlower(k) || (!isBig(k) && !isUnderstory(k)))).toBe(true);
      layout.clusters.forEach((c, i) => {
        const m = members(i);
        expect(c.kinds.length).toBeLessThanOrEqual(2);
        expect(m.every(p => c.kinds.includes(p.kind)), c.kinds.join('/')).toBe(true);
        if (!c.kinds.some(isUnderstory)) expect(m.length, c.kinds.join('/')).toBeGreaterThanOrEqual(2);
      });
    });

    // Bushes and undergrowth gather at a wood's feet, so cohesion is measured among clusters of
    // the same sort: trees, bushes, small plants.
    const sortOf = (c: { kinds: string[] }): number =>
      (c.kinds.some(k => isTree(k as Prop['kind'])) ? 2 : c.kinds.some(k => isBig(k as Prop['kind'])) ? 1 : 0);

    it('keeps each cluster nearer its own centre than any other cluster of its sort', () => {
      layout.clusters.forEach((c, i) => {
        const m = members(i);
        const others = layout.clusters.filter((o, j) => j !== i && sortOf(o) === sortOf(c));
        if (others.length === 0) return;
        const own = m.reduce((s, p) => s + dist(p, c), 0) / m.length;
        const other = m.reduce((s, p) => s + Math.min(...others.map(o => dist(p, o))), 0) / m.length;
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
        if (t.kind === 'heroTree') continue; // the farmhouse's tree stands alone on purpose
        expect(trees.some(o => o !== t && dist(o, t) < 260), `${t.kind} at ${t.x},${t.y}`).toBe(true);
      }
    });

    it('grows mushrooms and stumps only in the shade of a grove', () => {
      const trees = layout.props.filter(p => isTree(p.kind));
      const under = layout.props.filter(p => isUnderstory(p.kind));
      expect(under.length).toBeGreaterThan(0);
      for (const u of under) expect(trees.some(t => dist(u, t) < 240), `${u.kind} at ${u.x},${u.y}`).toBe(true);
    });

    it('keeps trees out of the grid between the pens (they line the side strips)', () => {
      for (const t of layout.props.filter(p => isBig(p.kind))) {
        const b = propBox(t);
        expect(b.x + b.w <= 0 || b.x >= 1200, `${t.kind} at ${t.x},${t.y}`).toBe(true);
      }
    });
  });

  describe('meadow flowers', () => {
    const flowers = layout.props.filter(p => isFlower(p.kind));
    const species = (k: Prop['kind']): string =>
      Object.entries(FLOWERS).find(([, ks]) => (ks as readonly string[]).includes(k))?.[0] ?? '';

    it('uses three or four species, and only those', () => {
      const used = new Set(flowers.map(p => species(p.kind)));
      expect(used.size).toBeGreaterThanOrEqual(3);
      expect(used.size).toBeLessThanOrEqual(4);
      const otherFlowers = ['sprBlue', 'sprRed', 'sprYellow', 'flLily', 'flRed', 'daisyY_', 'roses', 'violets', 'fbBlue',
        'fbPurple', 'fbYellow', 'tinyA', 'tinyB', 'tinyC', 'tinyD'];
      expect(layout.props.filter(p => otherFlowers.includes(p.kind))).toEqual([]);
    });

    it('spreads them over the whole map: both strips and every quarter of the grid', () => {
      const regions: Rect[] = [
        { x: -300, y: 0, w: 300, h: 1800 }, { x: 1200, y: 0, w: 300, h: 1800 },
        { x: 0, y: 0, w: 600, h: 900 }, { x: 600, y: 0, w: 600, h: 900 },
        { x: 0, y: 900, w: 600, h: 900 }, { x: 600, y: 900, w: 600, h: 900 },
      ];
      for (const r of regions) {
        expect(flowers.some(p => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h), JSON.stringify(r)).toBe(true);
      }
    });

    it('grows them both in patches and as loose singles and pairs', () => {
      const inPatches = flowers.filter(p => p.cluster !== undefined);
      const loose = flowers.filter(p => p.cluster === undefined);
      expect(inPatches.length).toBeGreaterThanOrEqual(20);
      expect(loose.length).toBeGreaterThanOrEqual(15);
      // some loose flowers stand alone (no flower within 60 units)
      expect(loose.some(p => !flowers.some(o => o !== p && Math.hypot(o.x - p.x, o.y - p.y) < 60))).toBe(true);
    });
  });

  describe('pen gates', () => {
    // A run is LOT_IN_CELL (540 x 440 world units) at 2.5 world units per sprite pixel.
    const W = 540 / 2.5;
    const H = 440 / 2.5;

    it('puts the gate in the middle of the front fence, where the path meets the pen', () => {
      const g = gateRect(W, H);
      expect(g.x + g.w / 2).toBe(W / 2);
      expect(g.y + g.h).toBe(H);
      for (const r of LOTS) {
        const gx = r.x + (g.x + g.w / 2) * 2.5;
        const gy = r.y + (g.y + g.h) * 2.5;
        expect(layout.paths.some(s => segDist(s, gx, gy) < 1), `gate at ${gx},${gy}`).toBe(true);
      }
    });

    it('draws a braced gate into every kind of pen', () => {
      for (const sp of SPECIES_ORDER) {
        const kind = SPECIES[sp].house;
        const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
        const ctx = {
          fillStyle: '',
          fillRect(x: number, y: number, w: number, h: number) { fills.push({ style: String(this.fillStyle), x, y, w, h }); },
        };
        drawRun(ctx as unknown as CanvasRenderingContext2D, W, H, kind);
        const g = gateRect(W, H);
        const brace = fills.filter(f => f.style === GATE.brace);
        expect(brace.length, kind).toBeGreaterThan(4);
        for (const f of brace) {
          expect(f.x >= g.x && f.x + f.w <= g.x + g.w && f.y >= g.y && f.y + f.h <= g.y + g.h, kind).toBe(true);
        }
        // the gate is drawn last, over the fence
        expect(fills[fills.length - 1].y).toBeLessThan(H);
      }
    });
  });
});
