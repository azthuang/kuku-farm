import { seeded } from './ranchArt';
import { FARMHOUSE_SIZE, SCENERY_FRAMES, type SceneryFrame } from './sceneryAtlas';

/**
 * The ranch's surroundings: LPC grass, a cobblestone path from the farmhouse to every pen, trees,
 * flowers and a windmill. Everything here is pure layout plus one bake onto a canvas; the scene
 * shows that canvas as a single static image under the pens (only the windmill blades move).
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** World units per LPC pixel (the big animals are drawn at the same scale). */
export const SCENERY_SCALE = 2;
/**
 * The world the overview frames: the 2 × 3 grid of pages (x 0…1200, y 0…1800) plus a 300-wide
 * strip on each side. The baked canvas covers exactly this.
 */
export const SCENERY_WORLD: Rect = { x: -300, y: 0, w: 1800, h: 1800 };
export const BAKE_W = SCENERY_WORLD.w / SCENERY_SCALE;
export const BAKE_H = SCENERY_WORLD.h / SCENERY_SCALE;

export type PropKind = SceneryFrame | 'farmhouse';

/** A sprite standing with its bottom centre at (x, y) in world units. */
export interface Prop { kind: PropKind; x: number; y: number }

export interface Segment { x0: number; y0: number; x1: number; y1: number }

export interface SceneryLayout {
  /** Path centre lines (world) and their half width. */
  paths: Segment[];
  pathHalf: number;
  props: Prop[];
  /** World point of the windmill hub (where the blade sprite is anchored). */
  hub: { x: number; y: number };
}

const TILE = 32;
const PATH_HALF = 22;
/** In blade frames (128 × 128) the hub sits here. */
export const BLADE_HUB = { x: 63, y: 70 };
export const BLADE_FRAMES = 8;

function frameSize(kind: PropKind): { w: number; h: number } {
  if (kind === 'farmhouse') return FARMHOUSE_SIZE;
  const f = SCENERY_FRAMES[kind];
  return { w: f[2], h: f[3] };
}

/** World box of a prop's sprite. */
export function propBox(p: Prop): Rect {
  const { w, h } = frameSize(p.kind);
  const W = w * SCENERY_SCALE;
  const H = h * SCENERY_SCALE;
  return { x: p.x - W / 2, y: p.y - H, w: W, h: H };
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

/** Distance from (x, y) to a segment. */
export function segDist(s: Segment, x: number, y: number): number {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / len2));
  const px = s.x0 + t * dx - x;
  const py = s.y0 + t * dy - y;
  return Math.sqrt(px * px + py * py);
}

function nearPath(paths: readonly Segment[], x: number, y: number, d: number): boolean {
  for (const s of paths) if (segDist(s, x, y) < d) return true;
  return false;
}

/** Does a prop's footprint (the lower part of its box) touch a path? */
export function onPath(p: Prop, paths: readonly Segment[], margin: number): boolean {
  const b = propBox(p);
  const foot = Math.min(b.h, 24);
  for (let fy = b.y + b.h - foot; fy <= b.y + b.h; fy += 6) {
    for (let fx = b.x; fx <= b.x + b.w; fx += 6) {
      if (nearPath(paths, fx, fy, PATH_HALF + margin)) return true;
    }
  }
  return false;
}

/**
 * Care pages show one 600 × 600 cell each (x 0…1200, y 0…1800), so a sprite crossing a cell
 * edge would be cut in half on both pages.
 */
export function crossesPageEdge(b: Rect, page = 600, grid: Rect = { x: 0, y: 0, w: 1200, h: 1800 }): boolean {
  for (let x = grid.x; x <= grid.x + grid.w; x += page) if (b.x < x && b.x + b.w > x) return true;
  if (b.x + b.w <= grid.x || b.x >= grid.x + grid.w) return false;
  for (let y = grid.y + page; y < grid.y + grid.h; y += page) if (b.y < y && b.y + b.h > y) return true;
  return false;
}

const SMALL: readonly [PropKind, number][] = [
  ['tinyA', 5], ['tinyB', 5], ['tinyC', 4], ['tinyD', 4], ['sprigA', 4], ['sprigB', 4],
  ['tuftA', 4], ['tuftC', 3], ['sprBlue', 2], ['sprRed', 2], ['sprYellow', 2],
  ['flW', 3], ['flY', 3], ['flLily', 2], ['flRed', 2], ['daisyW', 2], ['daisyY', 2],
  ['fbBlue', 1], ['fbRed', 1], ['fbYellow', 1], ['fbPurple', 1], ['bluebells', 1], ['roses', 1], ['violets', 1],
  ['rockB', 2], ['rockC', 1], ['mushRed', 1], ['mushYellow', 1], ['mushPurple', 1], ['bushA', 1], ['bushC', 1],
];

/**
 * Where everything goes. `lots` are the five pens' rects and `later` the sixth ("之後擴建")
 * cell's plot; nothing but its sign may overlap them. Deterministic: same layout every run.
 */
