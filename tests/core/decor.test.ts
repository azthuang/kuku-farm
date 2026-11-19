import { describe, it, expect } from 'vitest';
import { createNewState, type GameState } from '../../src/core/state';
import { createRanch } from '../../src/core/ranch';
import {
  DECOR, DECOR_ORDER, hasTrick, SPECIALS, spotSpan, SPOT_IDS, buySpecial, checkDecor, checkSpecial, decorPrice, lockedCrop, placeDecor,
  showSpecial, specialSlot, spotLot, spotOpen, storeDecor,
} from '../../src/core/decor';
import { SPECIES, SPECIES_ORDER } from '../../src/core/species';

/** A state with the coop built (its page's two spots are open). */
function st(unlocked: number): GameState {
  const s = { ...createNewState(0), unlocked, ranch: createRanch(0) };
  s.ranch.houses.push({ id: 'h0', kind: 'coop', lot: 1, poop: 0 });
  return s;
}
function rich(s: GameState): GameState {
  for (const k of Object.keys(s.inventory) as (keyof GameState['inventory'])[]) s.inventory[k] = 900;
  return s;
}

function allHouses(s: GameState): GameState {
  for (const sp of SPECIES_ORDER) s.ranch.houses.push({ id: `h-${sp}`, kind: SPECIES[sp].house, lot: SPECIES[sp].lot, poop: 0 });
  return s;
}

