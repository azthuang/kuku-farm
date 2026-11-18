import { createDecor } from './decor';
import { CROP_BY_ROW, type CropId } from './levels';
import {
  SPECIES, HOUSE_KINDS, LEGACY_PET_COLORS, PETS, PET_KINDS, PET_SNACK_IDS, speciesOfHouse, PRODUCT_IDS, SUPPLY_IDS,
  type HouseKind, type PetKind, type ProductId, type SpeciesId, type SupplyId,
} from './species';
import {
  MAX_POOP, PRODUCT_CAP, PET_MAX_IN_WINDOW, createRanch,
  type Animal, type House, type Pet, type RanchState,
} from './ranch';
import { SUPPLY_CAP } from './shop';
import { CROP_CAP, type DailyStat, type GameState } from './state';

export const SAVE_KEY = 'kuku-farm-save';
export const CORRUPT_KEY = 'kuku-farm-save-corrupt';

/**
 * `ranchReset`: the field data was fine but the ranch part was unreadable, so `state.ranch` is a
 * fresh empty ranch. Present only when true.
 */
export type ParseResult =
  | { ok: true; state: GameState; ranchReset?: true }
  | { ok: false; error: 'invalid' | 'newer-version' };

const MAX_MASTERY = 6;
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

function finite(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fail();
}

