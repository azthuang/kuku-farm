import { CROP_BY_ROW, LEVEL_ORDER, unlockedRows, type CropId } from '../core/levels';
import type { GameState } from '../core/state';
import { PRODUCT_EMOJI, SPECIES, SPECIES_ORDER, type ProductId } from '../core/species';

/** Save files are a few KB; anything this large is not ours. */
const MAX_IMPORT_BYTES = 1024 * 1024;

export type Tab = 'field' | 'ranch';

export interface Layout {
  stage: HTMLElement;
  panel: HTMLElement;
  /** The ranch toolbar slot (shown instead of the panel on the ranch tab). */
  ranch: HTMLElement;
  /** Ranch page navigation over the stage (title, 🗺️, ◀ ▶, dots); shown on the ranch tab. */
  ranchNav: HTMLElement;
  /** Redraws the HUD; on the ranch tab it leads with the products the child has (or can get). */
  updateHud(s: GameState): void;
  bumpCrop(id: CropId | ProductId): void;
  onTab(cb: (tab: Tab) => void): void;
  /** Switches tab as if its button was pressed (fires onTab when it changes). */
  setTab(t: Tab): void;
  onExport(cb: () => void): void;
  /** The picked file's text ('' when unreadable) and its name. */
  onImport(cb: (text: string, fileName: string) => void): void;
  /** Shows the undo-import button with this label; null hides it. */
  setUndo(label: string | null): void;
  onUndo(cb: () => void): void;
  onSpeechToggle(cb: (on: boolean) => void): void;
  onSoundToggle(cb: (on: boolean) => void): void;
  /** The 🏖️ 牧場放假 switch in the settings (it shows `state.ranch.paused`). */
  onHolidayToggle(cb: (on: boolean) => void): void;
  /** The settings slot for the 「👥 玩家」 list (filled by the profile UI). */
  players: HTMLElement;
  /** Shows the player badge at the top left; null hides it (no players without storage). */
  setPlayer(p: { name: string; icon: string } | null): void;
  onPlayerTap(cb: () => void): void;
  closeSettings(): void;
  /** Shows a short message for `ms` (default 2 s). */
  toast(msg: string, ms?: number): void;
}

