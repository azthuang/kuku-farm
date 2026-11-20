import { X_ICON } from './icons';
import { CROP_BY_ROW, type CropId } from '../core/levels';
import type { PageStatus } from '../core/ranch';
import { feedIcon } from './feedIcon';
import { checkBuy, headcount, lockHint, nextHouse, priceOf, SUPPLY_AMOUNT, type ShopItemId } from '../core/shop';
import { gardenOf } from '../core/garden';
import {
  SPECIALS, SPECIAL_ORDER, checkSpecial, specialSlot, specialsOpen, type SpecialId,
} from '../core/decor';
import {
  FARM_LOT, LOT_COUNT, PETS, PET_KINDS, PET_SNACK_EMOJI, PRODUCT_EMOJI, SPECIES, SPECIES_EMOJI, SPECIES_ORDER,
  speciesOfHouse, speciesOfLot,
  type HouseKind, type PetKind, type PetSnackId, type ProductId, type SpeciesId, type SupplyId,
} from '../core/species';
import type { GameState } from '../core/state';

export type Tool = 'hand' | 'feed' | 'brush' | 'treat' | 'medicine' | 'bone' | 'fish';

export interface RanchUi {
  setTool(t: Tool): void;
  onTool(cb: (t: Tool) => void): void;
  update(state: GameState): void;
  /** Opens the shop: the species of `focus` (or of the current page), then medicine and treats. */
  openShop(focus?: ShopItemId): void;
  closeShop(): void;
  onBuy(cb: (item: ShopItemId) => void): void;
  /** Stars on a shop row after a purchase. */
  celebrate(item: ShopItemId): void;
  /** A special's 買 (buy) or 擺出來 (show a stored one) at the end of the shop. */
  onSpecial(cb: (id: SpecialId, action: 'buy' | 'show') => void): void;
  /** Stars on a special's row. */
  celebrateSpecial(id: SpecialId): void;
  /** Current page (0 the garden, 1 … 5 the pens) and every page's status (for the dots). Cheap: call it every tick. */
  setPage(index: number, status: readonly PageStatus[]): void;
  /** ◀ ▶ or a dot asked for page `index`. */
  onPage(cb: (index: number) => void): void;
  /** 🗺️ was pressed (in either view). */
  onOverview(cb: () => void): void;
  setOverview(on: boolean): void;
  /** The garden page's「去農田種菜」button. */
  onGoField(cb: () => void): void;
  /** Following a pet: its label (e.g. 「🐕 旺財」) as the title, a ✕ instead of arrows and dots; null ends it. */
  setFollow(label: string | null): void;
  /** The ✕ of the follow view. */
  onFollowClose(cb: () => void): void;
}

/**
 * The shop can open from a canvas pointerdown (tapping the empty lot); the same gesture's
 * trailing click must not land on the new backdrop or a buy button.
 */
const GHOST_CLICK_MS = 350;

/** Per species: page emoji, animal name, house name. */
export const SPECIES_UI: Record<SpeciesId, { emoji: string; name: string; house: string }> = {
  chicken: { emoji: SPECIES_EMOJI.chicken, name: '雞', house: '雞舍' },
  cow: { emoji: SPECIES_EMOJI.cow, name: '牛', house: '牛棚' },
  pig: { emoji: SPECIES_EMOJI.pig, name: '豬', house: '豬圈' },
  sheep: { emoji: SPECIES_EMOJI.sheep, name: '綿羊', house: '羊圈' },
  llama: { emoji: SPECIES_EMOJI.llama, name: '羊駝', house: '羊駝屋' },
};

const OVERVIEW_TITLE = '🗺️ 我的牧場';
/** Called 農田 like the field tab (same 🌾), so the child sees one place in two views. */
const GARDEN_TITLE = '🌾 我的農田';

