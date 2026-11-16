import { describe, it, expect } from 'vitest';
import { createNewState } from '../../src/core/state';
import { createRanch } from '../../src/core/ranch';
import { buy, checkBuy, priceOf, nextName, isLocked, lockHint, MAX_ANIMALS, type ShopState, type ShopItemId } from '../../src/core/shop';
import { SPECIES, SPECIES_ORDER } from '../../src/core/species';

function st(): ShopState {
  return { ...createNewState(0), unlocked: 9, ranch: createRanch(0) };
}
const coop = (s: ShopState) => { s.ranch.houses.push({ id: 'h0', kind: 'coop', lot: 0, poop: 0 }); return s; };
const rich = (s: ShopState) => {
  s.inventory.wheat = 900; s.inventory.carrot = 900; s.inventory.corn = 900; s.ranch.products.egg = 900;
  return s;
};

describe('shop', () => {
  it('short does not charge; exact amount succeeds and zeroes', () => {
    const s = st();
    s.inventory.wheat = 150; s.inventory.carrot = 99;
    expect(buy(s, 'coop', 0, () => 0)).toEqual({ ok: false, reason: 'short' });
    expect(s.inventory.wheat).toBe(150);
    s.inventory.carrot = 100;
    expect(buy(s, 'coop', 0, () => 0).ok).toBe(true);
    expect(s.inventory.wheat).toBe(0);
    expect(s.inventory.carrot).toBe(0);
    expect(s.ranch.houses).toHaveLength(1);
  });

  it('house and capacity rules, pricing', () => {
    const s = rich(st());
    expect(checkBuy(s, 'chicken')).toEqual({ ok: false, reason: 'need-house' });
    buy(s, 'coop', 0, () => 0);
    expect(checkBuy(s, 'coop')).toEqual({ ok: false, reason: 'full' });
    buy(s, 'chicken', 0, () => 0.5);
    buy(s, 'chicken', 0, () => 0.5);
    expect(priceOf(s, 'chicken')).toEqual({ corn: 20, egg: 5 });
    const eggs = s.ranch.products.egg;
    buy(s, 'chicken', 0, () => 0.5);
    expect(s.inventory.corn).toBe(880);
    expect(s.ranch.products.egg).toBe(eggs - 5);
    buy(s, 'chicken', 0, () => 0.5);
    expect(checkBuy(s, 'chicken')).toEqual({ ok: false, reason: 'full' });
    expect(s.ranch.animals).toHaveLength(4);
  });

  it('names unique, from list; colors from list; nextName skips used', () => {
    const s = rich(st());
    buy(s, 'coop', 0, () => 0);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(buy(s, 'chicken', 0, () => 0).animalId!);
    const names = s.ranch.animals.map((a) => a.name);
    expect(new Set(names).size).toBe(4);
    names.forEach((n) => expect(SPECIES.chicken.names).toContain(n));
    expect(s.ranch.animals.map((a) => a.color).every((c) => SPECIES.chicken.colors.includes(c))).toBe(true);
    const a = s.ranch.animals[0];
    const before = a.name;
    nextName(s.ranch, a.id);
    expect(a.name).not.toBe(before);
    expect(new Set(s.ranch.animals.map((x) => x.name)).size).toBe(4);
  });

  it('colors map from rng', () => {
    const s = rich(st());
    buy(s, 'coop', 0, () => 0);
    buy(s, 'chicken', 0, () => 0.99);
    expect(s.ranch.animals[0].color).toBe('黑');
  });

  it('supplies: +5 feed, cap 99', () => {
    const s = coop(rich(st()));
    buy(s, 'feed', 0, () => 0);
    expect(s.ranch.supplies.feed).toBe(5);
    expect(s.inventory.wheat).toBe(870);
    expect(s.inventory.carrot).toBe(890);
    s.ranch.supplies.feed = 95;
    expect(buy(s, 'feed', 0, () => 0)).toEqual({ ok: false, reason: 'full' });
    expect(s.inventory.wheat).toBe(870);
    expect(s.ranch.supplies.feed).toBe(95);
  });

  it('treat x3, medicine x1 priced in crops only', () => {
    const s = coop(rich(st()));
    expect(priceOf(s, 'medicine')).toEqual({ wheat: 40, carrot: 20 });
    expect(priceOf(s, 'feed')).toEqual({ wheat: 30, carrot: 10 });
    expect(priceOf(s, 'treat')).toEqual({ carrot: 20 });
    buy(s, 'treat', 0, () => 0);
    buy(s, 'medicine', 0, () => 0);
    expect(s.ranch.supplies).toMatchObject({ feed: 0, treat: 3, medicine: 1 });
    expect(s.inventory.wheat).toBe(860);
    expect(s.inventory.carrot).toBe(860);
    expect(s.ranch.products.egg).toBe(900);
  });

  it('medicine is affordable with no eggs at all', () => {
    const s = st();
    s.inventory.wheat = 40; s.inventory.carrot = 20;
    expect(checkBuy(s, 'medicine')).toEqual({ ok: true });
  });

  it('two buys succeed only if affordable twice', () => {
    const s = coop(st());
    s.inventory.wheat = 59; s.inventory.carrot = 20;
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(false);
    expect(s.inventory.wheat).toBe(29);
    s.inventory.wheat = 60; s.inventory.carrot = 20;
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(s.inventory.wheat).toBe(0);
    expect(s.inventory.carrot).toBe(0);
  });

  it('every species matches the spec table', () => {
    const d = SPECIES;
    expect(SPECIES_ORDER).toEqual(['chicken', 'cow', 'pig', 'sheep', 'llama']);
    expect(SPECIES_ORDER.map((s) => [d[s].house, d[s].lot, d[s].houseCapacity, d[s].product, d[s].feed])).toEqual([
      ['coop', 0, 4, 'egg', 'feed'], ['barn', 1, 2, 'milk', 'feedCow'], ['sty', 2, 2, 'truffle', 'feedPig'],
      ['fold', 3, 2, 'yarn', 'feedSheep'], ['hut', 4, 2, 'fluff', 'feedLlama'],
    ]);
    expect(SPECIES_ORDER.map((s) => d[s].housePrice)).toEqual([
      { wheat: 150, carrot: 100 }, { potato: 120, corn: 80 }, { tomato: 120, potato: 80 },
      { strawberry: 120, tomato: 80 }, { grape: 120, pumpkin: 80 },
    ]);
    expect(SPECIES_ORDER.map((s) => d[s].feedPrice)).toEqual([
      { wheat: 30, carrot: 10 }, { corn: 30, potato: 10 }, { potato: 30, tomato: 10 },
      { tomato: 30, strawberry: 10 }, { pumpkin: 30, grape: 10 },
    ]);
    expect(d.chicken.animalPrice(0)).toEqual({ wheat: 80, carrot: 50 });
    expect(d.chicken.animalPrice(1)).toEqual({ wheat: 80, carrot: 50 });
    expect(d.chicken.animalPrice(2)).toEqual({ corn: 20, egg: 5 });
    expect(d.cow.animalPrice(0)).toEqual({ potato: 60, egg: 10 });
    expect(d.pig.animalPrice(1)).toEqual({ tomato: 60, milk: 5 });
    expect(d.sheep.animalPrice(1)).toEqual({ strawberry: 60, truffle: 5 });
    expect(d.llama.animalPrice(1)).toEqual({ watermelon: 60, yarn: 5 });
    expect(SPECIES_ORDER.map((s) => [d[s].produceEveryMs / 3.6e6, d[s].produceHappyEveryMs / 3.6e6])).toEqual([
      [2, 1.5], [3, 2.25], [4, 3], [4, 3], [6, 4.5],
    ]);
    expect(SPECIES_ORDER.map((s) => d[s].colors)).toEqual([
      ['白', '棕', '黑'], ['黑白花', '棕白花', '奶油色淡花'], ['粉紅', '棕', '黑'], ['白', '灰', '黑'], ['白', '淺棕', '深棕'],
    ]);
    expect(d.cow.names).toEqual(['哞哞', '花花', '奶茶', '大福', '乳酪', '雲朵']);
    expect(d.pig.names).toEqual(['嚕嚕', '粉粉', '肉圓', '波波', '團子', '小胖']);
    expect(d.sheep.names).toEqual(['咩咩', '棉花', '雪球', '捲捲', '白白', '絨絨']);
    expect(d.llama.names).toEqual(['駝駝', '草泥', '阿毛', '軟軟', '長長', '可可']);
    expect(d.cow.lockCrop.sort()).toEqual(['corn', 'potato']);
  });

  it('animals and feed need their own house', () => {
    const s = coop(rich(st()));
    expect(checkBuy(s, 'cow')).toEqual({ ok: false, reason: 'need-house' });
    expect(checkBuy(s, 'feedCow')).toEqual({ ok: false, reason: 'need-house' });
    expect(checkBuy(s, 'feedPig')).toEqual({ ok: false, reason: 'need-house' });
    expect(checkBuy(s, 'feed')).toEqual({ ok: true });
  });

  it('house is locked until every crop level is unlocked; lockHint names the crop', () => {
    const s = rich(st());
    s.inventory.potato = 500;
    s.unlocked = 3; // rows 1,2,5: no potato (row 4)
    expect(isLocked(s, 'barn')).toBe(true);
    expect(lockHint(s, 'barn')).toEqual({ row: 4, crop: 'potato', unlocked: false });
    expect(checkBuy(s, 'barn')).toEqual({ ok: false, reason: 'locked' });
    expect(buy(s, 'barn', 0, () => 0)).toEqual({ ok: false, reason: 'locked' });
    expect(s.inventory.potato).toBe(500);
    s.unlocked = 4;
    expect(isLocked(s, 'barn')).toBe(false);
    expect(lockHint(s, 'barn')).toBeNull();
    expect(checkBuy(s, 'barn')).toEqual({ ok: true });
    expect(isLocked(s, 'coop')).toBe(false);
  });

  it('buying a house uses the fixed lot and releases the species', () => {
    const s = rich(st());
    s.inventory.potato = 500;
    buy(s, 'barn', 0, () => 0);
    expect(s.ranch.houses[0]).toMatchObject({ kind: 'barn', lot: 1 });
    expect(checkBuy(s, 'barn')).toEqual({ ok: false, reason: 'full' });
    const r = buy(s, 'cow', 0, () => 0);
    expect(r.ok).toBe(true);
    expect(s.ranch.animals[0]).toMatchObject({ species: 'cow', houseId: s.ranch.houses[0].id });
    expect(s.ranch.products.egg).toBe(890);
    expect(buy(s, 'feedCow', 0, () => 0).ok).toBe(true);
    expect(s.ranch.supplies.feedCow).toBe(5);
    expect(s.ranch.supplies.feed).toBe(0);
  });

  it('chicken price depends only on the chicken count', () => {
    const s = rich(st());
    s.inventory.potato = 500;
    buy(s, 'barn', 0, () => 0);
    buy(s, 'cow', 0, () => 0);
    buy(s, 'cow', 0, () => 0);
    buy(s, 'coop', 0, () => 0);
    expect(priceOf(s, 'chicken')).toEqual({ wheat: 80, carrot: 50 });
  });

  it('whole ranch capped at 12 animals', () => {
    const s = rich(st());
    for (const k of ['potato', 'tomato', 'strawberry', 'grape', 'pumpkin', 'watermelon'] as const) s.inventory[k] = 900;
    for (const sp of SPECIES_ORDER) buy(s, SPECIES[sp].house, 0, () => 0);
    for (const sp of SPECIES_ORDER) s.ranch.products[SPECIES[sp].product] = 900;
    let n = 0;
    for (let i = 0; i < 4; i++) for (const sp of SPECIES_ORDER) {
      if (n < MAX_ANIMALS && buy(s, sp, 0, () => 0).ok) n++;
    }
    expect(s.ranch.animals.length).toBe(12);
    for (const sp of SPECIES_ORDER) expect(checkBuy(s, sp as ShopItemId)).toEqual({ ok: false, reason: 'full' });
  });

  it('names unique per species and from its list', () => {
    const s = rich(st());
    s.inventory.potato = 500;
    buy(s, 'barn', 0, () => 0);
    buy(s, 'cow', 0, () => 0);
    buy(s, 'cow', 0, () => 0);
    const [a, b] = s.ranch.animals;
    expect(a.name).not.toBe(b.name);
    expect(SPECIES.cow.names).toContain(a.name);
    expect(SPECIES.cow.colors).toContain(a.color);
  });

  it('every product appears in some price (fluff is batch 3)', () => {
    const prices = SPECIES_ORDER.flatMap((s) => [SPECIES[s].housePrice, SPECIES[s].feedPrice,
      SPECIES[s].animalPrice(0), SPECIES[s].animalPrice(5)]);
    for (const p of ['egg', 'milk', 'truffle', 'yarn'] as const) {
      expect(prices.some((x) => x[p] !== undefined)).toBe(true);
    }
    // fluff (llama product) is only spent in batch 3.
  });
});