export function createLayout(root: HTMLElement, s: GameState): Layout {
  let tabCb: (t: Tab) => void = () => {};
  let tab: Tab = 'field';
  let exportCb: () => void = () => {};
  let importCb: (text: string, fileName: string) => void = () => {};
  let undoCb: () => void = () => {};
  let speechCb: (on: boolean) => void = () => {};
  let soundCb: (on: boolean) => void = () => {};
  let holidayCb: (on: boolean) => void = () => {};
  let playerCb: () => void = () => {};

  root.innerHTML = `
    <div class="app">
      <header class="hud">
        <button type="button" class="hud-player" aria-label="換玩家" hidden><span class="hud-player-icon"></span><span class="hud-player-name"></span></button>
        <div class="hud-crops"></div>
        <div class="hud-level"></div>
        <button type="button" class="hud-gear" aria-label="設定">⚙️</button>
      </header>
      <main class="stage-wrap">
        <div class="stage"></div>
        <div class="ranch-nav" hidden></div>
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
          <label class="set-row"><span>🏖️ 牧場放假</span><input type="checkbox" class="set-holiday" /></label>
          <p class="set-hint">出遠門時打開：動物不會餓、不會大便，也不會生產。回來記得關掉。</p>
          <div class="set-players"></div>
          <button type="button" class="set-btn set-export">💾 匯出存檔</button>
          <label class="set-btn set-import">📂 匯入存檔
            <input type="file" accept=".json,application/json" class="set-file" hidden />
          </label>
          <button type="button" class="set-btn set-undo" hidden></button>
          <button type="button" class="set-btn set-credits-btn">📜 素材來源</button>
          <div class="set-credits" hidden>
            <h3>🎮 遊戲設計與製作</h3>
            <p>Azt</p>
            <h3>🐔 農場動物</h3>
            <p>LPC style farm animals：Daniel Eddeland（CC-BY 3.0）
              <span class="set-url">opengameart.org/content/lpc-style-farm-animals</span></p>
            <h3>🌳 牧場景觀與花圃、樹叢、小樹、大香菇、池塘</h3>
            <p>[LPC] Terrains、[LPC] Trees、[LPC] Flowers / Plants / Fungi / Wood、[LPC] Thatched-roof Cottage：bluecarrot16、Lanea Zimmerman (Sharm) 等多位作者（CC-BY-SA 3.0）
              <span class="set-url">opengameart.org/content/lpc-terrains</span>
              <span class="set-url">opengameart.org/content/lpc-trees</span>
              <span class="set-url">opengameart.org/content/lpc-flowers-plants-fungi-wood</span>
              <span class="set-url">opengameart.org/content/lpc-thatched-roof-cottage</span></p>
            <p>本遊戲由這些素材裁切、拼合的圖，同樣以 CC-BY-SA 3.0 釋出。</p>
            <h3>💧 水車</h3>
            <p>[LPC] Farm：bluecarrot16、Wolthera van Hövell tot Westerflier (TheraHedwig)、Ivan Voirol（CC-BY 4.0）
              <span class="set-url">opengameart.org/content/lpc-farm</span></p>
            <h3>🐶 狗、貓、稻草人、水井、南瓜堆、白鴿、錦鯉、兔子與驚喜物件</h3>
            <p>以 Google Antigravity 生成。</p>
            <h3>🌾 作物與小圖示</h3>
            <p>裝置內建的 emoji 與程式繪製的圖形。</p>
            <p class="set-note">每個素材包的完整作者名單見
              <span class="set-url">github.com/azthuang/kuku-farm/blob/main/CREDITS.md</span></p>
          </div>
          <button type="button" class="set-btn set-close">關閉</button>
          <p class="set-author">九九農場 · 作者 Azt</p>
        </div>
      </div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const stage = q<HTMLElement>('.stage');
  const panel = q<HTMLElement>('.panel');
  const ranch = q<HTMLElement>('.ranch');
  const ranchNav = q<HTMLElement>('.ranch-nav');
  const cropsEl = q<HTMLElement>('.hud-crops');
  const levelEl = q<HTMLElement>('.hud-level');
  const toastEl = q<HTMLElement>('.toast');
  const settings = q<HTMLElement>('.settings');
  const speech = q<HTMLInputElement>('.set-speech');
  const sound = q<HTMLInputElement>('.set-sound');
  const holiday = q<HTMLInputElement>('.set-holiday');
  const credits = q<HTMLElement>('.set-credits');
  const file = q<HTMLInputElement>('.set-file');
  const players = q<HTMLElement>('.set-players');
  const undo = q<HTMLButtonElement>('.set-undo');
  undo.addEventListener('click', () => undoCb());
  const playerBtn = q<HTMLButtonElement>('.hud-player');

  const counts = new Map<CropId | ProductId, HTMLElement>();
  let lastState = s;

  function hudItem(id: CropId | ProductId, emoji: string, value: number, product = false): void {
    const item = document.createElement('span');
    item.className = product ? `hud-crop hud-product hud-${id}` : 'hud-crop';
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
    if (tab === 'ranch') {
      // Products the child has, or can get (an animal of that species lives on the ranch).
      for (const sp of SPECIES_ORDER) {
        const p = SPECIES[sp].product;
        const n = st.ranch.products[p];
        if (n > 0 || st.ranch.animals.some(a => a.species === sp)) hudItem(p, PRODUCT_EMOJI[p], n, true);
      }
    }
    for (const r of unlockedRows(st.unlocked)) {
      const c = CROP_BY_ROW[r];
      hudItem(c.id, c.emoji, st.inventory[c.id] ?? 0);
    }
    cropsEl.scrollLeft = scrollLeft;
    const newest = LEVEL_ORDER[st.unlocked - 1];
    levelEl.textContent = newest === 1 ? '教學' : `${newest} 級`;
    speech.checked = st.settings.speech;
    sound.checked = st.settings.sound;
    holiday.checked = st.ranch.paused === true;
  }

  function bumpCrop(id: CropId | ProductId): void {
    const n = counts.get(id);
    if (!n) return;
    // The strip scrolls at narrow widths: bring the counter into view first.
    n.parentElement?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
  }

  function selectTab(next: Tab): void {
    if (next === tab) return;
    tab = next;
    root.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    stage.parentElement!.classList.toggle('show-ranch', tab === 'ranch');
    ranch.hidden = tab !== 'ranch';
    ranchNav.hidden = tab !== 'ranch';
    panel.classList.toggle('tab-hidden', tab !== 'field');
    cropsEl.scrollLeft = 0; // the product counters come and go at the front of the strip
    updateHud(lastState);
    tabCb(tab);
  }

  root.querySelectorAll<HTMLButtonElement>('.tab').forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab as Tab));
  });

  q<HTMLElement>('.hud-gear').addEventListener('click', () => { settings.hidden = false; });
  q<HTMLElement>('.set-close').addEventListener('click', () => { settings.hidden = true; });
  q<HTMLElement>('.set-credits-btn').addEventListener('click', () => { credits.hidden = !credits.hidden; });
  settings.addEventListener('click', e => { if (e.target === settings) settings.hidden = true; });
  playerBtn.addEventListener('click', () => playerCb());
  speech.addEventListener('change', () => speechCb(speech.checked));
  sound.addEventListener('change', () => soundCb(sound.checked));
  holiday.addEventListener('change', () => holidayCb(holiday.checked));
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
    importCb(text, f.name);
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
    stage, panel, ranch, ranchNav, updateHud, bumpCrop, toast, players,
    setPlayer(p) {
      playerBtn.hidden = p === null;
      q<HTMLElement>('.hud-player-icon').textContent = p ? p.icon : '';
      q<HTMLElement>('.hud-player-name').textContent = p ? p.name : '';
      playerBtn.setAttribute('aria-label', p ? `換玩家（現在是${p.name}）` : '換玩家');
    },
    onPlayerTap: cb => { playerCb = cb; },
    closeSettings: () => { settings.hidden = true; },
    onTab: cb => { tabCb = cb; },
    setTab: selectTab,
    onExport: cb => { exportCb = cb; },
    onImport: cb => { importCb = cb; },
    setUndo(label) {
      undo.hidden = label === null;
      undo.textContent = label ?? '';
    },
    onUndo: cb => { undoCb = cb; },
    onSpeechToggle: cb => { speechCb = cb; },
    onSoundToggle: cb => { soundCb = cb; },
    onHolidayToggle: cb => { holidayCb = cb; },
  };
}