/** The 🦴 and 🐟 show up once their pet lives on the farm (`pet`). */
const TOOLS: readonly { tool: Tool; icon: string; label: string; supply?: 'treat' | 'medicine' | PetSnackId; pet?: PetKind }[] = [
  { tool: 'hand', icon: '✋', label: '摸摸' },
  { tool: 'feed', icon: '', label: '飼料' },
  { tool: 'brush', icon: '🪮', label: '刷毛' },
  { tool: 'treat', icon: '🍪', label: '零食', supply: 'treat' },
  { tool: 'medicine', icon: '💊', label: '藥', supply: 'medicine' },
  { tool: 'bone', icon: '🦴', label: '狗骨頭', supply: 'bone', pet: 'dog' },
  { tool: 'fish', icon: '🐟', label: '小魚乾', supply: 'fish', pet: 'cat' },
];

/** Pet names in the shop and on its buttons. */
const PET_NAME = { dog: '狗', cat: '貓' } as const;
const SNACK_NAME = { bone: '狗骨頭', fish: '小魚乾' } as const;

/** On every page: medicine and treats, then the dog, the cat and their snacks (paid in products). */
const SHARED: readonly { item: ShopItemId; icon: string | HTMLElement; name: string }[] = [
  { item: 'medicine', icon: '💊', name: `藥 ×${SUPPLY_AMOUNT.medicine}` },
  { item: 'treat', icon: '🍪', name: `零食 ×${SUPPLY_AMOUNT.treat}` },
  ...PET_KINDS.flatMap(k => [
    { item: k as ShopItemId, icon: PETS[k].emoji, name: PET_NAME[k] },
    { item: PETS[k].snack as ShopItemId, icon: PET_SNACK_EMOJI[PETS[k].snack], name: `${SNACK_NAME[PETS[k].snack]} ×${SUPPLY_AMOUNT[PETS[k].snack]}` },
  ]),
];

const isPetItem = (item: string): boolean => (PET_KINDS as readonly string[]).includes(item);
const houseItem = (sp: SpeciesId) => ({ item: SPECIES[sp].house as ShopItemId, icon: '🏠', name: SPECIES_UI[sp].house });

function speciesItems(sp: SpeciesId): { item: ShopItemId; icon: string | HTMLElement; name: string }[] {
  const d = SPECIES[sp];
  const ui = SPECIES_UI[sp];
  return [
    houseItem(sp),
    { item: sp, icon: ui.emoji, name: ui.name },
    { item: d.feed, icon: feedIcon(ui.emoji), name: `飼料 ×${SUPPLY_AMOUNT[d.feed]}` },
  ];
}

/** The species a shop item belongs to, or null for the shared medicine and treats. */
function speciesOfItem(item: ShopItemId): SpeciesId | null {
  for (const sp of SPECIES_ORDER) {
    const d = SPECIES[sp];
    if (item === sp || item === d.house || item === d.feed) return sp;
  }
  return null;
}

const CROP_EMOJI = Object.fromEntries(
  Object.values(CROP_BY_ROW).map(c => [c.id, c.emoji]),
) as Record<CropId, string>;
const priceEmoji = (k: string): string => PRODUCT_EMOJI[k as ProductId] ?? CROP_EMOJI[k as CropId] ?? k;

