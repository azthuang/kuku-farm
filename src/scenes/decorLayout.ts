import { SPOT_IDS, spotLot, type SpotId } from '../core/decor';
import type { Rect } from './ranchScenery';

/**
 * Where the decorations stand (world units; a point is the bottom centre). Pure data: the scenery
 * layout keeps these boxes clear, the scene draws into them.
 *
 * Ordinary spots: three per page on the grass strip above the fence, right of the house roofs
 * (the houses stand in each pen's top-left corner). The two big spots for the specials sit in the
 * west strip (the strip east of the stream is too narrow), side by side at the very bottom, in
 * front of the bottom-left wood. A special stands in front of whatever grows behind it, so the
 * scenery keeps only its feet clear and puts nothing in front of it.
 */

const CELL = 600;
const COLS = 2;
/** Spot centres across a cell, and the bottom of every spot (8 above the fence at 80). */
const SPOT_X = [340, 440, 535] as const;
const SPOT_BOTTOM = 72;

export const SPOT_SIZE = { w: 70, h: 70 } as const;
export const BIG_SIZE = { w: 130, h: 200 } as const;

export const DECOR_SPOTS: Readonly<Record<SpotId, { x: number; y: number }>> = Object.fromEntries(
  SPOT_IDS.map((s) => {
    const lot = spotLot(s);
    const i = Number(s.split('-')[1]);
    return [s, { x: (lot % COLS) * CELL + SPOT_X[i], y: Math.floor(lot / COLS) * CELL + SPOT_BOTTOM }];
  }),
) as Record<SpotId, { x: number; y: number }>;

export const BIG_SPOTS: readonly [{ x: number; y: number }, { x: number; y: number }] = [
  { x: -91, y: 1796 },
  { x: -233, y: 1796 },
];
/** The ground a special stands on: kept clear of every plant's footprint. */
export const BIG_FOOT_H = 50;

export function spotBox(s: SpotId): Rect {
  const p = DECOR_SPOTS[s];
  return { x: p.x - SPOT_SIZE.w / 2, y: p.y - SPOT_SIZE.h, w: SPOT_SIZE.w, h: SPOT_SIZE.h };
}

export function bigBox(slot: 0 | 1): Rect {
  const p = BIG_SPOTS[slot];
  return { x: p.x - BIG_SIZE.w / 2, y: p.y - BIG_SIZE.h, w: BIG_SIZE.w, h: BIG_SIZE.h };
}

export function bigFoot(slot: 0 | 1): Rect {
  const b = bigBox(slot);
  return { x: b.x, y: b.y + b.h - BIG_FOOT_H, w: b.w, h: BIG_FOOT_H };
}

/** The ordinary spots: the scenery leaves these boxes wholly open. */
export const SPOT_CLEAR: readonly Rect[] = SPOT_IDS.map(spotBox);

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
