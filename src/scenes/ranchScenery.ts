import { seeded } from './ranchArt';
import { FARMHOUSE_SIZE, SCENERY_FRAMES, type SceneryFrame } from './sceneryAtlas';

/**
 * The ranch's surroundings: LPC grass, a cobblestone path from the farmhouse to every pen, a
 * stream with plank bridges and a water mill, woods and flowers. Everything here is pure layout
 * plus one bake onto a canvas; the scene shows that canvas as a single static image under the
 * pens (only the water wheel and a few glints on the water move).
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

/** One patch of nature: a wood, a thicket, a flower bed, a drift of grass, a few stones or reeds. */
export interface Cluster { kinds: PropKind[]; x: number; y: number }

export interface SceneryLayout {
  /** Path centre lines (world) and their half width. */
  paths: Segment[];
  pathHalf: number;
  props: Prop[];
  clusters: Cluster[];
  /** The stream's centre line (world), from the top edge of the world to the bottom. */
  river: { x: number; y: number }[];
  riverHalf: number;
  /** Plank bridges where paths cross the stream (world rects). */
  bridges: Rect[];
  /** Bottom centre of the water wheel sprite (world), standing in the stream by the mill. */
  wheel: { x: number; y: number };
  /** Which way the water runs where the wheel dips into it (unit vector, world axes). */
  wheelFlow: { dx: number; dy: number };
  /** Straight stretches of open water (no bridge or wheel) where glints drift downstream. */
  flows: Segment[];
  /** Where the dog and the cat lie down: the farmhouse door, the big tree, the mill by the stream. */
  petRest: { spot: { x: number; y: number }; via: { x: number; y: number } }[];
}

const TILE = 32;
const PATH_HALF = 22;
/** Half the stream's open water, in world units (the bank tiles add a grassy edge). */
const RIVER_HALF = 40;
/** Clear lawn kept beside the paths (world units), except for deliberate edge flowers and stones. */
const PATH_LAWN = 32;
export const WHEEL_FRAMES = 4;
/** water-wheel.png's frames, played 0 -> 3, turn the wheel clockwise on screen (measured). */
export const WHEEL_SHEET_CLOCKWISE = true;

/**
 * Frame order that turns the wheel with the stream. The wheel dips its bottom into the water, so
 * the bottom paddles move with the flow: water running east (dx > 0) turns it anticlockwise.
 */
export function wheelFrameOrder(flow: { dx: number }): number[] {
  const clockwise = flow.dx < 0;
  const order = Array.from({ length: WHEEL_FRAMES }, (_, i) => i);
  return clockwise === WHEEL_SHEET_CLOCKWISE ? order : order.reverse();
}

/**
 * The map's small flowers: four species, each a single bloom and a clump. They grow in patches,
 * in loose singles and pairs, and mix at the edges of neighbouring patches.
 */
export const FLOWERS = {
  white: ['flW', 'daisyW'],
  yellow: ['flY', 'daisyY'],
  blue: ['flBlue', 'bluebells'],
  red: ['flRose', 'fbRed'],
} as const satisfies Record<string, readonly SceneryFrame[]>;
const FLOWER_KINDS: readonly PropKind[] = Object.values(FLOWERS).flat();

export function isFlower(kind: PropKind): boolean {
  return FLOWER_KINDS.includes(kind);
}

/** World x of river vertex column `i` (the terrain's 32-px tile corners, 64 world units apart). */
const vx = (i: number): number => SCENERY_WORLD.x + i * TILE * SCENERY_SCALE;
const vy = (j: number): number => SCENERY_WORLD.y + j * TILE * SCENERY_SCALE;

/**
 * The stream on the terrain's tile-corner grid: for each corner row (64 world units apart) the
 * first and last water column. It comes in at the top of the right strip, bends east past the
 * mill, runs down beside the eastern bank and drifts back west before leaving at the bottom.
 */
const RIVER_ROWS: readonly (readonly [number, number])[] = Array.from({ length: 30 }, (_, j) =>
  j <= 12 ? [25, 25] : j === 13 ? [25, 27] : j <= 21 ? [27, 27] : j === 22 ? [26, 27] : [26, 26]);

export function isWater(i: number, j: number): boolean {
  const [a, b] = RIVER_ROWS[Math.max(0, Math.min(RIVER_ROWS.length - 1, j))];
  return i >= a && i <= b;
}

