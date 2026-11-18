// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRanchUi, lockText, type Tool } from '../../src/ui/ranchUi';
import { createNewState, type GameState } from '../../src/core/state';
import { buy } from '../../src/core/shop';
import { pageStatus, type PageStatus } from '../../src/core/ranch';
import { SPECIES, SPECIES_ORDER } from '../../src/core/species';
import { buySpecial, showSpecial, type SpecialId } from '../../src/core/decor';

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
    [0, 1, 2, 3, 4, 5].map(i => ({ hungry: false, sick: false, poop: false, products: 0, cure: null, ...over[i] }));

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
    // the garden page offers the next house to build, then what every page sells
    expect(rowOrder(root)).toEqual(['coop', 'medicine', 'treat', 'dog', 'bone', 'cat', 'fish', 'specials-locked']);
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

  it('following a pet: its name as the title, a ✕ instead of arrows and dots', () => {
    const { nav, ui, root } = setup(st(), 0);
    let closed = 0;
    ui.onFollowClose(() => { closed++; });
    const close = nav.querySelector<HTMLElement>('.rn-close')!;
    expect(close.hidden).toBe(true);
    ui.setFollow('🐕 旺財');
    expect(nav.querySelector('.rn-title')!.textContent).toBe('🐕 旺財');
    expect(close.hidden).toBe(false);
    expect(nav.querySelector<HTMLElement>('.rn-next')!.hidden).toBe(true);
    expect(nav.querySelector<HTMLElement>('.rn-dots')!.hidden).toBe(true);
    // the care tools work wherever the pet walks, even from the field page
    expect(root.querySelector('.ranch-tools')!.classList.contains('garden')).toBe(false);
    close.click();
    expect(closed).toBe(1);
    ui.setFollow(null);
    expect(nav.querySelector('.rn-title')!.textContent).toBe('🌾 我的農田 0/81');
    expect(close.hidden).toBe(true);
    expect(nav.querySelector<HTMLElement>('.rn-dots')!.hidden).toBe(false);
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
    expect(rowOrder(root)).toEqual(['barn', 'cow', 'feedCow', 'medicine', 'treat', 'dog', 'bone', 'cat', 'fish', 'specials-locked']);
    expect(row(root, 'coop')).toBeNull();
  });

  it('a lot or feed focus from another page shows that species', () => {
    const { root, ui } = setup(rich(st()), 1);
    ui.openShop('sty');
    expect(rowOrder(root)).toEqual(['sty', 'pig', 'feedPig', 'medicine', 'treat', 'dog', 'bone', 'cat', 'fish', 'specials-locked']);
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

  it('a full coop: 住滿了 and 4/4 on the hens, 蓋好了 on the coop, neither priced', () => {
    const s = rich(st());
    expect(buy(s, 'coop', T0, rng).ok).toBe(true);
    for (let i = 0; i < 3; i++) expect(buy(s, 'chicken', T0, rng).ok).toBe(true);
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    expect(row(root, 'chicken')!.querySelector('.shop-name')!.textContent).toBe('雞 3/4');
    expect(buyBtn(root, 'chicken').textContent).toBe('買');
    buy(s, 'chicken', T0, rng);
    ui.update(s);
    expect(row(root, 'chicken')!.querySelector('.shop-name')!.textContent).toBe('雞 4/4');
    expect(buyBtn(root, 'chicken').textContent).toBe('住滿了');
    expect(buyBtn(root, 'chicken').disabled).toBe(true);
    expect(row(root, 'chicken')!.querySelector('.price')!.children).toHaveLength(0);
    expect(buyBtn(root, 'coop').textContent).toBe('✅ 蓋好了');
    expect(buyBtn(root, 'coop').disabled).toBe(true);
    expect(row(root, 'coop')!.querySelector('.price')!.children).toHaveLength(0);
  });

  it('without a coop the hen row has no count', () => {
    const { root, ui } = setup(rich(st()));
    ui.openShop('chicken');
    expect(row(root, 'chicken')!.querySelector('.shop-name')!.textContent).toBe('雞');
  });

  it('a stocked-up supply says 裝滿了 and keeps its price', () => {
    const s = rich(st());
    buy(s, 'coop', T0, rng);
    s.ranch.supplies.feed = 97;
    s.ranch.supplies.medicine = 99;
    const { root, ui } = setup(s);
    ui.openShop();
    for (const item of ['feed', 'medicine']) {
      expect(buyBtn(root, item).textContent).toBe('裝滿了');
      expect(buyBtn(root, item).disabled).toBe(true);
      expect(row(root, item)!.querySelectorAll('.price .cost').length).toBeGreaterThan(0);
    }
  });

  it('the garden page offers the first house not built yet, then only the shared rows', () => {
    const s = rich(st());
    buy(s, 'coop', T0, rng);
    const { root, ui } = setup(s, 0);
    ui.openShop();
    expect(rowOrder(root)).toEqual(['barn', 'medicine', 'treat', 'dog', 'bone', 'cat', 'fish', 'specials-locked']);
    for (const h of ['barn', 'sty', 'fold', 'hut'] as const) buy(s, h, T0, rng);
    ui.update(s);
    // every house stands: the specials open up at the end
    expect(rowOrder(root)).toEqual(['medicine', 'treat', 'dog', 'bone', 'cat', 'fish',
      'special:xmasTree', 'special:balloon', 'special:rocket', 'special:ufo', 'special:dino']);
  });

  it('the garden page shows a locked next house with its hint', () => {
    const s = rich(st(1));
    s.ranch.houses.push({ id: 'h0', kind: 'coop', lot: 1, poop: 0 });
    const { root, ui } = setup(s, 0);
    ui.openShop();
    expect(rowOrder(root)[0]).toBe('barn');
    expect(buyBtn(root, 'barn').classList.contains('locked')).toBe(true);
  });

  it('shows the price of the next chicken', () => {
    const s = st();
    s.inventory.wheat = 999;
    s.inventory.carrot = 999;
    buy(s, 'coop', T0, rng);
    buy(s, 'chicken', T0, rng);
    buy(s, 'chicken', T0, rng);
    s.inventory.wheat = 10;
    s.inventory.carrot = 10;
    const { root, ui } = setup(s);
    ui.openShop('chicken');
    const nums = Array.from(row(root, 'chicken')!.querySelectorAll<HTMLElement>('.price b'));
    expect(nums.map(n => n.textContent)).toEqual(['120', '80']);
    expect(nums.every(n => n.classList.contains('short'))).toBe(true);
  });

  it('products in prices show their own emoji (the dog and the cat cost products)', () => {
    const s = rich(st());
    s.ranch.products.milk = 0;
    const { root, ui } = setup(s, 3);
    ui.openShop();
    const dog = row(root, 'dog')!;
    expect(dog.textContent).toContain('🥛');
    expect(dog.querySelector('.price b.short')!.textContent).toBe('15');
    expect(row(root, 'pig')!.textContent).not.toContain('🥛');
  });

  it('pets and snacks are in every page\'s shop; a snack waits for its pet; one of each pet', () => {
    const s = rich(st());
    const { root, ui } = setup(s, 2);
    ui.openShop();
    expect(rowOrder(root)).toEqual(['barn', 'cow', 'feedCow', 'medicine', 'treat', 'dog', 'bone', 'cat', 'fish', 'specials-locked']);
    expect(buyBtn(root, 'bone').textContent).toBe('先買狗');
    expect(buyBtn(root, 'fish').textContent).toBe('先買貓');
    buy(s, 'dog', T0, rng);
    ui.update(s);
    expect(buyBtn(root, 'dog').textContent).toBe('✅ 有了');
    expect(row(root, 'dog')!.querySelector('.price')!.children).toHaveLength(0);
    expect(buyBtn(root, 'bone').disabled).toBe(false);
  });

  it('🍪 still picks up with no treats while a bone or fish is left (for the pets)', () => {
    const s = rich(st());
    const { root, ui } = setup(s);
    const picked: Tool[] = [];
    ui.onTool(t => picked.push(t));
    s.ranch.supplies.bone = 2;
    ui.update(s);
    expect(toolBtn(root, 'treat').classList.contains('empty')).toBe(false);
    toolBtn(root, 'treat').click();
    expect(picked).toEqual(['treat']);
    expect(shopOpen(root)).toBe(false);
    s.ranch.supplies.bone = 0;
    ui.update(s);
    toolBtn(root, 'treat').click();
    expect(shopOpen(root)).toBe(true);
    expect(focused(root)).toBe('treat');
  });

  describe('surprise specials', () => {
    const allHouses = (s: GameState): GameState => {
      for (const sp of SPECIES_ORDER) s.ranch.houses.push({ id: `h-${sp}`, kind: SPECIES[sp].house, lot: SPECIES[sp].lot, poop: 0 });
      return s;
    };
    const SPECIAL_ROWS = ['special:xmasTree', 'special:balloon', 'special:rocket', 'special:ufo', 'special:dino'];

    it('before all five houses: one locked row at the end', () => {
      const { root, ui } = setup(rich(st()));
      ui.openShop();
      expect(rowOrder(root).at(-1)).toBe('specials-locked');
      expect(rowOrder(root).filter(r => r?.startsWith('special:'))).toEqual([]);
      const r = row(root, 'specials-locked')!;
      expect(r.textContent).toContain('驚喜物件');
      expect(r.querySelector('.shop-icon')!.textContent).toBe('✨');
      expect(r.textContent).toContain('五間房子都蓋好就能買');
      expect(r.querySelector<HTMLButtonElement>('.buy')!.disabled).toBe(true);
    });

    it('with all five houses: the five specials, priced, at the end', () => {
      const { root, ui } = setup(allHouses(rich(st())));
      ui.openShop();
      expect(rowOrder(root).slice(-5)).toEqual(SPECIAL_ROWS);
      expect(rowOrder(root)).not.toContain('specials-locked');
      expect(buyBtn(root, 'special:rocket').textContent).toBe('買');
      expect(row(root, 'special:rocket')!.textContent).toContain('火箭');
      expect(row(root, 'special:rocket')!.querySelectorAll('.cost')).toHaveLength(3);
    });

    it('shown: ✅ 擺著; stored: 擺出來; neither priced', () => {
      const s = allHouses(rich(st()));
      for (const id of ['rocket', 'ufo'] as SpecialId[]) { rich(s); buySpecial(s, id); }
      showSpecial(s, 'rocket');
      const { root, ui } = setup(s);
      ui.openShop();
      expect(buyBtn(root, 'special:rocket').textContent).toBe('✅ 擺著');
      expect(buyBtn(root, 'special:rocket').disabled).toBe(true);
      expect(buyBtn(root, 'special:ufo').textContent).toBe('擺出來');
      expect(buyBtn(root, 'special:ufo').disabled).toBe(false);
      expect(row(root, 'special:ufo')!.querySelectorAll('.cost')).toHaveLength(0);
      expect(row(root, 'special:rocket')!.querySelectorAll('.cost')).toHaveLength(0);
    });

    it('the buttons report buy and show', () => {
      vi.useFakeTimers();
      const s = allHouses(rich(st()));
      buySpecial(s, 'ufo');
      rich(s); // the ufo took 500 🥕; the rocket needs 500 more
      const { root, ui } = setup(s);
      const got: [SpecialId, string][] = [];
      ui.onSpecial((id, action) => got.push([id, action]));
      ui.openShop();
      vi.advanceTimersByTime(400);
      buyBtn(root, 'special:rocket').click();
      buyBtn(root, 'special:ufo').click();
      expect(got).toEqual([['rocket', 'buy'], ['ufo', 'show']]);
      vi.useRealTimers();
    });

    it('short crops grey the button', () => {
      const s = allHouses(st());
      const { root, ui } = setup(s);
      ui.openShop();
      expect(buyBtn(root, 'special:dino').disabled).toBe(true);
    });

    it('the garden page lists the specials after the shared rows too', () => {
      const { root, ui } = setup(allHouses(rich(st())), 0);
      ui.openShop();
      expect(rowOrder(root)).toEqual(['medicine', 'treat', 'dog', 'bone', 'cat', 'fish', ...SPECIAL_ROWS]);
    });
  });
});
