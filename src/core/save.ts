import { CROP_BY_ROW, type CropId } from './levels';
import { SPECIES, type HouseKind, type ProductId, type SpeciesId, type SupplyId } from './species';
import {
  MAX_POOP, PRODUCT_CAP, PET_MAX_IN_WINDOW, createRanch,
  type Animal, type House, type RanchState,
} from './ranch';
import { CROP_CAP, type DailyStat, type GameState } from './state';

export const SAVE_KEY = 'kuku-farm-save';
export const CORRUPT_KEY = 'kuku-farm-save-corrupt';

export type ParseResult =
  | { ok: true; state: GameState }
  | { ok: false; error: 'invalid' | 'newer-version' };

const MAX_MASTERY = 6;
const MAX_ANIMALS_SAVED = 10; // mirrors shop.MAX_ANIMALS
const SUPPLY_CAP_SAVED = 99; // mirrors shop.SUPPLY_CAP
const SUPPLY_IDS: readonly SupplyId[] = ['feed', 'treat', 'medicine'];
const PRODUCT_IDS: readonly ProductId[] = ['egg'];
const HOUSE_KINDS: readonly HouseKind[] = ['coop'];
const CELL_KEY = /^[1-9],[1-9]$/;
const ROW_KEY = /^[1-9]$/;

class Invalid extends Error {}
class Newer extends Error {}

function fail(): never { throw new Invalid(); }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function rec(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : fail();
}

function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function isFiniteIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function validateRanch(data: unknown): RanchState {
  const o = rec(data);

  const houses: House[] = [];
  if (!Array.isArray(o.houses)) fail();
  for (const hv of o.houses) {
    const h = rec(hv);
    if (typeof h.id !== 'string' || h.id === '') fail();
    if (!HOUSE_KINDS.includes(h.kind as HouseKind)) fail();
    if (!isNonNegInt(h.lot) || !isIntIn(h.poop, 0, MAX_POOP)) fail();
    if (houses.some((x) => x.id === h.id)) fail();
    houses.push({ id: h.id, kind: h.kind as HouseKind, lot: h.lot, poop: h.poop });
  }

  const animals: Animal[] = [];
  if (!Array.isArray(o.animals) || o.animals.length > MAX_ANIMALS_SAVED) fail();
  for (const av of o.animals) {
    const a = rec(av);
    if (typeof a.id !== 'string' || a.id === '') fail();
    if (animals.some((x) => x.id === a.id)) fail();
    if (typeof a.species !== 'string' || !has(SPECIES, a.species)) fail();
    const sp = SPECIES[a.species as SpeciesId];
    if (typeof a.name !== 'string' || typeof a.color !== 'string') fail();
    const house = houses.find((h) => h.id === a.houseId);
    if (!house || house.kind !== sp.house) fail();
    if (!isFiniteIn(a.satiety, 0, 100) || !isFiniteIn(a.mood, 0, 100)) fail();
    if (typeof a.sick !== 'boolean' || typeof a.medicated !== 'boolean') fail();
    if (!isFiniteIn(a.neglectMs, 0, Infinity) || !isFiniteIn(a.produceMs, 0, Infinity)
      || !isFiniteIn(a.poopMs, 0, Infinity)) fail();
    if (!isIntIn(a.waiting, 0, sp.maxWaiting)) fail();
    if (!Array.isArray(a.petTimes) || a.petTimes.length > PET_MAX_IN_WINDOW
      || !a.petTimes.every((t) => typeof t === 'number' && Number.isFinite(t))) fail();
    if (a.lastBrushAt !== null && !(typeof a.lastBrushAt === 'number' && Number.isFinite(a.lastBrushAt))) fail();
    if (animals.filter((x) => x.houseId === a.houseId).length >= sp.houseCapacity) fail();
    animals.push({
      id: a.id, species: a.species as SpeciesId, name: a.name, color: a.color, houseId: a.houseId as string,
      satiety: a.satiety, mood: a.mood, sick: a.sick, medicated: a.medicated,
      neglectMs: a.neglectMs, produceMs: a.produceMs, poopMs: a.poopMs, waiting: a.waiting,
      petTimes: [...(a.petTimes as number[])], lastBrushAt: a.lastBrushAt as number | null,
    });
  }

  const sIn = rec(o.supplies);
  const supplies = {} as Record<SupplyId, number>;
  for (const k of SUPPLY_IDS) {
    const n = has(sIn, k) ? sIn[k] : undefined;
    if (!isIntIn(n, 0, SUPPLY_CAP_SAVED)) fail();
    supplies[k] = n;
  }
  const pIn = rec(o.products);
  const products = {} as Record<ProductId, number>;
  for (const k of PRODUCT_IDS) {
    const n = has(pIn, k) ? pIn[k] : undefined;
    if (!isIntIn(n, 0, PRODUCT_CAP)) fail();
    products[k] = n;
  }

  if (typeof o.settledAt !== 'number' || !Number.isFinite(o.settledAt)) fail();
  if (!isIntIn(o.nextId, 1, Number.MAX_SAFE_INTEGER)) fail();
  return { houses, animals, supplies, products, settledAt: o.settledAt, nextId: o.nextId };
}