describe('decorations', () => {
  it('10 spots, 2 per pen (one 1×3, one 1×2); the garden page has none', () => {
    expect(SPOT_IDS).toHaveLength(10);
    expect(SPOT_IDS.some((s) => spotLot(s) === 0)).toBe(false);
    expect(SPOT_IDS.filter((s) => spotLot(s) === 2)).toEqual(['2-0', '2-1']);
    expect(spotSpan('3-0')).toBe(3);
    expect(spotSpan('3-1')).toBe(2);
  });

  it('the twelve decorations: flower beds and a big mushroom instead of the mailbox, haystack and beehive', () => {
    expect([...DECOR_ORDER]).toEqual([
      'flowers', 'sunflowers', 'roses', 'bluebells', 'bush', 'tree', 'pond', 'mushroom', 'scarecrow', 'pumpkins', 'well', 'pigeons',
    ]);
    // the pond took the bench's place, name and all, at the bench's price
    expect(DECOR.pond.name).toBe('池塘');
    expect(decorPrice(st(9), 'pond')).toEqual({ carrot: 100, corn: 60 });
    expect(decorPrice(st(9), 'roses')).toEqual({ wheat: 80, carrot: 80 });
    expect(decorPrice(st(9), 'bluebells')).toEqual({ strawberry: 100, wheat: 80 });
    expect(decorPrice(st(9), 'mushroom')).toEqual({ wheat: 150, corn: 60 });
  });

  it('prices from the spec table', () => {
    const s = st(9);
    expect(decorPrice(s, 'flowers')).toEqual({ wheat: 60, carrot: 40 });
    expect(decorPrice(s, 'pigeons')).toEqual({ tomato: 150, strawberry: 150, pumpkin: 100 });
  });

  it('each one owned adds half the first price, rounded to 10, capped at 900', () => {
    const s = st(9);
    s.ranch.decor.stored.flowers = 1;
    expect(decorPrice(s, 'flowers')).toEqual({ wheat: 90, carrot: 60 });
    s.ranch.decor.placed['1-0'] = 'flowers'; // placed ones count too
    expect(decorPrice(s, 'flowers')).toEqual({ wheat: 120, carrot: 80 });
    s.ranch.decor.stored.pigeons = 40;
    expect(decorPrice(s, 'pigeons')).toEqual({ tomato: 900, strawberry: 900, pumpkin: 900 });
  });

  it('a pen spots open once its house stands', () => {
    const s = st(9);
    expect(spotOpen(s, '1-1')).toBe(true);
    expect(spotOpen(s, '2-0')).toBe(false);
    s.ranch.houses.push({ id: 'h1', kind: 'barn', lot: 2, poop: 0 });
    expect(spotOpen(s, '2-0')).toBe(true);
    expect(checkDecor(st(9), '3-0', 'flowers')).toEqual({ ok: false, reason: 'closed' });
  });

  it('a decoration with a locked crop is locked', () => {
    const s = rich(st(2)); // only 1× and 2× open: the well's 🥔 (4×) is the first locked crop
    expect(checkDecor(s, '1-0', 'well')).toEqual({ ok: false, reason: 'locked' });
    expect(lockedCrop(s, DECOR.well.base)).toEqual({ row: 4, crop: 'potato' });
    expect(lockedCrop(s, DECOR.flowers.base)).toBeNull();
  });

  it('buying pays; short does not', () => {
    const s = st(9);
    s.inventory.wheat = 59; s.inventory.carrot = 40;
    expect(placeDecor(s, '1-0', 'flowers')).toEqual({ ok: false, reason: 'short' });
    expect(s.ranch.decor.placed['1-0']).toBeUndefined();
    s.inventory.wheat = 60;
    expect(placeDecor(s, '1-0', 'flowers')).toEqual({ ok: true, free: false });
    expect(s.inventory).toMatchObject({ wheat: 0, carrot: 0 });
    expect(s.ranch.decor.placed['1-0']).toBe('flowers');
  });

  it('placing over a decoration stores the old one', () => {
    const s = rich(st(9));
    placeDecor(s, '1-0', 'flowers');
    placeDecor(s, '1-0', 'bush');
    expect(s.ranch.decor.placed['1-0']).toBe('bush');
    expect(s.ranch.decor.stored.flowers).toBe(1);
    const wheat = s.inventory.wheat;
    expect(placeDecor(s, '1-1', 'flowers')).toEqual({ ok: true, free: true }); // from storage, no crops
    expect(s.inventory.wheat).toBe(wheat);
    expect(s.ranch.decor.stored.flowers ?? 0).toBe(0);
    expect(storeDecor(s, '1-1')).toBe(true);
    expect(s.ranch.decor.placed['1-1']).toBeUndefined();
    expect(s.ranch.decor.stored.flowers).toBe(1);
    expect(storeDecor(s, '5-0')).toBe(false);
  });

  it('a stored decoration goes out even while its crop is locked or short', () => {
    const s = st(1);
    s.ranch.decor.stored.well = 1;
    expect(checkDecor(s, '1-0', 'well')).toEqual({ ok: true, free: true });
  });

  it('a closed spot takes nothing, not even from storage', () => {
    const s = st(9);
    s.ranch.decor.stored.well = 1;
    expect(placeDecor(s, '4-0', 'well')).toEqual({ ok: false, reason: 'closed' });
    expect(s.ranch.decor.stored.well).toBe(1);
  });

  it('putting the same decoration back on its spot changes nothing', () => {
    const s = rich(st(9));
    placeDecor(s, '1-0', 'flowers');
    const before = JSON.stringify(s);
    expect(placeDecor(s, '1-0', 'flowers')).toEqual({ ok: true, free: true });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('specials', () => {
  it('specials open once all five houses stand', () => {
    const s = rich(st(9));
    expect(checkSpecial(s, 'rocket')).toEqual({ ok: false, reason: 'locked' });
    allHouses(s);
    expect(checkSpecial(s, 'rocket')).toEqual({ ok: true });
  });

  it('prices from the spec table', () => {
    // the spec's table × 0.55 (rounded to tens): the simulation's 1–2 weeks to all five (median 14 days)
    expect(SPECIALS.xmasTree.price).toEqual({ wheat: 220, carrot: 170, strawberry: 110 });
    expect(SPECIALS.dino.price).toEqual({ tomato: 220, strawberry: 170, pumpkin: 110 });
    expect(SPECIALS.balloon.price).toEqual({ wheat: 280, tomato: 220, pumpkin: 170 });
    expect(SPECIALS.rocket.price).toEqual({ carrot: 280, strawberry: 220, pumpkin: 220 });
    expect(SPECIALS.ufo.price).toEqual({ wheat: 330, carrot: 280, tomato: 220, strawberry: 170 });
  });

  it('buying does not show it; a full pair needs a slot', () => {
    const s = allHouses(rich(st(9)));
    for (const id of ['xmasTree', 'rocket', 'ufo'] as const) {
      rich(s); // three specials together cost more 🥕 than one stack holds
      expect(buySpecial(s, id)).toEqual({ ok: true });
    }
    expect(s.ranch.decor.big).toEqual([null, null]);
    expect(showSpecial(s, 'xmasTree')).toEqual({ ok: true, slot: 0, replaced: null });
    expect(showSpecial(s, 'rocket')).toEqual({ ok: true, slot: 1, replaced: null });
    expect(showSpecial(s, 'ufo')).toEqual({ ok: false, reason: 'full' });
    expect(showSpecial(s, 'ufo', 0)).toEqual({ ok: true, slot: 0, replaced: 'xmasTree' });
    expect(s.ranch.decor.big).toEqual(['ufo', 'rocket']);
    expect(specialSlot(s.ranch.decor, 'rocket')).toBe(1);
    expect(specialSlot(s.ranch.decor, 'xmasTree')).toBeNull();
    expect(s.ranch.decor.specials).toContain('xmasTree'); // still ours, just stored
    expect(showSpecial(s, 'rocket')).toEqual({ ok: false, reason: 'shown' });
    expect(showSpecial(s, 'dino')).toEqual({ ok: false, reason: 'not-owned' });
    expect(checkSpecial(s, 'ufo')).toEqual({ ok: false, reason: 'owned' });
  });

  it('buying pays; short does not charge', () => {
    const s = allHouses(st(9));
    expect(buySpecial(s, 'rocket')).toEqual({ ok: false, reason: 'short' });
    expect(s.ranch.decor.specials).toEqual([]);
    rich(s);
    buySpecial(s, 'rocket');
    expect(s.inventory).toMatchObject({ carrot: 620, strawberry: 680, pumpkin: 680 });
  });
});

describe('hasTrick', () => {
  it('the pigeons fly, the fish jumps from the pond, the rabbit hops out of the bush; the rest only open 換成什麼？', () => {
    expect(DECOR_ORDER.filter(hasTrick)).toEqual(['bush', 'pond', 'pigeons']);
  });
});
