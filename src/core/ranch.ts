import { SPECIES, type HouseKind, type ProductId, type SpeciesId, type SupplyId } from './species';

const MS_HOUR = 3_600_000;
const STEP_MS = 60_000;
const MAX_SETTLE_MS = 30 * 24 * MS_HOUR;

export const MAX_POOP = 6;
export const SICK_POOP = 3;
export const SICK_AFTER_MS = 24 * MS_HOUR;
export const FEED_AMOUNT = 50;
/** At or above this satiety a chicken counts as full: feeding it shakes its head and uses no feed. */
export const FEED_FULL_AT = 90;
export const MOOD_HAPPY = 70;
export const MOOD_START = 60;
export const MOOD_PET = 5;
export const MOOD_BRUSH = 15;
export const MOOD_TREAT = 30;
export const MOOD_HUNGRY_PER_HOUR = 5;
export const MOOD_POOP_PER_HOUR = 2;
export const PET_WINDOW_MS = 10 * 60_000;
export const PET_MAX_IN_WINDOW = 3;
export const BRUSH_COOLDOWN_MS = MS_HOUR;
export const HEAL_SATIETY = 30;
export const HEAL_MOOD = 50;
export const PRODUCT_CAP = 999;

export interface House { id: string; kind: HouseKind; lot: number; poop: number }

export interface Animal {
  id: string;
  species: SpeciesId;
  name: string;
  color: string;
  houseId: string;
  satiety: number;
  mood: number;
  sick: boolean;
  medicated: boolean;
  neglectMs: number;
  produceMs: number;
  poopMs: number;
  waiting: number;
  petTimes: number[];
  lastBrushAt: number | null;
}

export interface RanchState {
  houses: House[];
  animals: Animal[];
  supplies: Record<SupplyId, number>;
  products: Record<ProductId, number>;
  settledAt: number;
  nextId: number;
}

export type CareResult =
  | { ok: true; healed?: boolean }
  | { ok: false; reason: 'none-left' | 'full' | 'not-sick' | 'sick' | 'cooldown' | 'nothing' };

