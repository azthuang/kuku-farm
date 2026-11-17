import type { Rng } from './clock';
import type { Crop, CropId } from './levels';

export type Mode = 'basic' | 'challenge';

export const MAX_POINTS = 6;

export function applyAnswer(points: number, mode: Mode, correct: boolean, firstAttempt: boolean): number {
  if (!firstAttempt) return points;
  const delta = correct ? (mode === 'challenge' ? 2 : 1) : -1;
  return Math.min(MAX_POINTS, Math.max(0, points + delta));
}

export function starsOf(points: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(points / 2)) as 0 | 1 | 2 | 3;
}

export function challengeWeight(points: number): number {
  return 7 - points;
}

/** Returns the index of the picked item. */
export function weightedPick<T>(items: T[], weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0);
  const r = rng() * total;
  let cum = 0;
  for (let i = 0; i < items.length; i++) {
    cum += weights[i];
    if (r < cum) return i;
  }
  return items.length - 1;
}

/** Base of the fall-off below the row's own crop; each star makes the own crop more likely. */
export const CROP_FALLOFF = 0.65;
export const CROP_FALLOFF_PER_STAR = 0.1;

/** In pools of this many crops or more, wheat and carrot (pool[0], pool[1]) keep this share. */
export const BASE_CROP_FLOOR = 0.05;
export const BASE_CROP_FLOOR_FROM = 4;

/**
 * Shares for a pool ordered by unlock (wheat, carrot, … , the question's own crop last): the own
 * crop weighs 1, each step down weighs r times less, r = 0.65 − 0.1 × stars. In pools of 4+ crops
 * wheat and carrot never fall below BASE_CROP_FLOOR (chicken feed and medicine are paid in them);
 * the other crops give up that share in proportion. Sums to 1.
 */
export function cropWeights(poolSize: number, stars: number): number[] {
  const r = CROP_FALLOFF - CROP_FALLOFF_PER_STAR * stars;
  const w = Array.from({ length: poolSize }, (_, i) => Math.pow(r, poolSize - 1 - i));
  const sum = w.reduce((a, b) => a + b, 0);
  const p = w.map(x => x / sum);
  if (poolSize < BASE_CROP_FLOOR_FROM) return p;
  // Pin wheat/carrot that sit below the floor; scaling the rest down may push the other one under
  // too, so repeat until nothing new is pinned (at most twice).
  const pinned = new Set<number>();
  let out = p;
  for (;;) {
    for (const i of [0, 1]) if (out[i] < BASE_CROP_FLOOR - 1e-12) pinned.add(i);
    const free = p.reduce((a, x, i) => (pinned.has(i) ? a : a + x), 0);
    const k = (1 - pinned.size * BASE_CROP_FLOOR) / free;
    const next = p.map((x, i) => (pinned.has(i) ? BASE_CROP_FLOOR : x * k));
    if ([0, 1].every(i => pinned.has(i) || next[i] >= BASE_CROP_FLOOR - 1e-12)) return next;
    out = next;
  }
}

/** A full crop keeps this much of its share, so with every crop full the odds are the plain ones. */
export const STOCK_MIN = 0.02;

/**
 * Challenge mode leans toward what the barn is short of: each share is multiplied by
 * (room left)², `fullness` being stock / cap per crop (0 empty, 1 full), never below STOCK_MIN.
 * Measured (late game, 3 challenge rounds a day): no harvest lost to the cap while the ranch fills,
 * against 8% with the plain odds; the row's own crop still leads while it has room.
 */
export function stockWeights(weights: number[], fullness: number[]): number[] {
  return weights.map((w, i) => w * Math.max(STOCK_MIN, Math.max(0, 1 - fullness[i]) ** 2));
}

/** A crop for a question; with `fullness` (challenge mode) a nearly full crop rarely comes. */
export function pickCrop(pool: Crop[], stars: number, rng: Rng, fullness?: Partial<Record<CropId, number>>): CropId {
  let w = cropWeights(pool.length, stars);
  if (fullness) w = stockWeights(w, pool.map(c => fullness[c.id] ?? 0));
  return pool[weightedPick(pool, w, rng)].id;
}