/** 「解鎖 4× 就有 🥔」 for a locked house (「練 …」 once that level is open), else null. */
export function lockText(state: GameState, kind: HouseKind): string | null {
  const h = lockHint(state, kind);
  if (!h) return null;
  return `${h.unlocked ? '練' : '解鎖'} ${h.row}× 就有 ${CROP_BY_ROW[h.row].emoji}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string, label?: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

/** A close button whose ✕ is drawn, so it is the same size and centred on every device's fonts. */
export function closeButton(cls: string, label: string): HTMLButtonElement {
  const b = button(cls, '', label);
  b.innerHTML = X_ICON;
  return b;
}

interface Row { row: HTMLElement; name: HTMLElement; price: HTMLElement; btn: HTMLButtonElement }

/**
 * Ranch toolbar (pick a tool, then tap an animal), page navigation over the stage (title, 🗺️,
 * ◀ ▶, dots) and the barter shop sheet. Pure DOM.
 */
export function createRanchUi(root: HTMLElement, nav?: HTMLElement): RanchUi {
  let toolCb: (t: Tool) => void = () => {};
  let buyCb: (item: ShopItemId) => void = () => {};
  let specialCb: (id: SpecialId, action: 'buy' | 'show') => void = () => {};
  let pageCb: (index: number) => void = () => {};
  let overviewCb: () => void = () => {};
  let goFieldCb: () => void = () => {};
  let followCloseCb: () => void = () => {};
  let followLabel: string | null = null;
  let tool: Tool = 'hand';
  let state: GameState | null = null;
  let ignoreUntil = 0;
  let page = 0;
  let overview = false;
  /** The species whose rows lead the shop, or null on the garden page (the next house instead). */
  let shopSpecies: SpeciesId | null = 'chicken';
  let focusItem: ShopItemId | null = null;

  /** The species of the page shown (the garden page feeds the chickens; its shop offers the next house). */
  const pageSpecies = (): SpeciesId => speciesOfLot(page) ?? SPECIES_ORDER[0];

  // ---------------------------------------------------------------- toolbar

  const bar = el('div', 'ranch-tools');
  const toolBtns = new Map<Tool, { btn: HTMLButtonElement; icon: HTMLElement; count: HTMLElement | null }>();
  for (const t of TOOLS) {
    const btn = button('tool', '', t.label);
    btn.dataset.tool = t.tool;
    const icon = el('span', 'tool-icon', typeof t.icon === 'string' ? t.icon : '');
    btn.append(icon);
    const count = t.tool === 'feed' || t.supply ? el('b', 'tool-count', '0') : null;
    if (count) btn.append(count);
    btn.addEventListener('click', () => {
      if (overview) return;
      const s = state;
      if (s && t.tool === 'feed') {
        const sp = pageSpecies();
        const d = SPECIES[sp];
        if (!s.ranch.houses.some(h => h.kind === d.house)) {
          openShop(d.house);
          return;
        }
        if (s.ranch.supplies[d.feed] < 1) {
          openShop(d.feed);
          return;
        }
      } else if (s && t.supply && s.ranch.supplies[t.supply] < 1) {
        openShop(t.supply);
        return;
      }
      setTool(t.tool);
      toolCb(t.tool);
    });
    if (t.pet) btn.hidden = true; // until that pet is bought
    toolBtns.set(t.tool, { btn, icon, count });
    bar.append(btn);
  }
  const shopBtn = button('tool tool-shop', '', '商店');
  shopBtn.dataset.tool = 'shop';
  shopBtn.append(el('span', 'tool-icon', '🛒'));
  // the shop works on the map too, with the things that need no page (see renderShop)
  shopBtn.addEventListener('click', () => openShop());
  // On the garden page the care tools give way to one big way back to the field.
  const goField = button('tool go-field', '', '去農田種菜');
  goField.append(el('span', 'tool-icon', '🌾'), el('span', 'go-field-text', '去農田種菜'));
  goField.addEventListener('click', () => {
    if (!overview) goFieldCb();
  });
  bar.append(goField, shopBtn);

  // ---------------------------------------------------------------- page navigation

  const title = el('div', 'rn-title', '');
  const mapBtn = button('rn-map', '🗺️', '全景');
  const prev = button('rn-prev', '◀', '上一頁');
  const next = button('rn-next', '▶', '下一頁');
  const closeFollow = closeButton('rn-close', '不跟了');
  closeFollow.hidden = true;
  closeFollow.addEventListener('click', () => followCloseCb());
  const dotsEl = el('div', 'rn-dots');
  const dots = Array.from({ length: LOT_COUNT }, (_, i) => {
    const sp = speciesOfLot(i);
    const d = button(sp ? 'rn-dot' : 'rn-dot rn-dot-garden', '', sp ? SPECIES_UI[sp].house : '農田');
    d.dataset.page = String(i);
    d.addEventListener('click', () => pageCb(i));
    dotsEl.append(d);
    return d;
  });
  prev.addEventListener('click', () => { if (page > 0) pageCb(page - 1); });
  next.addEventListener('click', () => { if (page < LOT_COUNT - 1) pageCb(page + 1); });
  mapBtn.addEventListener('click', () => overviewCb());
  nav?.replaceChildren(title, mapBtn, closeFollow, prev, next, dotsEl);

  function renderNav(): void {
    const sp = pageSpecies();
    const garden = page === FARM_LOT;
    let text = `${SPECIES_UI[sp].emoji} ${SPECIES_UI[sp].house}`;
    if (garden) text = state ? `${GARDEN_TITLE} ${gardenOf(state).grown}/81` : GARDEN_TITLE;
    const following = followLabel !== null && !overview;
    const shown = overview ? OVERVIEW_TITLE : following ? followLabel! : text;
    if (title.textContent !== shown) title.textContent = shown;
    mapBtn.classList.toggle('active', overview);
    // following a pet, the care tools work wherever it goes (not the field page's single button)
    bar.classList.toggle('garden', garden && !following);
    closeFollow.hidden = !following;
    prev.hidden = overview || following || page === 0;
    next.hidden = overview || following || page === LOT_COUNT - 1;
    dotsEl.hidden = overview || following;
    dots.forEach((d, i) => d.classList.toggle('current', i === page));
  }

  // ---------------------------------------------------------------- shop

  const shop = el('div', 'shop');
  shop.hidden = true;
  const sheet = el('div', 'shop-sheet');
  const head = el('div', 'shop-head');
  head.append(el('span', 'shop-title', '🛒 商店'));
  const close = closeButton('shop-close', '關閉');
  head.append(close);
  const list = el('div', 'shop-list');
  sheet.append(head, list);
  shop.append(sheet);

  /** Rows are built once per item and updated in place (a rebuild would drop the purchase stars). */
  const rows = new Map<string, Row>();
  /** `item` is a ShopItemId, or `special:<id>` / `specials-locked` for the specials at the end. */
  function rowOf(it: { item: string; icon: string | HTMLElement; name: string }, click?: () => void): Row {
    let r = rows.get(it.item);
    if (r) return r;
    const row = el('div', 'shop-row');
    row.dataset.item = it.item;
    const what = el('div', 'shop-what');
    const ic = el('span', 'shop-icon', typeof it.icon === 'string' ? it.icon : '');
    if (typeof it.icon !== 'string') ic.append(it.icon);
    const name = el('span', 'shop-name', it.name);
    what.append(ic, name);
    const price = el('div', 'price');
    const btn = button('buy', '買');
    btn.addEventListener('click', () => {
      if (Date.now() < ignoreUntil || btn.disabled) return;
      if (click) click();
      else buyCb(it.item as ShopItemId);
    });
    row.append(what, price, btn);
    r = { row, name, price, btn };
    rows.set(it.item, r);
    return r;
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
      const { btn, icon, count } = toolBtns.get(t.tool)!;
      if (!count) continue;
      if (t.tool === 'feed') {
        const sp = pageSpecies();
        const d = SPECIES[sp];
        const n = s.ranch.supplies[d.feed];
        const noHouse = !s.ranch.houses.some(h => h.kind === d.house);
        if (icon.dataset.sp !== sp) {
          icon.dataset.sp = sp;
          icon.replaceChildren(feedIcon(SPECIES_UI[sp].emoji));
        }
        count.textContent = String(n);
        // Grey but still tappable (it opens the shop), so a class, not the disabled attribute.
        btn.classList.toggle('nohouse', noHouse);
        btn.classList.toggle('empty', noHouse || n < 1);
      } else if (t.supply) {
        const n = s.ranch.supplies[t.supply as SupplyId];
        count.textContent = String(n);
        btn.classList.toggle('empty', n < 1);
        if (t.pet) btn.hidden = !s.ranch.pets.some(p => p.kind === t.pet);
      }
    }
  }

  function renderRow(s: GameState, item: ShopItemId, r: Row): void {
    const { name, price, btn } = r;
    const check = checkBuy(s, item);
    price.replaceChildren();
    btn.classList.remove('full', 'need', 'locked', 'owned');
    // an animal row counts the hens (or cows …) against the room in their house: 雞 3/4
    const sp = (SPECIES_ORDER as readonly string[]).includes(item) ? item as SpeciesId : null;
    if (sp) {
      const h = headcount(s, sp);
      const text = h.cap > 0 ? `${SPECIES_UI[sp].name} ${h.n}/${h.cap}` : SPECIES_UI[sp].name;
      if (name.textContent !== text) name.textContent = text;
    }
    // bought once and for good (a house, the dog, the cat), or no room for another: no price to show
    if (!check.ok && (check.reason === 'owned' || check.reason === 'full')) {
      price.classList.remove('is-locked');
      const owned = check.reason === 'owned';
      const pet = (PET_KINDS as readonly string[]).includes(item);
      btn.textContent = owned ? (pet ? '✅ 有了' : '✅ 蓋好了') : '住滿了';
      btn.classList.add(owned ? 'owned' : 'full');
      btn.disabled = true;
      return;
    }
    if (!check.ok && check.reason === 'locked') {
      const kind = item as HouseKind;
      const h = lockHint(s, kind);
      price.classList.add('is-locked');
      price.append(
        el('span', 'lock-icon', `🔒${h ? CROP_BY_ROW[h.row].emoji : ''}`),
        el('span', 'lock-hint', lockText(s, kind) ?? ''),
      );
      btn.textContent = '🔒';
      btn.classList.add('locked');
      btn.disabled = true;
      return;
    }
    price.classList.remove('is-locked');
    for (const [k, n] of Object.entries(priceOf(s, item))) {
      const have = k in s.ranch.products ? s.ranch.products[k as ProductId] : s.inventory[k as CropId];
      const chip = el('span', 'cost');
      chip.append(el('span', '', priceEmoji(k)), el('b', have >= (n ?? 0) ? '' : 'short', String(n)));
      price.append(chip);
    }
    if (check.ok) {
      btn.textContent = '買';
      btn.disabled = false;
    } else if (check.reason === 'stocked') {
      btn.textContent = '裝滿了';
      btn.classList.add('full');
      btn.disabled = true;
    } else if (check.reason === 'need-pet') {
      const k = PET_KINDS.find(p => PETS[p].snack === item) ?? 'dog';
      btn.textContent = `先買${PET_NAME[k]}`;
      btn.classList.add('need');
      btn.disabled = true;
    } else if (check.reason === 'need-house') {
      const sp = speciesOfItem(item) ?? 'chicken';
      btn.textContent = `先蓋${SPECIES_UI[sp].house}`;
      btn.classList.add('need');
      btn.disabled = true;
    } else {
      btn.textContent = '買';
      btn.disabled = true;
    }
  }

  const specialRow = (id: SpecialId): Row => rowOf(
    { item: `special:${id}`, icon: SPECIALS[id].emoji, name: SPECIALS[id].name },
    () => { if (state) specialCb(id, state.ranch.decor.specials.includes(id) ? 'show' : 'buy'); },
  );
  const lockedSpecials = (): Row => rowOf({ item: 'specials-locked', icon: '✨', name: '驚喜物件' }, () => {});

  /** A special: 買 with its price, 擺出來 when stored, ✅ 擺著 when on the map. */
  function renderSpecial(s: GameState, id: SpecialId, r: Row): void {
    const { price, btn } = r;
    price.replaceChildren();
    btn.classList.remove('owned', 'full');
    if (specialSlot(s.ranch.decor, id) !== null) {
      btn.textContent = '✅ 擺著';
      btn.classList.add('owned');
      btn.disabled = true;
      return;
    }
    if (s.ranch.decor.specials.includes(id)) {
      btn.textContent = '擺出來';
      btn.disabled = false;
      return;
    }
    for (const [k, n] of Object.entries(SPECIALS[id].price) as [CropId, number][]) {
      const chip = el('span', 'cost');
      chip.append(el('span', '', priceEmoji(k)), el('b', s.inventory[k] >= n ? '' : 'short', String(n)));
      price.append(chip);
    }
    btn.textContent = '買';
    btn.disabled = !checkSpecial(s, id).ok;
  }

  /** Puts the shown species' rows, then the shared ones, then the specials into the list and refreshes them. */
  function renderShop(s: GameState): void {
    const next = nextHouse(s);
    const house = next ? [houseItem(speciesOfHouse(next))] : [];
    // On the map: no feed, medicine, treats or snacks (they are used on a page, so bought there);
    // the next house, the dog and the cat, the specials.
    const items = overview ? [...house, ...SHARED.filter(it => isPetItem(it.item))]
      : [...(shopSpecies ? speciesItems(shopSpecies) : house), ...SHARED];
    const open = specialsOpen(s);
    const tail = open ? SPECIAL_ORDER.map(specialRow) : [lockedSpecials()];
    const wanted = [...items.map(it => rowOf(it).row), ...tail.map(r => r.row)];
    const shown = Array.from(list.children);
    if (shown.length !== wanted.length || shown.some((c, i) => c !== wanted[i])) list.replaceChildren(...wanted);
    for (const it of items) {
      const r = rowOf(it);
      renderRow(s, it.item, r);
      r.row.classList.toggle('focus', it.item === focusItem);
    }
    if (open) {
      SPECIAL_ORDER.forEach((id, i) => renderSpecial(s, id, tail[i]));
    } else {
      const { price, btn } = tail[0];
      if (!price.childElementCount) {
        price.classList.add('is-locked');
        price.append(el('span', 'lock-icon', '🔒'), el('span', 'lock-hint', '五間房子都蓋好就能買'));
      }
      btn.textContent = '🔒';
      btn.classList.add('locked');
      btn.disabled = true;
    }
  }

  function update(s: GameState): void {
    state = s;
    renderTools(s);
    if (!shop.hidden) renderShop(s);
  }

  function openShop(focus?: ShopItemId): void {
    shopSpecies = (focus && speciesOfItem(focus)) || speciesOfLot(page);
    focusItem = focus ?? null;
    if (state) renderShop(state);
    ignoreUntil = Date.now() + GHOST_CLICK_MS;
    shop.hidden = false;
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
    celebrateKey(item);
  }

  function celebrateKey(item: string): void {
    const r = rows.get(item);
    if (!r) return;
    const star = el('span', 'shop-stars', '✨');
    star.addEventListener('animationend', () => star.remove());
    r.row.append(star);
  }

  function setPage(index: number, status: readonly PageStatus[]): void {
    const i = Math.max(0, Math.min(LOT_COUNT - 1, Math.round(index)));
    if (i !== page) {
      page = i;
      if (state) renderTools(state);
    }
    renderNav();
    // Toggling an already-set class does not restart the bounce, so this is safe every tick.
    dots.forEach((d, k) => {
      const p = status[k];
      d.classList.toggle('attention', !!p && (p.hungry || p.sick || p.poop || p.products > 0));
    });
  }

  function setOverview(on: boolean): void {
    if (on !== overview) closeShop(); // the map's shop and a page's are different lists
    overview = on;
    bar.classList.toggle('off', on);
    for (const { btn } of toolBtns.values()) btn.disabled = on;
    goField.disabled = on;
    renderNav();
  }

  setTool('hand');
  renderNav();

  return {
    setTool, update, openShop, closeShop, celebrate, setPage, setOverview,
    celebrateSpecial: id => celebrateKey(`special:${id}`),
    onSpecial: cb => { specialCb = cb; },
    onTool: cb => { toolCb = cb; },
    onBuy: cb => { buyCb = cb; },
    onPage: cb => { pageCb = cb; },
    onOverview: cb => { overviewCb = cb; },
    onGoField: cb => { goFieldCb = cb; },
    setFollow: label => {
      if (label === followLabel) return;
      followLabel = label;
      renderNav();
    },
    onFollowClose: cb => { followCloseCb = cb; },
  };
}
