import { CROP_BY_ROW, LEVEL_ORDER, type CropId } from './levels';
import type { Rng } from './clock';
import type { GameState } from './state';
import { settle, MOOD_START, type Animal, type RanchState } from './ranch';
import {
  SPECIES, SPECIES_ORDER, speciesOfHouse,
  type HouseKind, type Price, type ProductId, type SpeciesId, type SupplyId,
} from './species';

export type { Price };
export type ShopItemId = HouseKind | SpeciesId | SupplyId;
export type ShopState = GameState;
export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'short' | 'full' | 'need-house' | 'locked' };

export const MAX_ANIMALS = 12;
export const MAX_HOUSES = 5;
export const SUPPLY_CAP = 99;
export const SUPPLY_AMOUNT: Record<SupplyId, number> = {
  feed: 5, feedCow: 5, feedPig: 5, feedSheep: 5, feedLlama: 5, treat: 3, medicine: 1,
};

const SHARED_PRICES: Record<'treat' | 'medicine', Price> = {
  treat: { carrot: 20 },
  medicine: { wheat: 40, carrot: 20 },
};

type Kind =
  | { t: 'house'; sp: SpeciesId }
  | { t: 'animal'; sp: SpeciesId }
  | { t: 'feed'; sp: SpeciesId }
  | { t: 'shared'; id: 'treat' | 'medicine' };

function classify(item: ShopItemId): Kind {
  for (const sp of SPECIES_ORDER) {
    const d = SPECIES[sp];
    if (item === d.house) return { t: 'house', sp };
    if (item === sp) return { t: 'animal', sp };
    if (item === d.feed) return { t: 'feed', sp };
  }
  return { t: 'shared', id: item as 'treat' | 'medicine' };
}

function countOf(r: RanchState, sp: SpeciesId): number {
  return r.animals.filter((a) => a.species === sp).length;
}

export function priceOf(state: ShopState, item: ShopItemId): Price {
  const k = classify(item);
  if (k.t === 'house') return { ...SPECIES[k.sp].housePrice };
  if (k.t === 'animal') return { ...SPECIES[k.sp].animalPrice(countOf(state.ranch, k.sp)) };
  if (k.t === 'feed') return { ...SPECIES[k.sp].feedPrice };
  return { ...SHARED_PRICES[k.id] };
}

type PriceEntries = [CropId | ProductId, number][];

function isProduct(key: CropId | ProductId, r: RanchState): key is ProductId {
  return key in r.products;
}

function have(state: ShopState, key: CropId | ProductId): number {
  return isProduct(key, state.ranch) ? state.ranch.products[key] : state.inventory[key];
}

function openHouse(r: RanchState, sp: SpeciesId) {
  const def = SPECIES[sp];
  return r.houses.find((h) => h.kind === def.house
    && r.animals.filter((a) => a.houseId === h.id).length < def.houseCapacity);
}

function hasHouse(r: RanchState, sp: SpeciesId): boolean {
  return r.houses.some((h) => h.kind === SPECIES[sp].house);
}

function lockedBy(state: ShopState, kind: HouseKind): { row: number; crop: CropId } | null {
  const open = LEVEL_ORDER.slice(0, state.unlocked);
  for (const crop of SPECIES[speciesOfHouse(kind)].lockCrop) {
    const row = LEVEL_ORDER.find((r) => CROP_BY_ROW[r].id === crop);
    if (row !== undefined && !open.includes(row)) return { row, crop };
  }
  return null;
}

export function isLocked(state: ShopState, kind: HouseKind): boolean {
  return lockedBy(state, kind) !== null;
}

/** The first crop of the house price whose level is still locked, or null when the house is open. */
export function lockHint(
  state: ShopState, kind: HouseKind,
): { row: number; crop: CropId; unlocked: boolean } | null {
  const l = lockedBy(state, kind);
  return l ? { ...l, unlocked: LEVEL_ORDER.slice(0, state.unlocked).includes(l.row) } : null;
}

function supplyOf(k: Kind): SupplyId | null {
  if (k.t === 'feed') return SPECIES[k.sp].feed;
  return k.t === 'shared' ? k.id : null;
}

export function checkBuy(state: ShopState, item: ShopItemId): CheckResult {
  const r = state.ranch;
  const k = classify(item);
  if (k.t === 'house') {
    if (r.houses.some((h) => h.kind === SPECIES[k.sp].house)) return { ok: false, reason: 'full' };
    if (isLocked(state, SPECIES[k.sp].house)) return { ok: false, reason: 'locked' };
  } else if (k.t === 'animal') {
    if (!hasHouse(r, k.sp)) return { ok: false, reason: 'need-house' };
    if (r.animals.length >= MAX_ANIMALS || !openHouse(r, k.sp)) return { ok: false, reason: 'full' };
  } else {
    if (k.t === 'feed' && !hasHouse(r, k.sp)) return { ok: false, reason: 'need-house' };
    const id = supplyOf(k)!;
    if (r.supplies[id] + SUPPLY_AMOUNT[id] > SUPPLY_CAP) return { ok: false, reason: 'full' };
  }
  const price = Object.entries(priceOf(state, item)) as PriceEntries;
  return price.every(([key, n]) => have(state, key) >= n) ? { ok: true } : { ok: false, reason: 'short' };
}

function pay(state: ShopState, price: Price): void {
  for (const [key, n] of Object.entries(price) as PriceEntries) {
    if (isProduct(key, state.ranch)) state.ranch.products[key] -= n;
    else state.inventory[key] -= n;
  }
}

function unusedNames(r: RanchState, sp: SpeciesId, except?: Animal): string[] {
  const used = new Set(r.animals.filter((a) => a !== except).map((a) => a.name));
  return SPECIES[sp].names.filter((n) => !used.has(n));
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
  const k = classify(item);
  if (k.t === 'house') {
    const sp = SPECIES[k.sp];
    r.houses.push({ id: `h${r.nextId++}`, kind: sp.house, lot: sp.lot, poop: 0 });
    return { ok: true };
  }
  if (k.t === 'animal') {
    const sp = SPECIES[k.sp];
    const names = unusedNames(r, k.sp);
    const animal: Animal = {
      id: `a${r.nextId++}`, species: k.sp,
      name: pickFrom(names.length ? names : sp.names, rng),
      color: pickFrom(sp.colors, rng),
      houseId: openHouse(r, k.sp)!.id,
      satiety: 100, mood: MOOD_START, sick: false, medicated: false,
      neglectMs: 0, produceMs: 0, poopMs: 0, waiting: 0, petTimes: [], lastBrushAt: null,
    };
    r.animals.push(animal);
    return { ok: true, animalId: animal.id };
  }
  const id = supplyOf(k)!;
  r.supplies[id] += SUPPLY_AMOUNT[id];
  return { ok: true };
}

export function nextName(r: RanchState, animalId: string): void {
  const a = r.animals.find((x) => x.id === animalId);
  if (!a) return;
  const names = SPECIES[a.species].names;
  const free = new Set(unusedNames(r, a.species, a));
  const start = names.indexOf(a.name);
  for (let i = 1; i <= names.length; i++) {
    const n = names[(start + i) % names.length];
    if (n !== a.name && free.has(n)) { a.name = n; return; }
  }
}