function int(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? v : fail();
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Wrong types, unknown species/kinds, dangling or duplicate ids fail (the caller then resets just
 * the ranch). Numbers that are merely out of range are clamped: caps are tunable and a changed cap
 * must never cost the child her animals. Animal and house-capacity counts are not capped here at all
 * (the shop refuses more buys), so lowering a cap later never removes a chicken.
 */
/** Keys a v3 save never had (new species); they start at 0. Everything else is required. */
const V3_SUPPLY_IDS: readonly SupplyId[] = ['feed', 'treat', 'medicine'];
const V3_PRODUCT_IDS: readonly ProductId[] = ['egg'];

function validateRanch(data: unknown, version: number): RanchState {
  const o = rec(data);

  const houses: House[] = [];
  if (!Array.isArray(o.houses)) fail();
  for (const hv of o.houses) {
    const h = rec(hv);
    if (typeof h.id !== 'string' || h.id === '') fail();
    if (!HOUSE_KINDS.includes(h.kind as HouseKind)) fail();
    if (!isNonNegInt(h.lot)) fail();
    if (houses.some((x) => x.id === h.id || x.kind === h.kind)) fail(); // one house per kind
    // The lot of a kind is fixed by its species; a stale lot is reassigned, never a reason to reject.
    const lot = SPECIES[speciesOfHouse(h.kind as HouseKind)].lot;
    houses.push({ id: h.id, kind: h.kind as HouseKind, lot, poop: clamp(int(h.poop), 0, MAX_POOP) });
  }

  const animals: Animal[] = [];
  if (!Array.isArray(o.animals)) fail();
  for (const av of o.animals) {
    const a = rec(av);
    if (typeof a.id !== 'string' || a.id === '') fail();
    if (animals.some((x) => x.id === a.id)) fail();
    if (typeof a.species !== 'string' || !has(SPECIES, a.species)) fail();
    const sp = SPECIES[a.species as SpeciesId];
    if (typeof a.name !== 'string' || typeof a.color !== 'string') fail();
    const house = houses.find((h) => h.id === a.houseId);
    if (!house || house.kind !== sp.house) fail();
    if (typeof a.sick !== 'boolean' || typeof a.medicated !== 'boolean') fail();
    if (!Array.isArray(a.petTimes)) fail();
    if (a.lastBrushAt !== null) finite(a.lastBrushAt);
    animals.push({
      id: a.id, species: a.species as SpeciesId, name: a.name, color: a.color, houseId: house.id,
      satiety: clamp(finite(a.satiety), 0, 100),
      mood: clamp(finite(a.mood), 0, 100),
      sick: a.sick, medicated: a.medicated,
      neglectMs: Math.max(0, finite(a.neglectMs)),
      produceMs: Math.max(0, finite(a.produceMs)),
      poopMs: Math.max(0, finite(a.poopMs)),
      waiting: clamp(int(a.waiting), 0, sp.maxWaiting),
      petTimes: a.petTimes
        .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
        .slice(-PET_MAX_IN_WINDOW),
      lastBrushAt: a.lastBrushAt as number | null,
    });
  }

  const sIn = rec(o.supplies);
  const supplies = {} as Record<SupplyId, number>;
  for (const k of SUPPLY_IDS) {
    if (!has(sIn, k) && version < 4 && !V3_SUPPLY_IDS.includes(k)) { supplies[k] = 0; continue; }
    if (!has(sIn, k) && version < 5 && PET_SNACK_IDS.includes(k as never)) { supplies[k] = 0; continue; }
    if (!has(sIn, k)) fail();
    supplies[k] = clamp(int(sIn[k]), 0, SUPPLY_CAP);
  }
  const pIn = rec(o.products);
  const products = {} as Record<ProductId, number>;
  for (const k of PRODUCT_IDS) {
    if (!has(pIn, k) && version < 4 && !V3_PRODUCT_IDS.includes(k)) { products[k] = 0; continue; }
    if (!has(pIn, k)) fail();
    products[k] = clamp(int(pIn[k]), 0, PRODUCT_CAP);
  }

  // v5 added the dog and the cat; older saves have none.
  const pets: Pet[] = [];
  if (version >= 5 || o.pets !== undefined) {
    if (!Array.isArray(o.pets)) fail();
    for (const pv of o.pets) {
      const p = rec(pv);
      if (typeof p.id !== 'string' || p.id === '') fail();
      if (!PET_KINDS.includes(p.kind as PetKind)) fail();
      if (typeof p.name !== 'string' || typeof p.color !== 'string') fail();
      if (pets.some((x) => x.id === p.id) || animals.some((a) => a.id === p.id)) fail();
      if (pets.some((x) => x.kind === p.kind)) continue; // one of each: a duplicate is dropped, not fatal
      pets.push({ id: p.id, kind: p.kind as PetKind, name: p.name, color: petColor(p.kind as PetKind, p.color) });
    }
  }

  const settledAt = finite(o.settledAt);
  if (!isIntIn(o.nextId, 1, Number.MAX_SAFE_INTEGER)) fail();
  return { houses, animals, pets, decor: createDecor(), supplies, products, settledAt, nextId: o.nextId };
}

/** A pet's breed as the sheet names it now: an old coat name maps to the breed that looks like it. */
function petColor(kind: PetKind, color: string): string {
  const now = PETS[kind].colors;
  if (now.includes(color)) return color;
  const i = LEGACY_PET_COLORS[kind].indexOf(color);
  return now[i >= 0 ? i : 0];
}

/** The ranch part of a v3/v4 save, or null when it is too broken to read. */
function tryRanch(data: unknown, version: number): RanchState | null {
  try {
    return validateRanch(data, version);
  } catch (e) {
    if (e instanceof Invalid) return null;
    throw e;
  }
}

function validate(data: unknown): { state: GameState; ranchReset: boolean } {
  const o = rec(data);
  if (typeof o.version !== 'number' || Number.isNaN(o.version)) fail();
  if (o.version > 5) throw new Newer();
  if (o.version !== 1 && o.version !== 2 && o.version !== 3 && o.version !== 4 && o.version !== 5) fail();
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

  // A broken ranch must never cost the field progress: keep the rest and start the ranch over.
  const ranch = o.version >= 3 ? tryRanch(o.ranch, o.version) : createRanch(o.lastSeenAt);
  const ranchReset = ranch === null;

  const state: GameState = {
    version: 5,
    unlocked: o.unlocked,
    cleared,
    mastery,
    inventory,
    daily,
    settings: { speech: sIn.speech, sound: sIn.sound },
    lastSeenAt: o.lastSeenAt,
    ranch: ranch ?? createRanch(o.lastSeenAt),
  };
  return { state, ranchReset };
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function parseSave(raw: string): ParseResult {
  try {
    const { state, ranchReset } = validate(JSON.parse(raw));
    return ranchReset ? { ok: true, state, ranchReset: true } : { ok: true, state };
  } catch (e) {
    return { ok: false, error: e instanceof Newer ? 'newer-version' : 'invalid' };
  }
}

/** `ranchReset` as in ParseResult; the raw save was then copied to CORRUPT_KEY first. */
export type LoadResult =
  | { kind: 'ok'; state: GameState; ranchReset?: true }
  | { kind: 'empty' }
  | { kind: 'corrupt' }
  | { kind: 'newer' };

export function loadFrom(storage: Pick<Storage, 'getItem' | 'setItem'>): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { kind: 'empty' };
    const r = parseSave(raw);
    if (r.ok && !r.ranchReset) return { kind: 'ok', state: r.state };
    if (!r.ok && r.error === 'newer-version') return { kind: 'newer' }; // never touch storage
    // Keep the raw save so a broken ranch (or a broken save) can still be recovered by hand.
    try { storage.setItem(CORRUPT_KEY, raw); } catch { /* backup is best-effort */ }
    return r.ok ? { kind: 'ok', state: r.state, ranchReset: true } : { kind: 'corrupt' };
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
