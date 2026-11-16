import Phaser from 'phaser';
import type { AnswerResult, Game, Question } from '../core/game';
import { CROP_BY_ROW, unlockedRows } from '../core/levels';
import { starsOf } from '../core/mastery';
import { cellKey } from '../core/state';
import { ASSETS, ASSET_RES, makePlaceholderTextures } from './assets';

/** Logical size of the field. The canvas backing store is VIEW * ASSET_RES for crisp art. */
export const VIEW = 600;

const CELL = 60;
const GRID_X = 56;
const GRID_Y = 56;
const FIELD_RIGHT = GRID_X + 9 * CELL;
const INV = 1 / ASSET_RES;
const CROP_SCALE = INV * 0.86;
const BASE_DY = 12;       // crop pivot (its base) below the cell centre
const CROP_DY = -19;      // crop image centre above its pivot
const STAR_SCALE = INV * 0.95;
const STAR_GAP = 17;
const GOLD = 0xffc83d;
const FAINT = 0xfff3d6;
const FONT = '"Arial Rounded MT Bold","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';

type Img = Phaser.GameObjects.Image;
type Text = Phaser.GameObjects.Text;
type Correct = Extract<AnswerResult, { kind: 'correct' }>;

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
  phase: number;
}

interface RowDeco {
  label: Text;
  lock: Img;
  /** Lights a counted row (drawn per question, between the plots and the crops). */
  glow: Phaser.GameObjects.Graphics;
  /** Running total at the row's end while counting. */
  count: Text;
}

function textStyle(size: number, color: string, stroke: string, strokeThickness: number): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke, strokeThickness, resolution: ASSET_RES };
}

/**
 * The 9×9 field. Two views:
 * - idle: the times-table map (stars on unlocked rows, padlocks on locked rows, row/column labels);
 * - question: an a-row × b-column block of one crop in the top-left corner, the rest bare soil.
 * The 81 crop sprites are built once and reused for every question.
 */
