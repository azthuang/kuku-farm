import { describe, it, expect } from 'vitest';
import {
  FEED_FULL_AT, HUNGRY_SHOW_AT, createRanch, settle, feed, pet, brush, giveTreat, giveMedicine, cleanPoop, collect,
  giveSnack, pageStatus, type RanchState, type Animal,
} from '../../src/core/ranch';

const H = 3_600_000;
const T0 = 1_000_000;

function mk(over: Partial<Animal> = {}): RanchState {
  const r = createRanch(T0);
  r.houses.push({ id: 'h1', kind: 'coop', lot: 1, poop: 0 });
  r.animals.push({
    id: 'a1', species: 'chicken', name: '咕咕', color: '白', houseId: 'h1',
    satiety: 100, mood: 60, sick: false, medicated: false, neglectMs: 0,
    produceMs: 0, poopMs: 0, waiting: 0, petTimes: [], lastBrushAt: null, ...over,
  });
  return r;
}

describe('settle', () => {
  it('hunger, mood and poop over time', () => {
    const r = mk();
    settle(r, T0 + 12.5 * H);
    expect(r.animals[0].satiety).toBe(0);
    expect(r.animals[0].mood).toBeLessThan(60);
    const r2 = mk();
    settle(r2, T0 + 24 * H);
    expect(r2.animals[0].sick).toBe(false);
    expect(r2.houses[0].poop).toBe(6);
  });

  it('gets sick only after 48h of neglect (60.5h in)', () => {
    const r = mk();
    settle(r, T0 + 24 * H);
    expect(r.animals[0].sick).toBe(false); // a day away: hungry and dirty, never sick
    settle(r, T0 + 60 * H);
    expect(r.animals[0].sick).toBe(false);
    settle(r, T0 + 61 * H);
    expect(r.animals[0].sick).toBe(true);
  });

  it('feeding resets neglect', () => {
    const r = mk();
    r.supplies.feed = 5;
    settle(r, T0 + 12.5 * H + 47 * H);
    expect(r.animals[0].sick).toBe(false);
    expect(feed(r, 'a1', T0 + 59.5 * H).ok).toBe(true);
    expect(r.animals[0].neglectMs).toBe(0);
    settle(r, T0 + 59.5 * H + 6.25 * H + 47 * H);
    expect(r.animals[0].sick).toBe(false);
  });

  it('one feed from empty (to 50) on a dirty coop is not sick 48h later', () => {
    const r = mk({ satiety: 0 });
    r.houses[0].poop = 3;
    r.supplies.feed = 1;
    expect(feed(r, 'a1', T0).ok).toBe(true);
    expect(r.animals[0].satiety).toBe(50);
    settle(r, T0 + 48 * H);
    expect(r.houses[0].poop).toBeGreaterThanOrEqual(3);
    expect(r.animals[0].sick).toBe(false);
  });

  it('healing never lowers satiety or mood', () => {
    const r = mk({ sick: true, satiety: 80, mood: 90 });
    r.supplies.medicine = 1;
    expect(giveMedicine(r, 'a1', T0).ok).toBe(true);
    expect(pet(r, 'a1', T0)).toEqual({ ok: true, healed: true });
    expect(r.animals[0]).toMatchObject({ sick: false, satiety: 80, mood: 90 });
  });

  it('sick animals do not produce or poop; medicine then pet heals', () => {
    const r = mk({ sick: true, satiety: 0 });
    settle(r, T0 + 10 * H);
    expect(r.animals[0].waiting).toBe(0);
    expect(r.houses[0].poop).toBe(0);
    r.supplies.medicine = 1;
    expect(pet(r, 'a1', T0 + 10 * H)).toEqual({ ok: true });
    expect(r.animals[0].sick).toBe(true);
    expect(giveMedicine(r, 'a1', T0 + 10 * H).ok).toBe(true);
    expect(pet(r, 'a1', T0 + 10 * H + 1000)).toEqual({ ok: true, healed: true });
    expect(r.animals[0]).toMatchObject({ sick: false, satiety: 30, mood: 50 });
  });

  it('produces every 2h (mood < 70) or 1.5h (mood >= 70), max 3 waiting', () => {
    const a = mk({ mood: 60 });
    settle(a, T0 + 2 * H);
    expect(a.animals[0].waiting).toBe(1);
    const b = mk({ mood: 100 });
    b.animals[0].satiety = 100;
    settle(b, T0 + 1.5 * H);
    expect(b.animals[0].waiting).toBe(1);
    const c = mk({ mood: 60 });
    settle(c, T0 + 11 * H);
    expect(c.animals[0].waiting).toBe(3);
    expect(collect(c, 'a1')).toBe(3);
    expect(c.products.egg).toBe(3);
    expect(c.animals[0].waiting).toBe(0);
  });

  it('collect caps products at 999', () => {
    const r = mk({ waiting: 3 });
    r.products.egg = 998;
    expect(collect(r, 'a1')).toBe(1);
    expect(r.products.egg).toBe(999);
    expect(r.animals[0].waiting).toBe(2);
  });

  it('clock rollback changes nothing', () => {
    const r = mk();
    settle(r, T0 + H);
    const snap = JSON.stringify(r);
    settle(r, T0);
    expect(JSON.stringify(r)).toBe(snap);
    expect(r.settledAt).toBe(T0 + H);
    settle(r, T0 + 2 * H);
    const ref = mk();
    settle(ref, T0 + 2 * H);
    expect(r.animals[0].satiety).toBeCloseTo(ref.animals[0].satiety, 6);
  });

  it('40 days is fast and equals 30 days', () => {
    const a = mk();
    const b = mk();
    const t = Date.now();
    settle(a, T0 + 40 * 24 * H);
    expect(Date.now() - t).toBeLessThan(1000);
    settle(b, T0 + 30 * 24 * H);
    expect(a.animals[0].sick).toBe(b.animals[0].sick);
    expect(a.houses[0].poop).toBe(b.houses[0].poop);
    expect(a.settledAt).toBe(T0 + 40 * 24 * H);
  });
});

