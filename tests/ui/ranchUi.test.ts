// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRanchUi, lockText, type Tool } from '../../src/ui/ranchUi';
import { createNewState, type GameState } from '../../src/core/state';
import { buy } from '../../src/core/shop';
import { pageStatus, type PageStatus } from '../../src/core/ranch';

const T0 = 1_700_000_000_000;
const rng = () => 0;

/** A state with `unlocked` levels open (1 = tutorial only, 9 = every crop). */
function st(unlocked = 9): GameState {
  const s = createNewState(T0);
  s.unlocked = unlocked;
  return s;
}

function rich(s: GameState): GameState {
  for (const k of Object.keys(s.inventory) as (keyof GameState['inventory'])[]) s.inventory[k] = 999;
  for (const k of Object.keys(s.ranch.products) as (keyof GameState['ranch']['products'])[]) s.ranch.products[k] = 99;
  return s;
}

/** Page 1 is the coop (page 0 is the garden). */
function setup(state: GameState, page = 1) {
  const root = document.createElement('div');
  const nav = document.createElement('div');
  document.body.append(root, nav);
  const ui = createRanchUi(root, nav);
  ui.update(state);
  ui.setPage(page, pageStatus(state.ranch));
  return { root, nav, ui };
}

const toolBtn = (root: HTMLElement, t: string) => root.querySelector<HTMLButtonElement>(`[data-tool="${t}"]`)!;
const row = (root: HTMLElement, item: string) => root.querySelector<HTMLElement>(`.shop-row[data-item="${item}"]`);
const buyBtn = (root: HTMLElement, item: string) => row(root, item)!.querySelector<HTMLButtonElement>('.buy')!;
const shopOpen = (root: HTMLElement) => !root.querySelector<HTMLElement>('.shop')!.hidden;
const focused = (root: HTMLElement) => root.querySelector<HTMLElement>('.shop-row.focus')?.dataset.item;
const rowOrder = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.shop-row')).map(r => r.dataset.item);

describe('ranch toolbar', () => {
  it('without the page\'s house the feed button is grey and opens the shop at that house', () => {
    const { root, ui } = setup(st());
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    const feed = toolBtn(root, 'feed');
    expect(feed.classList.contains('empty')).toBe(true);
    expect(feed.classList.contains('nohouse')).toBe(true);
    feed.click();
    expect(picked).toEqual([]);
    expect(shopOpen(root)).toBe(true);
    expect(focused(root)).toBe('coop');
  });

  it('with the house but no feed it opens the shop at that feed', () => {
    const s = rich(st());
    buy(s, 'coop', T0, rng);
    const { root } = setup(s);
    const feed = toolBtn(root, 'feed');
    expect(feed.classList.contains('empty')).toBe(true);
    expect(feed.classList.contains('nohouse')).toBe(false);
    expect(feed.textContent).toContain('0');
    feed.click();
    expect(focused(root)).toBe('feed');
  });

  it('selects a stocked tool and highlights it', () => {
    const s = rich(st());
    buy(s, 'coop', T0, rng);
    s.ranch.supplies.feed = 5;
    const { root, ui } = setup(s);
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    const feed = toolBtn(root, 'feed');
    expect(feed.classList.contains('empty')).toBe(false);
    expect(feed.querySelector('.feed-sack-emoji')!.textContent).toBe('🐔');
    expect(feed.textContent).not.toContain('🌾');
    expect(feed.textContent).toContain('5');
    feed.click();
    expect(picked).toEqual(['feed']);
    expect(feed.classList.contains('selected')).toBe(true);
    expect(toolBtn(root, 'hand').classList.contains('selected')).toBe(false);
    expect(shopOpen(root)).toBe(false);
  });

  it('on the cow page the feed button shows a 🐄 sack and the cow feed count', () => {
    const s = rich(st());
    s.ranch.supplies.feed = 3;
    s.ranch.supplies.feedCow = 7;
    const { root, ui } = setup(s, 2);
    const feed = toolBtn(root, 'feed');
    expect(feed.querySelector('.feed-sack-emoji')!.textContent).toBe('🐄');
    expect(feed.textContent).not.toContain('🌽');
    expect(feed.textContent).toContain('7');
    expect(feed.classList.contains('nohouse')).toBe(true); // no barn yet
    buy(s, 'barn', T0, rng);
    ui.update(s);
    expect(feed.classList.contains('nohouse')).toBe(false);
    expect(feed.classList.contains('empty')).toBe(false);
    ui.setPage(3, pageStatus(s.ranch));
    expect(feed.querySelector('.feed-sack-emoji')!.textContent).toBe('🐖');
    expect(feed.textContent).not.toContain('🥔');
    expect(feed.classList.contains('nohouse')).toBe(true);
  });

  it('the shop feed rows show the species sack, not a crop', () => {
    const { root, ui } = setup(rich(st()));
    ui.setPage(2, pageStatus(st().ranch));
    toolBtn(root, 'shop').click();
    const cow = row(root, 'feedCow')!.querySelector('.shop-icon')!;
    expect(cow.querySelector('.feed-sack-emoji')!.textContent).toBe('🐄');
    expect(cow.textContent).not.toContain('🌽');
  });

  it('the hand and brush never run out', () => {
    const { root } = setup(st());
    expect(toolBtn(root, 'hand').classList.contains('empty')).toBe(false);
    expect(toolBtn(root, 'brush').classList.contains('empty')).toBe(false);
    expect(toolBtn(root, 'hand').classList.contains('selected')).toBe(true);
  });

  it('in the overview the toolbar is off: no tool, no shop', () => {
    const { root, ui } = setup(rich(st()));
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    ui.setOverview(true);
    expect(root.querySelector('.ranch-tools')!.classList.contains('off')).toBe(true);
    toolBtn(root, 'brush').click();
    toolBtn(root, 'shop').click();
    expect(picked).toEqual([]);
    expect(shopOpen(root)).toBe(false);
    ui.setOverview(false);
    toolBtn(root, 'brush').click();
    expect(picked).toEqual(['brush']);
  });
});