export function sceneryLayout(lots: readonly Rect[], later: Rect): SceneryLayout {
  const W = SCENERY_WORLD;
  const keepOut = [...lots, later];
  const bottom = (r: Rect): number => r.y + r.h;
  const centreX = (r: Rect): number => r.x + r.w / 2;
  // Each row's path runs through the band between its pens' fences and the next row.
  const rowY = [bottom(lots[0]) + 40, bottom(lots[2]) + 40, bottom(lots[4]) + 40];
  const leftX = lots[0].x - 70;
  const rightX = W.x + W.w - 150;
  const house: Prop = { kind: 'farmhouse', x: W.x + 150, y: 40 + FARMHOUSE_SIZE.h * SCENERY_SCALE };
  const doorY = house.y - 12;

  const paths: Segment[] = [
    // farmhouse door down to the first row, then along each row of pens
    { x0: house.x, y0: doorY, x1: house.x, y1: rowY[0] },
    { x0: house.x, y0: rowY[0], x1: rightX, y1: rowY[0] },
    { x0: leftX, y0: rowY[0], x1: leftX, y1: rowY[2] },
    { x0: leftX, y0: rowY[1], x1: rightX, y1: rowY[1] },
    { x0: rightX, y0: rowY[0], x1: rightX, y1: rowY[1] },
    { x0: leftX, y0: rowY[2], x1: centreX(later), y1: rowY[2] },
  ];
  // a short apron up to each pen's fence (its gate)
  for (const r of [...lots, later]) {
    paths.push({ x0: centreX(r), y0: bottom(r), x1: centreX(r), y1: bottom(r) + 40 });
  }

  const tower: Prop = { kind: 'tower', x: rightX, y: rowY[0] - PATH_HALF - 2 };
  const towerH = SCENERY_FRAMES.tower[3] * SCENERY_SCALE;
  const hub = { x: tower.x, y: tower.y - towerH + 92 };

  const props: Prop[] = [
    house,
    tower,
    { kind: 'mailbox', x: house.x + 46, y: doorY + 70 },
    { kind: 'veggie', x: W.x + 62, y: rowY[0] - 40 },
    { kind: 'sign', x: centreX(later), y: bottom(later) - 46 },
    // right strip, around the windmill
    { kind: 'haystack', x: rightX + 90, y: rowY[0] - 34 },
    { kind: 'wheat', x: rightX - 92, y: rowY[0] - 32 },
    { kind: 'treeSmall', x: rightX - 84, y: 150 },
    { kind: 'shrubLolly', x: rightX + 96, y: 128 },
    // left strip below the house
    { kind: 'treeRound', x: W.x + 112, y: 870 },
    { kind: 'treePine', x: W.x + 64, y: 1140 },
    { kind: 'bushGreen', x: W.x + 176, y: 1010 },
    { kind: 'treeOak', x: W.x + 116, y: 1440 },
    { kind: 'stumpDaisy', x: W.x + 200, y: 1250 },
    { kind: 'treeTall', x: W.x + 70, y: 1730 },
    { kind: 'shrubDark', x: W.x + 162, y: 1700 },
    { kind: 'log', x: W.x + 196, y: 1560 },
    // right strip between the paths and below
    { kind: 'treeDark', x: rightX - 86, y: 920 },
    { kind: 'treeTall', x: rightX + 87, y: 860 },
    { kind: 'bushMid', x: rightX + 86, y: 1050 },
    { kind: 'roundBushBig', x: rightX - 84, y: 1060 },
    { kind: 'treeBig', x: rightX + 2, y: 1520 },
    { kind: 'treeSmall', x: rightX + 98, y: 1740 },
    { kind: 'bushLight', x: rightX - 66, y: 1760 },
    { kind: 'stumpYellow', x: rightX + 110, y: 1310 },
    { kind: 'toadstool', x: rightX - 104, y: 1300 },
    { kind: 'bushB', x: rightX + 90, y: 700 },
  ];

  const blocked = (b: Rect, pad: number): boolean => {
    if (b.x < W.x + 4 || b.y < W.y + 4 || b.x + b.w > W.x + W.w - 4 || b.y + b.h > W.y + W.h - 4) return true;
    for (const r of keepOut) if (overlaps(b, r, pad)) return true;
    return false;
  };

  // Small things scattered over the free grass, never on a path or another prop.
  const rnd = seeded(20261116);
  const total = SMALL.reduce((s, [, w]) => s + w, 0);
  const pick = (): PropKind => {
    let t = rnd() * total;
    for (const [k, w] of SMALL) if ((t -= w) < 0) return k;
    return SMALL[0][0];
  };
  const boxes = props.map(propBox);
  let placed = 0;
  for (let tries = 0; tries < 3000 && placed < 120; tries++) {
    const p: Prop = { kind: pick(), x: W.x + rnd() * W.w, y: W.y + rnd() * W.h };
    const b = propBox(p);
    if (blocked(b, 8) || crossesPageEdge(b) || onPath(p, paths, 4)) continue;
    if (boxes.some(o => overlaps(b, o, 10))) continue;
    props.push(p);
    boxes.push(b);
    placed++;
  }

  return { paths, pathHalf: PATH_HALF, props, hub };
}

// ---------------------------------------------------------------- bake

type Ctx = CanvasRenderingContext2D;

