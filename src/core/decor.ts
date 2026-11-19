import { CROP_BY_ROW, LEVEL_ORDER, type CropId } from './levels';
import { FARM_LOT, LOT_COUNT, SPECIES, SPECIES_ORDER, speciesOfLot, type Price } from './species';
import type { GameState } from './state';

/**
 * Ranch decorations (batch 3). Ordinary ones go in the fixed spots, two per page; the child
 * picks what stands where, may buy the same kind again (each one dearer) and swaps freely, and
 * nothing taken down is ever lost: it goes to storage. Specials are the big surprises; only two
 * of them stand on the map at a time.
 */

export type DecorId =
  | 'flowers' | 'sunflowers' | 'roses' | 'bluebells' | 'bush' | 'tree'
  | 'pond' | 'mushroom' | 'scarecrow' | 'pumpkins' | 'well' | 'pigeons';
export type SpecialId = 'xmasTree' | 'balloon' | 'rocket' | 'ufo' | 'dino';

export interface DecorDef {
  id: DecorId;
  name: string;
  emoji: string;
  /** Price of the first one; each one owned adds DECOR_GROWTH of it. */
  base: Price;
  /** Moves by itself (the pigeons). */
  moves: boolean;
}

const def = (id: DecorId, name: string, emoji: string, base: Price, moves = false): DecorDef => ({ id, name, emoji, base, moves });

export const DECOR: Record<DecorId, DecorDef> = {
  flowers: def('flowers', '彩色花圃', '🌷', { wheat: 60, carrot: 40 }),
  sunflowers: def('sunflowers', '向日葵花圃', '🌻', { wheat: 80, carrot: 60 }),
  roses: def('roses', '玫瑰花圃', '🌹', { wheat: 80, carrot: 80 }),
  bluebells: def('bluebells', '藍色花圃', '💐', { strawberry: 100, wheat: 80 }),
  bush: def('bush', '樹叢', '🌿', { carrot: 60, corn: 40 }),
  tree: def('tree', '小樹', '🌳', { wheat: 100, carrot: 80 }),
  pond: def('pond', '池塘', '🪷', { carrot: 100, corn: 60 }), // took the bench's place (old saves: LEGACY_DECOR)
  mushroom: def('mushroom', '大香菇', '🍄', { wheat: 150, corn: 60 }),
  scarecrow: def('scarecrow', '稻草人', '🧑‍🌾', { wheat: 120, carrot: 100 }),
  pumpkins: def('pumpkins', '南瓜堆', '🎃', { pumpkin: 120, potato: 60 }),
  well: def('well', '水井', '🪣', { potato: 120, tomato: 100 }),
  pigeons: def('pigeons', '鴿子聚集地', '🕊️', { tomato: 150, strawberry: 150, pumpkin: 100 }, true),
};
export const DECOR_ORDER = Object.keys(DECOR) as readonly DecorId[];

/** A tap plays these (the pigeons fly, a fish jumps from the pond, a rabbit hops out of the bush); a quick second tap opens 換成什麼？. */
const TRICKS: ReadonlySet<DecorId> = new Set(['pigeons', 'pond', 'bush']);
export function hasTrick(id: DecorId): boolean {
  return TRICKS.has(id);
}
/** Decorations that were replaced, by what stands in their place now. */
export const LEGACY_DECOR: Readonly<Record<string, DecorId>> = { bench: 'pond' };

/** Two spots in each pen: `<lot>-0` is three tiles wide, `<lot>-1` two. The garden has none. */
export type SpotId = `${number}-${0 | 1}`;
export const SPOTS_PER_LOT = 2;
export const SPOT_IDS: readonly SpotId[] = Array.from({ length: LOT_COUNT * SPOTS_PER_LOT },
  (_, i) => `${Math.floor(i / SPOTS_PER_LOT)}-${i % SPOTS_PER_LOT}` as SpotId).filter((s) => !s.startsWith(`${FARM_LOT}-`));

export function spotLot(s: SpotId): number {
  return Number(s.split('-')[0]);
}

/** How many tiles wide a spot is: 3 or 2 (one tile deep either way). */
export function spotSpan(s: SpotId): 2 | 3 {
  return s.endsWith('-0') ? 3 : 2;
}

export interface DecorState {
  placed: Partial<Record<SpotId, DecorId>>;
  stored: Partial<Record<DecorId, number>>;
  specials: SpecialId[];
  big: [SpecialId | null, SpecialId | null];
}

export function createDecor(): DecorState {
  return { placed: {}, stored: {}, specials: [], big: [null, null] };
}

export const DECOR_GROWTH = 0.5;
export const DECOR_CROP_MAX = 900;

/** Placed plus stored. */
export function ownedCount(d: DecorState, id: DecorId): number {
  return Object.values(d.placed).filter((x) => x === id).length + (d.stored[id] ?? 0);
}

export function decorPrice(state: GameState, id: DecorId): Price {
  const n = ownedCount(state.ranch.decor, id);
  const out: Price = {};
  for (const [k, v] of Object.entries(DECOR[id].base) as [CropId, number][]) {
    out[k] = Math.min(DECOR_CROP_MAX, Math.round((v * (1 + DECOR_GROWTH * n)) / 10) * 10);
  }
  return out;
}

/** A pen's spots open once its house stands. */
export function spotOpen(state: GameState, spot: SpotId): boolean {
  const sp = speciesOfLot(spotLot(spot));
  return sp !== null && state.ranch.houses.some((h) => h.kind === SPECIES[sp].house);
}

