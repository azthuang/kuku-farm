import { CROP_BY_ROW, type CropId } from '../core/levels';
import { checkBuy, priceOf, SUPPLY_AMOUNT, type ShopItemId } from '../core/shop';
import type { SupplyId } from '../core/species';
import type { GameState } from '../core/state';

export type Tool = 'hand' | 'feed' | 'brush' | 'treat' | 'medicine';

export interface RanchUi {
  setTool(t: Tool): void;
  onTool(cb: (t: Tool) => void): void;
  update(state: GameState): void;
  openShop(focus?: ShopItemId): void;
  closeShop(): void;
  onBuy(cb: (item: ShopItemId) => void): void;
  /** Stars on a shop row after a purchase. */
  celebrate(item: ShopItemId): void;
}

/**
 * The shop can open from a canvas pointerdown (tapping the empty lot); the same gesture's
 * trailing click must not land on the new backdrop or a buy button.
 */
const GHOST_CLICK_MS = 350;

const TOOLS: readonly { tool: Tool; icon: string; label: string; supply?: SupplyId }[] = [
  { tool: 'hand', icon: '✋', label: '摸摸' },
  { tool: 'feed', icon: '🌾', label: '飼料', supply: 'feed' },
  { tool: 'brush', icon: '🪮', label: '刷毛' },
  { tool: 'treat', icon: '🍪', label: '零食', supply: 'treat' },
  { tool: 'medicine', icon: '💊', label: '藥', supply: 'medicine' },
];

const ITEMS: readonly { item: ShopItemId; icon: string; name: string }[] = [
  { item: 'coop', icon: '🏠', name: '雞舍' },
  { item: 'chicken', icon: '🐔', name: '雞' },
  { item: 'feed', icon: '🌾', name: `飼料 ×${SUPPLY_AMOUNT.feed}` },
  { item: 'treat', icon: '🍪', name: `零食 ×${SUPPLY_AMOUNT.treat}` },
  { item: 'medicine', icon: '💊', name: `藥 ×${SUPPLY_AMOUNT.medicine}` },
];

