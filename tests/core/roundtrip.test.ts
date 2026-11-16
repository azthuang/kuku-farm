import { describe, it, expect } from 'vitest';
import { createNewState, type GameState } from '../../src/core/state';
import { serialize, parseSave } from '../../src/core/save';
import {
  settle, feed, pet, brush, giveTreat, giveMedicine, cleanPoop, collect,
} from '../../src/core/ranch';
import { buy, nextName } from '../../src/core/shop';

const H = 3_600_000;
const T0 = 1_763_000_000_000;

/** Deterministic PRNG (mulberry32). */
function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rich(now: number): GameState {
  const s = createNewState(now);
  s.unlocked = 9;
  for (const k of Object.keys(s.inventory) as (keyof GameState['inventory'])[]) s.inventory[k] = 999;
  return s;
}

/** Whatever the app produces must load back exactly, with nothing clamped or reset. */
function expectRoundTrip(s: GameState): void {
  expect(parseSave(serialize(s))).toEqual({ ok: true, state: s });
}

describe('app-produced saves round trip', () => {
  it('a scripted week of buying and care', () => {
    const rng = mulberry(7);
    let now = T0;
    const s = rich(now);
    const r = s.ranch;
    expect(buy(s, 'coop', now, rng).ok).toBe(true);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      now += 60_000;
      const res = buy(s, 'chicken', now, rng);
      expect(res.ok).toBe(true);
      ids.push(res.animalId!);
      if (i === 1) r.products.egg = 20; // chickens 3 and 4 cost eggs
    }
    for (const item of ['feed', 'feed', 'treat', 'medicine', 'medicine'] as const) {
      expect(buy(s, item, now, rng).ok).toBe(true);
    }
    expectRoundTrip(s);

    let sawSick = false;
    let healed = 0;
    for (let day = 0; day < 7; day++) {
      // An absence: short on most days, long enough to fall sick on day 3.
      now += day === 3 ? 62 * H + 17_321 : 9 * H + day * 3_337;
      settle(r, now);
      expectRoundTrip(s);
      for (const id of ids) {
        const a = r.animals.find((x) => x.id === id)!;
        if (a.sick) {
          sawSick = true;
          giveMedicine(r, id, now);
          now += 1500;
          if (pet(r, id, now).ok) healed += 1;
        }
        feed(r, id, now);
        now += 2_000;
        pet(r, id, now);
        pet(r, id, now + 10);
        brush(r, id, now);
        if (day % 2 === 0) giveTreat(r, id, now);
        collect(r, id);
        expectRoundTrip(s);
      }
      for (const h of r.houses) cleanPoop(r, h.id);
      if (day === 4) nextName(r, ids[0]);
      now += 37 * 60_000 + 123; // the child keeps playing a while
      settle(r, now);
      expectRoundTrip(s);
    }
    expect(sawSick).toBe(true);
    expect(healed).toBeGreaterThan(0);
    expect(r.animals.some((a) => a.petTimes.length > 0 && a.lastBrushAt !== null)).toBe(true);
    expect(r.animals.some((a) => !Number.isInteger(a.satiety) || !Number.isInteger(a.mood))).toBe(true);
  });

  it('seeded random play (time also jumps back)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rnd = mulberry(seed);
      let now = T0;
      const s = rich(now);
      const r = s.ranch;
      for (let step = 0; step < 250; step++) {
        const jr = rnd();
        if (jr < 0.6) now += Math.floor(rnd() * 120_000);
        else if (jr < 0.8) now += Math.floor(rnd() * 70 * H);
        else if (jr < 0.9) now -= Math.floor(rnd() * 5 * H);
        else now += 1;
        const ids = r.animals.map((a) => a.id);
        const id = ids.length ? ids[Math.floor(rnd() * ids.length)] : 'none';
        const x = rnd();
        if (x < 0.12) buy(s, (['coop', 'chicken', 'feed', 'treat', 'medicine'] as const)[Math.floor(rnd() * 5)], now, rnd);
        else if (x < 0.25) feed(r, id, now);
        else if (x < 0.4) pet(r, id, now);
        else if (x < 0.5) brush(r, id, now);
        else if (x < 0.55) giveTreat(r, id, now);
        else if (x < 0.65) giveMedicine(r, id, now);
        else if (x < 0.75) { settle(r, now); if (r.houses[0]) cleanPoop(r, r.houses[0].id); }
        else if (x < 0.85) { settle(r, now); collect(r, id); }
        else if (x < 0.9) nextName(r, id);
        else settle(r, now);
        s.inventory.wheat = 999;
        s.inventory.carrot = 999;
        s.inventory.corn = 999;
        const p = parseSave(serialize(s));
        expect(p, `seed ${seed} step ${step}`).toEqual({ ok: true, state: s });
      }
    }
  });
});