/** The first crop of `price` whose level is not unlocked yet, or null. */
export function lockedCrop(state: GameState, price: Price): { row: number; crop: CropId } | null {
  const open = LEVEL_ORDER.slice(0, state.unlocked);
  for (const key of Object.keys(price)) {
    const row = LEVEL_ORDER.find((r) => CROP_BY_ROW[r].id === key);
    if (row !== undefined && !open.includes(row)) return { row, crop: key as CropId };
  }
  return null;
}

function canPay(state: GameState, price: Price): boolean {
  return (Object.entries(price) as [CropId, number][]).every(([k, n]) => state.inventory[k] >= n);
}

function pay(state: GameState, price: Price): void {
  for (const [k, n] of Object.entries(price) as [CropId, number][]) state.inventory[k] -= n;
}

export type DecorCheck = { ok: true; free: boolean } | { ok: false; reason: 'short' | 'locked' | 'closed' };

export function checkDecor(state: GameState, spot: SpotId, id: DecorId): DecorCheck {
  if (!spotOpen(state, spot)) return { ok: false, reason: 'closed' };
  const d = state.ranch.decor;
  if (d.placed[spot] === id || (d.stored[id] ?? 0) > 0) return { ok: true, free: true };
  const price = decorPrice(state, id);
  if (lockedCrop(state, price)) return { ok: false, reason: 'locked' };
  return canPay(state, price) ? { ok: true, free: false } : { ok: false, reason: 'short' };
}

/** Puts `id` on `spot`, from storage if one is there, else bought; whatever stood there is stored. */
export function placeDecor(state: GameState, spot: SpotId, id: DecorId): DecorCheck {
  const check = checkDecor(state, spot, id);
  const d = state.ranch.decor;
  if (!check.ok || d.placed[spot] === id) return check;
  if (check.free) d.stored[id] = (d.stored[id] ?? 1) - 1;
  else pay(state, decorPrice(state, id));
  if (d.stored[id] === 0) delete d.stored[id];
  storeDecor(state, spot);
  d.placed[spot] = id;
  return check;
}

/** Takes the decoration on `spot` down into storage; false when the spot is empty. */
export function storeDecor(state: GameState, spot: SpotId): boolean {
  const d = state.ranch.decor;
  const old = d.placed[spot];
  if (!old) return false;
  d.stored[old] = (d.stored[old] ?? 0) + 1;
  delete d.placed[spot];
  return true;
}

// ---------------------------------------------------------------- specials

export interface SpecialDef { id: SpecialId; name: string; emoji: string; price: Price }

/**
 * Prices: the design's table × 0.55. Simulated from a full ranch, three challenge rounds a day
 * while also buying ordinary decorations, all five take a median 14 days (p90 17).
 */
export const SPECIALS: Record<SpecialId, SpecialDef> = {
  xmasTree: { id: 'xmasTree', name: '閃閃發光的聖誕樹', emoji: '🎄', price: { wheat: 220, carrot: 170, strawberry: 110 } },
  balloon: { id: 'balloon', name: '熱氣球', emoji: '🎈', price: { wheat: 280, tomato: 220, pumpkin: 170 } },
  rocket: { id: 'rocket', name: '火箭', emoji: '🚀', price: { carrot: 280, strawberry: 220, pumpkin: 220 } },
  ufo: { id: 'ufo', name: '飛碟', emoji: '🛸', price: { wheat: 330, carrot: 280, tomato: 220, strawberry: 170 } },
  dino: { id: 'dino', name: '恐龍', emoji: '🦖', price: { tomato: 220, strawberry: 170, pumpkin: 110 } },
};
export const SPECIAL_ORDER: readonly SpecialId[] = ['xmasTree', 'balloon', 'rocket', 'ufo', 'dino'];
export const BIG_SLOTS = 2;

/** The goal once the ranch is full: every house stands. */
export function specialsOpen(state: GameState): boolean {
  return SPECIES_ORDER.every((sp) => state.ranch.houses.some((h) => h.kind === SPECIES[sp].house));
}

export type SpecialCheck = { ok: true } | { ok: false; reason: 'locked' | 'owned' | 'short' };

export function checkSpecial(state: GameState, id: SpecialId): SpecialCheck {
  if (!specialsOpen(state)) return { ok: false, reason: 'locked' };
  if (state.ranch.decor.specials.includes(id)) return { ok: false, reason: 'owned' };
  return canPay(state, SPECIALS[id].price) ? { ok: true } : { ok: false, reason: 'short' };
}

/** Pays and keeps it in storage; showSpecial puts it on the map. */
export function buySpecial(state: GameState, id: SpecialId): SpecialCheck {
  const check = checkSpecial(state, id);
  if (!check.ok) return check;
  pay(state, SPECIALS[id].price);
  state.ranch.decor.specials.push(id);
  return check;
}

export function specialSlot(d: DecorState, id: SpecialId): 0 | 1 | null {
  const i = d.big.indexOf(id);
  return i === 0 || i === 1 ? i : null;
}

export type ShowResult =
  | { ok: true; slot: 0 | 1; replaced: SpecialId | null }
  | { ok: false; reason: 'not-owned' | 'shown' | 'full' };

/** Shows a bought special: in the first free slot, or in `slot`, storing the one there. */
export function showSpecial(state: GameState, id: SpecialId, slot?: 0 | 1): ShowResult {
  const d = state.ranch.decor;
  if (!d.specials.includes(id)) return { ok: false, reason: 'not-owned' };
  if (specialSlot(d, id) !== null) return { ok: false, reason: 'shown' };
  const at = slot ?? (d.big[0] === null ? 0 : d.big[1] === null ? 1 : null);
  if (at === null) return { ok: false, reason: 'full' };
  const replaced = d.big[at];
  d.big[at] = id;
  return { ok: true, slot: at, replaced };
}