describe('actions', () => {
  it('pet cooldown: 4th within 10 minutes', () => {
    const r = mk();
    for (let i = 0; i < 3; i++) expect(pet(r, 'a1', T0 + i * 1000).ok).toBe(true);
    const mood = r.animals[0].mood;
    expect(pet(r, 'a1', T0 + 4000)).toEqual({ ok: false, reason: 'cooldown' });
    expect(r.animals[0].mood).toBeCloseTo(mood, 3);
    expect(pet(r, 'a1', T0 + 11 * 60_000).ok).toBe(true);
  });

  it('brush once per hour', () => {
    const r = mk();
    expect(brush(r, 'a1', T0).ok).toBe(true);
    expect(brush(r, 'a1', T0 + 30 * 60_000)).toEqual({ ok: false, reason: 'cooldown' });
    expect(brush(r, 'a1', T0 + H).ok).toBe(true);
  });

  it('feed: full and none-left', () => {
    const r = mk();
    r.supplies.feed = 2;
    expect(feed(r, 'a1', T0)).toEqual({ ok: false, reason: 'full' });
    expect(r.supplies.feed).toBe(2);
    const r2 = mk({ satiety: 20 });
    expect(feed(r2, 'a1', T0)).toEqual({ ok: false, reason: 'none-left' });
    r2.supplies.feed = 1;
    expect(feed(r2, 'a1', T0).ok).toBe(true);
    expect(r2.animals[0].satiety).toBeCloseTo(70, 3);
    expect(r2.supplies.feed).toBe(0);
  });

  it('feed: a nearly full chicken counts as full (no feed used)', () => {
    expect(FEED_FULL_AT).toBe(90);
    const r = mk({ satiety: 89.9 });
    r.supplies.feed = 3;
    expect(feed(r, 'a1', T0).ok).toBe(true);
    expect(r.animals[0].satiety).toBe(100);
    expect(r.supplies.feed).toBe(2);
    const r2 = mk({ satiety: 90 });
    r2.supplies.feed = 3;
    expect(feed(r2, 'a1', T0)).toEqual({ ok: false, reason: 'full' });
    expect(r2.supplies.feed).toBe(3);
    // fed a second later: satiety is just under 100, still full
    expect(feed(r, 'a1', T0 + 1000)).toEqual({ ok: false, reason: 'full' });
    expect(r.supplies.feed).toBe(2);
  });

  it('treat, medicine reasons', () => {
    const r = mk();
    expect(giveTreat(r, 'a1', T0)).toEqual({ ok: false, reason: 'none-left' });
    r.supplies.treat = 1;
    expect(giveTreat(r, 'a1', T0).ok).toBe(true);
    expect(r.animals[0].mood).toBeCloseTo(90, 3);
    expect(giveMedicine(r, 'a1', T0)).toEqual({ ok: false, reason: 'not-sick' });
    const s = mk({ sick: true });
    expect(giveTreat(s, 'a1', T0)).toEqual({ ok: false, reason: 'sick' });
    expect(giveMedicine(s, 'a1', T0)).toEqual({ ok: false, reason: 'none-left' });
  });

  it('cleanPoop', () => {
    const r = mk();
    r.houses[0].poop = 2;
    expect(cleanPoop(r, 'h1').ok).toBe(true);
    expect(r.houses[0].poop).toBe(1);
    r.houses[0].poop = 0;
    expect(cleanPoop(r, 'h1')).toEqual({ ok: false, reason: 'nothing' });
  });
});

