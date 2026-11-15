export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export type Rng = () => number;

export const systemRng: Rng = Math.random;
