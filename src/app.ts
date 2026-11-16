import Phaser from 'phaser';
import { Game, type AnswerResult, type Question } from './core/game';
import { createNewState } from './core/state';
import { CROP_BY_ROW, unlockedRows } from './core/levels';
import type { Mode } from './core/mastery';
import { exportFileName, loadFrom, parseSave, saveTo, serialize, type LoadResult } from './core/save';
import { systemClock, systemRng } from './core/clock';
import { chantText, questionText, toChineseNumber } from './core/chant';
import { createLayout } from './ui/layout';
import { createSpeech } from './ui/speech';
import { createPanel } from './ui/panel';
import { countRowTiming } from './ui/timing';
import { FieldScene, VIEW } from './scenes/FieldScene';
import { ASSET_RES } from './scenes/assets';

/** Caps on waiting for speech before moving on (zh-TW chants measure about 1.9-2.3 s). */
const CHANT_WAIT_MS = 3000;
const WRONG_CHANT_WAIT_MS = 3500;
/** After a wrong answer's row count, the counted block stays on screen at least this long. */
const WRONG_HOLD_MS = 1500;
/** Exported blob URLs stay valid long enough for slow mobile download sheets. */
const EXPORT_URL_TTL_MS = 40_000;
const HINT: Record<Mode, string> = { basic: '點一列開始', challenge: '準備好了就開始！' };

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** localStorage, or null when the browser refuses access (sandbox / privacy settings). */
function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function startApp(root: HTMLElement): void {
  const clock = systemClock;
  const rng = systemRng;

  const store = storage();
  const loaded: LoadResult = store ? loadFrom(store) : { kind: 'empty' };
  /** A newer version's save is in storage: play on a fresh state but never overwrite it. */
  let readOnly = loaded.kind === 'newer';
  let game = new Game(loaded.kind === 'ok' ? loaded.state : createNewState(clock.now()), clock, rng);

  const speech = createSpeech(
    typeof window !== 'undefined' ? window.speechSynthesis : undefined,
    game.state.settings.speech,
  );
  const say = (text: string): void => speech.say(text);
  // Browsers only allow speech after a user gesture. A touch pointerdown is not a user
  // activation on iOS, so unlock on pointerup / touchend / click, and keep trying on later
  // gestures until an utterance has actually started.
  const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click'] as const;
  const tryUnlock = (): void => {
    void speech.unlock().then(done => {
      if (done) UNLOCK_EVENTS.forEach(t => document.removeEventListener(t, tryUnlock, true));
    });
  };
  UNLOCK_EVENTS.forEach(t => document.addEventListener(t, tryUnlock, { capture: true, passive: true }));
  // Ask the browser not to evict our save data; ignore the outcome.
  try { void navigator.storage?.persist?.()?.catch(() => {}); } catch { /* ignore */ }

  const layout = createLayout(root, game.state);
  const panel = createPanel(layout.panel);
  const scene = new FieldScene();
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
    if (readOnly) return;
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
    panel.showIdle(uiMode, hint);
  }

  /**
   * Shows the current question: the block grows, then the question is spoken. The numpad stays
   * open while the crops pop up; if an answer comes in first, the question is not spoken.
   */
  async function showCurrent(): Promise<void> {
    const q = game.mode !== null ? game.current : null;
    if (!q) {
      scene.render(game);
      showIdle();
      return;
    }
    const my = epoch;
    panel.showQuestion(q, game.progress());
    await scene.plant(q);
    if (my !== epoch || busy || game.current !== q) return;
    say(questionText(q.a, q.b));
  }

  function beginRound(q: Question | null): void {
    if (!q) return;
    epoch++;
    void showCurrent();
  }

  function onCellTap(a: number, _b: number): void {
    if (busy || game.mode !== null || uiMode !== 'basic') return;
    if (!unlockedRows(game.state.unlocked).includes(a)) {
      layout.toast('先完成前一級喔');
      return;
    }
    beginRound(game.startBasic(a));
  }

  async function onAnswer(value: number): Promise<void> {
    if (busy) return; // feedback is showing; the next showQuestion unlocks the numpad
    if (game.mode === null) {
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
    try {
      save();
      if (r.kind === 'correct') {
        const product = r.q.a * r.q.b;
        panel.showCorrect(r.q, product);
        // Let the chant finish before the next question's say() cancels it, but bump the HUD as
        // soon as the crop lands. Same end time as Promise.all([playHarvest, chant]).
        const chantDone = speech.sayAndWait(chantText(r.q.a, r.q.b), CHANT_WAIT_MS);
        await scene.playHarvest(r);
        if (my !== epoch) return;
        layout.updateHud(game.state);
        if (r.amount > 0) layout.bumpCrop(r.crop);
        await chantDone;
        if (my !== epoch) return;
        if (r.unlockedRow !== null) {
          const { emoji, name } = CROP_BY_ROW[r.unlockedRow];
          layout.toast(`🎉 解鎖了！新作物 ${emoji} ${name}`);
          await Promise.all([
            scene.playUnlock(r.unlockedRow),
            speech.sayAndWait('解鎖了！', CHANT_WAIT_MS),
          ]);
          if (my !== epoch) return;
        }
      } else {
        // Spec 3.5: count first, then show the answer. The panel stays neutral meanwhile.
        panel.showCounting(r.q);
        // Count the block row by row: 「四、八」, then 「是二四得八」. sayAndWait restarts its
        // timeout when the voice starts, so race it against a hard per-row cap as well: the whole
        // count must stay under COUNT_MAX_MS even with a slow speech engine.
        const t = countRowTiming(r.q.a);
        await scene.playCount(r.q, async (_row, total) => {
          if (my !== epoch) return;
          const spoken = speech.sayAndWait(toChineseNumber(total), t.speechMaxMs);
          await Promise.all([Promise.race([spoken, delay(t.speechMaxMs)]), delay(t.minMs)]);
        });
        if (my !== epoch) return;
        panel.showWrong(r.q, r.correctAnswer);
        await Promise.all([
          speech.sayAndWait('是' + chantText(r.q.a, r.q.b), WRONG_CHANT_WAIT_MS),
          delay(WRONG_HOLD_MS),
        ]);
        if (my !== epoch) return;
      }
    } catch (e) {
      console.error(e); // fall through and restore the UI below
    } finally {
      // Exit/import reset busy themselves and bump the epoch; don't clobber a newer round.
      if (my === epoch) busy = false;
    }
    if (my !== epoch) return;

    if (game.mode === null) {
      scene.render(game);
      const { total } = game.progress();
      showIdle(total > 0 ? `🎉 完成 ${total} 題！` : HINT[uiMode]);
    } else {
      void showCurrent();
    }
  }

  function exitRound(): void {
    if (game.mode === null && !busy) return;
    game.endRound();
    epoch++;
    busy = false;
    speech.cancel();
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
    beginRound(game.startChallenge());
  });

  layout.onSpeechToggle(on => {
    game.state.settings.speech = on;
    speech.setEnabled(on);
    save();
  });

  layout.onExport(() => {
    if (readOnly) {
      layout.toast('請重新整理頁面'); // in-memory state is blank: don't export it over the real save
      return;
    }
    save();
    const blob = new Blob([serialize(game.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(new Date(clock.now()));
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), EXPORT_URL_TTL_MS);
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
    speech.cancel();
    game = new Game(r.state, clock, rng);
    readOnly = false; // importing is an explicit choice to use this progress: saving resumes
    speech.setEnabled(game.state.settings.speech);
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
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);

  save();
  showIdle();
  if (readOnly) layout.toast('請重新整理頁面', 6000); // shown at boot: keep it up long enough to be seen
}
