import { describe, it, expect } from 'vitest';
import { createNewState } from '../../src/core/state';
import {
  SAVE_KEY, CORRUPT_KEY, serialize, parseSave, loadFrom, saveTo, exportFileName,
} from '../../src/core/save';
import { createRanch, type RanchState } from '../../src/core/ranch';
import { Game } from '../../src/core/game';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

describe('save', () => {
  it('round trips and validates basics', () => {
    const s = createNewState(5);
    expect(parseSave(serialize(s))).toEqual({ ok: true, state: s });
    expect(parseSave('not json')).toEqual({ ok: false, error: 'invalid' });
    expect(parseSave(JSON.stringify({ ...s, version: 4 }))).toEqual({ ok: false, error: 'newer-version' });
    expect(parseSave(JSON.stringify({ ...s, unlocked: 12 })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...s, inventory: { ...s.inventory, corn: -1 } })).ok).toBe(false);
    const { version: _v, ...noVersion } = s;
    expect(parseSave(JSON.stringify(noVersion)).ok).toBe(false);
  });

  it('round trips a populated state and drops unknown fields', () => {
    const s = createNewState(5);
    s.unlocked = 3;
    s.cleared = { 1: [1, 2, 3], 2: [9] };
    s.mastery = { '1,2': 6, '2,3': 0 };
    s.inventory.corn = 99;
    s.daily = { '2026-11-15': { answered: 4, correct: 3 } };
    const raw = JSON.stringify({ ...s, extra: 1 });
    expect(parseSave(raw)).toEqual({ ok: true, state: s });
  });

  it('rejects malformed fields', () => {
    const s = createNewState(5);
    const bad = (o: object) => expect(parseSave(JSON.stringify({ ...s, ...o }))).toEqual({ ok: false, error: 'invalid' });
    bad({ unlocked: 0 });
    bad({ unlocked: 1.5 });
    bad({ inventory: { ...s.inventory, corn: 1000 } });
    bad({ inventory: { wheat: 0 } });
    bad({ mastery: { '1,2': 7 } });
    bad({ mastery: { 'x': 1 } });
    bad({ mastery: { '0,2': 1 } });
    bad({ cleared: { 1: [0] } });
    bad({ cleared: { 10: [1] } });
    bad({ cleared: { 1: 'x' } });
    bad({ settings: { speech: 1, sound: true } });
    bad({ daily: [] });
    bad({ daily: { d: { answered: -1, correct: 0 } } });
    bad({ daily: { d: { answered: 1.5, correct: 0 } } });
    bad({ lastSeenAt: null });
    bad({ version: undefined });
    bad({ version: '1' });
    expect(parseSave('null')).toEqual({ ok: false, error: 'invalid' });
    expect(parseSave('[]')).toEqual({ ok: false, error: 'invalid' });
  });

  it('loadFrom / saveTo with corrupt backup', () => {
    const s = createNewState(5);
    const mem = memoryStorage();
    expect(loadFrom(mem)).toEqual({ kind: 'empty' });
    saveTo(mem, s);
    expect(loadFrom(mem)).toEqual({ kind: 'ok', state: s });
    mem.setItem(SAVE_KEY, '{broken');
    expect(loadFrom(mem)).toEqual({ kind: 'corrupt' });
    expect(mem.getItem(CORRUPT_KEY)).toBe('{broken');
  });

  it('deduplicates cleared lists so repeated entries cannot unlock a row', () => {
    const s = createNewState(0);
    (s.cleared as Record<number, number[]>)[1] = [1, 1, 1, 1, 1, 1, 1, 1, 1];
    const r = parseSave(serialize(s));
    if (!r.ok) throw new Error('expected ok');
    expect(r.state.cleared[1]).toEqual([1]);
    const g = new Game(r.state, { now: () => 0 }, () => 0.99);
    g.startBasic(1);
    expect(g.answer(1)).toMatchObject({ kind: 'correct', unlockedRow: null });
    expect(g.state.unlocked).toBe(1);
  });

  it('loadFrom never throws', () => {
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); } };
    expect(loadFrom(throwing)).toEqual({ kind: 'empty' });
  });

  const v1 = (growing: unknown) => {
    const { version: _v, ...rest } = createNewState(5);
    return {
      ...rest, version: 1, growing,
      unlocked: 3,
      cleared: { 1: [1, 2, 3] },
      mastery: { '1,2': 6, '2,3': 2 },
      inventory: { ...rest.inventory, corn: 99 },
      daily: { '2026-11-15': { answered: 4, correct: 3 } },
      settings: { speech: false, sound: true },
    };
  };

  it('migrates a v1 save to v2 keeping every other field', () => {
    const old = v1({ '1,2': 12345 });
    const r = parseSave(JSON.stringify(old));
    if (!r.ok) throw new Error('expected ok');
    const { growing: _g, version: _v, ...expected } = old;
    expect(r.state.version).toBe(3);
    expect('growing' in r.state).toBe(false);
    expect(r.state).toEqual({ ...expected, version: 3, ranch: createRanch(5) });
  });

  it('migrates v1 even when growing is garbage', () => {
    for (const g of ['garbage', { '1,10': 'a' }, undefined, null]) {
      const r = parseSave(JSON.stringify(v1(g)));
      expect(r.ok).toBe(true);
      if (r.ok) expect('growing' in r.state).toBe(false);
    }
  });

  it('accepts inventory 999 but not 1000', () => {
    const s = createNewState(5);
    s.inventory.corn = 999;
    expect(parseSave(serialize(s))).toEqual({ ok: true, state: s });
    expect(parseSave(JSON.stringify({ ...s, inventory: { ...s.inventory, corn: 1000 } })).ok).toBe(false);
  });

  it('loadFrom on a newer save reports newer and never writes', () => {
    const calls: string[] = [];
    const store = {
      getItem: () => JSON.stringify({ ...createNewState(5), version: 4 }),
      setItem: (k: string) => { calls.push(k); },
    };
    expect(loadFrom(store)).toEqual({ kind: 'newer' });
    expect(calls).toEqual([]);
  });

  it('loadFrom migrates a stored v1 save', () => {
    const mem = memoryStorage();
    mem.setItem(SAVE_KEY, JSON.stringify(v1({ '1,2': 1 })));
    const r = loadFrom(mem);
    expect(r.kind).toBe('ok');
    expect(mem.getItem(CORRUPT_KEY)).toBeNull();
  });

  it('exportFileName', () => {
    expect(exportFileName(new Date(2026, 10, 15))).toBe('kuku-farm-save-20261115.json');
    expect(exportFileName(new Date(2026, 0, 5))).toBe('kuku-farm-save-20260105.json');
  });

  it('migrates a v2 save to v3 with an empty ranch, fields unchanged', () => {
    const { ranch: _r, ...base } = createNewState(7);
    const v2 = {
      ...base, version: 2, unlocked: 4, mastery: { '1,2': 3 },
      inventory: { ...base.inventory, wheat: 40 }, lastSeenAt: 777,
    };
    const r = parseSave(JSON.stringify(v2));
    if (!r.ok) throw new Error('expected ok');
    expect(r.state).toEqual({ ...v2, version: 3, ranch: createRanch(777) });
  });

  function populated(): RanchState {
    const r = createRanch(100);
    r.houses.push({ id: 'h1', kind: 'coop', lot: 0, poop: 2 });
    r.animals.push(
      { id: 'a1', species: 'chicken', name: '咕咕', color: '白', houseId: 'h1', satiety: 42.5, mood: 60.25,
        sick: false, medicated: false, neglectMs: 1234.5, produceMs: 99.5, poopMs: 10, waiting: 2,
        petTimes: [1, 2], lastBrushAt: null },
      { id: 'a2', species: 'chicken', name: '皮皮', color: '棕', houseId: 'h1', satiety: 0, mood: 0,
        sick: true, medicated: true, neglectMs: 0, produceMs: 0, poopMs: 0, waiting: 0,
        petTimes: [], lastBrushAt: 50 },
    );
    r.supplies = { feed: 99, treat: 3, medicine: 1 };
    r.products = { egg: 999 };
    r.nextId = 3;
    return r;
  }
  const withRanch = (mut: (r: RanchState) => void) => {
    const s = createNewState(5);
    s.ranch = populated();
    mut(s.ranch);
    return parseSave(JSON.stringify(s));
  };

  it('round trips a populated ranch', () => {
    const s = createNewState(5);
    s.ranch = populated();
    expect(parseSave(serialize(s))).toEqual({ ok: true, state: s });
  });

  it('rejects impossible ranch data', () => {
    const bad: Array<[string, (r: RanchState) => void]> = [
      ['satiety 101', (r) => { r.animals[0].satiety = 101; }],
      ['mood -1', (r) => { r.animals[0].mood = -1; }],
      ['satiety NaN', (r) => { r.animals[0].satiety = NaN; }],
      ['species', (r) => { (r.animals[0] as unknown as { species: string }).species = 'dragon'; }],
      ['houseId', (r) => { r.animals[0].houseId = 'nope'; }],
      ['capacity', (r) => {
        for (let i = 0; i < 3; i++) {
          r.animals.push({ ...r.animals[0], id: `x${i}` });
        }
      }],
      ['animals > 10', (r) => {
        for (let i = 0; i < 9; i++) r.animals.push({ ...r.animals[0], id: `y${i}`, houseId: 'h2' });
        r.houses.push({ id: 'h2', kind: 'coop', lot: 1, poop: 0 });
      }],
      ['supply 100', (r) => { r.supplies.feed = 100; }],
      ['product 1000', (r) => { r.products.egg = 1000; }],
      ['dup animal id', (r) => { r.animals[1].id = 'a1'; }],
      ['dup house id', (r) => { r.houses.push({ id: 'h1', kind: 'coop', lot: 1, poop: 0 }); }],
      ['poop 7', (r) => { r.houses[0].poop = 7; }],
      ['waiting 4', (r) => { r.animals[0].waiting = 4; }],
      ['bad house kind', (r) => { (r.houses[0] as unknown as { kind: string }).kind = 'barn'; }],
      ['nextId 0', (r) => { r.nextId = 0; }],
      ['petTimes junk', (r) => { (r.animals[0] as unknown as { petTimes: unknown }).petTimes = ['x']; }],
    ];
    for (const [name, mut] of bad) expect(withRanch(mut).ok, name).toBe(false);
    const s = { ...createNewState(5), ranch: undefined };
    expect(parseSave(JSON.stringify(s)).ok).toBe(false);
  });
});
