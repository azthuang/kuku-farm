import Phaser from 'phaser';
import type { AnswerResult, Game, Question } from '../core/game';
import { isRipe, msUntilRipe } from '../core/field';
import { CROP_BY_ROW, LEVEL_ORDER, unlockedRows } from '../core/levels';
import { starsOf } from '../core/mastery';
import { cellKey } from '../core/state';
import { systemClock, type Clock } from '../core/clock';
import { formatMs } from '../ui/format';
import { ASSETS, ASSET_RES, makePlaceholderTextures } from './assets';

/** Logical size of the field. The canvas backing store is VIEW * ASSET_RES for crisp art. */
export const VIEW = 600;

const CELL = 60;
const GRID_X = 56;
const GRID_Y = 56;
const INV = 1 / ASSET_RES;
const CROP_SCALE = INV * 0.86;
const SPROUT_SCALE = INV * 0.85;
const BASE_DY = 12;       // crop pivot (its base) below the cell centre
const CROP_DY = -19;      // crop image centre above its pivot
const SPROUT_DY = -15;
const BOTTOM_DY = 19;     // stars / countdown line below the cell centre
const GOLD = 0xffc83d;
const FAINT = 0xfff3d6;
const FONT = '"Arial Rounded MT Bold","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';

type Img = Phaser.GameObjects.Image;
type View = 'locked' | 'ripe' | 'growing';

interface Cell {
  a: number;
  b: number;
  x: number;
  y: number;
  baseY: number;
  plot: Img;
  wrap: Phaser.GameObjects.Container;
  crop: Img;
  stars: Img[];
  timer: Phaser.GameObjects.Text;
  view: View | null;
  timerText: string;
  starCount: number;
  busy: number;
  phase: number;
}

interface RowDeco { label: Phaser.GameObjects.Text; lock: Img }

function textStyle(size: number, color: string, stroke: string, strokeThickness: number): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness, resolution: ASSET_RES };
}

export class FieldScene extends Phaser.Scene {
  private clock: Clock;
  private model: Game | null = null;
  private handlers: { onCellTap(a: number, b: number): void } = { onCellTap: () => {} };
  private built = false;
  private cells: Cell[][] = [];
  private rows: RowDeco[] = [];
  /** Rows the scene shows as unlocked; changed only by render() and playUnlock(). */
  private revealed = new Set<number>();
  private hl!: Phaser.GameObjects.Container;
  private hlTween!: Phaser.Tweens.Tween;
  private hlCell: Cell | null = null;
  private pendingHighlight: Question | null = null;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(clock: Clock = systemClock) {
    super({ key: 'field' });
    this.clock = clock;
  }

  setHandlers(h: { onCellTap(a: number, b: number): void }): void {
    this.handlers = h;
  }

