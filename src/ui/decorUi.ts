import {
  DECOR, DECOR_ORDER, SPECIALS, checkDecor, decorPrice, lockedCrop,
  type DecorId, type SpecialId, type SpotId,
} from '../core/decor';
import { CROP_BY_ROW, type CropId } from '../core/levels';
import type { GameState } from '../core/state';
import { closeButton } from './ranchUi';

/** Same guard as the shop: the tap that opened a sheet must not land on it. */
const GHOST_CLICK_MS = 350;

const CROP_EMOJI = Object.fromEntries(
  Object.values(CROP_BY_ROW).map(c => [c.id, c.emoji]),
) as Record<CropId, string>;

/**
 * A first tap on a decoration plays it (the pigeons, pond or bush do their trick, the others
 * wiggle); a second tap on it within this long opens 「換成什麼？」.
 */
export const PIGEON_DOUBLE_MS = 1600;

export function isSecondTap(last: { spot: SpotId; at: number } | null, spot: SpotId, now: number): boolean {
  return last !== null && last.spot === spot && now - last.at < PIGEON_DOUBLE_MS;
}

/** Whether a tap on `spot` opens its list: at once on an empty spot, on the second tap on a decoration. */
export function decorTapOpens(placed: boolean, last: { spot: SpotId; at: number } | null, spot: SpotId, now: number): boolean {
  return !placed || isSecondTap(last, spot, now);
}

