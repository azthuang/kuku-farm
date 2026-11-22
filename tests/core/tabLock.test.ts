// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { TAB_KEY, createTabLock } from '../../src/core/tabLock';

function mem() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const storageEvent = (key: string | null, newValue: string | null) =>
  Object.assign(new Event('storage'), { key, newValue });

let stop: (() => void) | undefined;
afterEach(() => stop?.());

function setup(storage = mem()) {
  let lost = 0;
  const lock = createTabLock(storage, window, document, () => { lost++; });
  stop = lock.stop;
  return { storage, lock, lost: () => lost };
}

describe('tab lock', () => {
  it('claims the game for this tab when it opens', () => {
    const { storage, lock, lost } = setup();
    expect(storage.m.get(TAB_KEY)).toBeTruthy();
    expect(lock.owns()).toBe(true);
    expect(lost()).toBe(0);
  });

  it('two tabs claim different values', () => {
    const storage = mem();
    setup(storage);
    const first = storage.m.get(TAB_KEY);
    stop!();
    setup(storage);
    expect(storage.m.get(TAB_KEY)).not.toBe(first);
  });

  it('loses the game once when another tab opens it', () => {
    const { storage, lock, lost } = setup();
    storage.m.set(TAB_KEY, 'other');
    window.dispatchEvent(storageEvent(TAB_KEY, 'other'));
    expect(lost()).toBe(1);
    expect(lock.owns()).toBe(false);
    window.dispatchEvent(storageEvent(TAB_KEY, 'another'));
    expect(lost()).toBe(1);
  });

  it('ignores other keys and a cleared storage', () => {
    const { lost } = setup();
    window.dispatchEvent(storageEvent('kuku-farm-save', 'x'));
    window.dispatchEvent(storageEvent(null, null));
    window.dispatchEvent(storageEvent(TAB_KEY, null));
    expect(lost()).toBe(0);
  });

  it('notices a missed event when the tab comes back', () => {
    const { storage, lost } = setup();
    storage.m.set(TAB_KEY, 'other');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lost()).toBe(1);
  });

  it('check() reports whether this tab still owns the game', () => {
    const { storage, lock, lost } = setup();
    expect(lock.check()).toBe(true);
    storage.m.set(TAB_KEY, 'other');
    expect(lock.check()).toBe(false);
    expect(lost()).toBe(1);
  });

  it('keeps playing when storage refuses access', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    let lost = 0;
    const lock = createTabLock(broken, window, document, () => { lost++; });
    stop = lock.stop;
    expect(lock.owns()).toBe(true);
    expect(lock.check()).toBe(true);
    expect(lost).toBe(0);
  });
});