export class FieldScene extends Phaser.Scene {
  private model: Game | null = null;
  private handlers: { onCellTap(a: number, b: number): void } = { onCellTap: () => {} };
  private built = false;
  private cells: Cell[][] = [];
  private rows: RowDeco[] = [];
  private headers: (Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[] = [];
  private view: 'idle' | 'question' = 'idle';
  /** The planted question (question view), or one plant() received before create(). */
  private planted: Question | null = null;
  /** Crops sway only once fully planted and until harvest starts. */
  private sway = false;
  /** Bumped on every view switch; stale animation cleanups are skipped. */
  private gen = 0;
  private pending = new Set<() => void>();
  private plantDone: (() => void) | null = null;
  private plus!: Text;
  private bigCrop!: Img;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'field' });
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
    this.buildEffects();

    this.input.on('pointerdown', this.onPointer, this);

    this.built = true;
    if (this.model && this.model.mode !== null && this.planted) {
      this.reset();
      this.layoutQuestion(this.planted, true);
      this.sway = true;
    } else if (this.model) {
      this.render(this.model);
    }
  }

  update(time: number): void {
    const q = this.planted;
    if (!this.built || !this.sway || !q) return;
    for (let a = 1; a <= q.a; a++) {
      for (let b = 1; b <= q.b; b++) {
        const c = this.cells[a][b];
        c.wrap.angle = Math.sin(time * 0.0024 + c.phase) * 3.5;
      }
    }
  }

  /** Idle times-table map from the game state. Does nothing to the view while a round is active. */
  render(game: Game): void {
    this.model = game;
    if (!this.built || game.mode !== null) return;
    this.reset();
    this.layoutIdle(new Set(unlockedRows(game.state.unlocked)));
  }

  /** Clears the field and grows a rows × b block of q.crop, crop by crop, from the top-left. */
  plant(q: Question): Promise<void> {
    this.planted = q;
    if (!this.built) return Promise.resolve();
    this.reset();
    this.planted = q;
    this.layoutQuestion(q, false);
    const cells = this.block(q);
    const n = cells.length;
    const step = Math.min(90, 1300 / n);
    return this.settle(n * step + 1500, done => {
      this.plantDone = done;
      cells.forEach((c, i) => {
        this.tweens.add({
          targets: c.wrap, scaleX: 1, scaleY: 1, delay: i * step, duration: 320,
          ease: 'Back.Out', easeParams: [2.2],
          onStart: c.b === 1 ? () => this.sparkles.explode(4, c.x, c.baseY + CROP_DY) : undefined,
          onComplete: i === n - 1 ? done : undefined,
        });
      });
    }, () => {
      this.plantDone = null;
      for (const c of cells) {
        this.tweens.killTweensOf(c.wrap);
        c.wrap.setScale(1);
      }
      this.sway = true;
    });
  }

  /** The whole block hops, then the crops fly up toward the HUD and fade. */
  playHarvest(r: Correct): Promise<void> {
    if (!this.built || this.view !== 'question') return Promise.resolve();
    this.finishPlant();
    this.sway = false;
    const cells = this.block(r.q);
    const n = cells.length;
    const step = Math.min(40, 700 / n);
    const hudIdx = Math.max(0, unlockedRows(this.model?.state.unlocked ?? 1)
      .findIndex(row => CROP_BY_ROW[row].id === r.crop));
    const targetX = Phaser.Math.Clamp(40 + hudIdx * 70, 30, VIEW - 30);
    const midX = GRID_X + (r.q.b * CELL) / 2;
    const midY = GRID_Y + (r.q.a * CELL) / 2;

    for (const c of cells) c.wrap.setAngle(0).setDepth(7);
    this.sparkles.explode(Math.min(28, 6 + Math.round(n / 3)), midX, midY);

    const topY = Math.max(40, GRID_Y + CROP_DY);
    this.plus.setText(r.amount > 0 ? `+${r.amount}` : '滿了！')
      .setPosition(midX, topY).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: this.plus, y: topY - 34, alpha: 0, delay: 650, duration: 700, ease: 'Sine.In' });

    return this.settle(3500, done => {
      cells.forEach((c, i) => {
        this.tweens.chain({
          targets: c.wrap,
          tweens: [
            { scaleX: 1.22, scaleY: 0.78, duration: 90, ease: 'Quad.Out' },
            { y: c.baseY - 22, scaleX: 1.15, scaleY: 1.15, duration: 230, ease: 'Back.Out' },
            { x: targetX, y: -40, scaleX: 0.5, scaleY: 0.5, angle: -30, alpha: 0.25,
              delay: i * step, duration: 460, ease: 'Cubic.In' },
          ],
          onComplete: i === n - 1 ? done : undefined,
        });
      });
    }, () => {
      for (const c of cells) this.resetCrop(c);
      this.plus.setVisible(false);
    });
  }

  /**
   * Counts the block row by row: each row lights up and its running total appears at the row's
   * end, then onRow(row, total) is awaited. Only onRow takes time; the scene's own animation is
   * fire and forget. Stops early when the view changes (exit / import / next question).
   */
  async playCount(q: Question, onRow: (row: number, total: number) => Promise<void>): Promise<void> {
    if (this.built) this.finishPlant();
    const gen = this.gen;
    for (let row = 1; row <= q.a; row++) {
      if (gen !== this.gen) return;
      const total = row * q.b;
      if (this.built && this.view === 'question') this.lightRow(row, q.b, total);
      await onRow(row, total);
    }
  }

  /** Shows the idle map with the new row still locked, then opens it with confetti. */
  playUnlock(row: number): Promise<void> {
    if (!this.built || !this.model) return Promise.resolve();
    this.reset();
    const open = new Set(unlockedRows(this.model.state.unlocked));
    open.add(row);
    const before = new Set(open);
    before.delete(row);
    this.layoutIdle(before);

    const d = this.rows[row];
    const rowY = this.cells[row][1].y;
    this.tweens.add({
      targets: d.lock, scaleX: INV * 1.6, scaleY: INV * 1.6, alpha: 0, angle: 25,
      duration: 380, ease: 'Back.In', onComplete: () => d.lock.setVisible(false),
    });
    this.tweens.add({ targets: d.label, alpha: 1, duration: 300 });
    this.confetti.explode(40, 150, rowY);
    this.confetti.explode(40, 450, rowY);

    this.bigCrop.setTexture(ASSETS.crop[CROP_BY_ROW[row].id])
      .setPosition(GRID_X + 4.5 * CELL, rowY).setScale(0).setAlpha(1).setVisible(true);
    this.tweens.chain({
      targets: this.bigCrop,
      tweens: [
        { scaleX: INV * 2.2, scaleY: INV * 2.2, delay: 300, duration: 450, ease: 'Back.Out' },
        { y: rowY - 14, duration: 900, ease: 'Sine.InOut', yoyo: true },
        { alpha: 0, scaleX: INV * 1.2, scaleY: INV * 1.2, duration: 350, ease: 'Quad.In' },
      ],
    });

    const cells = this.cells[row].slice(1);
    return this.settle(4200, done => {
      cells.forEach((c, i) => {
        this.time.delayedCall(350 + i * 110, () => {
          c.plot.setTexture(ASSETS.tilled).setAlpha(1);
          this.setStars(c, starsOf(this.model?.state.mastery[cellKey(c.a, c.b)] ?? 0), true);
          this.tweens.add({ targets: c.plot, scaleX: INV * 1.12, scaleY: INV * 0.85, duration: 110, yoyo: true });
          for (const st of c.stars) {
            st.setScale(0);
            this.tweens.add({ targets: st, scaleX: STAR_SCALE, scaleY: STAR_SCALE, duration: 260, ease: 'Back.Out' });
          }
          if (i === cells.length - 1) {
            this.confetti.explode(50, 300, rowY);
            this.time.delayedCall(1200, done);
          }
        });
      });
    }, () => {
      this.reset();
      this.layoutIdle(open);
    });
  }

  // ---------------------------------------------------------------- internals

  /**
   * Resolves when `run` calls done, or after maxMs (e.g. tab hidden, tween killed). Cleanup runs
   * once, and only if the view has not switched since (reset() settles stale ones without it).
   */
  private settle(maxMs: number, run: (done: () => void) => void, cleanup: () => void): Promise<void> {
    const gen = this.gen;
    return new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        this.pending.delete(done);
        if (gen === this.gen) cleanup();
        resolve();
      };
      const timer = window.setTimeout(done, maxMs);
      this.pending.add(done);
      run(done);
    });
  }

  /** Skips the rest of the planting animation (an answer came in early). */
  private finishPlant(): void {
    this.plantDone?.();
  }

  /** Stops every animation, settles pending promises without their cleanup, blanks the field. */
  private reset(): void {
    this.gen++;
    for (const done of [...this.pending]) done();
    this.pending.clear();
    this.plantDone = null;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.sway = false;
    this.planted = null;
    for (let a = 1; a <= 9; a++) {
      const d = this.rows[a];
      d.glow.clear().setVisible(false).setAlpha(1);
      d.count.setVisible(false).setScale(1);
      d.lock.setVisible(false).setAlpha(1).setScale(INV).setAngle(0);
      for (let b = 1; b <= 9; b++) {
        const c = this.cells[a][b];
        this.resetCrop(c);
        c.plot.setScale(INV);
        for (const st of c.stars) st.setVisible(false).setScale(STAR_SCALE);
      }
    }
    this.plus.setVisible(false);
    this.bigCrop.setVisible(false);
  }

  private resetCrop(c: Cell): void {
    c.wrap.setVisible(false).setPosition(c.x, c.baseY).setScale(1).setAngle(0).setAlpha(1).setDepth(2);
  }

  private layoutIdle(open: Set<number>): void {
    this.view = 'idle';
    const s = this.model?.state;
    for (const h of this.headers) h.setVisible(true);
    for (let a = 1; a <= 9; a++) {
      const unlocked = open.has(a);
      const d = this.rows[a];
      d.lock.setVisible(!unlocked);
      d.label.setAlpha(unlocked ? 1 : 0.45);
      for (let b = 1; b <= 9; b++) {
        const c = this.cells[a][b];
        if (unlocked) {
          c.plot.setTexture(ASSETS.tilled).setAlpha(1);
          this.setStars(c, starsOf(s?.mastery[cellKey(a, b)] ?? 0), true);
        } else {
          c.plot.setTexture(ASSETS.soil).setAlpha(0.75);
        }
      }
    }
  }

  /** Bare soil everywhere except the a × b block; crops start hidden (scale 0) unless `grown`. */
  private layoutQuestion(q: Question, grown: boolean): void {
    this.view = 'question';
    for (const h of this.headers) h.setVisible(false);
    const tex = ASSETS.crop[q.crop];
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        const c = this.cells[a][b];
        if (a <= q.a && b <= q.b) {
          c.plot.setTexture(ASSETS.tilled).setAlpha(1);
          c.crop.setTexture(tex);
          c.wrap.setScale(grown ? 1 : 0).setVisible(true);
        } else {
          c.plot.setTexture(ASSETS.soil).setAlpha(1);
        }
      }
    }
  }

  /** Cells of q's block, row by row, left to right. */
  private block(q: Question): Cell[] {
    const out: Cell[] = [];
    for (let a = 1; a <= q.a; a++) {
      for (let b = 1; b <= q.b; b++) out.push(this.cells[a][b]);
    }
    return out;
  }

  private lightRow(row: number, b: number, total: number): void {
    const d = this.rows[row];
    const top = GRID_Y + (row - 1) * CELL;
    d.glow.clear()
      .fillStyle(0xfff1a8, 0.6).fillRoundedRect(GRID_X + 1, top + 1, b * CELL - 2, CELL - 2, 14)
      .lineStyle(5, 0xffa31a, 1).strokeRoundedRect(GRID_X + 1, top + 1, b * CELL - 2, CELL - 2, 14)
      .setVisible(true).setAlpha(0);
    this.tweens.add({ targets: d.glow, alpha: 1, duration: 160 });

    for (let col = 1; col <= b; col++) {
      const c = this.cells[row][col];
      this.tweens.add({ targets: c.wrap, y: c.baseY - 9, duration: 130, delay: col * 25, yoyo: true, ease: 'Quad.Out' });
    }

    // Right of the block; with a full row, inside the field edge over the last crop's lower part
    // (right-aligned so two digits never run off the canvas, and the crop's top still shows).
    const full = b >= 9;
    d.count.setText(String(total)).setScale(0).setVisible(true);
    if (full) d.count.setOrigin(1, 0.5).setPosition(FIELD_RIGHT + 2, top + CELL / 2 + 12);
    else d.count.setOrigin(0.5, 0.5).setPosition(GRID_X + b * CELL + CELL / 2, top + CELL / 2);
    this.tweens.add({ targets: d.count, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out', easeParams: [2.4] });
  }

  private setStars(c: Cell, n: number, visible: boolean): void {
    c.stars.forEach((st, i) => {
      st.setVisible(visible);
      if (i < n) st.setTint(GOLD).setAlpha(1);
      else st.setTint(FAINT).setAlpha(0.55);
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
    // header and label pills (idle map only)
    const pills = this.add.graphics().setDepth(0);
    pills.fillStyle(0xfff8e1, 0.92);
    for (let i = 1; i <= 9; i++) {
      const { x } = this.cellCenter(1, i);
      pills.fillRoundedRect(x - 21, 5, 42, 42, 14);
      const { y } = this.cellCenter(i, 1);
      pills.fillRoundedRect(3, y - 22, 46, 44, 14);
    }
    this.headers.push(pills);
  }

  private buildGrid(): void {
    const head = textStyle(28, '#4a3a2a', '#ffffff', 0);
    for (let b = 1; b <= 9; b++) {
      const { x } = this.cellCenter(1, b);
      this.headers.push(this.add.text(x, 27, String(b), head).setOrigin(0.5).setDepth(1));
    }
    for (let a = 1; a <= 9; a++) {
      this.cells[a] = [];
      const { y } = this.cellCenter(a, 1);
      const label = this.add.text(26, y + 1, `${a}×`, textStyle(26, '#4a3a2a', '#ffffff', 0))
        .setOrigin(0.5).setDepth(1);
      this.headers.push(label);
      const lock = this.add.image(GRID_X + 4.5 * CELL, y, ASSETS.lock).setScale(INV).setDepth(4).setVisible(false);
      const glow = this.add.graphics().setDepth(1.5).setVisible(false);
      const count = this.add.text(0, 0, '', textStyle(44, '#ffffff', '#d9480f', 10))
        .setOrigin(0.5).setDepth(6).setVisible(false);
      this.rows[a] = { label, lock, glow, count };
      for (let b = 1; b <= 9; b++) {
        const { x, y: cy } = this.cellCenter(a, b);
        const baseY = cy + BASE_DY;
        const plot = this.add.image(x, cy, ASSETS.tilled).setScale(INV).setDepth(1);
        const crop = this.add.image(0, CROP_DY, ASSETS.crop.wheat).setScale(CROP_SCALE);
        const wrap = this.add.container(x, baseY, [crop]).setDepth(2).setVisible(false);
        const stars = [-1, 0, 1].map(i =>
          this.add.image(x + i * STAR_GAP, cy + 1, ASSETS.star).setScale(STAR_SCALE).setDepth(3).setVisible(false));
        this.cells[a][b] = { a, b, x, y: cy, baseY, plot, wrap, crop, stars, phase: b * 0.55 + a * 0.3 };
      }
    }
  }

  private buildEffects(): void {
    this.plus = this.add.text(0, 0, '', textStyle(34, '#ffffff', '#4f9a35', 8))
      .setOrigin(0.5).setDepth(10).setVisible(false);
    this.bigCrop = this.add.image(0, 0, ASSETS.crop.wheat).setDepth(8).setVisible(false);
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
    if (!this.built || this.view !== 'idle') return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const b = Math.floor((w.x - GRID_X) / CELL) + 1;
    const a = Math.floor((w.y - GRID_Y) / CELL) + 1;
    if (a < 1 || a > 9 || b < 1 || b > 9) return;
    this.poke(a, b);
    this.handlers.onCellTap(a, b);
  }

  /** Tactile feedback on tap (visual only): a locked row's padlock wiggles, a plot squishes. */
  private poke(a: number, b: number): void {
    const lock = this.rows[a].lock;
    if (lock.visible) {
      if (!this.tweens.isTweening(lock)) {
        this.tweens.add({ targets: lock, angle: { from: -14, to: 14 }, duration: 70, yoyo: true, repeat: 2,
          onComplete: () => lock.setAngle(0) });
      }
      return;
    }
    const plot = this.cells[a][b].plot;
    if (this.tweens.isTweening(plot)) return;
    this.tweens.add({ targets: plot, scaleX: INV * 1.1, scaleY: INV * 0.9, duration: 90, yoyo: true, ease: 'Quad.Out' });
  }
}
