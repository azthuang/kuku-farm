import type { Rng } from './clock';

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

export function goldenChance(stars: number): number {
  if (stars >= 3) return 0.3;
  if (stars === 2) return 0.1;
  return 0;
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
