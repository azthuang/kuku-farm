import { describe, it, expect } from 'vitest';
import { createNewState } from '../../src/core/state';
import {
  SAVE_KEY, CORRUPT_KEY, serialize, parseSave, loadFrom, saveTo, exportFileName,
} from '../../src/core/save';
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
    expect(parseSave(JSON.stringify({ ...s, version: 3 }))).toEqual({ ok: false, error: 'newer-version' });
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
    expect(r.state.version).toBe(2);
    expect('growing' in r.state).toBe(false);
    expect(r.state).toEqual({ ...expected, version: 2 });
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
      getItem: () => JSON.stringify({ ...createNewState(5), version: 3 }),
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
});