describe('ranch pages', () => {
  const status = (over: Partial<Record<number, Partial<PageStatus>>>): PageStatus[] =>
    [0, 1, 2, 3, 4, 5].map(i => ({ hungry: false, sick: false, poop: false, products: 0, ...over[i] }));

  it('shows the page name, arrows only where there is a page, and the current dot', () => {
    const { nav, ui } = setup(st(), 0);
    const title = nav.querySelector('.rn-title')!;
    const prev = nav.querySelector<HTMLElement>('.rn-prev')!;
    const next = nav.querySelector<HTMLElement>('.rn-next')!;
    expect(title.textContent).toBe('🌾 我的農田 0/81');
    expect(prev.hidden).toBe(true);
    expect(next.hidden).toBe(false);
    ui.setPage(1, status({}));
    expect(title.textContent).toBe('🐔 雞舍');
    expect(prev.hidden).toBe(false);
    ui.setPage(2, status({}));
    expect(title.textContent).toBe('🐄 牛棚');
    ui.setPage(5, status({}));
    expect(title.textContent).toBe('🦙 羊駝屋');
    expect(next.hidden).toBe(true);
    const dots = Array.from(nav.querySelectorAll('.rn-dot'));
    expect(dots).toHaveLength(6);
    expect(dots[0].classList.contains('rn-dot-garden')).toBe(true);
    expect(dots.map(d => d.classList.contains('current'))).toEqual([false, false, false, false, false, true]);
  });

  it('the garden title counts the fully grown plants (3-star facts)', () => {
    const s = st(1);
    s.mastery['1,1'] = 6;
    s.mastery['1,2'] = 6;
    s.mastery['1,3'] = 4;
    const { nav } = setup(s, 0);
    expect(nav.querySelector('.rn-title')!.textContent).toBe('🌾 我的農田 2/81');
  });

  it('on the garden page the care tools give way to「去農田種菜」; the shop stays', () => {
    const { root, ui } = setup(st(), 0);
    const bar = root.querySelector('.ranch-tools')!;
    expect(bar.classList.contains('garden')).toBe(true);
    let go = 0;
    ui.onGoField(() => { go++; });
    // one name for one place: the ranch page, its button and the field tab all say 農田
    expect(root.querySelector('.go-field')!.textContent).toBe('🌾去農田種菜');
    root.querySelector<HTMLElement>('.go-field')!.click();
    expect(go).toBe(1);
    toolBtn(root, 'shop').click();
    expect(rowOrder(root)[0]).toBe('coop'); // the garden page shops for the chickens
    ui.setPage(1, status({}));
    expect(bar.classList.contains('garden')).toBe(false);
    ui.setOverview(true);
    root.querySelector<HTMLElement>('.go-field')!.click();
    expect(go).toBe(1);
  });

  it('dots of pages that need the child get the attention style', () => {
    const { nav, ui } = setup(st());
    ui.setPage(1, status({ 2: { hungry: true }, 3: { sick: true }, 4: { poop: true }, 5: { products: 2 } }));
    const dots = Array.from(nav.querySelectorAll('.rn-dot'));
    expect(dots.map(d => d.classList.contains('attention'))).toEqual([false, false, true, true, true, true]);
    ui.setPage(1, status({ 5: { products: 1 } }));
    expect(dots.map(d => d.classList.contains('attention'))).toEqual([false, false, false, false, false, true]);
  });

  it('arrows, dots and 🗺️ report what the child asked for', () => {
    const { nav, ui } = setup(st(), 3);
    const pages: number[] = [];
    let maps = 0;
    ui.onPage(i => pages.push(i));
    ui.onOverview(() => { maps++; });
    nav.querySelector<HTMLElement>('.rn-next')!.click();
    nav.querySelector<HTMLElement>('.rn-prev')!.click();
    nav.querySelectorAll<HTMLElement>('.rn-dot')[5].click();
    nav.querySelectorAll<HTMLElement>('.rn-dot')[0].click();
    nav.querySelector<HTMLElement>('.rn-map')!.click();
    expect(pages).toEqual([4, 2, 5, 0]);
    expect(maps).toBe(1);
  });

  it('the overview has its own title and no arrows or dots', () => {
    const { nav, ui } = setup(st(), 3);
    ui.setOverview(true);
    expect(nav.querySelector('.rn-title')!.textContent).toBe('🗺️ 我的牧場');
    expect(nav.querySelector<HTMLElement>('.rn-prev')!.hidden).toBe(true);
    expect(nav.querySelector<HTMLElement>('.rn-next')!.hidden).toBe(true);
    expect(nav.querySelector<HTMLElement>('.rn-dots')!.hidden).toBe(true);
    ui.setOverview(false);
    expect(nav.querySelector('.rn-title')!.textContent).toBe('🐖 豬圈');
    expect(nav.querySelector<HTMLElement>('.rn-dots')!.hidden).toBe(false);
  });
});

