import { CROP_BY_ROW, LEVEL_ORDER, unlockedRows, type CropId } from '../core/levels';
import type { GameState } from '../core/state';

/** Save files are a few KB; anything this large is not ours. */
const MAX_IMPORT_BYTES = 1024 * 1024;

export type Tab = 'field' | 'ranch';

export interface Layout {
  stage: HTMLElement;
  panel: HTMLElement;
  /** The ranch toolbar slot (shown instead of the panel on the ranch tab). */
  ranch: HTMLElement;
  /** Redraws the HUD; on the ranch tab it leads with the egg count. */
  updateHud(s: GameState): void;
  bumpCrop(id: CropId | 'egg'): void;
  onTab(cb: (tab: Tab) => void): void;
  onExport(cb: () => void): void;
  onImport(cb: (text: string) => void): void;
  onSpeechToggle(cb: (on: boolean) => void): void;
  onSoundToggle(cb: (on: boolean) => void): void;
  /** Shows a short message for `ms` (default 2 s). */
  toast(msg: string, ms?: number): void;
}

export function createLayout(root: HTMLElement, s: GameState): Layout {
  let tabCb: (t: Tab) => void = () => {};
  let tab: Tab = 'field';
  let exportCb: () => void = () => {};
  let importCb: (text: string) => void = () => {};
  let speechCb: (on: boolean) => void = () => {};
  let soundCb: (on: boolean) => void = () => {};

  root.innerHTML = `
    <div class="app">
      <header class="hud">
        <div class="hud-crops"></div>
        <div class="hud-level"></div>
        <button type="button" class="hud-gear" aria-label="設定">⚙️</button>
      </header>
      <main class="stage-wrap">
        <div class="stage"></div>
      </main>
      <section class="panel"></section>
      <section class="ranch" hidden></section>
      <nav class="tabs">
        <button type="button" class="tab active" data-tab="field">🌾 農田</button>
        <button type="button" class="tab" data-tab="ranch">🐄 牧場</button>
      </nav>
      <div class="toast" hidden></div>
      <div class="settings" hidden>
        <div class="settings-card">
          <h2>⚙️ 設定</h2>
          <label class="set-row"><span>🔊 語音</span><input type="checkbox" class="set-speech" /></label>
          <label class="set-row"><span>🔈 音效</span><input type="checkbox" class="set-sound" /></label>
          <button type="button" class="set-btn set-export">💾 匯出存檔</button>
          <label class="set-btn set-import">📂 匯入存檔
            <input type="file" accept=".json,application/json" class="set-file" hidden />
          </label>
          <button type="button" class="set-btn set-credits-btn">📜 素材來源</button>
          <div class="set-credits" hidden>
            農場動物圖：Daniel Eddeland（LPC style farm animals），授權 CC-BY 3.0<br />
            <span class="set-url">https://opengameart.org/content/lpc-style-farm-animals</span>
          </div>
          <button type="button" class="set-btn set-close">關閉</button>
        </div>
      </div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const stage = q<HTMLElement>('.stage');
  const panel = q<HTMLElement>('.panel');
  const ranch = q<HTMLElement>('.ranch');
  const cropsEl = q<HTMLElement>('.hud-crops');
  const levelEl = q<HTMLElement>('.hud-level');
  const toastEl = q<HTMLElement>('.toast');
  const settings = q<HTMLElement>('.settings');
  const speech = q<HTMLInputElement>('.set-speech');
  const sound = q<HTMLInputElement>('.set-sound');
  const credits = q<HTMLElement>('.set-credits');
  const file = q<HTMLInputElement>('.set-file');

  const counts = new Map<CropId | 'egg', HTMLElement>();
  let lastState = s;

  function hudItem(id: CropId | 'egg', emoji: string, value: number): void {
    const item = document.createElement('span');
    item.className = id === 'egg' ? 'hud-crop hud-egg' : 'hud-crop';
    const em = document.createElement('span');
    em.textContent = emoji;
    const n = document.createElement('b');
    n.textContent = String(value);
    n.addEventListener('animationend', () => n.classList.remove('bump'));
    item.append(em, n);
    cropsEl.appendChild(item);
    counts.set(id, n);
  }

  function updateHud(st: GameState): void {
    lastState = st;
    const scrollLeft = cropsEl.scrollLeft; // replaceChildren() would snap the strip back to the start
    cropsEl.replaceChildren();
    counts.clear();
    if (tab === 'ranch') hudItem('egg', '🥚', st.ranch.products.egg);
    for (const r of unlockedRows(st.unlocked)) {
      const c = CROP_BY_ROW[r];
      hudItem(c.id, c.emoji, st.inventory[c.id] ?? 0);
    }
    cropsEl.scrollLeft = scrollLeft;
    const newest = LEVEL_ORDER[st.unlocked - 1];
    levelEl.textContent = newest === 1 ? '教學' : `${newest} 級`;
    speech.checked = st.settings.speech;
    sound.checked = st.settings.sound;
  }

  function bumpCrop(id: CropId | 'egg'): void {
    const n = counts.get(id);
    if (!n) return;
    // The strip scrolls at narrow widths: bring the counter into view first.
    n.parentElement?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
  }

  root.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab as Tab;
      if (next === tab) return;
      tab = next;
      root.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      stage.parentElement!.classList.toggle('show-ranch', tab === 'ranch');
      ranch.hidden = tab !== 'ranch';
      panel.classList.toggle('tab-hidden', tab !== 'field');
      cropsEl.scrollLeft = 0; // the egg counter comes and goes at the front of the strip
      updateHud(lastState);
      tabCb(tab);
    });
  });

  q<HTMLElement>('.hud-gear').addEventListener('click', () => { settings.hidden = false; });
  q<HTMLElement>('.set-close').addEventListener('click', () => { settings.hidden = true; });
  q<HTMLElement>('.set-credits-btn').addEventListener('click', () => { credits.hidden = !credits.hidden; });
  settings.addEventListener('click', e => { if (e.target === settings) settings.hidden = true; });
  speech.addEventListener('change', () => speechCb(speech.checked));
  sound.addEventListener('change', () => soundCb(sound.checked));
  q<HTMLElement>('.set-export').addEventListener('click', () => exportCb());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    // '' fails validation, so read errors and oversized files get the same 「檔案無法讀取」 toast.
    let text = '';
    try {
      if (f.size <= MAX_IMPORT_BYTES) text = await f.text();
    } catch {
      text = '';
    } finally {
      file.value = ''; // allow picking the same file again
    }
    importCb(text);
  });

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(msg: string, ms = 2000): void {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
  }

  updateHud(s);

  return {
    stage, panel, ranch, updateHud, bumpCrop, toast,
    onTab: cb => { tabCb = cb; },
    onExport: cb => { exportCb = cb; },
    onImport: cb => { importCb = cb; },
    onSpeechToggle: cb => { speechCb = cb; },
    onSoundToggle: cb => { soundCb = cb; },
  };
}
