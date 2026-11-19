import { BACK_ICON } from './icons';

export interface Numpad {
  value(): string;
  clear(): void;
  setLocked(locked: boolean): void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'back', 'ok'];
const LABEL: Record<string, string> = { ok: '✔' };

export function createNumpad(root: HTMLElement, onSubmit: (n: number) => void): Numpad {
  let value = '';
  let locked = false;

  const wrap = document.createElement('div');
  wrap.className = 'numpad';
  const display = document.createElement('div');
  display.className = 'numpad-display';
  const grid = document.createElement('div');
  grid.className = 'numpad-grid';

  const render = () => {
    display.textContent = value === '' ? '?' : value;
    wrap.classList.toggle('locked', locked);
  };

  for (const k of KEYS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'key' + (k === 'ok' ? ' key-ok' : k === 'back' ? ' key-back' : '');
    btn.dataset.key = k;
    if (k === 'back') {
      btn.innerHTML = BACK_ICON; // drawn: the ⌫ glyph shows tiny on an iPad
      btn.setAttribute('aria-label', '刪除');
    } else {
      btn.textContent = LABEL[k] ?? k;
    }
    btn.addEventListener('click', () => {
      if (locked) return;
      if (k === 'back') {
        value = value.slice(0, -1);
      } else if (k === 'ok') {
        if (value === '') return;
        locked = true;
        render();
        onSubmit(Number(value));
        return;
      } else if (value.length < 2) {
        value += k;
      }
      render();
    });
    grid.appendChild(btn);
  }

  wrap.append(display, grid);
  root.appendChild(wrap);
  render();

  return {
    value: () => value,
    clear: () => { value = ''; render(); },
    setLocked: (l: boolean) => { locked = l; render(); },
  };
}