export function createRanch(now: number): RanchState {
  return {
    houses: [],
    animals: [],
    supplies: { feed: 0, treat: 0, medicine: 0 },
    products: { egg: 0 },
    settledAt: now,
    nextId: 1,
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function stepAnimal(a: Animal, house: House | undefined, dt: number): void {
  const sp = SPECIES[a.species];
  const hours = dt / MS_HOUR;
  const poop = house?.poop ?? 0;

  if (!a.sick) {
    a.satiety = Math.max(0, a.satiety - sp.satietyPerHour * hours);
    if (a.satiety < 1e-6) a.satiety = 0;
  }

  let moodDelta = -MOOD_POOP_PER_HOUR * poop * hours;
  if (a.satiety === 0) moodDelta -= MOOD_HUNGRY_PER_HOUR * hours;
  a.mood = clamp(a.mood + moodDelta, 0, 100);

  if (a.sick) return;

  if (a.satiety === 0 && poop >= SICK_POOP) {
    a.neglectMs += dt;
    if (a.neglectMs >= SICK_AFTER_MS) {
      a.sick = true;
      a.medicated = false;
      a.neglectMs = 0;
      return;
    }
  } else {
    a.neglectMs = 0;
  }

  a.poopMs += dt;
  if (a.poopMs >= sp.poopEveryMs) {
    a.poopMs -= sp.poopEveryMs;
    if (house && house.poop < MAX_POOP) house.poop += 1;
  }

  if (a.satiety > 0 && a.waiting < sp.maxWaiting) {
    a.produceMs += dt;
    const every = a.mood >= MOOD_HAPPY ? sp.produceHappyEveryMs : sp.produceEveryMs;
    if (a.produceMs >= every) {
      a.produceMs -= every;
      a.waiting += 1;
    }
  }
}

export function settle(r: RanchState, now: number): void {
  let remaining = now - r.settledAt;
  if (remaining <= 0) return; // clock went back or no time passed: keep settledAt
  r.settledAt = now;
  remaining = Math.min(remaining, MAX_SETTLE_MS);
  if (r.animals.length === 0) return;
  while (remaining > 0) {
    const dt = Math.min(STEP_MS, remaining);
    for (const a of r.animals) {
      stepAnimal(a, r.houses.find((h) => h.id === a.houseId), dt);
    }
    remaining -= dt;
  }
}

function withAnimal(
  r: RanchState, animalId: string, now: number, fn: (a: Animal) => CareResult,
): CareResult {
  settle(r, now);
  const a = r.animals.find((x) => x.id === animalId);
  return a ? fn(a) : { ok: false, reason: 'nothing' };
}

export function feed(r: RanchState, animalId: string, now: number): CareResult {
  return withAnimal(r, animalId, now, (a) => {
    if (a.satiety >= FEED_FULL_AT) return { ok: false, reason: 'full' };
    if (r.supplies.feed < 1) return { ok: false, reason: 'none-left' };
    r.supplies.feed -= 1;
    a.satiety = Math.min(100, a.satiety + FEED_AMOUNT);
    a.neglectMs = 0;
    return { ok: true };
  });
}

export function pet(r: RanchState, animalId: string, now: number): CareResult {
  return withAnimal(r, animalId, now, (a) => {
    if (a.sick && a.medicated) {
      a.sick = false;
      a.medicated = false;
      a.satiety = HEAL_SATIETY;
      a.mood = HEAL_MOOD;
      a.neglectMs = 0;
      return { ok: true, healed: true };
    }
    a.petTimes = a.petTimes.filter((t) => now - t < PET_WINDOW_MS);
    if (a.petTimes.length >= PET_MAX_IN_WINDOW) return { ok: false, reason: 'cooldown' };
    a.petTimes.push(now);
    a.mood = clamp(a.mood + MOOD_PET, 0, 100);
    return { ok: true };
  });
}

export function brush(r: RanchState, animalId: string, now: number): CareResult {
  return withAnimal(r, animalId, now, (a) => {
    if (a.sick) return { ok: false, reason: 'sick' };
    if (a.lastBrushAt !== null && now - a.lastBrushAt < BRUSH_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown' };
    }
    a.lastBrushAt = now;
    a.mood = clamp(a.mood + MOOD_BRUSH, 0, 100);
    return { ok: true };
  });
}

export function giveTreat(r: RanchState, animalId: string, now: number): CareResult {
  return withAnimal(r, animalId, now, (a) => {
    if (a.sick) return { ok: false, reason: 'sick' };
    if (r.supplies.treat < 1) return { ok: false, reason: 'none-left' };
    r.supplies.treat -= 1;
    a.mood = clamp(a.mood + MOOD_TREAT, 0, 100);
    return { ok: true };
  });
}

export function giveMedicine(r: RanchState, animalId: string, now: number): CareResult {
  return withAnimal(r, animalId, now, (a) => {
    if (!a.sick) return { ok: false, reason: 'not-sick' };
    if (a.medicated) return { ok: false, reason: 'nothing' };
    if (r.supplies.medicine < 1) return { ok: false, reason: 'none-left' };
    r.supplies.medicine -= 1;
    a.medicated = true;
    return { ok: true };
  });
}

export function cleanPoop(r: RanchState, houseId: string): CareResult {
  const h = r.houses.find((x) => x.id === houseId);
  if (!h || h.poop < 1) return { ok: false, reason: 'nothing' };
  h.poop -= 1;
  return { ok: true };
}

export function collect(r: RanchState, animalId: string): number {
  const a = r.animals.find((x) => x.id === animalId);
  if (!a) return 0;
  const product = SPECIES[a.species].product;
  const n = Math.min(a.waiting, PRODUCT_CAP - r.products[product]);
  if (n <= 0) return 0;
  a.waiting -= n;
  r.products[product] += n;
  return n;
}