function validate(data: unknown): GameState {
  const o = rec(data);
  if (typeof o.version !== 'number' || Number.isNaN(o.version)) fail();
  if (o.version > 3) throw new Newer();
  if (o.version !== 1 && o.version !== 2 && o.version !== 3) fail();
  // v1 carried a `growing` map; it is ignored (even if malformed) and dropped.

  if (!isIntIn(o.unlocked, 1, 9)) fail();

  const invIn = rec(o.inventory);
  const inventory = {} as Record<CropId, number>;
  for (const row of Object.keys(CROP_BY_ROW)) {
    const id = CROP_BY_ROW[Number(row)].id;
    const n = Object.prototype.hasOwnProperty.call(invIn, id) ? invIn[id] : undefined;
    if (!isIntIn(n, 0, CROP_CAP)) fail();
    inventory[id] = n;
  }

  const mastery: Record<string, number> = {};
  const mIn = rec(o.mastery);
  for (const k of Object.keys(mIn)) {
    if (!CELL_KEY.test(k) || !isIntIn(mIn[k], 0, MAX_MASTERY)) fail();
    mastery[k] = mIn[k] as number;
  }

  const cleared: Record<number, number[]> = {};
  const cIn = rec(o.cleared);
  for (const k of Object.keys(cIn)) {
    const v = cIn[k];
    if (!ROW_KEY.test(k) || !Array.isArray(v)) fail();
    if (!v.every((x) => isIntIn(x, 1, 9))) fail();
    cleared[Number(k)] = [...new Set(v as number[])]; // duplicates must not count toward unlocking
  }

  const sIn = rec(o.settings);
  if (typeof sIn.speech !== 'boolean' || typeof sIn.sound !== 'boolean') fail();

  const daily: Record<string, DailyStat> = {};
  const dIn = rec(o.daily);
  for (const k of Object.keys(dIn)) {
    const d = rec(dIn[k]);
    if (!isNonNegInt(d.answered) || !isNonNegInt(d.correct)) fail();
    daily[k] = { answered: d.answered, correct: d.correct };
  }

  if (typeof o.lastSeenAt !== 'number' || !Number.isFinite(o.lastSeenAt)) fail();

  const ranch = o.version === 3 ? validateRanch(o.ranch) : createRanch(o.lastSeenAt);

  return {
    version: 3,
    unlocked: o.unlocked,
    cleared,
    mastery,
    inventory,
    daily,
    settings: { speech: sIn.speech, sound: sIn.sound },
    lastSeenAt: o.lastSeenAt,
    ranch,
  };
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function parseSave(raw: string): ParseResult {
  try {
    return { ok: true, state: validate(JSON.parse(raw)) };
  } catch (e) {
    return { ok: false, error: e instanceof Newer ? 'newer-version' : 'invalid' };
  }
}

export type LoadResult =
  | { kind: 'ok'; state: GameState }
  | { kind: 'empty' }
  | { kind: 'corrupt' }
  | { kind: 'newer' };

export function loadFrom(storage: Pick<Storage, 'getItem' | 'setItem'>): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { kind: 'empty' };
    const r = parseSave(raw);
    if (r.ok) return { kind: 'ok', state: r.state };
    if (r.error === 'newer-version') return { kind: 'newer' }; // never touch storage
    try { storage.setItem(CORRUPT_KEY, raw); } catch { /* backup is best-effort */ }
    return { kind: 'corrupt' };
  } catch {
    return { kind: 'empty' };
  }
}

export function saveTo(storage: Pick<Storage, 'setItem'>, s: GameState): void {
  storage.setItem(SAVE_KEY, serialize(s));
}

export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `kuku-farm-save-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}