describe('species-driven care', () => {
  function cowRanch() {
    const r = createRanch(0);
    r.houses.push({ id: 'h2', kind: 'barn', lot: 2, poop: 0 });
    r.animals.push({
      id: 'a2', species: 'cow', name: '哞哞', color: '黑白花', houseId: 'h2',
      satiety: 100, mood: 60, sick: false, medicated: false,
      neglectMs: 0, produceMs: 0, poopMs: 0, waiting: 0, petTimes: [], lastBrushAt: null,
    });
    return r;
  }
  it('createRanch has every supply and product key at 0', () => {
    const r = createRanch(0);
    expect(r.supplies).toEqual({ feed: 0, feedCow: 0, feedPig: 0, feedSheep: 0, feedLlama: 0, treat: 0, medicine: 0, bone: 0, fish: 0 });
    expect(r.pets).toEqual([]);
    expect(r.products).toEqual({ egg: 0, milk: 0, truffle: 0, yarn: 0, fluff: 0 });
  });
  it('feeding a cow spends feedCow, not chicken feed', () => {
    const r = cowRanch();
    r.animals[0].satiety = 10;
    r.supplies.feed = 3;
    expect(feed(r, 'a2', 0)).toEqual({ ok: false, reason: 'none-left' });
    r.supplies.feedCow = 2;
    expect(feed(r, 'a2', 0)).toEqual({ ok: true });
    expect(r.supplies.feedCow).toBe(1);
    expect(r.supplies.feed).toBe(3);
  });
  it('a cow makes milk every 3 h (2.25 h when happy)', () => {
    const r = cowRanch();
    settle(r, 2.9 * H);
    expect(r.animals[0].waiting).toBe(0);
    settle(r, 3 * H);
    expect(r.animals[0].waiting).toBe(1);
    expect(collect(r, 'a2')).toBe(1);
    expect(r.products.milk).toBe(1);
    expect(r.products.egg).toBe(0);
    const h = cowRanch();
    h.animals[0].mood = 100;
    settle(h, 2.25 * H);
    expect(h.animals[0].waiting).toBe(1);
  });
});

