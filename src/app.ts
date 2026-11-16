import Phaser from 'phaser';
import { Game, type AnswerResult, type Question } from './core/game';
import { createNewState } from './core/state';
import { CROP_BY_ROW, unlockedRows } from './core/levels';
import { nextPracticeRow } from './core/practice';
import type { Mode } from './core/mastery';
import { exportFileName, loadFrom, parseSave, saveTo, serialize, type LoadResult } from './core/save';
import { systemClock, systemRng } from './core/clock';
import { chantText, questionText, toChineseNumber } from './core/chant';
import { createLayout, type Tab } from './ui/layout';
import { createSpeech } from './ui/speech';
import { createPanel } from './ui/panel';
import { countTiming } from './ui/timing';
import { FieldScene, VIEW } from './scenes/FieldScene';
import { RanchScene, type RanchView } from './scenes/RanchScene';
import { ASSET_RES } from './scenes/assets';
import {
  brush, cleanPoop, collect, feed, giveMedicine, giveTreat, pet, settle, type CareResult,
} from './core/ranch';
import { buy, isLocked, lockHint, nextName } from './core/shop';
import { HOUSE_KINDS, SPECIES, SPECIES_ORDER, type HouseKind } from './core/species';
import { createSfx, voiceOf } from './ui/sfx';
import { createRanchUi, type Tool } from './ui/ranchUi';
import { careFeedback } from './ui/ranchFeedback';