describe('ranch shop', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('lists the page\'s house, animal and feed first, then medicine and treats', () => {
    const { root, ui } = setup(rich(st()), 2);
    ui.openShop();
    expect(rowOrder(root)).toEqual(['barn', 'cow', 'feedCow', 'medicine', 'treat']);
    expect(row(root, 'coop')).toBeNull();
  });

  it('a lot or feed focus from another page shows that species', () => {
    const { root, ui } = setup(rich(st()), 1);
    ui.openShop('sty');
    expect(rowOrder(root)).toEqual(['sty', 'pig', 'feedPig', 'medicine', 'treat']);
    expect(focused(root)).toBe('sty');
  });

  it('a locked barn shows 🔒🥔 and the level to unlock', () => {
    const s = rich(st(3)); // 1×, 2×, 5× open: 🌽 is there, 🥔 (4×) is not
    expect(lockText(s, 'barn')).toBe('解鎖 4× 就有 🥔');
    const { root, ui } = setup(s, 2);
    ui.openShop();
    const barn = row(root, 'barn')!;
    expect(barn.textContent).toContain('🔒🥔');
    expect(barn.textContent).toContain('解鎖 4× 就有 🥔');
    expect(buyBtn(root, 'barn').disabled).toBe(true);
    expect(buyBtn(root, 'cow').textContent).toContain('先蓋牛棚');
    expect(buyBtn(root, 'feedCow').textContent).toContain('先蓋牛棚');
  });

  it('marks missing crops red and disables the buy button', () => {
    const s = st();
    s.inventory.wheat = 200;
    s.inventory.carrot = 20;
    const { root, ui } = setup(s);
    ui.openShop('coop');
    const nums = Array.from(row(root, 'coop')!.querySelectorAll<HTMLElement>('.price b'));
    expect(nums.map(n => n.textContent)).toEqual(['150', '100']);
    expect(nums[0].classList.contains('short')).toBe(false);
    expect(nums[1].classList.contains('short')).toBe(true);
    expect(buyBtn(root, 'coop').disabled).toBe(true);
  });

  it('enables buying when there is enough and reports the item', () => {
    const s = st();
    s.inventory.wheat = 150;
    s.inventory.carrot = 100;
    const { root, ui } = setup(s);
    const bought: string[] = [];
    ui.onBuy(i => bought.push(i));
    vi.useFakeTimers();
    ui.openShop();
    const btn = buyBtn(root, 'coop');
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
    const { root, ui } = setup(rich(st()));
    ui.openShop('chicken');
    expect(buyBtn(root, 'chicken').textContent).toContain('先蓋雞舍');
    expect(buyBtn(root, 'chicken').disabled).toBe(true);
  });

  it('shows 住滿了 when the coop is full', () => {
    const s = rich(st());
    expect(buy(s, 'coop', T0, rng).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(buy(s, 'chicken', T0, rng).ok).toBe(true);
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    expect(buyBtn(root, 'chicken').textContent).toContain('住滿了');
    expect(buyBtn(root, 'chicken').disabled).toBe(true);
    expect(buyBtn(root, 'coop').textContent).toContain('住滿了');
  });

  it('shows the price of the next chicken', () => {
    const s = st();
    s.inventory.wheat = 999;
    s.inventory.carrot = 999;
    buy(s, 'coop', T0, rng);
    buy(s, 'chicken', T0, rng);
    buy(s, 'chicken', T0, rng);
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    const nums = Array.from(row(root, 'chicken')!.querySelectorAll<HTMLElement>('.price b'));
    expect(nums.map(n => n.textContent)).toEqual(['20', '5']);
    expect(nums.every(n => n.classList.contains('short'))).toBe(true);
  });

  it('products in prices show their own emoji', () => {
    const s = rich(st());
    s.ranch.products.milk = 0;
    buy(s, 'sty', T0, rng);
    const { root, ui } = setup(s, 3);
    ui.openShop();
    const pig = row(root, 'pig')!;
    expect(pig.textContent).toContain('🥛');
    expect(pig.querySelector('.price b.short')!.textContent).toBe('5');
  });
});
