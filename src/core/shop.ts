import type { CropId } from './levels';
import type { Rng } from './clock';
import type { GameState } from './state';
import { settle, MOOD_START, type Animal, type RanchState } from './ranch';
import { SPECIES, type ProductId, type SupplyId } from './species';

export type ShopItemId = 'coop' | 'chicken' | 'feed' | 'treat' | 'medicine';
export type Price = Partial<Record<CropId | ProductId, number>>;
export type ShopState = GameState;
export type CheckResult = { ok: true } | { ok: false; reason: 'short' | 'full' | 'need-house' };

export const MAX_ANIMALS = 10;
export const MAX_HOUSES = 1;
export const SUPPLY_CAP = 99;
export const SUPPLY_AMOUNT: Record<SupplyId, number> = { feed: 5, treat: 3, medicine: 1 };
const CHEAP_CHICKENS = 2;

const PRICES: Record<Exclude<ShopItemId, 'chicken'>, Price> = {
  coop: { wheat: 150, carrot: 100 },
  feed: { wheat: 15 },
  treat: { carrot: 10 },
  medicine: { egg: 2, wheat: 10 },
};

export function priceOf(state: ShopState, item: ShopItemId): Price {
  if (item !== 'chicken') return { ...PRICES[item] };
  return state.ranch.animals.length < CHEAP_CHICKENS
    ? { wheat: 80, carrot: 50 }
    : { corn: 20, egg: 5 };
}

type PriceEntries = [CropId | ProductId, number][];

function have(state: ShopState, key: CropId | ProductId): number {
  return key === 'egg' ? state.ranch.products.egg : state.inventory[key];
}

function openHouse(r: RanchState) {
  const sp = SPECIES.chicken;
  return r.houses.find((h) => h.kind === sp.house
    && r.animals.filter((a) => a.houseId === h.id).length < sp.houseCapacity);
}

export function checkBuy(state: ShopState, item: ShopItemId): CheckResult {
  const r = state.ranch;
  if (item === 'coop') {
    if (r.houses.length >= MAX_HOUSES) return { ok: false, reason: 'full' };
  } else if (item === 'chicken') {
    if (!r.houses.some((h) => h.kind === SPECIES.chicken.house)) return { ok: false, reason: 'need-house' };
    if (r.animals.length >= MAX_ANIMALS || !openHouse(r)) return { ok: false, reason: 'full' };
  } else if (r.supplies[item] + SUPPLY_AMOUNT[item] > SUPPLY_CAP) {
    return { ok: false, reason: 'full' };
  }
  const price = Object.entries(priceOf(state, item)) as PriceEntries;
  return price.every(([k, n]) => have(state, k) >= n) ? { ok: true } : { ok: false, reason: 'short' };
}

function pay(state: ShopState, price: Price): void {
  for (const [k, n] of Object.entries(price) as PriceEntries) {
    if (k === 'egg') state.ranch.products.egg -= n;
    else state.inventory[k] -= n;
  }
}

function unusedNames(r: RanchState, except?: Animal): string[] {
  const used = new Set(r.animals.filter((a) => a !== except).map((a) => a.name));
  return SPECIES.chicken.names.filter((n) => !used.has(n));
}

function pickFrom<T>(list: readonly T[], rng: Rng): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function buy(
  state: ShopState, item: ShopItemId, now: number, rng: Rng,
): CheckResult & { animalId?: string } {
  const r = state.ranch;
  settle(r, now);
  const check = checkBuy(state, item);
  if (!check.ok) return check;
  pay(state, priceOf(state, item));
  if (item === 'coop') {
    r.houses.push({ id: `h${r.nextId++}`, kind: 'coop', lot: r.houses.length, poop: 0 });
    return { ok: true };
  }
  if (item === 'chicken') {
    const sp = SPECIES.chicken;
    const names = unusedNames(r);
    const animal: Animal = {
      id: `a${r.nextId++}`, species: 'chicken',
      name: pickFrom(names.length ? names : sp.names, rng),
      color: pickFrom(sp.colors, rng),
      houseId: openHouse(r)!.id,
      satiety: 100, mood: MOOD_START, sick: false, medicated: false,
      neglectMs: 0, produceMs: 0, poopMs: 0, waiting: 0, petTimes: [], lastBrushAt: null,
    };
    r.animals.push(animal);
    return { ok: true, animalId: animal.id };
  }
  r.supplies[item] += SUPPLY_AMOUNT[item];
  return { ok: true };
}

export function nextName(r: RanchState, animalId: string): void {
  const a = r.animals.find((x) => x.id === animalId);
  if (!a) return;
  const names = SPECIES[a.species].names;
  const free = new Set(unusedNames(r, a));
  const start = names.indexOf(a.name);
  for (let i = 1; i <= names.length; i++) {
    const n = names[(start + i) % names.length];
    if (n !== a.name && free.has(n)) { a.name = n; return; }
  }
}