describe('pageStatus', () => {
  const animal = (id: string, houseId: string, over: Partial<Animal> = {}): Animal => ({
    id, species: 'chicken', name: id, color: '白', houseId,
    satiety: 100, mood: 60, sick: false, medicated: false, neglectMs: 0,
    produceMs: 0, poopMs: 0, waiting: 0, petTimes: [], lastBrushAt: null, ...over,
  });
  const calm = { hungry: false, sick: false, poop: false, products: 0, cure: null };

  it('has one calm entry per page even with an empty ranch', () => {
    expect(pageStatus(createRanch(0))).toEqual([calm, calm, calm, calm, calm, calm]);
  });

  it('reports each house on its own lot (page)', () => {
    const r = createRanch(0);
    r.houses.push({ id: 'h1', kind: 'coop', lot: 1, poop: 2 });
    r.houses.push({ id: 'h2', kind: 'sty', lot: 3, poop: 0 });
    r.animals.push(animal('a1', 'h1', { waiting: 2 }));
    r.animals.push(animal('a2', 'h1', { waiting: 1, satiety: HUNGRY_SHOW_AT }));
    r.animals.push(animal('p1', 'h2', { species: 'pig', color: '粉紅', sick: true, satiety: 50 }));
    expect(pageStatus(r)).toEqual([
      calm, // the garden
      { hungry: true, sick: false, poop: true, products: 3, cure: null },
      calm,
      { hungry: false, sick: true, poop: false, products: 0, cure: 'medicine' },
      calm,
      calm,
    ]);
  });

  it('hungry only at or below the shown threshold', () => {
    const r = createRanch(0);
    r.houses.push({ id: 'h1', kind: 'coop', lot: 1, poop: 0 });
    r.animals.push(animal('a1', 'h1', { satiety: HUNGRY_SHOW_AT + 0.5 }));
    expect(pageStatus(r)[1].hungry).toBe(false);
    r.animals[0].satiety = 0;
    expect(pageStatus(r)[1].hungry).toBe(true);
  });

  it('a sick page asks for 💊 first, then ✋ once every sick animal has had its medicine', () => {
    const r = createRanch(0);
    r.houses.push({ id: 'h1', kind: 'coop', lot: 1, poop: 0 });
    r.animals.push(animal('a1', 'h1', { sick: true }), animal('a2', 'h1', { sick: true }));
    expect(pageStatus(r)[1].cure).toBe('medicine');
    r.animals[0].medicated = true;
    expect(pageStatus(r)[1].cure).toBe('medicine'); // a2 still needs hers
    r.animals[1].medicated = true;
    expect(pageStatus(r)[1]).toMatchObject({ sick: true, cure: 'pet' });
    r.animals.forEach((a) => { a.sick = false; a.medicated = false; });
    expect(pageStatus(r)[1]).toMatchObject({ sick: false, cure: null });
  });

  it('ignores animals whose house is missing', () => {
    const r = createRanch(0);
    r.animals.push(animal('a1', 'gone', { waiting: 3, sick: true }));
    expect(pageStatus(r)).toEqual([calm, calm, calm, calm, calm, calm]);
  });

  it('never flags the garden page, even for a house stored on its lot', () => {
    const r = createRanch(0);
    r.houses.push({ id: 'h1', kind: 'coop', lot: 0, poop: 3 });
    r.animals.push(animal('a1', 'h1', { waiting: 2 }));
    expect(pageStatus(r)[0]).toEqual(calm);
  });
});

describe('giveSnack', () => {
  function withPets(): RanchState {
    const r = createRanch(T0);
    r.pets = [{ id: 'p1', kind: 'dog', name: '旺財', color: '柴犬' }, { id: 'p2', kind: 'cat', name: '咪咪', color: '三花貓' }];
    r.supplies.bone = 1; r.supplies.fish = 1; r.supplies.treat = 2;
    return r;
  }

  it('🦴 to the dog, 🐟 to the cat, 🍪 to either: each uses exactly what was given', () => {
    const r = withPets();
    expect(giveSnack(r, 'p1', 'bone')).toEqual({ ok: true, used: 'bone' });
    expect(giveSnack(r, 'p2', 'fish')).toEqual({ ok: true, used: 'fish' });
    expect(giveSnack(r, 'p1', 'treat')).toEqual({ ok: true, used: 'treat' });
    expect(giveSnack(r, 'p2', 'treat')).toEqual({ ok: true, used: 'treat' });
    expect([r.supplies.bone, r.supplies.fish, r.supplies.treat]).toEqual([0, 0, 0]);
  });

  it('a 🦴 is not for the cat (nor a 🐟 for the dog): nothing is used', () => {
    const r = withPets();
    expect(giveSnack(r, 'p2', 'bone')).toEqual({ ok: false, reason: 'wrong-pet' });
    expect(giveSnack(r, 'p1', 'fish')).toEqual({ ok: false, reason: 'wrong-pet' });
    expect([r.supplies.bone, r.supplies.fish]).toEqual([1, 1]);
  });

  it('none left: nothing else is used in its place', () => {
    const r = withPets();
    r.supplies.bone = 0;
    expect(giveSnack(r, 'p1', 'bone')).toEqual({ ok: false, reason: 'none-left' });
    expect(r.supplies.treat).toBe(2);
    expect(giveSnack(r, 'nobody', 'treat')).toEqual({ ok: false, reason: 'nothing' });
  });
});
