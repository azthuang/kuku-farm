// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRanchUi, type Tool } from '../../src/ui/ranchUi';
import { createNewState, type GameState } from '../../src/core/state';
import { buy } from '../../src/core/shop';

const T0 = 1_700_000_000_000;
const rng = () => 0;

function setup(state: GameState) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ui = createRanchUi(root);
  ui.update(state);
  return { root, ui };
}

const toolBtn = (root: HTMLElement, t: string) => root.querySelector<HTMLButtonElement>(`[data-tool="${t}"]`)!;
const row = (root: HTMLElement, item: string) => root.querySelector<HTMLElement>(`.shop-row[data-item="${item}"]`)!;
const shopOpen = (root: HTMLElement) => !root.querySelector<HTMLElement>('.shop')!.hidden;

describe('ranch toolbar', () => {
  it('greys out a tool with no supplies and opens the shop at that item when tapped', () => {
    const s = createNewState(T0);
    const { root, ui } = setup(s);
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    const feed = toolBtn(root, 'feed');
    expect(feed.classList.contains('empty')).toBe(true);
    expect(feed.textContent).toContain('0');
    feed.click();
    expect(picked).toEqual([]);
    expect(shopOpen(root)).toBe(true);
    expect(row(root, 'feed').classList.contains('focus')).toBe(true);
  });

  it('selects a stocked tool and highlights it', () => {
    const s = createNewState(T0);
    s.ranch.supplies.feed = 5;
    const { root, ui } = setup(s);
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    const feed = toolBtn(root, 'feed');
    expect(feed.classList.contains('empty')).toBe(false);
    expect(feed.textContent).toContain('5');
    feed.click();
    expect(picked).toEqual(['feed']);
    expect(feed.classList.contains('selected')).toBe(true);
    expect(toolBtn(root, 'hand').classList.contains('selected')).toBe(false);
    expect(shopOpen(root)).toBe(false);
  });

  it('the hand and brush never run out', () => {
    const { root } = setup(createNewState(T0));
    expect(toolBtn(root, 'hand').classList.contains('empty')).toBe(false);
    expect(toolBtn(root, 'brush').classList.contains('empty')).toBe(false);
    expect(toolBtn(root, 'hand').classList.contains('selected')).toBe(true);
  });
});

describe('ranch shop', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('marks missing crops red and disables the buy button', () => {
    const s = createNewState(T0);
    s.inventory.wheat = 200;
    s.inventory.carrot = 20;
    const { root, ui } = setup(s);
    ui.openShop('coop');
    const coop = row(root, 'coop');
    const nums = Array.from(coop.querySelectorAll<HTMLElement>('.price b'));
    expect(nums.map(n => n.textContent)).toEqual(['150', '100']);
    expect(nums[0].classList.contains('short')).toBe(false);
    expect(nums[1].classList.contains('short')).toBe(true);
    expect(coop.querySelector<HTMLButtonElement>('.buy')!.disabled).toBe(true);
  });

  it('enables buying when there is enough and reports the item', () => {
    const s = createNewState(T0);
    s.inventory.wheat = 150;
    s.inventory.carrot = 100;
    const { root, ui } = setup(s);
    const bought: string[] = [];
    ui.onBuy(i => bought.push(i));
    vi.useFakeTimers();
    ui.openShop();
    const btn = row(root, 'coop').querySelector<HTMLButtonElement>('.buy')!;
    expect(btn.disabled).toBe(false);
    btn.click(); // the trailing click of the gesture that opened the shop
    root.querySelector<HTMLElement>('.shop')!.click();
    expect(bought).toEqual([]);
    expect(shopOpen(root)).toBe(true);
    vi.advanceTimersByTime(400);
    btn.click();
    expect(bought).toEqual(['coop']);
  });

  it('asks for a coop before chickens', () => {
    const s = createNewState(T0);
    s.inventory.wheat = 999;
    s.inventory.carrot = 999;
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    const btn = row(root, 'chicken').querySelector<HTMLButtonElement>('.buy')!;
    expect(btn.textContent).toContain('先蓋雞舍');
    expect(btn.disabled).toBe(true);
  });

  it('shows 住滿了 when the coop is full', () => {
    const s = createNewState(T0);
    s.inventory.wheat = 999;
    s.inventory.carrot = 999;
    s.inventory.corn = 999;
    s.ranch.products.egg = 99;
    expect(buy(s, 'coop', T0, rng).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(buy(s, 'chicken', T0, rng).ok).toBe(true);
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    const btn = row(root, 'chicken').querySelector<HTMLButtonElement>('.buy')!;
    expect(btn.textContent).toContain('住滿了');
    expect(btn.disabled).toBe(true);
    expect(row(root, 'coop').querySelector<HTMLButtonElement>('.buy')!.textContent).toContain('住滿了');
  });

  it('shows the price of the next chicken', () => {
    const s = createNewState(T0);
    s.inventory.wheat = 999;
    s.inventory.carrot = 999;
    buy(s, 'coop', T0, rng);
    buy(s, 'chicken', T0, rng);
    buy(s, 'chicken', T0, rng);
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    const nums = Array.from(row(root, 'chicken').querySelectorAll<HTMLElement>('.price b'));
    expect(nums.map(n => n.textContent)).toEqual(['20', '5']);
    expect(nums.every(n => n.classList.contains('short'))).toBe(true);
  });
});
