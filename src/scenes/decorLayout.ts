import { SPOT_IDS, spotLot, spotSpan, type SpotId } from '../core/decor';
import type { Rect } from './ranchScenery';

/**
 * Where the decorations stand (world units; a point is the bottom centre). Pure data: the scene
 * draws into these boxes and keeps the animals out of the pens' decoration row.
 *
 * In each pen the two spots run along the inside of the front fence, either side of the gate:
 * `-0` three tiles wide on the left, `-1` two tiles on the right, one tile deep. The animals
 * roam above that row, so a decoration never stands where they walk. The garden (all vegetable
 * beds) has none.
 *
 * The specials' two big spots, the same size (about the farmhouse oak's): one in front of the
 * bottom-left wood, one on the lawn west of the stream below the water mill, where a special may
 * stand a little over the water.
 */

const CELL = 600;
const COLS = 2;
export const TILE = 64;
/** The pens' decoration row: one tile deep, against the inside of the front fence. */
export const PEN_DECOR_ROW = TILE;
/** The pen's fenced plot within its cell, and where the inside of its front fence is. */
const LOT = { x: 30, y: 80, w: 540, h: 440 } as const;
const FRONT = LOT.y + LOT.h - 40;
/** How tall a decoration may grow, by its spot's width in tiles. */
const MAX_H = { 2: 150, 3: 180 } as const;

interface Spot { x: number; y: number; w: number; h: number }

function spot(s: SpotId): Spot {
  const lot = spotLot(s);
  const span = spotSpan(s);
  const x0 = (lot % COLS) * CELL;
  const y0 = Math.floor(lot / COLS) * CELL;
  const w = span * TILE;
  // either side of the gate in the middle of the front fence
  return { x: x0 + (span === 3 ? LOT.x + 20 + w / 2 : LOT.x + LOT.w - 42 - w / 2), y: y0 + FRONT, w, h: MAX_H[span] };
}

export const DECOR_SPOTS: Readonly<Record<SpotId, Spot>> = Object.fromEntries(SPOT_IDS.map((s) => [s, spot(s)])) as Record<SpotId, Spot>;

/** The whole box a decoration on `s` may fill (its tiles' width, its height limit). */
export function spotBox(s: SpotId): Rect {
  const p = DECOR_SPOTS[s];
  return { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
}

/** The ground a decoration stands on: its tiles, one deep. */
export function spotFoot(s: SpotId): Rect {
  const p = DECOR_SPOTS[s];
  return { x: p.x - p.w / 2, y: p.y - PEN_DECOR_ROW, w: p.w, h: PEN_DECOR_ROW };
}

export const BIG_SPOTS: readonly [Spot, Spot] = [
  { x: -150, y: 1796, w: 250, h: 330 },
  { x: 1300, y: 1130, w: 250, h: 330 },
];
/** The ground a special stands on: kept clear of every plant's footprint. */
export const BIG_FOOT_H = 50;

export function bigBox(slot: 0 | 1): Rect {
  const p = BIG_SPOTS[slot];
  return { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
}

export function bigFoot(slot: 0 | 1): Rect {
  const b = bigBox(slot);
  return { x: b.x, y: b.y + b.h - BIG_FOOT_H, w: b.w, h: BIG_FOOT_H };
}


/** Which shows are running (a special's trick, the pigeons' flight): a tap mid-show starts nothing. */
export interface Busy {
  /** Starts `key` for `ms` from `now` unless it is still running; true when it started. */
  start(key: string, ms: number, now: number): boolean;
  busy(key: string, now: number): boolean;
  clear(): void;
}

export function createBusy(): Busy {
  const until = new Map<string, number>();
  const busy = (key: string, now: number): boolean => (until.get(key) ?? -Infinity) > now;
  return {
    busy,
    start(key, ms, now) {
      if (busy(key, now)) return false;
      until.set(key, now + ms);
      return true;
    },
    clear: () => until.clear(),
  };
}
