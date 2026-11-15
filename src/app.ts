import Phaser from 'phaser';
import { Game, type AnswerResult, type Question } from './core/game';
import { createNewState } from './core/state';
import { CROP_BY_ROW, unlockedRows } from './core/levels';
import type { Mode } from './core/mastery';
import { exportFileName, loadFrom, parseSave, saveTo, serialize } from './core/save';
import { systemClock, systemRng } from './core/clock';
import { chantText, questionText } from './core/chant';
import { createLayout } from './ui/layout';
import { createPanel } from './ui/panel';
import { formatMs } from './ui/format';
import { FieldScene, VIEW } from './scenes/FieldScene';
import { ASSET_RES } from './scenes/assets';

const WRONG_PAUSE_MS = 2500;
const HINT: Record<Mode, string> = { basic: '點一列開始', challenge: '準備好了就開始！' };

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** localStorage, or null when the browser refuses access (sandbox / privacy settings). */
function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function startApp(root: HTMLElement): void {
  const clock = systemClock;
  const rng = systemRng;

  // Speech seam: Task 9 replaces this no-op with the zh-TW speech module.
  const say = (_text: string): void => {};

  const store = storage();
  let game = new Game((store && loadFrom(store)) ?? createNewState(clock.now()), clock, rng);
  game.resume();

  const layout = createLayout(root, game.state);
  const panel = createPanel(layout.panel);
  const scene = new FieldScene(clock);
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: layout.stage,
    width: VIEW * ASSET_RES,
    height: VIEW * ASSET_RES,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: scene,
  });

  let uiMode: Mode = 'basic';
  /** True while an answer's feedback/animation sequence is playing. */
  let busy = false;
  /** Bumped on round start, exit and import; an in-flight answer sequence stops when it changes. */
  let epoch = 0;
  let saveFailShown = false;

  function save(): void {
    const s = game.state;
    s.lastSeenAt = Math.max(s.lastSeenAt, clock.now());
    try {
      if (!store) throw new Error('no storage');
      saveTo(store, s);
    } catch {
      if (!saveFailShown) {
        saveFailShown = true;
        layout.toast('存檔失敗');
      }
    }
  }

  function showIdle(hint: string = HINT[uiMode]): void {
    scene.highlight(null);
    panel.showIdle(uiMode, hint);
  }

  /** Shows the current question, or returns to idle when no round is active. */
  function showCurrent(): void {
    const q = game.mode !== null ? game.current : null;
    if (!q) {
      showIdle();
      return;
    }
    panel.showQuestion(q, game.progress());
    scene.highlight(q);
    say(questionText(q.a, q.b));
  }

  function beginRound(q: Question | null): boolean {
    if (!q) return false;
    epoch++;
    showCurrent();
    return true;
  }

  function onCellTap(a: number, _b: number): void {
    if (busy || game.mode !== null || uiMode !== 'basic') return;
    if (!unlockedRows(game.state.unlocked).includes(a)) {
      layout.toast('先完成前一級喔');
      return;
    }
    if (!beginRound(game.startBasic(a))) {
      layout.toast(`作物還在長大（${formatMs(game.msUntilNextRipe(a))}）`);
    }
  }

  async function onAnswer(value: number): Promise<void> {
    if (busy || game.mode === null) {
      panel.numpad.setLocked(false);
      return;
    }
    const r: AnswerResult | null = game.answer(value);
    if (!r) {
      panel.numpad.setLocked(false);
      return;
    }
    busy = true;
    const my = epoch;
    save();

    if (r.kind === 'correct') {
      const product = r.q.a * r.q.b;
      panel.showCorrect(r.q, product);
      say(chantText(r.q.a, r.q.b));
      await scene.playHarvest(r);
      if (my !== epoch) return;
      layout.updateHud(game.state);
      layout.bumpCrop(r.crop);
      if (r.unlockedRow !== null) {
        say('解鎖了！');
        layout.toast(`🎉 解鎖了！${CROP_BY_ROW[r.unlockedRow].emoji} ${CROP_BY_ROW[r.unlockedRow].name}`);
        await scene.playUnlock(r.unlockedRow);
        if (my !== epoch) return;
      }
    } else {
      panel.showWrong(r.q, r.correctAnswer);
      say('是' + chantText(r.q.a, r.q.b));
      await Promise.all([scene.playWrong(r.q), delay(WRONG_PAUSE_MS)]);
      if (my !== epoch) return;
    }

    busy = false;
    scene.render(game);
    if (game.mode === null) {
      const { total } = game.progress();
      showIdle(total > 0 ? `🎉 完成 ${total} 題！` : HINT[uiMode]);
    } else {
      showCurrent();
    }
  }

  function exitRound(): void {
    if (game.mode === null && !busy) return;
    game.endRound();
    epoch++;
    busy = false;
    scene.render(game);
    layout.updateHud(game.state);
    showIdle();
  }

  scene.setHandlers({ onCellTap });
  scene.render(game);

  panel.onSubmit(n => { void onAnswer(n); });
  panel.onExit(exitRound);
  panel.onModeChange(m => {
    if (busy || game.mode !== null) return;
    uiMode = m;
    showIdle();
  });
  panel.onStartChallenge(() => {
    if (busy || game.mode !== null) return;
    if (!beginRound(game.startChallenge())) layout.toast('作物還在長大');
  });

  layout.onSpeechToggle(on => {
    game.state.settings.speech = on;
    save();
  });

  layout.onExport(() => {
    save();
    const blob = new Blob([serialize(game.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(new Date(clock.now()));
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  layout.onImport(text => {
    const r = parseSave(text);
    if (!r.ok) {
      layout.toast('檔案無法讀取');
      return;
    }
    if (game.mode !== null) game.endRound();
    epoch++;
    busy = false;
    game = new Game(r.state, clock, rng);
    game.resume();
    save();
    scene.render(game);
    layout.updateHud(game.state);
    showIdle();
    layout.toast('✅ 已匯入存檔');
  });

  // Keep the canvas fitted: the stage shrinks when the question panel opens.
  // refresh() alone reuses the cached parent size, so re-read it first.
  const refit = () => {
    phaser.scale.getParentBounds();
    phaser.scale.refresh();
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(layout.stage);
  layout.onTab(tab => {
    if (tab === 'field') requestAnimationFrame(refit);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      save();
    } else {
      game.resume();
      save();
      scene.render(game);
    }
  });
  window.addEventListener('pagehide', save);

  save();
  showIdle();
}