function blit(ctx: Ctx, atlas: CanvasImageSource, kind: SceneryFrame, dx: number, dy: number): void {
  const [sx, sy, w, h] = SCENERY_FRAMES[kind];
  ctx.drawImage(atlas, sx, sy, w, h, dx, dy, w, h);
}

/** Small integer hash → [0, 1). */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Bakes the whole scenery into `ctx` (BAKE_W × BAKE_H LPC pixels; canvas pixel (0, 0) is the
 * world's top-left). `makeCanvas` gives a scratch canvas of the same size for the path stones.
 */
export function bakeScenery(
  ctx: Ctx, atlas: CanvasImageSource, house: CanvasImageSource | null, layout: SceneryLayout,
  keepOut: readonly Rect[], makeCanvas: () => HTMLCanvasElement,
): void {
  const S = SCENERY_SCALE;
  const W0 = SCENERY_WORLD;
  ctx.imageSmoothingEnabled = false;

  // grass: three variants of the same green, picked per tile with a fixed seed
  const rnd = seeded(7);
  for (let ty = 0; ty * TILE < BAKE_H; ty++) {
    for (let tx = 0; tx * TILE < BAKE_W; tx++) {
      const r = rnd();
      blit(ctx, atlas, r < 0.55 ? 'grass2' : r < 0.85 ? 'grass1' : 'grass0', tx * TILE, ty * TILE);
    }
  }

  // path: cobble tiles masked to the path shape, with a dark rim
  const stones = makeCanvas();
  const sctx = stones.getContext('2d');
  if (sctx) {
    sctx.imageSmoothingEnabled = false;
    for (let ty = 0; ty * TILE < BAKE_H; ty++) {
      for (let tx = 0; tx * TILE < BAKE_W; tx++) {
        blit(sctx, atlas, (['cobble0', 'cobble1', 'cobble2'] as const)[(tx * 7 + ty * 3) % 3], tx * TILE, ty * TILE);
      }
    }
    const src = sctx.getImageData(0, 0, BAKE_W, BAKE_H).data;
    const img = ctx.getImageData(0, 0, BAKE_W, BAKE_H);
    const dst = img.data;
    const mask = new Uint8Array(BAKE_W * BAKE_H);
    const segs = layout.paths;
    const reach = layout.pathHalf + 4;
    for (const s of segs) {
      const x0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - reach - W0.x) / S));
      const x1 = Math.min(BAKE_W - 1, Math.ceil((Math.max(s.x0, s.x1) + reach - W0.x) / S));
      const y0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - reach - W0.y) / S));
      const y1 = Math.min(BAKE_H - 1, Math.ceil((Math.max(s.y0, s.y1) + reach - W0.y) / S));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const i = py * BAKE_W + px;
          if (mask[i]) continue;
          const wx = W0.x + (px + 0.5) * S;
          const wy = W0.y + (py + 0.5) * S;
          // a slightly ragged edge, in 2-pixel steps like the LPC stones
          const wob = (noise(px >> 1, py >> 1) - 0.5) * 2.6 * S;
          if (segDist(s, wx, wy) <= layout.pathHalf + wob) mask[i] = 1;
        }
      }
    }
    // stop at the pens' edges
    for (const r of keepOut) {
      for (let py = Math.max(0, Math.floor((r.y - W0.y) / S)); py < Math.min(BAKE_H, Math.ceil((r.y + r.h - W0.y) / S)); py++) {
        for (let px = Math.max(0, Math.floor((r.x - W0.x) / S)); px < Math.min(BAKE_W, Math.ceil((r.x + r.w - W0.x) / S)); px++) {
          mask[py * BAKE_W + px] = 0;
        }
      }
    }
    const at = (px: number, py: number): number =>
      px >= 0 && py >= 0 && px < BAKE_W && py < BAKE_H ? mask[py * BAKE_W + px] : 0;
    for (let py = 0; py < BAKE_H; py++) {
      for (let px = 0; px < BAKE_W; px++) {
        const i = py * BAKE_W + px;
        const k = i * 4;
        const edge = !at(px - 1, py) || !at(px + 1, py) || !at(px, py - 1) || !at(px, py + 1);
        if (mask[i]) {
          const shade = edge ? 0.72 : 1;
          dst[k] = src[k] * shade;
          dst[k + 1] = src[k + 1] * shade;
          dst[k + 2] = src[k + 2] * shade;
          dst[k + 3] = 255;
        } else if (at(px, py - 1) || at(px - 1, py) || at(px + 1, py) || at(px, py + 1)) {
          // soft shadow just outside the stones, heavier below them
          const below = at(px, py - 1) ? 0.62 : 0.78;
          dst[k] *= below;
          dst[k + 1] *= below;
          dst[k + 2] *= below;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // props, back to front
  const props = [...layout.props].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of props) {
    const b = propBox(p);
    const dx = Math.round((b.x - W0.x) / S);
    const dy = Math.round((b.y - W0.y) / S);
    if (p.kind === 'farmhouse') {
      if (house) ctx.drawImage(house, dx, dy);
    } else {
      blit(ctx, atlas, p.kind, dx, dy);
    }
  }
}