const CROP_EMOJI = Object.fromEntries(
  Object.values(CROP_BY_ROW).map(c => [c.id, c.emoji]),
) as Record<CropId, string>;
const priceEmoji = (k: string): string => (k === 'egg' ? '🥚' : CROP_EMOJI[k as CropId] ?? k);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Ranch toolbar (pick a tool, then tap an animal) and the barter shop sheet. Pure DOM. */
export function createRanchUi(root: HTMLElement): RanchUi {
  let toolCb: (t: Tool) => void = () => {};
  let buyCb: (item: ShopItemId) => void = () => {};
  let tool: Tool = 'hand';
  let state: GameState | null = null;
  let ignoreUntil = 0;

  const bar = el('div', 'ranch-tools');
  const toolBtns = new Map<Tool, { btn: HTMLButtonElement; count: HTMLElement | null }>();
  for (const t of TOOLS) {
    const btn = el('button', 'tool');
    btn.type = 'button';
    btn.dataset.tool = t.tool;
    btn.setAttribute('aria-label', t.label);
    btn.append(el('span', 'tool-icon', t.icon));
    const count = t.supply ? el('b', 'tool-count', '0') : null;
    if (count) btn.append(count);
    btn.addEventListener('click', () => {
      if (t.supply && state && state.ranch.supplies[t.supply] < 1) {
        openShop(t.supply);
        return;
      }
      setTool(t.tool);
      toolCb(t.tool);
    });
    toolBtns.set(t.tool, { btn, count });
    bar.append(btn);
  }
  const shopBtn = el('button', 'tool tool-shop');
  shopBtn.type = 'button';
  shopBtn.dataset.tool = 'shop';
  shopBtn.setAttribute('aria-label', '商店');
  shopBtn.append(el('span', 'tool-icon', '🛒'));
  shopBtn.addEventListener('click', () => openShop());
  bar.append(shopBtn);

  const shop = el('div', 'shop');
  shop.hidden = true;
  const sheet = el('div', 'shop-sheet');
  const head = el('div', 'shop-head');
  head.append(el('span', 'shop-title', '🛒 商店'));
  const close = el('button', 'shop-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', '關閉');
  head.append(close);
  const list = el('div', 'shop-list');
  sheet.append(head, list);
  shop.append(sheet);

  const rows = new Map<ShopItemId, { row: HTMLElement; price: HTMLElement; btn: HTMLButtonElement }>();
  for (const it of ITEMS) {
    const row = el('div', 'shop-row');
    row.dataset.item = it.item;
    const what = el('div', 'shop-what');
    what.append(el('span', 'shop-icon', it.icon), el('span', 'shop-name', it.name));
    const price = el('div', 'price');
    const btn = el('button', 'buy');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (Date.now() < ignoreUntil || btn.disabled) return;
      buyCb(it.item);
    });
    row.append(what, price, btn);
    list.append(row);
    rows.set(it.item, { row, price, btn });
  }

  close.addEventListener('click', () => {
    if (Date.now() >= ignoreUntil) closeShop();
  });
  shop.addEventListener('click', e => {
    if (e.target === shop && Date.now() >= ignoreUntil) closeShop();
  });

  root.replaceChildren(bar, shop);

  function setTool(t: Tool): void {
    tool = t;
    for (const [k, { btn }] of toolBtns) btn.classList.toggle('selected', k === tool);
  }

  function renderTools(s: GameState): void {
    for (const t of TOOLS) {
      const { btn, count } = toolBtns.get(t.tool)!;
      if (!t.supply || !count) continue;
      const n = s.ranch.supplies[t.supply];
      count.textContent = String(n);
      btn.classList.toggle('empty', n < 1);
    }
  }

  function renderShop(s: GameState): void {
    for (const it of ITEMS) {
      const { price, btn } = rows.get(it.item)!;
      const check = checkBuy(s, it.item);
      price.replaceChildren();
      for (const [k, n] of Object.entries(priceOf(s, it.item))) {
        const have = k === 'egg' ? s.ranch.products.egg : s.inventory[k as CropId];
        const chip = el('span', 'cost');
        const num = el('b', have >= (n ?? 0) ? '' : 'short', String(n));
        chip.append(el('span', '', priceEmoji(k)), num);
        price.append(chip);
      }
      btn.classList.remove('full', 'need');
      if (check.ok) {
        btn.textContent = '買';
        btn.disabled = false;
      } else if (check.reason === 'full') {
        btn.textContent = '住滿了';
        btn.classList.add('full');
        btn.disabled = true;
      } else if (check.reason === 'need-house') {
        btn.textContent = '先蓋雞舍';
        btn.classList.add('need');
        btn.disabled = true;
      } else {
        btn.textContent = '買';
        btn.disabled = true;
      }
    }
  }

  function update(s: GameState): void {
    state = s;
    renderTools(s);
    renderShop(s);
  }

  function openShop(focus?: ShopItemId): void {
    if (state) renderShop(state);
    ignoreUntil = Date.now() + GHOST_CLICK_MS;
    shop.hidden = false;
    for (const [k, { row }] of rows) row.classList.toggle('focus', k === focus);
    const target = focus ? rows.get(focus)?.row : null;
    if (target) target.scrollIntoView?.({ block: 'nearest' });
    else list.scrollTop = 0;
  }

  function closeShop(): void {
    shop.hidden = true;
    // A hidden sheet never finishes its star animation: drop them instead of replaying on reopen.
    for (const st of Array.from(list.querySelectorAll('.shop-stars'))) st.remove();
  }

  function celebrate(item: ShopItemId): void {
    const r = rows.get(item);
    if (!r) return;
    const star = el('span', 'shop-stars', '✨');
    star.addEventListener('animationend', () => star.remove());
    r.row.append(star);
  }

  setTool('hand');

  return {
    setTool, update, openShop, closeShop, celebrate,
    onTool: cb => { toolCb = cb; },
    onBuy: cb => { buyCb = cb; },
  };
}
