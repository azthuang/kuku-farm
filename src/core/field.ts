import { REGROW_MS, cellKey, type GameState } from './state';

export function isRipe(s: GameState, a: number, b: number, now: number): boolean {
  const t = s.growing[cellKey(a, b)];
  return t === undefined || now >= t;
}

export function msUntilRipe(s: GameState, a: number, b: number, now: number): number {
  const t = s.growing[cellKey(a, b)];
  return t === undefined ? 0 : Math.max(0, t - now);
}

export function harvestCell(s: GameState, a: number, b: number, now: number): void {
  s.growing[cellKey(a, b)] = now + REGROW_MS;
}

/** Drops ripe cells; clamps any timestamp beyond one regrow from now (bad import, clock jump). */
export function refreshGrowing(s: GameState, now: number): void {
  for (const key of Object.keys(s.growing)) {
    if (now >= s.growing[key]) delete s.growing[key];
    else s.growing[key] = Math.min(s.growing[key], now + REGROW_MS);
  }
}

/** If the device clock moved backwards, shift all timestamps back by the same amount. */
export function rebaseClock(s: GameState, now: number): boolean {
  const rewound = now < s.lastSeenAt;
  if (rewound) {
    const diff = s.lastSeenAt - now;
    for (const key of Object.keys(s.growing)) s.growing[key] -= diff;
  }
  for (const key of Object.keys(s.growing)) {
    s.growing[key] = Math.min(s.growing[key], now + REGROW_MS);
  }
  s.lastSeenAt = now;
  return rewound;
}
