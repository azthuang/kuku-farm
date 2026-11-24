// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PIGEON_DOUBLE_MS, createDecorUi, decorTapOpens, isSecondTap } from '../../src/ui/decorUi';
import { createNewState, type GameState } from '../../src/core/state';
import { DECOR_ORDER, placeDecor } from '../../src/core/decor';

/** A state with the coop built (its two spots are open). */
function st(unlocked: number): GameState {
  const s = createNewState(0);
  s.unlocked = unlocked;
  s.ranch.houses.push({ id: 'h0', kind: 'coop', lot: 1, poop: 0 });
  return s;
}
function rich(s: GameState): GameState {
  for (const k of Object.keys(s.inventory) as (keyof GameState['inventory'])[]) s.inventory[k] = 900;
  return s;
}

let root: HTMLElement;
function setup() {
  root = document.createElement('div');
  document.body.append(root);
  return createDecorUi(root);
}
const title = () => root.querySelector('.decor-pick .shop-title')!.textContent;
const rowIds = () => Array.from(root.querySelectorAll<HTMLElement>('.decor-pick .shop-row')).map(r => r.dataset.item);
const row = (id: string) => root.querySelector<HTMLElement>(`.decor-pick .shop-row[data-item="${id}"]`)!;
const btn = (id: string) => row(id).querySelector<HTMLButtonElement>('.buy')!;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('decoration picker', () => {
  it('an empty spot: 🌻 放什麼？ and every decoration in order', () => {
    const ui = setup();
    ui.open('1-0', rich(st(9)));
    expect(ui.isOpen()).toBe(true);
    expect(title()).toBe('🌻 放什麼？');
    expect(rowIds()).toEqual([...DECOR_ORDER]);
    expect(btn('flowers').textContent).toBe('買');
    expect(btn('flowers').disabled).toBe(false);
  });

  it('a placed spot: 換成什麼？ with 📦 收起來 first; the decoration standing there is not offered', () => {
    const ui = setup();
    const s = rich(st(9));
    placeDecor(s, '1-0', 'flowers');
    ui.open('1-0', s);
    expect(title()).toBe('換成什麼？');
    expect(rowIds()[0]).toBe('store');
    expect(row('store').textContent).toContain('📦 收起來');
    expect(rowIds()).not.toContain('flowers');
  });

  it('stored ones say 放這裡 and 收納 2, with no price', () => {
    const ui = setup();
    const s = st(1);
    s.ranch.decor.stored.well = 2;
    ui.open('1-0', s);
    expect(btn('well').textContent).toBe('放這裡');
    expect(btn('well').disabled).toBe(false);
    expect(row('well').textContent).toContain('收納 2');
    expect(row('well').querySelectorAll('.cost')).toHaveLength(0);
  });

  it('short crops show red and a grey 買; a locked crop shows 🔒 and its level', () => {
    const ui = setup();
    ui.open('1-0', st(2));
    expect(btn('flowers').disabled).toBe(true);
    expect(row('flowers').querySelector('b.short')).not.toBeNull();
    expect(row('well').textContent).toContain('解鎖 4× 就有 🥔');
    expect(btn('well').disabled).toBe(true);
  });

  it('picking reports the spot and the decoration, then closes', () => {
    vi.useFakeTimers();
    const ui = setup();
    const picked: [string, string][] = [];
    ui.onPick((spot, id) => picked.push([spot, id]));
    ui.open('1-1', rich(st(9)));
    vi.advanceTimersByTime(400); // past the ghost-click guard
    btn('bush').click();
    expect(picked).toEqual([['1-1', 'bush']]);
    expect(ui.isOpen()).toBe(false);
  });

  it('📦 收起來 reports the spot', () => {
    vi.useFakeTimers();
    const ui = setup();
    const s = rich(st(9));
    placeDecor(s, '1-1', 'tree');
    const stored: string[] = [];
    ui.onStore(spot => stored.push(spot));
    ui.open('1-1', s);
    vi.advanceTimersByTime(400);
    btn('store').click();
    expect(stored).toEqual(['1-1']);
    expect(ui.isOpen()).toBe(false);
  });

  it('update refreshes prices while open', () => {
    const ui = setup();
    const s = st(9);
    ui.open('1-0', s);
    expect(btn('flowers').disabled).toBe(true);
    rich(s);
    ui.update(s);
    expect(btn('flowers').disabled).toBe(false);
  });

  it('askSlot offers the two shown specials and 取消', async () => {
    vi.useFakeTimers();
    const ui = setup();
    const p = ui.askSlot(['ufo', 'rocket']);
    vi.advanceTimersByTime(400);
    // the one taken down is stored, never lost: the wording must not sound like it goes away
    expect(root.querySelector('.slot-ask .shop-title')!.textContent).toBe('📦 要把哪一個收起來？');
    expect(root.querySelector('.slot-ask .slot-note')!.textContent).toBe('收起來的還是你的，在 🛒 商店按「擺出來」就能再拿出來');
    expect(root.querySelector('[data-slot="0"]')!.textContent).toContain('🛸');
    expect(root.querySelector('[data-slot="1"]')!.textContent).toContain('🚀');
    root.querySelector<HTMLElement>('[data-slot="1"]')!.click();
    await expect(p).resolves.toBe(1);
    const q = ui.askSlot(['ufo', 'rocket']);
    vi.advanceTimersByTime(400);
    root.querySelector<HTMLElement>('.slot-cancel')!.click();
    await expect(q).resolves.toBeNull();
    expect(root.querySelector<HTMLElement>('.slot-ask')!.hidden).toBe(true);
  });
});

describe('pigeons: a second tap opens the list', () => {
  it('the same spot again while they fly counts; later, or another spot, does not', () => {
    expect(PIGEON_DOUBLE_MS).toBe(1600);
    expect(isSecondTap(null, '1-1', 0)).toBe(false);
    expect(isSecondTap({ spot: '1-1', at: 1000 }, '1-1', 2500)).toBe(true);
    expect(isSecondTap({ spot: '1-1', at: 1000 }, '1-1', 2600)).toBe(false);
    expect(isSecondTap({ spot: '1-1', at: 1000 }, '1-0', 1200)).toBe(false);
  });
});

describe('a decoration opens 換成什麼？ on the second tap', () => {
  it('an empty spot opens at once; a placed decoration only on a quick second tap on it', () => {
    expect(decorTapOpens(false, null, '1-1', 0)).toBe(true); // 放什麼？ on an empty spot: one tap
    expect(decorTapOpens(true, null, '1-1', 0)).toBe(false); // the first tap only wiggles or plays
    expect(decorTapOpens(true, { spot: '1-1', at: 1000 }, '1-1', 1400)).toBe(true);
    expect(decorTapOpens(true, { spot: '1-1', at: 1000 }, '1-1', 2700)).toBe(false); // too late: a new first tap
    expect(decorTapOpens(true, { spot: '1-0', at: 1000 }, '1-1', 1200)).toBe(false); // another spot
  });
});