function riverLine(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: vx(25), y: vy(-1) }];
  pts.push({ x: vx(25), y: vy(13) }, { x: vx(27), y: vy(13) }, { x: vx(27), y: vy(22) }, { x: vx(26), y: vy(22) });
  pts.push({ x: vx(26), y: vy(29) });
  return pts;
}

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

/** Distance from (x, y) to a polyline. */
export function lineDist(pts: readonly { x: number; y: number }[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    d = Math.min(d, segDist({ x0: pts[i - 1].x, y0: pts[i - 1].y, x1: pts[i].x, y1: pts[i].y }, x, y));
  }
  return d;
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

/** Distance between a box and a segment (exact for the axis-aligned paths and stream). */
function rectSegDist(r: Rect, s: Segment): number {
  if (s.x0 !== s.x1 && s.y0 !== s.y1) {
    // a slanted segment: sample the box
    let d = Infinity;
    for (let y = r.y; y <= r.y + r.h + 0.01; y += Math.min(8, r.h || 8)) {
      for (let x = r.x; x <= r.x + r.w + 0.01; x += Math.min(8, r.w || 8)) d = Math.min(d, segDist(s, x, y));
    }
    return d;
  }
  const gx = Math.max(0, Math.min(s.x0, s.x1) - (r.x + r.w), r.x - Math.max(s.x0, s.x1));
  const gy = Math.max(0, Math.min(s.y0, s.y1) - (r.y + r.h), r.y - Math.max(s.y0, s.y1));
  return Math.hypot(gx, gy);
}

/** Smallest distance from a box to any of the segments. */
function boxDist(b: Rect, segs: readonly Segment[]): number {
  let d = Infinity;
  for (const s of segs) d = Math.min(d, rectSegDist(b, s));
  return d;
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

/** Trees, shrubs and big bushes: they stand in woods and thickets and may overlap each other. */
export function isBig(kind: PropKind): boolean {
  return /^(tree|shrub)/.test(kind) || kind === 'heroTree' || kind === 'bushGreen' || kind === 'bushMid'
    || kind === 'bushLight' || kind === 'roundBushBig';
}

export function isTree(kind: PropKind): boolean {
  return kind.startsWith('tree') || kind === 'heroTree';
}

/** Things that only grow in the shade of trees. */
export function isUnderstory(kind: PropKind): boolean {
  return kind.startsWith('mush') || kind === 'toadstool' || kind.startsWith('stump') || kind === 'log';
}

/** Plants of the water's edge, and those floating on it. */
export function isWaterside(kind: PropKind): boolean {
  return kind.startsWith('cattail') || kind.startsWith('reed');
}
export function isAfloat(kind: PropKind): boolean {
  return kind.startsWith('lily');
}

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
  /** Deliberately lines a path or fence (may come within a few units of the stones). */
  edge?: boolean;
  /** How far apart members of a wood stand, as a share of a tree's width (default 0.45). */
  gap?: number;
}

/** The bottom strip a prop stands on: a tree's trunk, a bush's base, a flower's whole tuft. */
function footprint(p: Prop): Rect {
  const b = propBox(p);
  const f = isTree(p.kind) ? 0.36 : isBig(p.kind) ? 0.7 : 0.9;
  const h = Math.min(b.h, isBig(p.kind) ? 22 : 18);
  return { x: p.x - (b.w * f) / 2, y: p.y - h, w: b.w * f, h };
}

/**
 * Where everything goes. `cells` are the six fenced plots in page order, row-major on the 2 × 3
 * grid (the garden first, then the five pens); nothing may overlap them.
 *
 * The map has a clear hierarchy: the farmhouse's big tree (the largest on the map) and the stream
 * with its mill are the two focal points; two dense woods (bottom-left, and top-right past the
 * stream) are the secondary masses; small patches of one kind thin out away from them, and the
 * lawn in front of the farmhouse and along the paths stays open. Deterministic.
 */
export function sceneryLayout(cells: readonly Rect[]): SceneryLayout {
  const W = SCENERY_WORLD;
  const lots = cells;
  const keepOut = cells;
  const bottom = (r: Rect): number => r.y + r.h;
  const centreX = (r: Rect): number => r.x + r.w / 2;
  // Each row's path runs through the band between its pens' fences and the next row.
  const rowY = [bottom(lots[0]) + 40, bottom(lots[2]) + 40, bottom(lots[4]) + 40];
  // The spine down the west side runs along the grid's edge, leaving the strip whole for trees.
  const leftX = lots[0].x - 30;
  const river = riverLine();
  const riverAt = (y: number): number => {
    for (let i = 1; i < river.length; i++) {
      const a = river[i - 1];
      const b = river[i];
      if (a.x === b.x && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return a.x;
    }
    return river[0].x;
  };
  const house: Prop = { kind: 'farmhouse', x: W.x + 150, y: 40 + FARMHOUSE_SIZE.h * SCENERY_SCALE };
  const doorY = house.y - 12;

  // Bridges carry the first row's path over to the mill and the second row's path out east.
  const bridgeW = SCENERY_FRAMES.bridge[2] * SCENERY_SCALE;
  const bridgeH = SCENERY_FRAMES.bridge[3] * SCENERY_SCALE;
  const cross = [{ x: riverAt(rowY[0]), y: rowY[0] }, { x: riverAt(rowY[1]), y: rowY[1] }];
  const bridges = cross.map(c => ({ x: c.x - bridgeW / 2, y: c.y - bridgeH / 2, w: bridgeW, h: bridgeH }));
  const millEnd = bridges[0].x + bridges[0].w + 30;

  const paths: Segment[] = [
    // farmhouse door down to the first row, then along each row of pens
    { x0: house.x, y0: doorY, x1: house.x, y1: rowY[0] },
    { x0: house.x, y0: rowY[0], x1: millEnd, y1: rowY[0] },
    { x0: leftX, y0: rowY[0], x1: leftX, y1: rowY[2] },
    { x0: leftX, y0: rowY[1], x1: W.x + W.w + 30, y1: rowY[1] },
    { x0: leftX, y0: rowY[2], x1: centreX(cells[5]), y1: rowY[2] },
  ];
  // a short apron up to each pen's fence (its gate)
  for (const r of cells) {
    paths.push({ x0: centreX(r), y0: bottom(r), x1: centreX(r), y1: bottom(r) + 40 });
  }

  // The mill stands on the bank where the stream turns east; its wheel dips into the bend.
  const bendY = vy(13);
  const mill: Prop = { kind: 'mill', x: W.x + W.w - 70, y: bendY - RIVER_HALF + 8 };
  const wheel = { x: vx(26) + 16, y: bendY + 26 };
  const wheelBox: Rect = {
    x: wheel.x - SCENERY_FRAMES.wheel0[2], y: wheel.y - SCENERY_FRAMES.wheel0[3] * SCENERY_SCALE,
    w: SCENERY_FRAMES.wheel0[2] * SCENERY_SCALE, h: SCENERY_FRAMES.wheel0[3] * SCENERY_SCALE,
  };
  // The farmhouse's big tree: the largest on the map, between the house and the woods.
  const hero: Prop = { kind: 'heroTree', x: W.x + 140, y: 960 };

  const props: Prop[] = [
    house,
    hero,
    mill,
    { kind: 'mailbox', x: house.x + 46, y: doorY + 70 },
    { kind: 'veggie', x: W.x + 62, y: rowY[0] - 40 },
  ];
  // Buildings, the wheel and the bridges are solid; plants may only grow in front of the big tree.
  const hard = [...props.filter(p => p !== hero).map(propBox), wheelBox, ...bridges];
  const heroBox = propBox(hero);

  // Bands just inside each cell, between a path or the world's edge and the pens' fences.
  const topBand = lots[0].y - 10;
  const band1 = lots[2].y - 10;
  const band2 = lots[4].y - 10;
  const E = W.x + W.w;
  // Back to front within each wood, so nearer trees overlap the ones behind.
  const specs: ClusterSpec[] = [
    // focal 1: a few mushrooms in the big tree's shade
    { kinds: ['mushRed'], x: W.x + 46, y: 985, sx: 10, sy: 8, n: 3 },
    // secondary: the bottom-left wood, three layers deep, bushes at its feet
    { kinds: ['treePine', 'treeTall'], x: W.x + 125, y: 1470, sx: 50, sy: 110, n: 5, gap: 0.8 },
    { kinds: ['roundBushBig', 'bushC'], x: W.x + 125, y: 1782, sx: 50, sy: 6, n: 3 },
    { kinds: ['stump', 'stumpRoots'], x: W.x + 208, y: 1000, sx: 8, sy: 14, n: 2 },
    { kinds: ['mushPurple'], x: W.x + 40, y: 1700, sx: 8, sy: 40, n: 3 },
    // by the farmhouse: a rose bed at the corner of the path, marigolds by the veggie patch
    { kinds: [...FLOWERS.red], x: -45, y: 500, sx: 12, sy: 10, n: 3, edge: true },
    { kinds: [FLOWERS.yellow[0]], x: W.x + 40, y: 425, sx: 24, sy: 8, n: 3, edge: true },
    // meadow flowers in the left strip, at the edges of the big tree's lawn and the wood
    { kinds: [...FLOWERS.white], x: W.x + 240, y: 1150, sx: 20, sy: 40, n: 5, edge: true },
    { kinds: [...FLOWERS.yellow], x: W.x + 60, y: 1140, sx: 30, sy: 20, n: 3, strays: 2 },
    { kinds: [...FLOWERS.blue], x: W.x + 250, y: 1740, sx: 16, sy: 30, n: 3, edge: true },
    // secondary: the top-right wood past the stream, shrubs on the near bank
    { kinds: ['treeTall', 'treeDark'], x: E - 76, y: 330, sx: 6, sy: 50, n: 3 },
    { kinds: ['bushA', 'bushB'], x: E - 108, y: 500, sx: 40, sy: 3, n: 2 },
    // the stream's banks: reeds and cattails, lily pads, stones by the bridges, a few flowers
    { kinds: ['cattailBrown'], x: 1236, y: 300, sx: 3, sy: 60, n: 3 },
    { kinds: ['reedA', 'reedB'], x: 1240, y: 760, sx: 4, sy: 30, n: 3 },
    { kinds: ['lilyA', 'lilyB'], x: vx(27), y: 1010, sx: 4, sy: 50, n: 3 },
    { kinds: ['cattailDark'], x: vx(27) - 64, y: 1290, sx: 4, sy: 24, n: 3 },
    { kinds: ['rockB', 'rockC'], x: 1260, y: rowY[1] + 60, sx: 20, sy: 4, n: 3, edge: true },
    { kinds: [...FLOWERS.blue], x: 1270, y: 1000, sx: 20, sy: 30, n: 5 },
    { kinds: [...FLOWERS.yellow], x: 1250, y: 900, sx: 16, sy: 20, n: 3 },
    { kinds: ['lilyFlower', 'lilyB'], x: vx(26), y: 1620, sx: 3, sy: 60, n: 3 },
    { kinds: ['reedA', 'reedB'], x: vx(26) - 60, y: 1500, sx: 4, sy: 30, n: 3 },
    { kinds: [...FLOWERS.white], x: 1250, y: 1640, sx: 16, sy: 50, n: 5 },
    { kinds: [...FLOWERS.red], x: 1240, y: 1760, sx: 16, sy: 10, n: 3 },
    { kinds: ['roundBushBig', 'bushC'], x: E - 44, y: 1690, sx: 4, sy: 50, n: 3 },
    // inside the grid: a few single-colour patches along the fences, open lawn elsewhere
    // (neighbouring patches of different flowers mix where they meet)
    { kinds: [...FLOWERS.yellow], x: 150, y: topBand, sx: 36, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.white], x: 280, y: topBand, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.blue], x: 760, y: topBand, sx: 36, sy: 3, n: 3, edge: true },
    { kinds: ['tuftA'], x: 1070, y: topBand, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.white], x: 160, y: band1, sx: 36, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.red], x: 290, y: band1, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.blue], x: 830, y: band1, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: ['tuftC'], x: 1060, y: band1, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.white], x: 140, y: band2, sx: 36, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.yellow], x: 260, y: band2, sx: 30, sy: 3, n: 3, edge: true },
    { kinds: ['rockB', 'rockC'], x: 430, y: band2, sx: 20, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.blue], x: 780, y: band2, sx: 36, sy: 3, n: 3, edge: true },
    { kinds: [...FLOWERS.red], x: 1020, y: band2, sx: 30, sy: 3, n: 3, edge: true },
  ];
  const clusters: Cluster[] = specs.map(s => ({ kinds: s.kinds, x: s.x, y: s.y }));

  let rnd = seeded(20261116);
  const gauss = (): number => {
    const u = Math.max(1e-6, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const foots = props.map(footprint);
  const placedBig: Prop[] = props.filter(p => isBig(p.kind));
  const toRiver = (x: number, y: number): number => lineDist(river, x, y);
  const riverSegs: Segment[] = river.slice(1).map((q, i) => ({ x0: river[i].x, y0: river[i].y, x1: q.x, y1: q.y }));

  // The lawn straight in front of the farmhouse door stays clear.
  const doorLawn: Rect = { x: house.x - 60, y: house.y + 4, w: 120, h: rowY[0] - PATH_HALF - house.y - 8 };

  /** `ci` is the cluster the prop grows in, or -1 for a loose flower. */
  const fits = (p: Prop, ci: number, edge: boolean): boolean => {
    const b = propBox(p);
    if (!isBig(p.kind) && overlaps(footprint(p), doorLawn)) return false;
    if (b.x < W.x + 4 || b.y < W.y + 4 || b.x + b.w > W.x + W.w - 4 || b.y + b.h > W.y + W.h - 4) return false;
    for (const r of keepOut) if (overlaps(b, r, 8)) return false;
    if (crossesPageEdge(b)) return false;
    if (hard.some(h => overlaps(b, h, 6))) return false;
    const big = isBig(p.kind);
    // nothing big in front of (or behind) the farmhouse's tree: it stands free
    if (big && overlaps(b, heroBox, 16)) return false;
    const f = footprint(p);
    // keep the lawn beside the paths open, and the water clear
    // (small plants: the bottom of the sprite, as onPath measures it)
    const base: Rect = big ? b : { x: b.x, y: b.y + b.h - Math.min(b.h, 24), w: b.w, h: Math.min(b.h, 24) };
    if (boxDist(base, paths) < PATH_HALF + (big || !edge ? PATH_LAWN : 4)) return false;
    if (isAfloat(p.kind)) {
      if (toRiver(p.x, p.y - b.h / 2) > 10 || boxDist(b, paths) < PATH_HALF + 30) return false;
    } else if (isWaterside(p.kind)) {
      const d = boxDist(f, riverSegs);
      if (d < RIVER_HALF - 22 || d > RIVER_HALF + 16) return false;
    } else if ((big ? boxDist(b, riverSegs) : boxDist(f, riverSegs)) < RIVER_HALF + (big ? 12 : 20)) {
      return false;
    }
    if (foots.some(o => overlaps(f, o, 2))) return false;
    for (const o of placedBig) {
      const ob = propBox(o);
      if (!overlaps(b, ob, 0)) continue;
      // Trees of one wood overlap, but their trunks keep apart; nothing hides wholly behind a canopy.
      if (big && ci >= 0 && o.cluster !== undefined && clusters[o.cluster] && Math.abs(o.cluster - ci) <= 3
        && specs[o.cluster].kinds.some(isBig)) {
        const dx = Math.abs(p.x - o.x);
        const dy = Math.abs(p.y - o.y);
        if (dx < 24 && dy < 48) return false;
        if (o.cluster === ci && Math.hypot(dx, dy * 1.4) < (specs[ci].gap ?? 0.45) * Math.max(b.w, ob.w)) return false;
        if (p.y < o.y) return false;
      } else if (p.y < o.y - (big ? 60 : 6)) {
        return false;
      }
    }
    // Stay nearer this cluster's centre than any other of its sort (trees, bushes, small plants),
    // so patches never blur together while bushes and undergrowth may gather at a wood's feet.
    // Flowers may wander into a neighbouring patch: meadows mix at their edges.
    if (ci < 0 || isFlower(p.kind)) return true;
    const own = Math.hypot(p.x - clusters[ci].x, p.y - clusters[ci].y);
    const sort = (j: number): number => (specs[j].kinds.some(isTree) ? 2 : specs[j].kinds.some(isBig) ? 1 : 0);
    return clusters.every((c, j) => j === ci || sort(j) !== sort(ci) || Math.hypot(p.x - c.x, p.y - c.y) > own);
  };

  specs.forEach((s, ci) => {
    // Each cluster has its own fixed seed, so tuning one patch never reshuffles the others.
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
      if (!fits(p, ci, !!s.edge)) continue;
      props.push(p);
      foots.push(footprint(p));
      if (isBig(p.kind)) placedBig.push(p);
      m++;
    }
  });

  // Loose flowers over the open lawn: singles and pairs (sometimes of two species), anywhere they
  // fit, but never in a wood's shade.
  rnd = seeded(5150);
  const singles = Object.values(FLOWERS).map(k => k[0]);
  let loose = 0;
  for (let tries = 0; tries < 4000 && loose < 34; tries++) {
    const a: Prop = { kind: singles[Math.floor(rnd() * singles.length)], x: W.x + rnd() * W.w, y: W.y + rnd() * W.h };
    if (!fits(a, -1, true)) continue;
    props.push(a);
    foots.push(footprint(a));
    loose++;
    if (rnd() < 0.45) {
      const kind = rnd() < 0.6 ? a.kind : singles[Math.floor(rnd() * singles.length)];
      const ang = rnd() * Math.PI * 2;
      const b: Prop = { kind, x: a.x + Math.cos(ang) * 30, y: a.y + Math.sin(ang) * 18 };
      if (fits(b, -1, true)) {
        props.push(b);
        foots.push(footprint(b));
      }
    }
  }

  // Glints drift down the open stretches of the stream, clear of the bridges and the wheel.
  const flows: Segment[] = [];
  for (let i = 1; i < river.length; i++) {
    const a = river[i - 1];
    const b = river[i];
    if (a.x !== b.x) continue;
    let y0 = Math.max(a.y, 16);
    const yEnd = Math.min(b.y, W.y + W.h - 16);
    for (const br of [...bridges, wheelBox].filter(r => a.x >= r.x && a.x <= r.x + r.w).sort((p, q) => p.y - q.y)) {
      if (br.y - 12 > y0 && br.y < yEnd) flows.push({ x0: a.x, y0, x1: a.x, y1: br.y - 12 });
      y0 = Math.max(y0, br.y + br.h + 12);
    }
    if (yEnd - y0 > 60) flows.push({ x0: a.x, y0, x1: a.x, y1: yEnd });
  }

  // At the wheel the stream runs east along the bend.
  const wheelFlow = { dx: 1, dy: 0 };
  // Resting spots: on the door path, on the open lawn just off the spine beside the big tree (the
  // lawn by a path is kept clear of plants), and at the path's end by the mill.
  const treeY = hero.y + 40;
  const petRest = [
    { spot: { x: house.x, y: doorY + 44 }, via: { x: house.x, y: doorY + 44 } },
    { spot: { x: leftX - 46, y: treeY }, via: { x: leftX, y: treeY } },
    { spot: { x: millEnd, y: rowY[0] }, via: { x: millEnd, y: rowY[0] } },
  ];
  return { paths, pathHalf: PATH_HALF, props, clusters, river, riverHalf: RIVER_HALF, bridges, wheel, wheelFlow, flows, petRest };
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

/** Marching-squares piece for a tile whose corners (tl, tr, bl, br) are water (1) or bank (0). */
const WATER_PIECE: Record<number, SceneryFrame> = {
  0b0001: 'wTL', 0b0011: 'wT', 0b0010: 'wTR', 0b0101: 'wL', 0b1010: 'wR',
  0b0100: 'wBL', 0b1100: 'wB', 0b1000: 'wBR',
  0b1110: 'wI1110', 0b1101: 'wI1101', 0b1011: 'wI1011', 0b0111: 'wI0111',
};

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

  // the stream: LPC pond tiles with grassy banks, chosen by which tile corners are water
  for (let ty = 0; ty * TILE < BAKE_H; ty++) {
    for (let tx = 0; tx * TILE < BAKE_W; tx++) {
      const m = (+isWater(tx, ty) << 3) | (+isWater(tx + 1, ty) << 2) | (+isWater(tx, ty + 1) << 1) | +isWater(tx + 1, ty + 1);
      if (m === 0) continue;
      if (m === 0b1111) {
        const r = noise(tx, ty);
        blit(ctx, atlas, r < 0.6 ? 'wC' : r < 0.75 ? 'wRip0' : r < 0.9 ? 'wRip1' : 'wRip2', tx * TILE, ty * TILE);
      } else if (m === 0b1001 || m === 0b0110) {
        // two diagonal corners: both outer corner pieces
        blit(ctx, atlas, m === 0b1001 ? 'wBR' : 'wBL', tx * TILE, ty * TILE);
      } else {
        blit(ctx, atlas, WATER_PIECE[m], tx * TILE, ty * TILE);
      }
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

  // plank bridges over the stream, on top of the path so it runs on across them
  for (const b of layout.bridges) blit(ctx, atlas, 'bridge', Math.round((b.x - W0.x) / S), Math.round((b.y - W0.y) / S));

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