  create(): void {
    makePlaceholderTextures(this);
    const cam = this.cameras.main;
    cam.setZoom(ASSET_RES);
    cam.centerOn(VIEW / 2, VIEW / 2);

    this.drawBackground();
    this.buildGrid();
    this.buildHighlight();
    this.buildEmitters();

    this.input.on('pointerdown', this.onPointer, this);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refresh(true) });

    this.built = true;
    if (this.model) this.render(this.model);
    this.highlight(this.pendingHighlight);
  }

  update(time: number): void {
    if (!this.built) return;
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        const c = this.cells[a][b];
        if (c.busy > 0 || c.view !== 'ripe') continue;
        c.wrap.angle = Math.sin(time * 0.0024 + c.phase) * 4;
        if (c === this.hlCell) c.wrap.y = c.baseY - Math.abs(Math.sin(time * 0.006)) * 5;
      }
    }
  }

  /** Full redraw from the game state: locked rows, ripe crops, sprouts with m:ss, stars. */
  render(game: Game): void {
    this.model = game;
    if (!this.built) return;
    this.revealed = new Set(unlockedRows(game.state.unlocked));
    for (let a = 1; a <= 9; a++) {
      const open = this.revealed.has(a);
      const d = this.rows[a];
      this.tweens.killTweensOf(d.lock);
      d.lock.setVisible(!open).setAlpha(1).setScale(INV).setAngle(0);
      d.label.setAlpha(open ? 1 : 0.45);
    }
    this.refresh(false);
  }

  /** Pulsing outline on the current question's cell (null hides it). */
  highlight(q: Question | null): void {
    this.pendingHighlight = q;
    if (!this.built) return;
    if (this.hlCell && this.hlCell.busy === 0) this.hlCell.wrap.y = this.hlCell.baseY;
    if (!q) {
      this.hlCell = null;
      this.hl.setVisible(false);
      this.hlTween.pause();
      return;
    }
    const c = this.cells[q.a][q.b];
    this.hlCell = c;
    this.hl.setPosition(c.x, c.y).setVisible(true);
    this.hlTween.resume();
  }

  /** Bounce, rise, fly to the top of the canvas and fade; golden crops sparkle. */
  playHarvest(r: Extract<AnswerResult, { kind: 'correct' }>): Promise<void> {
    if (!this.built) return Promise.resolve();
    const c = this.cells[r.q.a][r.q.b];
    const startY = c.baseY + CROP_DY;
    c.busy++;
    this.tweens.killTweensOf(c.wrap);
    if (this.hlCell === c) this.highlight(null);

    // The cell is already harvested in the state: swap to a sprout that pops up.
    this.setView(c, 'growing');
    this.syncTimer(c);
    c.wrap.setScale(0);
    this.tweens.add({ targets: c.wrap, scaleX: 1, scaleY: 1, delay: 380, duration: 420, ease: 'Back.Out' });

    const flyer = this.add.container(c.x, startY).setDepth(8);
    const img = this.add.image(0, 0, ASSETS.crop[r.crop]).setScale(CROP_SCALE);
    let glow: Img | null = null;
    if (r.golden) {
      glow = this.add.image(0, 0, ASSETS.glow).setTint(0xffd23f).setScale(INV * 1.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      flyer.add(glow);
      img.setTint(0xfff0b0);
      this.tweens.add({ targets: glow, alpha: 0.4, duration: 180, yoyo: true, repeat: -1 });
      this.sparkles.explode(26, c.x, startY);
    } else {
      this.sparkles.explode(7, c.x, startY);
    }
    flyer.add(img);

    const label = r.amount > 0 ? `+${r.amount}` : '滿了！';
    const plus = this.add.text(c.x, startY - 18, label, r.golden
      ? textStyle(28, '#ffd23f', '#a0560a', 6)
      : textStyle(26, '#ffffff', '#4f9a35', 6)).setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: plus, y: startY - 64, alpha: 0, delay: 250, duration: 800, ease: 'Sine.In' });

    const idx = Math.max(0, LEVEL_ORDER.indexOf(r.q.a));
    const targetX = Phaser.Math.Clamp(40 + idx * 70, 30, VIEW - 30);

    return this.settle(2600, done => {
      this.tweens.chain({
        targets: flyer,
        tweens: [
          { scaleX: 1.25, scaleY: 0.75, duration: 90, ease: 'Quad.Out' },
          { y: startY - 48, scaleX: 1.45, scaleY: 1.45, duration: 260, ease: 'Back.Out' },
          { y: startY - 38, scaleX: 1.3, scaleY: 1.3, duration: r.golden ? 320 : 140, ease: 'Sine.InOut' },
          { x: targetX, y: -50, scaleX: 0.6, scaleY: 0.6, angle: -30, alpha: 0.2, duration: 480, ease: 'Cubic.In' },
        ],
        onComplete: done,
      });
    }, () => {
      this.tweens.killTweensOf([flyer, img, plus]);
      if (glow) this.tweens.killTweensOf(glow);
      flyer.destroy(true);
      plus.destroy();
      c.busy--;
      this.applyCell(c, false);
    });
  }

  /** The crop droops (tilts, darkens), then springs back. */
  playWrong(q: Question): Promise<void> {
    if (!this.built) return Promise.resolve();
    const c = this.cells[q.a][q.b];
    c.busy++;
    this.tweens.killTweensOf(c.wrap);
    c.wrap.setAngle(0).setScale(1).setY(c.baseY);
    const grey = (t: number) => {
      const v = Math.round(255 - 110 * t);
      c.crop.setTint((v << 16) | (v << 8) | v);
    };
    return this.settle(2400, done => {
      this.tweens.chain({
        targets: c.wrap,
        tweens: [
          { angle: 28, scaleY: 0.86, y: c.baseY + 4, duration: 380, ease: 'Sine.Out',
            onUpdate: (tw: Phaser.Tweens.Tween) => grey(tw.progress) },
          { angle: 22, duration: 700, ease: 'Sine.InOut' },
          { angle: -6, scaleY: 1.06, y: c.baseY, duration: 260, ease: 'Quad.Out',
            onUpdate: (tw: Phaser.Tweens.Tween) => grey(1 - tw.progress) },
          { angle: 0, scaleY: 1, duration: 360, ease: 'Back.Out' },
        ],
        onComplete: done,
      });
    }, () => {
      this.tweens.killTweensOf(c.wrap);
      c.crop.clearTint();
      c.wrap.setAngle(0).setScale(1).setY(c.baseY);
      c.busy--;
      this.applyCell(c, false);
    });
  }

  /** The new row's crops pop up cell by cell, with confetti. */
  playUnlock(row: number): Promise<void> {
    if (!this.built || !this.model) return Promise.resolve();
    const s = this.model.state;
    this.revealed.add(row);
    const d = this.rows[row];
    const rowY = this.cells[row][1].y;
    this.tweens.killTweensOf(d.lock);
    this.tweens.add({
      targets: d.lock, scaleX: INV * 1.6, scaleY: INV * 1.6, alpha: 0, angle: 25,
      duration: 380, ease: 'Back.In', onComplete: () => d.lock.setVisible(false),
    });
    this.tweens.add({ targets: d.label, alpha: 1, duration: 300 });
    this.confetti.explode(40, 150, rowY);
    this.confetti.explode(40, 450, rowY);

    const cells = this.cells[row].slice(1);
    for (const c of cells) {
      c.busy++;
      this.tweens.killTweensOf(c.wrap);
      this.setView(c, 'ripe');
      this.setStars(c, starsOf(s.mastery[cellKey(c.a, c.b)] ?? 0));
      c.wrap.setScale(0).setAngle(0).setY(c.baseY);
      for (const st of c.stars) st.setVisible(false);
    }
    return this.settle(4000, done => {
      cells.forEach((c, i) => {
        this.tweens.add({
          targets: c.wrap, scaleX: 1, scaleY: 1, delay: 350 + i * 110, duration: 420,
          ease: 'Back.Out', easeParams: [2.6],
          onStart: () => {
            this.sparkles.explode(4, c.x, c.baseY + CROP_DY);
            this.tweens.add({ targets: c.plot, scaleY: INV * 0.85, duration: 90, yoyo: true });
          },
          onComplete: () => {
            for (const st of c.stars) st.setVisible(true);
            if (i === cells.length - 1) {
              this.confetti.explode(50, 300, rowY);
              this.time.delayedCall(250, done);
            }
          },
        });
      });
    }, () => {
      for (const c of cells) {
        this.tweens.killTweensOf([c.wrap, c.plot]);
        c.plot.setScale(INV);
        c.wrap.setScale(1);
        c.busy--;
        c.view = null; // force a full re-apply
        this.applyCell(c, false);
      }
    });
  }

  // ---------------------------------------------------------------- internals

  /** Resolves when `run` calls done, or after maxMs (e.g. tab hidden, tween killed). Cleanup runs once. */
  private settle(maxMs: number, run: (done: () => void) => void, cleanup: () => void): Promise<void> {
    return new Promise(resolve => {
      let finished = false;
      const timer = window.setTimeout(() => done(), maxMs);
      const done = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        cleanup();
        resolve();
      };
      run(done);
    });
  }

  private refresh(animate: boolean): void {
    if (!this.built || !this.model) return;
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) this.applyCell(this.cells[a][b], animate);
    }
  }

  private applyCell(c: Cell, animate: boolean): void {
    if (c.busy > 0 || !this.model) return;
    const s = this.model.state;
    const now = this.clock.now();
    const view: View = !this.revealed.has(c.a) ? 'locked' : isRipe(s, c.a, c.b, now) ? 'ripe' : 'growing';
    const prev = c.view;
    if (view !== prev) {
      this.setView(c, view);
      if (animate && prev === 'growing' && view === 'ripe') {
        c.wrap.setScale(0);
        this.tweens.add({ targets: c.wrap, scaleX: 1, scaleY: 1, duration: 450, ease: 'Back.Out', easeParams: [2.4] });
        this.sparkles.explode(5, c.x, c.baseY + CROP_DY);
      }
    }
    if (view === 'ripe') {
      const stars = starsOf(s.mastery[cellKey(c.a, c.b)] ?? 0);
      if (stars !== c.starCount || view !== prev) this.setStars(c, stars);
    }
    this.syncTimer(c);
  }

  private syncTimer(c: Cell): void {
    if (!this.model) return;
    const text = c.view === 'growing'
      ? formatMs(msUntilRipe(this.model.state, c.a, c.b, this.clock.now()))
      : '';
    if (text !== c.timerText) {
      c.timerText = text;
      c.timer.setText(text);
    }
  }

  private setView(c: Cell, view: View): void {
    c.view = view;
    c.crop.clearTint();
    c.wrap.setScale(1).setAngle(0).setY(c.baseY);
    if (view === 'locked') {
      c.plot.setTexture(ASSETS.soil).setAlpha(0.75);
      c.wrap.setVisible(false);
      c.timer.setVisible(false);
      for (const st of c.stars) st.setVisible(false);
      return;
    }
    c.plot.setTexture(ASSETS.tilled).setAlpha(1);
    c.wrap.setVisible(true);
    if (view === 'ripe') {
      c.crop.setTexture(ASSETS.crop[CROP_BY_ROW[c.a].id]).setScale(CROP_SCALE).setY(CROP_DY);
      c.timer.setVisible(false);
      for (const st of c.stars) st.setVisible(true);
    } else {
      c.crop.setTexture(ASSETS.sprout).setScale(SPROUT_SCALE).setY(SPROUT_DY);
      c.timer.setVisible(true);
      for (const st of c.stars) st.setVisible(false);
    }
  }

  private setStars(c: Cell, n: number): void {
    c.starCount = n;
    c.stars.forEach((st, i) => {
      if (i < n) st.setTint(GOLD).setAlpha(1);
      else st.setTint(FAINT).setAlpha(0.5);
    });
  }

  private cellCenter(a: number, b: number): { x: number; y: number } {
    return { x: GRID_X + (b - 1) * CELL + CELL / 2, y: GRID_Y + (a - 1) * CELL + CELL / 2 };
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    // field bed
    g.fillStyle(0x4f9a35, 1).fillRoundedRect(GRID_X - 4, GRID_Y - 1, 9 * CELL + 6, 9 * CELL + 4, 16);
    g.fillStyle(0x6cbf4a, 1).fillRoundedRect(GRID_X - 4, GRID_Y - 4, 9 * CELL + 6, 9 * CELL + 4, 16);
    // header and label pills
    g.fillStyle(0xfff8e1, 0.92);
    for (let i = 1; i <= 9; i++) {
      const { x } = this.cellCenter(1, i);
      g.fillRoundedRect(x - 21, 5, 42, 42, 14);
      const { y } = this.cellCenter(i, 1);
      g.fillRoundedRect(3, y - 22, 46, 44, 14);
    }
  }

  private buildGrid(): void {
    const head = textStyle(28, '#4a3a2a', '#ffffff', 0);
    for (let b = 1; b <= 9; b++) {
      const { x } = this.cellCenter(1, b);
      this.add.text(x, 27, String(b), head).setOrigin(0.5).setDepth(1);
    }
    for (let a = 1; a <= 9; a++) {
      this.cells[a] = [];
      const { y } = this.cellCenter(a, 1);
      const label = this.add.text(26, y + 1, `${a}×`, textStyle(26, '#4a3a2a', '#ffffff', 0))
        .setOrigin(0.5).setDepth(1);
      const lock = this.add.image(GRID_X + 4.5 * CELL, y, ASSETS.lock).setScale(INV).setDepth(4).setVisible(false);
      this.rows[a] = { label, lock };
      for (let b = 1; b <= 9; b++) {
        const { x, y: cy } = this.cellCenter(a, b);
        const baseY = cy + BASE_DY;
        const plot = this.add.image(x, cy, ASSETS.tilled).setScale(INV).setDepth(1);
        const crop = this.add.image(0, CROP_DY, ASSETS.sprout).setScale(CROP_SCALE);
        const wrap = this.add.container(x, baseY, [crop]).setDepth(2).setVisible(false);
        const stars = [-1, 0, 1].map(i =>
          this.add.image(x + i * 16, cy + BOTTOM_DY, ASSETS.star).setScale(INV * 0.8).setDepth(3).setVisible(false));
        const timer = this.add.text(x, cy + BOTTOM_DY, '', textStyle(17, '#ffffff', '#6b4226', 4))
          .setOrigin(0.5).setDepth(3).setVisible(false);
        this.cells[a][b] = {
          a, b, x, y: cy, baseY, plot, wrap, crop, stars, timer,
          view: null, timerText: '', starCount: -1, busy: 0, phase: b * 0.55 + a * 0.3,
        };
      }
    }
  }

  private buildHighlight(): void {
    const g = this.add.graphics();
    g.lineStyle(7, 0xffffff, 0.9).strokeRoundedRect(-31, -31, 62, 62, 14);
    g.lineStyle(4, 0xffb020, 1).strokeRoundedRect(-31, -31, 62, 62, 14);
    this.hl = this.add.container(0, 0, [g]).setDepth(5).setVisible(false);
    this.hlTween = this.tweens.add({
      targets: this.hl, scaleX: 1.08, scaleY: 1.08, alpha: 0.55,
      duration: 520, ease: 'Sine.InOut', yoyo: true, repeat: -1, paused: true,
    });
  }

  private buildEmitters(): void {
    this.sparkles = this.add.particles(0, 0, ASSETS.sparkle, {
      emitting: false,
      speed: { min: 50, max: 220 },
      lifespan: { min: 400, max: 850 },
      scale: { start: INV * 1.3, end: 0 },
      rotate: { start: 0, end: 180 },
      tint: [0xffd23f, 0xfff4b0, 0xffffff],
      blendMode: 'ADD',
    }).setDepth(9);
    this.confetti = this.add.particles(0, 0, ASSETS.confetti, {
      emitting: false,
      angle: { min: 225, max: 315 },
      speed: { min: 260, max: 560 },
      gravityY: 900,
      lifespan: 1700,
      scaleX: { min: INV * 0.8, max: INV * 1.4 },
      scaleY: { min: INV * 0.8, max: INV * 1.4 },
      rotate: { start: 0, end: 720 },
      alpha: { start: 1, end: 0, ease: 'Quad.In' },
      tint: [0xff6b6b, 0xffd23f, 0x6fcf5f, 0x5fb8ff, 0xff9ff3, 0xffffff],
    }).setDepth(9);
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (!this.built) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const b = Math.floor((w.x - GRID_X) / CELL) + 1;
    const a = Math.floor((w.y - GRID_Y) / CELL) + 1;
    if (a < 1 || a > 9 || b < 1 || b > 9) return;
    this.poke(a, b);
    this.handlers.onCellTap(a, b);
  }

  /** Tactile squish on tap (visual only). */
  private poke(a: number, b: number): void {
    const c = this.cells[a][b];
    if (c.busy > 0) return;
    if (c.view === 'locked') {
      const lock = this.rows[a].lock;
      if (!this.tweens.isTweening(lock)) {
        this.tweens.add({ targets: lock, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 2,
          onComplete: () => lock.setAngle(0) });
      }
      return;
    }
    if (this.tweens.isTweening(c.wrap)) return;
    this.tweens.add({ targets: c.wrap, scaleX: 1.18, scaleY: 0.84, duration: 90, yoyo: true, ease: 'Quad.Out' });
  }
}
