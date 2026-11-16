import { describe, it, expect } from 'vitest';
import { createNewState } from '../../src/core/state';
import { createRanch } from '../../src/core/ranch';
import { buy, checkBuy, priceOf, nextName, type ShopState } from '../../src/core/shop';
import { SPECIES } from '../../src/core/species';

function st(): ShopState {
  return { ...createNewState(0), ranch: createRanch(0) };
}
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
    const s = rich(st());
    buy(s, 'feed', 0, () => 0);
    expect(s.ranch.supplies.feed).toBe(5);
    expect(s.inventory.wheat).toBe(885);
    s.ranch.supplies.feed = 95;
    expect(buy(s, 'feed', 0, () => 0)).toEqual({ ok: false, reason: 'full' });
    expect(s.inventory.wheat).toBe(885);
    expect(s.ranch.supplies.feed).toBe(95);
  });

  it('treat x3, medicine x1 priced in crops only', () => {
    const s = rich(st());
    expect(priceOf(s, 'medicine')).toEqual({ wheat: 10, carrot: 5 });
    buy(s, 'treat', 0, () => 0);
    buy(s, 'medicine', 0, () => 0);
    expect(s.ranch.supplies).toEqual({ feed: 0, treat: 3, medicine: 1 });
    expect(s.inventory.wheat).toBe(890);
    expect(s.inventory.carrot).toBe(885);
    expect(s.ranch.products.egg).toBe(900);
  });

  it('medicine is affordable with no eggs at all', () => {
    const s = st();
    s.inventory.wheat = 10; s.inventory.carrot = 5;
    expect(checkBuy(s, 'medicine')).toEqual({ ok: true });
  });

  it('two buys succeed only if affordable twice', () => {
    const s = st();
    s.inventory.wheat = 29;
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(false);
    expect(s.inventory.wheat).toBe(14);
    s.inventory.wheat = 30;
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(buy(s, 'feed', 0, () => 0).ok).toBe(true);
    expect(s.inventory.wheat).toBe(0);
  });
});