export interface DecorUi {
  /** 「🌻 放什麼？」 on an empty spot, 「換成什麼？」 on a decorated one. */
  open(spot: SpotId, state: GameState): void;
  close(): void;
  /** Refreshes prices and storage counts while open. */
  update(state: GameState): void;
  isOpen(): boolean;
  onPick(cb: (spot: SpotId, id: DecorId) => void): void;
  onStore(cb: (spot: SpotId) => void): void;
  /** 「📦 要把哪一個收起來？」 between the two specials on the map: the slot, or null for 取消. */
  askSlot(shown: [SpecialId, SpecialId]): Promise<0 | 1 | null>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(cls: string, text: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/** A sheet like the shop's: backdrop, title, ✕ and a scrolling list. */
function sheet(extra: string): { box: HTMLElement; title: HTMLElement; close: HTMLButtonElement; list: HTMLElement } {
  const box = el('div', `shop ${extra}`);
  box.hidden = true;
  const inner = el('div', 'shop-sheet');
  const head = el('div', 'shop-head');
  const title = el('span', 'shop-title');
  const close = closeButton('shop-close', '關閉');
  head.append(title, close);
  const list = el('div', 'shop-list');
  inner.append(head, list);
  box.append(inner);
  return { box, title, close, list };
}

/** The decoration picker and the which-special-to-swap question, appended to `root`. */
export function createDecorUi(root: HTMLElement): DecorUi {
  let pickCb: (spot: SpotId, id: DecorId) => void = () => {};
  let storeCb: (spot: SpotId) => void = () => {};
  let spot: SpotId | null = null;
  let ignoreUntil = 0;

  const pick = sheet('decor-pick');
  const ask = sheet('slot-ask');
  // The one taken down goes to storage: say so, or a child thinks it is thrown away.
  ask.title.textContent = '📦 要把哪一個收起來？';
  root.append(pick.box, ask.box);

  const ready = (): boolean => Date.now() >= ignoreUntil;

  function close(): void {
    pick.box.hidden = true;
    spot = null;
  }
  pick.close.addEventListener('click', () => { if (ready()) close(); });
  pick.box.addEventListener('click', e => { if (e.target === pick.box && ready()) close(); });

  function storeRow(at: SpotId): HTMLElement {
    const row = el('div', 'shop-row');
    row.dataset.item = 'store';
    const what = el('div', 'shop-what');
    what.append(el('span', 'shop-name', '📦 收起來'));
    const b = button('buy', '收起來');
    b.addEventListener('click', () => {
      if (!ready()) return;
      close();
      storeCb(at);
    });
    row.append(what, el('div', 'price'), b);
    return row;
  }

  function decorRow(s: GameState, at: SpotId, id: DecorId): HTMLElement {
    const d = DECOR[id];
    const row = el('div', 'shop-row');
    row.dataset.item = id;
    const what = el('div', 'shop-what');
    what.append(el('span', 'shop-icon', d.emoji), el('span', 'shop-name', d.name));
    const price = el('div', 'price');
    const stored = s.ranch.decor.stored[id] ?? 0;
    const check = checkDecor(s, at, id);
    let label = '買';
    if (stored > 0) {
      label = '放這裡';
      price.append(el('span', 'stored', `收納 ${stored}`));
    } else {
      const cost = decorPrice(s, id);
      const lock = lockedCrop(s, cost);
      if (lock) {
        price.classList.add('is-locked');
        price.append(
          el('span', 'lock-icon', `🔒${CROP_BY_ROW[lock.row].emoji}`),
          el('span', 'lock-hint', `解鎖 ${lock.row}× 就有 ${CROP_BY_ROW[lock.row].emoji}`),
        );
      } else {
        for (const [k, n] of Object.entries(cost) as [CropId, number][]) {
          const chip = el('span', 'cost');
          chip.append(el('span', '', CROP_EMOJI[k]), el('b', s.inventory[k] >= n ? '' : 'short', String(n)));
          price.append(chip);
        }
      }
    }
    const b = button('buy', label);
    b.disabled = !check.ok;
    b.addEventListener('click', () => {
      if (!ready() || b.disabled) return;
      close();
      pickCb(at, id);
    });
    row.append(what, price, b);
    return row;
  }

  function render(s: GameState): void {
    if (spot === null) return;
    const at = spot;
    const here = s.ranch.decor.placed[at];
    pick.title.textContent = here ? '換成什麼？' : '🌻 放什麼？';
    const rows = DECOR_ORDER.filter(id => id !== here).map(id => decorRow(s, at, id));
    pick.list.replaceChildren(...(here ? [storeRow(at)] : []), ...rows);
  }

  let answer: ((slot: 0 | 1 | null) => void) | null = null;
  function finishAsk(slot: 0 | 1 | null): void {
    if (!ready()) return;
    ask.box.hidden = true;
    const a = answer;
    answer = null;
    a?.(slot);
  }
  ask.close.addEventListener('click', () => finishAsk(null));
  ask.box.addEventListener('click', e => { if (e.target === ask.box) finishAsk(null); });

  return {
    open(at, s) {
      spot = at;
      render(s);
      ignoreUntil = Date.now() + GHOST_CLICK_MS;
      pick.box.hidden = false;
      pick.list.scrollTop = 0;
    },
    close,
    update(s) {
      if (!pick.box.hidden) render(s);
    },
    isOpen: () => !pick.box.hidden,
    onPick(cb) { pickCb = cb; },
    onStore(cb) { storeCb = cb; },
    askSlot(shown) {
      answer?.(null); // a question left open is answered 取消
      const choices = el('div', 'slot-choices');
      shown.forEach((id, i) => {
        const b = button('slot-choice', '');
        b.dataset.slot = String(i);
        b.append(el('span', 'slot-icon', SPECIALS[id].emoji), el('span', 'slot-name', SPECIALS[id].name));
        b.addEventListener('click', () => finishAsk(i as 0 | 1));
        choices.append(b);
      });
      const cancel = button('buy slot-cancel', '取消');
      cancel.addEventListener('click', () => finishAsk(null));
      const note = el('p', 'slot-note', '收起來的還是你的，在 🛒 商店按「擺出來」就能再拿出來');
      ask.list.replaceChildren(choices, note, cancel);
      ignoreUntil = Date.now() + GHOST_CLICK_MS;
      ask.box.hidden = false;
      return new Promise(resolve => { answer = resolve; });
    },
  };
}