/** Caps on waiting for speech before moving on (zh-TW chants measure about 1.9-2.3 s). */
const CHANT_WAIT_MS = 3000;
const WRONG_CHANT_WAIT_MS = 3500;
/** After a wrong answer's row count, the counted block stays on screen at least this long. */
const WRONG_HOLD_MS = 1500;
/** Exported blob URLs stay valid long enough for slow mobile download sheets. */
const EXPORT_URL_TTL_MS = 40_000;
const HINT: Record<Mode, string> = { basic: '點一列開始', challenge: '準備好了就開始！' };
/** The ranch is settled and redrawn this often while its tab is on screen. */
const RANCH_TICK_MS = 1000;
/** A scene still booting/loading can't be slept or woken yet: look again after this long. */
const SCENE_RETRY_MS = 100;

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
  const sfx = createSfx(() => {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  }, game.state.settings.sound);
  // Browsers only allow speech after a user gesture. A touch pointerdown is not a user
  // activation on iOS, so unlock on pointerup / touchend / click, and keep trying on later
  // gestures until an utterance has actually started. Sound effects resume their AudioContext on
  // the same gestures (synchronously, while the gesture still counts as a user activation).
  const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click'] as const;
  const tryUnlock = (): void => {
    sfx.unlock();
    void speech.unlock().then(done => {
      if (done) UNLOCK_EVENTS.forEach(t => document.removeEventListener(t, tryUnlock, true));
    });
  };
  UNLOCK_EVENTS.forEach(t => document.addEventListener(t, tryUnlock, { capture: true, passive: true }));
  // The AudioContext can be suspended again later (iOS after backgrounding, screen lock, a call),
  // long after the listeners above are gone: every gesture resumes it. unlock() does nothing
  // while the context is running or sound is off.
  const resumeSfx = (): void => sfx.unlock();
  (['pointerup', 'touchend'] as const).forEach(t => document.addEventListener(t, resumeSfx, { capture: true, passive: true }));
  // Ask the browser not to evict our save data; ignore the outcome.
  try { void navigator.storage?.persist?.()?.catch(() => {}); } catch { /* ignore */ }

  const layout = createLayout(root, game.state);
  const panel = createPanel(layout.panel);
  const scene = new FieldScene();
  const ranchScene = new RanchScene();
  const ranchUi = createRanchUi(layout.ranch);
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
    scene: [scene, ranchScene],
  });

  let uiMode: Mode = 'basic';
  /** True while an answer's feedback/animation sequence is playing. */
  let busy = false;
  /** Bumped on round start, exit and import; an in-flight answer sequence stops when it changes. */
  let epoch = 0;
  let saveFailShown = false;
  let tab: Tab = 'field';
  let tool: Tool = 'hand';

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

  /** Glow the row to practise next on the idle basic map; none in challenge mode or during a round. */
  function syncGlow(): void {
    scene.setGlowRow(uiMode === 'basic' && game.mode === null ? nextPracticeRow(game.state) : null);
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
      syncGlow();
      scene.render(game);
      showIdle();
      return;
    }
    const my = epoch;
    panel.showQuestion(q, game.progress());
    await scene.plant(q);
    if (my !== epoch || busy || game.current !== q || tab !== 'field') return;
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
        // Count the block column by column ("b groups of a"): 「五、十、十五、二十」, then 「是五四二十」. sayAndWait restarts its
        // timeout when the voice starts, so race it against a hard per-step cap as well: the whole
        // count must stay under COUNT_MAX_MS even with a slow speech engine.
        const t = countTiming(r.q.b);
        await scene.playCount(r.q, async (_step, total) => {
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
      syncGlow();
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
    syncGlow();
    scene.render(game);
    layout.updateHud(game.state);
    showIdle();
  }

  scene.setHandlers({ onCellTap });
  syncGlow();
  scene.render(game);

  panel.onSubmit(n => { void onAnswer(n); });
  panel.onExit(exitRound);
  panel.onModeChange(m => {
    if (busy || game.mode !== null) return;
    uiMode = m;
    syncGlow();
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
    sfx.setEnabled(game.state.settings.sound);
    settle(game.state.ranch, clock.now());
    save();
    syncGlow();
    scene.render(game);
    renderRanch();
    ranchUi.update(game.state);
    layout.updateHud(game.state);
    showIdle();
    // The file's ranch was unreadable: the field progress came in, the ranch starts over.
    layout.toast(r.ranchReset ? '✅ 已匯入存檔（牧場重新開始）' : '✅ 已匯入存檔');
  });

  // Keep the canvas fitted: the stage shrinks when the question panel opens.
  // refresh() alone reuses the cached parent size, so re-read it first.
  const refit = () => {
    phaser.scale.getParentBounds();
    phaser.scale.refresh();
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(layout.stage);
  // ---------------------------------------------------------------- tabs and the ranch

  let sceneRetry: ReturnType<typeof setTimeout> | undefined;

  /**
   * Runs the current tab's scene and sleeps the other. A scene that is still booting or loading
   * cannot be slept or woken yet, so look again shortly until both are settled.
   */
  function applyScenes(): void {
    clearTimeout(sceneRetry);
    sceneRetry = undefined;
    const S = Phaser.Scenes;
    let retry = false;
    for (const key of ['field', 'ranch'] as const) {
      const sys = phaser.scene.getScene(key)?.sys;
      if (!sys || sys.isTransitioning()) {
        retry = true;
        continue;
      }
      const st = sys.settings.status;
      if (key === tab) {
        if (st === S.SLEEPING) phaser.scene.wake(key);
        else if (st === S.PAUSED) phaser.scene.resume(key);
        else if (st <= S.INIT || st === S.SHUTDOWN) {
          phaser.scene.start(key); // first visit (booted but never started)
          retry = true;
        } else if (st < S.RUNNING) retry = true; // loading or creating
      } else if (st === S.RUNNING || st === S.PAUSED) {
        phaser.scene.sleep(key);
      } else if (st > S.INIT && st < S.RUNNING) {
        retry = true; // still starting: sleep it once it is up
      }
    }
    if (retry) sceneRetry = setTimeout(applyScenes, SCENE_RETRY_MS);
  }

  /** Which empty lots are locked (and by which crop) for the ranch scene. */
  function ranchView(): RanchView {
    const locked = {} as Record<HouseKind, boolean>;
    const lockCrop: Partial<Record<HouseKind, string>> = {};
    for (const kind of HOUSE_KINDS) {
      locked[kind] = isLocked(game.state, kind);
      const hint = locked[kind] ? lockHint(game.state, kind) : null;
      if (hint) lockCrop[kind] = CROP_BY_ROW[hint.row].emoji;
    }
    return { locked, lockCrop };
  }

  function renderRanch(): void {
    ranchScene.render(game.state.ranch, ranchView());
  }

  let ranchTick: ReturnType<typeof setInterval> | undefined;

  function tickRanch(): void {
    settle(game.state.ranch, clock.now());
    renderRanch();
  }

  /** Settles and redraws every second, only while the ranch is actually on screen. */
  function syncRanchTick(): void {
    if (tab === 'ranch' && document.visibilityState === 'visible') {
      if (ranchTick === undefined) {
        tickRanch();
        ranchTick = setInterval(tickRanch, RANCH_TICK_MS);
      }
    } else if (ranchTick !== undefined) {
      clearInterval(ranchTick);
      ranchTick = undefined;
    }
  }

  /** After any ranch action or purchase: redraw, refresh the toolbar and shop, and save. */
  function ranchChanged(): void {
    renderRanch();
    ranchUi.update(game.state);
    save();
  }

  /** With ✋ eggs and poop under a chicken win the tap; with a care tool the chicken does. */
  function selectTool(t: Tool): void {
    tool = t;
    ranchUi.setTool(t);
    ranchScene.setTapPriority(t === 'hand' ? 'items' : 'animals');
  }

  function onAnimal(id: string): void {
    const r = game.state.ranch;
    const now = clock.now();
    const used = tool;
    let res: CareResult;
    switch (used) {
      case 'hand': res = pet(r, id, now); break;
      case 'feed': res = feed(r, id, now); break;
      case 'brush': res = brush(r, id, now); break;
      case 'treat': res = giveTreat(r, id, now); break;
      case 'medicine': res = giveMedicine(r, id, now); break;
    }
    ranchChanged();
    const fb = careFeedback(used, res, r.animals.find(a => a.id === id)?.sick ?? false);
    ranchScene.fx(id, fb.fx);
    if (fb.sound) sfx.play(fb.sound);
    if (fb.toast) layout.toast(fb.toast);
    if (fb.shop) ranchUi.openShop(fb.shop); // ran out mid-use (the button is grey now)
    if (fb.nextTool) selectTool(fb.nextTool); // after medicine the pat heals: hand over the ✋
  }

  function onPoop(houseId: string): void {
    settle(game.state.ranch, clock.now()); // cleanPoop does not settle by itself
    const res = cleanPoop(game.state.ranch, houseId);
    ranchChanged();
    sfx.play(res.ok ? 'sweep' : 'nope');
  }

  function onEgg(animalId: string): void {
    const r = game.state.ranch;
    settle(r, clock.now());
    const n = collect(r, animalId);
    if (n <= 0) {
      ranchChanged();
      sfx.play('nope'); // the egg store is full (999)
      return;
    }
    // flyFrom hides each egg it launches; render right after so the scene drops exactly those.
    const flights: Promise<void>[] = [];
    for (let i = 0; i < n; i++) flights.push(ranchScene.flyFrom(animalId, '🥚'));
    ranchChanged();
    sfx.play('collect');
    void Promise.all(flights).then(() => {
      layout.updateHud(game.state);
      layout.bumpCrop('egg');
    });
  }

  ranchScene.setHandlers({
    onAnimal,
    onPoop,
    onEgg,
    onLot: lot => ranchUi.openShop(SPECIES[SPECIES_ORDER[lot]].house),
    // Task 5: page dots/arrows, the overview button and the 🔒 hint toast build on these.
    onLockedLot: () => sfx.play('nope'),
    onPageTap: i => ranchScene.showPage(i),
    onSwipe: d => ranchScene.showPage(ranchScene.page + d),
    onTag: id => {
      nextName(game.state.ranch, id); // the scene pops the tag when the name changes
      ranchChanged();
      sfx.play('cluck');
    },
    onIdleVoice: id => {
      // The scene only runs on the ranch tab; the guard also covers a hidden page.
      const a = game.state.ranch.animals.find(x => x.id === id);
      if (a && tab === 'ranch' && document.visibilityState === 'visible') sfx.ambient(voiceOf(a.species));
    },
  });
  renderRanch();
  ranchUi.update(game.state);
  ranchUi.onTool(selectTool);
  ranchUi.onBuy(item => {
    const res = buy(game.state, item, clock.now(), rng);
    ranchChanged();
    if (!res.ok) {
      sfx.play('nope');
      return;
    }
    sfx.play('buy');
    ranchUi.celebrate(item);
    layout.updateHud(game.state);
    if (item === 'coop') {
      ranchUi.openShop('chicken'); // next step: a chicken to live in it
    } else if (item === 'chicken') {
      ranchUi.closeShop(); // let the child watch the new chicken arrive
      if (res.animalId) ranchScene.fx(res.animalId, 'jump');
    } else {
      selectTool(item); // just bought supplies: ready to use them
    }
  });

  layout.onSoundToggle(on => {
    game.state.settings.sound = on;
    sfx.setEnabled(on);
    if (on) {
      sfx.unlock(); // no context exists while sound is off; this tap is the gesture that allows one
      sfx.play('cluck');
    }
    save();
  });

  layout.onTab(t => {
    tab = t;
    applyScenes();
    requestAnimationFrame(refit);
    if (t === 'ranch') {
      settle(game.state.ranch, clock.now());
      renderRanch();
      ranchUi.update(game.state);
    } else {
      ranchUi.closeShop();
      // A question planted while the ranch was open was not spoken: say it now.
      const q = game.mode !== null ? game.current : null;
      if (q && !busy) say(questionText(q.a, q.b));
    }
    syncRanchTick();
    save();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else sfx.unlock(); // may be refused without a gesture; the next tap's resumeSfx retries
    syncRanchTick();
  });
  window.addEventListener('pagehide', save);

  save();
  showIdle();
  if (readOnly) layout.toast('請重新整理頁面', 6000); // shown at boot: keep it up long enough to be seen
}
