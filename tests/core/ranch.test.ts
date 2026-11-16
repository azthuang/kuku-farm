import { describe, it, expect } from 'vitest';
import {
  FEED_FULL_AT, createRanch, settle, feed, pet, brush, giveTreat, giveMedicine, cleanPoop, collect,
  type RanchState, type Animal,
} from '../../src/core/ranch';

const H = 3_600_000;
const T0 = 1_000_000;

function mk(over: Partial<Animal> = {}): RanchState {
  const r = createRanch(T0);
  r.houses.push({ id: 'h1', kind: 'coop', lot: 0, poop: 0 });
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

  it('gets sick only after 24h of neglect (36.5h in)', () => {
    const r = mk();
    settle(r, T0 + 36 * H);
    expect(r.animals[0].sick).toBe(false);
    settle(r, T0 + 37 * H);
    expect(r.animals[0].sick).toBe(true);
  });

  it('feeding resets neglect', () => {
    const r = mk();
    r.supplies.feed = 5;
    settle(r, T0 + 12.5 * H + 23 * H);
    expect(r.animals[0].sick).toBe(false);
    expect(feed(r, 'a1', T0 + 35.5 * H).ok).toBe(true);
    expect(r.animals[0].neglectMs).toBe(0);
    settle(r, T0 + 58.5 * H);
    expect(r.animals[0].sick).toBe(false);
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
