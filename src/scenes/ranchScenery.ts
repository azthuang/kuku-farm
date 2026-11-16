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
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  /** Index into SceneryLayout.clusters for plants that grow in one. */
  cluster?: number;
}

export interface Segment { x0: number; y0: number; x1: number; y1: number }

export interface SceneryLayout {
  /** Path centre lines (world) and their half width. */
  paths: Segment[];
  pathHalf: number;
  props: Prop[];
  clusters: Cluster[];
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

/** Trees, shrubs and big bushes: they stand in groves and thickets and may overlap each other. */
export function isBig(kind: PropKind): boolean {
  return /^(tree|shrub)/.test(kind) || kind === 'bushGreen' || kind === 'bushMid' || kind === 'bushLight' || kind === 'roundBushBig';
}

export function isTree(kind: PropKind): boolean {
  return kind.startsWith('tree');
}

/** Things that only grow in the shade of trees. */
export function isUnderstory(kind: PropKind): boolean {
  return kind.startsWith('mush') || kind === 'toadstool' || kind.startsWith('stump') || kind === 'log';
}

/** One patch of nature: a grove, a thicket, a flower bed, a drift of grass or a few stones. */
export interface Cluster { kinds: PropKind[]; x: number; y: number }

interface ClusterSpec {
  kinds: PropKind[];
  x: number;
  y: number;
  /** Gaussian spread (world units) of the members around the centre. */
  sx: number;
  sy: number;
  n: number;
  /** Extra members of the same kind a little further out. */
  strays?: number;
}

/** The bottom strip a prop stands on: a tree's trunk, a bush's base, a flower's whole tuft. */
function footprint(p: Prop): Rect {
  const b = propBox(p);
  const f = isTree(p.kind) ? 0.36 : isBig(p.kind) ? 0.7 : 0.9;
  const h = Math.min(b.h, isBig(p.kind) ? 22 : 18);
  return { x: p.x - (b.w * f) / 2, y: p.y - h, w: b.w * f, h };
}

/** Does any part of the box come near a path (big plants must not hang over the stones)? */
function boxOnPath(b: Rect, paths: readonly Segment[], margin: number): boolean {
  for (let y = b.y; y <= b.y + b.h + 0.01; y += Math.min(8, b.h)) {
    for (let x = b.x; x <= b.x + b.w + 0.01; x += Math.min(8, b.w)) {
      if (nearPath(paths, x, y, PATH_HALF + margin)) return true;
    }
  }
  return false;
}

/**
 * Where everything goes. `lots` are the five pens' rects and `later` the sixth ("之後擴建")
 * cell's plot; nothing but its sign may overlap them. Plants grow in clusters of one kind, as
 * in nature: groves of tall trees along the outer edges, thickets at their feet, mushrooms and
 * stumps in their shade, and flowers and grass along the paths and fences, with open lawn in
 * between. Deterministic: same layout every run.
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
  const bladeSize = SCENERY_FRAMES.blade0[2] * SCENERY_SCALE;
  const blades: Rect = {
    x: hub.x - BLADE_HUB.x * SCENERY_SCALE, y: hub.y - BLADE_HUB.y * SCENERY_SCALE, w: bladeSize, h: bladeSize,
  };

  const props: Prop[] = [
    house,
    tower,
    { kind: 'mailbox', x: house.x + 46, y: doorY + 70 },
    { kind: 'veggie', x: W.x + 62, y: rowY[0] - 40 },
    { kind: 'sign', x: centreX(later), y: bottom(later) - 46 },
    { kind: 'haystack', x: rightX + 90, y: rowY[0] - 34 },
    { kind: 'wheat', x: rightX - 92, y: rowY[0] - 32 },
  ];
  const hard = [...props.map(propBox), blades];

  // Bands just inside each cell, between a path or the world's edge and the pens' fences.
  const topBand = lots[0].y - 10;
  const band1 = lots[2].y - 10;
  const band2 = lots[4].y - 10;
  const specs: ClusterSpec[] = [
    // left strip: a deciduous grove, then a conifer wood along the outer edge
    { kinds: ['treeRound', 'treeBig'], x: W.x + 110, y: 990, sx: 16, sy: 90, n: 3 },
    { kinds: ['bushGreen', 'bushMid'], x: W.x + 178, y: 1120, sx: 12, sy: 26, n: 2 },
    { kinds: ['mushRed'], x: W.x + 55, y: 1110, sx: 10, sy: 12, n: 2 },
    { kinds: ['treePine', 'treeTall'], x: W.x + 82, y: 1560, sx: 12, sy: 130, n: 4 },
    { kinds: ['stump', 'stumpRoots'], x: W.x + 205, y: 1745, sx: 14, sy: 12, n: 2 },
    { kinds: ['mushPurple'], x: W.x + 200, y: 1420, sx: 10, sy: 14, n: 2, strays: 1 },
    { kinds: ['tuftA'], x: W.x + 200, y: 1300, sx: 8, sy: 14, n: 2, strays: 1 },
    // around the farmhouse: a rose bed by the door, marigolds by the veggie patch
    { kinds: ['roses'], x: -50, y: 500, sx: 22, sy: 12, n: 3 },
    { kinds: ['flY'], x: W.x + 60, y: 425, sx: 22, sy: 8, n: 3, strays: 1 },
    // right strip: shrubs above the windmill, small trees and a thicket between the paths,
    // an oak grove below with its own thicket, stumps and mushrooms
    { kinds: ['shrubLight', 'shrubDark'], x: rightX - 20, y: 150, sx: 50, sy: 8, n: 3 },
    { kinds: ['treeSmall', 'shrubLolly'], x: rightX + 86, y: 860, sx: 6, sy: 110, n: 3 },
    { kinds: ['roundBushBig', 'bushC'], x: rightX - 86, y: 900, sx: 10, sy: 90, n: 3 },
    { kinds: ['fbRed'], x: rightX - 86, y: 1080, sx: 14, sy: 14, n: 3 },
    { kinds: ['treeOak', 'treeBig'], x: rightX + 30, y: 1600, sx: 28, sy: 110, n: 4 },
    { kinds: ['bushLight', 'bushGreen'], x: rightX - 60, y: 1755, sx: 34, sy: 14, n: 2 },
    { kinds: ['mushYellow'], x: rightX - 95, y: 1560, sx: 10, sy: 10, n: 2 },
    { kinds: ['stumpYellow'], x: rightX + 115, y: 1780, sx: 6, sy: 6, n: 1 },
    { kinds: ['rockB', 'rockC'], x: rightX - 60, y: rowY[1] + 56, sx: 24, sy: 6, n: 2 },
    // inside the grid: flowers and grass along the fences and paths, one kind per patch
    { kinds: ['flY'], x: 150, y: topBand, sx: 40, sy: 3, n: 4, strays: 1 },
    { kinds: ['tinyA'], x: 430, y: topBand, sx: 40, sy: 3, n: 4 },
    { kinds: ['sprBlue'], x: 730, y: topBand, sx: 36, sy: 3, n: 3, strays: 1 },
    { kinds: ['tuftA'], x: 1040, y: topBand, sx: 40, sy: 3, n: 4 },
    { kinds: ['daisyY'], x: 170, y: band1, sx: 36, sy: 3, n: 3, strays: 1 },
    { kinds: ['sprigA'], x: 440, y: band1, sx: 40, sy: 3, n: 4 },
    { kinds: ['violets'], x: 770, y: band1, sx: 36, sy: 3, n: 3 },
    { kinds: ['tinyC'], x: 1060, y: band1, sx: 40, sy: 3, n: 4 },
    { kinds: ['flW'], x: 140, y: band2, sx: 40, sy: 3, n: 4, strays: 1 },
    { kinds: ['rockB', 'rockC'], x: 420, y: band2, sx: 20, sy: 3, n: 2 },
    { kinds: ['bluebells'], x: 760, y: band2, sx: 36, sy: 3, n: 3 },
    { kinds: ['tuftC'], x: 1070, y: band2, sx: 40, sy: 3, n: 4 },
  ];
  const clusters: Cluster[] = specs.map(s => ({ kinds: s.kinds, x: s.x, y: s.y }));

  // Each cluster has its own fixed seed, so tuning one patch never reshuffles the others.
  let rnd = seeded(20261116);
  const gauss = (): number => {
    const u = Math.max(1e-6, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const foots = props.map(footprint);
  const placedBig: Prop[] = [];

  const fits = (p: Prop, ci: number): boolean => {
    const b = propBox(p);
    if (b.x < W.x + 4 || b.y < W.y + 4 || b.x + b.w > W.x + W.w - 4 || b.y + b.h > W.y + W.h - 4) return false;
    for (const r of keepOut) if (overlaps(b, r, 8)) return false;
    if (crossesPageEdge(b)) return false;
    if (hard.some(h => overlaps(b, h, 6))) return false;
    const big = isBig(p.kind);
    if (big ? boxOnPath(b, paths, 4) : onPath(p, paths, 4)) return false;
    const f = footprint(p);
    if (foots.some(o => overlaps(f, o, 2))) return false;
    for (const o of placedBig) {
      const ob = propBox(o);
      if (!overlaps(b, ob, 0)) continue;
      // Trees of one grove overlap, but their trunks keep apart; nothing hides wholly behind a canopy.
      if (big && o.cluster === ci) {
        const dx = Math.abs(p.x - o.x);
        const dy = Math.abs(p.y - o.y);
        if (dx < 24 && dy < 48) return false;
        if (Math.hypot(dx, dy * 1.4) < 0.6 * Math.max(b.w, ob.w)) return false;
      } else if (p.y < o.y - (big ? 60 : 6)) {
        return false;
      }
    }
    // Stay nearer this cluster's centre than any other, so patches never blur together.
    const own = Math.hypot(p.x - clusters[ci].x, p.y - clusters[ci].y);
    return clusters.every((c, j) => j === ci || Math.hypot(p.x - c.x, p.y - c.y) > own);
  };

  specs.forEach((s, ci) => {
    rnd = seeded(20261116 + ci * 7919);
    const want = s.n + (s.strays ?? 0);
    for (let m = 0, tries = 0; m < want && tries < 250 * want; tries++) {
      const spread = m < s.n ? 1 : 2.2;
      const first = m === 0 && tries === 0;
      const p: Prop = {
        kind: s.kinds[m % s.kinds.length],
        x: s.x + (first ? 0 : gauss() * s.sx * spread),
        y: s.y + (first ? 0 : gauss() * s.sy * spread),
        cluster: ci,
      };
      if (!fits(p, ci)) continue;
      props.push(p);
      foots.push(footprint(p));
      if (isBig(p.kind)) placedBig.push(p);
      m++;
    }
  });

  return { paths, pathHalf: PATH_HALF, props, clusters, hub };
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
