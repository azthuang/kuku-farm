import Phaser from 'phaser';
import {
  DECOR, SPECIALS, SPOT_IDS, type DecorId, type DecorState, type SpecialId, type SpotId,
} from '../core/decor';
import { BIG_SPOTS, DECOR_SPOTS, bigBox, createBusy, spotFoot } from './decorLayout';
import { DECOR_LPC_FRAMES } from './decorAtlas';
import { DECOR_MADE_FRAMES, SPECIAL_FRAMES } from './decorMadeAtlas';
import { FISH_PALETTE, FISH_ROWS, RABBIT_PALETTE, RABBIT_ROWS, pixelTexture } from './pixelArt';
import { SCENERY_WORLD } from './ranchScenery';
import { BALLOON_MS, DINO_MS, UFO_MS, balloonAt, dinoAt, ufoAt, ufoTarget } from './trickMoves';

/** Texture keys of public/assets/decor/lpc.png and made.png (loaded by the scene). */
export const DECOR_LPC_TEX = 'decor-lpc';
export const DECOR_MADE_TEX = 'decor-made';
type Frames = Partial<Record<string, readonly [number, number, number, number]>>;
/**
 * A decoration fills its spot: the largest whole-number scale that fits the spot's width (three
 * tiles) and height limit, so its pixels stay crisp. The small flower beds are a few pixels
 * wider than a tile, so whole steps left them at half their spot: they stretch to fit it exactly.
 * The little tree grows in half steps (half a world unit is one canvas pixel at the care view's
 * zoom, ASSET_RES 2, so its pixels stay square). Pigeons are drawn at PIGEON_SCALE.
 */
const PIGEON_SCALE = 3;
const EXACT_FIT: ReadonlySet<string> = new Set(['roses', 'flowers', 'bluebells']);
const HALF_STEPS: ReadonlySet<string> = new Set(['tree']);
export function fitScale(id: string, w: number, h: number, boxW: number, boxH: number): number {
  const fit = Math.min(boxW / w, boxH / h);
  if (EXACT_FIT.has(id)) return fit;
  const steps = HALF_STEPS.has(id) ? 2 : 1;
  return Math.max(1 / steps, Math.floor(fit * steps) / steps);
}

type Img = Phaser.GameObjects.Image;
type Fx = Phaser.Tweens.Tween | Phaser.Time.TimerEvent;

export interface DecorDeps {
  /** Texture key of an emoji image (the stand-in until the art lands) and its size in texture pixels. */
  emojiTex(emoji: string): string;
  emojiPx: number;
  /** Stars at a world point. */
  sparkle(x: number, y: number): void;
  /** Depth of the garden's decorations and the specials. */
  depth: number;
  /** Depth of a special in the air (the balloon's round, the UFO, the rocket): above everything. */
  flyDepth: number;
  /** Depth of something standing at world y inside a pen (sorted with the animals). */
  ySort(y: number): number;
}

export type DecorHit = { spot: SpotId } | { slot: 0 | 1; id: SpecialId };

/** World size of a decoration and of a special (their height; emoji are square). */
const SPECIAL_PX = 150;
const PIGEON_PX = 40;
/** A decoration with an animal or poop behind it turns see-through, so nothing the child must see hides. */
export const FADED_ALPHA = 0.45;
/** A tap this far outside a spot's box still counts (small fingers, small targets). */
const HIT_PAD = 10;
/** How long each trick runs: a tap meanwhile starts nothing. */
const TREE_MS = 3000;
const ROCKET_MS = 5200;
const SHOW_MS: Record<SpecialId, number> = { xmasTree: TREE_MS, balloon: BALLOON_MS, rocket: ROCKET_MS, ufo: UFO_MS, dino: DINO_MS };
export const PIGEON_FLY_MS = 1600;
/** The pond's fish: out of the water, an arc, back in. The bush's rabbit: out, a look round, back in. */
export const FISH_JUMP_MS = 1000;
export const RABBIT_MS = 2200;
/** The drawn fish and rabbit: two world units to an art pixel (crisp at the care view's zoom). */
const CRITTER_SCALE = 2;
/** Where the three pigeons stand, around the spot's foot. */
/** Where the three pigeons stand, as fractions of the spot's width and px up from its front. */
const PIGEON_AT = [{ x: -0.3, y: 6 }, { x: 0.02, y: 26 }, { x: 0.3, y: 2 }];

interface SpotView {
  img: Img;
  plus: Phaser.GameObjects.Container;
  birds: Img[];
  /** The pond's fish or the bush's rabbit while its trick runs (gone with the decoration). */
  actors: Img[];
  id: DecorId | null;
  open: boolean;
  fx: Fx[];
}
interface BigView {
  img: Img;
  id: SpecialId | null;
  fx: Fx[];
  /** Drawn only for a trick (the UFO's beam, the tree's glow): gone when it ends or the special does. */
  extras: Phaser.GameObjects.GameObject[];
}

/**
 * The decorations on the map: one image per spot (or a faint wooden ＋ sign on an open, empty
 * spot in the care view), the pigeons, and the two specials with their idle moves and tricks.
 * Looks only; the scene asks hit() on a tap and play() / flyPigeons() to run a trick.
 */
export class DecorLayer {
  private spots = new Map<SpotId, SpotView>();
  private bigs: [BigView, BigView];
  private busy = createBusy();

  constructor(private scene: Phaser.Scene, private deps: DecorDeps) {
    const frames = (key: string, list: Frames): void => {
      if (!scene.textures.exists(key)) return;
      const t = scene.textures.get(key);
      t.setFilter(Phaser.Textures.FilterMode.NEAREST);
      for (const [id, f] of Object.entries(list)) if (f && !t.has(id)) t.add(id, 0, f[0], f[1], f[2], f[3]);
    };
    frames(DECOR_LPC_TEX, DECOR_LPC_FRAMES);
    frames(DECOR_MADE_TEX, { ...DECOR_MADE_FRAMES, ...SPECIAL_FRAMES });
    for (const s of SPOT_IDS) {
      const p = DECOR_SPOTS[s];
      const depth = this.depthOf(s, p.y);
      const img = scene.add.image(p.x, p.y, '__MISSING').setOrigin(0.5, 1).setDepth(depth).setVisible(false);
      this.spots.set(s, { img, plus: this.makePlus(p.x, p.y - p.h * 0, depth), birds: [], actors: [], id: null, open: false, fx: [] });
    }
    const big = (i: 0 | 1): BigView => {
      const p = BIG_SPOTS[i];
      const img = scene.add.image(p.x, p.y, '__MISSING').setOrigin(0.5, 1).setDepth(deps.depth + 0.1).setVisible(false);
      return { img, id: null, fx: [], extras: [] };
    };
    this.bigs = [big(0), big(1)];
  }

  /** A decoration stands in a pen: it sorts with the animals by how far down it stands. */
  private depthOf(_s: SpotId, y: number): number {
    return this.deps.ySort(y);
  }

  /** A small wooden sign with a white ＋, standing on the spot. */
  private makePlus(x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    const w = 46;
    const h = 34;
    g.fillStyle(0x7a5230, 1).fillRect(-4, -26, 8, 26); // post
    g.fillStyle(0x5c3b1f, 0.35).fillRoundedRect(-w / 2 + 3, -26 - h + 3, w, h, 7);
    g.fillStyle(0xc8945a, 1).fillRoundedRect(-w / 2, -26 - h, w, h, 7);
    g.lineStyle(3, 0x8a5a2b, 1).strokeRoundedRect(-w / 2, -26 - h, w, h, 7);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-13, -26 - h / 2 - 3.5, 26, 7, 3).fillRoundedRect(-3.5, -26 - h / 2 - 13, 7, 26, 3);
    const c = this.scene.add.container(x, y - 12, [g]).setDepth(depth).setAlpha(0.8).setVisible(false);
    this.scene.tweens.add({ targets: c, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return c;
  }

  /** The art frame of a decoration, special or pigeon pose, if its sheet is loaded. */
  private art(name: string): { key: string; h: number; w: number } | null {
    const lpc = (DECOR_LPC_FRAMES as Frames)[name];
    if (lpc && this.scene.textures.exists(DECOR_LPC_TEX)) return { key: DECOR_LPC_TEX, w: lpc[2], h: lpc[3] };
    const made = ({ ...DECOR_MADE_FRAMES, ...SPECIAL_FRAMES } as Frames)[name];
    if (made && this.scene.textures.exists(DECOR_MADE_TEX)) return { key: DECOR_MADE_TEX, w: made[2], h: made[3] };
    return null;
  }

  private tex(img: Img, emoji: string, px: number): void {
    const key = this.deps.emojiTex(emoji);
    if (img.texture.key !== key) img.setTexture(key);
    img.setScale(px / this.deps.emojiPx);
  }

  private stop(fx: Fx[]): void {
    for (const f of fx) f.remove();
    fx.length = 0;
  }

  private loop(fx: Fx[], ms: number, fn: () => void): void {
    fx.push(this.scene.time.addEvent({ delay: ms, loop: true, callback: fn }));
  }

  /** A one-off callback owned by `fx`: stop(fx) cancels it if it has not run yet. */
  private once(fx: Fx[], ms: number, fn: () => void): void {
    const e = this.scene.time.delayedCall(ms, () => {
      fx.splice(fx.indexOf(e), 1);
      fn();
    });
    fx.push(e);
  }

  // ---------------------------------------------------------------- sync

  sync(d: DecorState, open: (s: SpotId) => boolean, overview: boolean): void {
    for (const [s, v] of this.spots) {
      const id = d.placed[s] ?? null;
      v.open = open(s);
      if (id !== v.id) this.setSpot(s, v, id);
      v.plus.setVisible(!v.id && v.open && !overview);
    }
    this.bigs.forEach((b, i) => {
      const id = d.big[i];
      if (id !== b.id) this.setBig(i as 0 | 1, b, id);
    });
  }

  private setSpot(s: SpotId, v: SpotView, id: DecorId | null): void {
    this.stop(v.fx);
    v.img.setAlpha(1);
    for (const b of v.birds) {
      this.scene.tweens.killTweensOf(b);
      b.destroy();
    }
    v.birds = [];
    for (const a of v.actors) a.destroy();
    v.actors = [];
    v.id = id;
    const p = DECOR_SPOTS[s];
    v.img.setVisible(!!id && id !== 'pigeons');
    if (!id) return;
    if (id !== 'pigeons') {
      const a = this.art(id);
      if (a) {
        v.img.setTexture(a.key, id).setScale(fitScale(id, a.w, a.h, p.w, p.h));
      } else {
        this.tex(v.img, DECOR[id].emoji, Math.min(p.w, p.h) * 0.8);
      }
      return;
    }
    // a little flock pecking at the ground, one at a time
    v.birds = PIGEON_AT.map((o, i) => {
      const b = this.scene.add.image(p.x + o.x * p.w, p.y - o.y, '__MISSING').setOrigin(0.5, 1).setDepth(this.depthOf(s, p.y - o.y));
      this.pigeon(b, 0);
      if (i === 1) b.setFlipX(true);
      return b;
    });
    this.loop(v.fx, 700, () => {
      if (this.busy.busy(s, this.scene.time.now)) return;
      const b = v.birds[Math.floor(Math.random() * v.birds.length)];
      if (Math.random() < 0.25) {
        const home = p.x + PIGEON_AT[v.birds.indexOf(b)].x * p.w;
        this.scene.tweens.add({ targets: b, x: home + (Math.random() < 0.5 ? -8 : 8), duration: 260, yoyo: true });
      } else if (this.art('pigeon1')) {
        this.pigeon(b, 1); // head down to the ground, then up again
        this.once(v.fx, 320, () => { if (!this.busy.busy(s, this.scene.time.now)) this.pigeon(b, 0); });
      } else {
        this.scene.tweens.add({ targets: b, angle: b.flipX ? -24 : 24, duration: 140, yoyo: true, repeat: 1 });
      }
    });
  }

  /** A pigeon's pose: 0 standing, 1 pecking, 2 flying (emoji until the art is loaded). */
  private pigeon(b: Img, pose: 0 | 1 | 2): void {
    if (!b.active) return; // a bird taken away (swapped, stored, a save imported) mid-move
    const a = this.art(`pigeon${pose}`);
    if (a) b.setTexture(a.key, `pigeon${pose}`).setScale(PIGEON_SCALE);
    else this.tex(b, DECOR.pigeons.emoji, PIGEON_PX);
  }

  private setBig(slot: 0 | 1, b: BigView, id: SpecialId | null): void {
    this.stop(b.fx);
    this.scene.tweens.killTweensOf(b.img);
    for (const e of b.extras) e.destroy();
    b.extras = [];
    const p = BIG_SPOTS[slot];
    b.id = id;
    b.img.setPosition(p.x, p.y).setAngle(0).setAlpha(1).setFlipX(false).clearTint().setDepth(this.deps.depth + 0.1).setVisible(!!id);
    if (!id) return;
    const a = this.art(id);
    // as big as its spot allows (about the farmhouse oak's size in the west strip)
    if (a) b.img.setTexture(a.key, id).setScale(Math.min(p.w / a.w, p.h / a.h));
    else this.tex(b.img, SPECIALS[id].emoji, SPECIAL_PX);
    const base = b.img.scaleX;
    switch (id) {
      case 'xmasTree': {
        const tints = [0xffffff, 0xfff1a8, 0xffd0d0, 0xd8f4ff];
        let i = 0;
        this.loop(b.fx, 450, () => b.img.setTint(tints[i++ % tints.length]));
        break;
      }
      case 'balloon':
        b.fx.push(this.scene.tweens.add({ targets: b.img, y: p.y - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
        this.loop(b.fx, 3200, () => this.puff(b.img.x, b.img.y - b.img.displayHeight * 0.3, 0xffa640, 0.7));
        break;
      case 'rocket':
        this.loop(b.fx, 1500, () => {
          if (!this.busy.busy(`big${slot}`, this.scene.time.now)) this.puff(p.x, p.y - 8, 0xdddddd, 0.6);
        });
        break;
      case 'ufo': {
        b.fx.push(this.scene.tweens.add({ targets: b.img, y: p.y - 14, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
        const lights = [0xffffff, 0xbff7ff, 0xfff0b0, 0xffd6f7];
        let i = 0;
        this.loop(b.fx, 380, () => b.img.setTint(lights[i++ % lights.length]));
        break;
      }
      case 'dino':
        b.fx.push(this.scene.tweens.add({ targets: b.img, angle: 2, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
        this.loop(b.fx, 3300, () => {
          if (this.busy.busy(`big${slot}`, this.scene.time.now)) return;
          this.scene.tweens.add({ targets: b.img, scaleY: base * 0.96, duration: 90, yoyo: true });
        });
        break;
    }
  }

  /**
   * Fades each decoration that has one of `pts` (an animal's feet or body, a poop) behind it, and
   * restores the others. Cheap enough for every frame: ten spots, a few points.
   */
  fade(pts: readonly { x: number; y: number }[]): void {
    for (const v of this.spots.values()) {
      if (!v.id || v.id === 'pigeons') continue;
      const r = v.img.getBounds();
      const hidden = pts.some(p => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);
      const a = hidden ? FADED_ALPHA : 1;
      if (v.img.alpha !== a) v.img.setAlpha(a);
    }
  }

  /** The ＋ signs are for the care view only. */
  setOverview(on: boolean): void {
    for (const v of this.spots.values()) v.plus.setVisible(!v.id && v.open && !on);
  }

  // ---------------------------------------------------------------- taps and tricks

  /** What a tap at a world point lands on: a decorated or open spot, or a shown special. */
  hit(x: number, y: number): DecorHit | null {
    const inside = (r: { x: number; y: number; w: number; h: number }): boolean =>
      x >= r.x - HIT_PAD && x <= r.x + r.w + HIT_PAD && y >= r.y - HIT_PAD && y <= r.y + r.h + HIT_PAD;
    for (const [s, v] of this.spots) {
      // a decoration: the picture itself; an open spot: its ground (the ＋ sign stands there)
      const r = v.id && v.id !== 'pigeons' ? v.img.getBounds() : null;
      const box = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : v.id || v.open ? spotFoot(s) : null;
      if (box && inside(box)) return { spot: s };
    }
    return this.hitSpecial(x, y);
  }

  /** A shown special under a world point (the overview plays it; there nothing else answers a tap). */
  hitSpecial(x: number, y: number): { slot: 0 | 1; id: SpecialId } | null {
    for (const slot of [0, 1] as const) {
      const id = this.bigs[slot].id;
      const r = bigBox(slot);
      if (id && x >= r.x - HIT_PAD && x <= r.x + r.w + HIT_PAD && y >= r.y - HIT_PAD && y <= r.y + r.h + HIT_PAD) return { slot, id };
    }
    return null;
  }

  /**
   * The special's trick; false while the last one still runs. The tree dances and glows, the
   * balloon flies once round the farm, the rocket goes up out of sight and lands again, the UFO
   * visits the cow pen and shines its beam down, the dinosaur hops left and right. Each ends by
   * setting the special up afresh on its spot, idle moves and all.
   */
  play(slot: 0 | 1): boolean {
    const b = this.bigs[slot];
    const id = b.id;
    if (!id || !this.busy.start(`big${slot}`, SHOW_MS[id], this.scene.time.now)) return false;
    const p = BIG_SPOTS[slot];
    const img = b.img;
    this.stop(b.fx); // the idle moves pause for the show
    this.scene.tweens.killTweensOf(img);
    img.clearTint();
    const size = img.scaleX;
    const h = img.displayHeight;
    let step: (k: number) => void = () => {};
    switch (id) {
      case 'xmasTree': {
        // a warm glow behind it, its lights flashing fast, and a wiggle from the trunk up
        const glow = this.extra(b, this.scene.add.graphics().setDepth(this.deps.depth + 0.09).setPosition(p.x, p.y - h * 0.5));
        for (let r = 6; r >= 1; r--) glow.fillStyle(0xfff3a0, 0.2).fillCircle(0, 0, (h * 0.75 * r) / 6);
        glow.setAlpha(0);
        const tints = [0xfff1a8, 0xffd0d0, 0xd8f4ff, 0xffffff];
        let i = 0;
        this.loop(b.fx, 120, () => img.setTint(tints[i++ % tints.length]));
        for (const d of [0, 1000, 2000]) this.once(b.fx, d, () => {
          this.deps.sparkle(p.x, p.y - h * 0.85);
          this.deps.sparkle(p.x + (Math.random() - 0.5) * h * 0.4, p.y - h * 0.4);
        });
        step = k => {
          const env = Math.sin(Math.PI * k);
          const bounce = env * Math.sin(2 * Math.PI * 10 * k);
          img.setAngle(9 * env * Math.sin(2 * Math.PI * 5 * k));
          img.setScale(size * (1 - 0.03 * bounce), size * (1 + 0.05 * bounce));
          glow.setAlpha(env * (0.75 + 0.25 * Math.sin(2 * Math.PI * 6 * k)));
        };
        break;
      }
      case 'balloon':
        this.puff(p.x, p.y - h * 0.3, 0xff8a30, 1);
        img.setDepth(this.deps.flyDepth);
        step = k => {
          const q = balloonAt(p, k);
          img.setPosition(q.x, q.y);
        };
        break;
      case 'rocket': {
        // a little shake for the countdown, straight up and out of sight, a wait, and down again
        const top = Math.min(this.scene.cameras?.main?.worldView?.y ?? SCENERY_WORLD.y, SCENERY_WORLD.y) - 60;
        const body = this.art('rocketBody');
        const pad = this.art('rocketPad');
        if (body && pad) { // the launch pad stays on the ground
          img.setTexture(body.key, 'rocketBody');
          this.extra(b, this.scene.add.image(p.x, p.y, pad.key, 'rocketPad').setOrigin(0.5, 1).setScale(size).setDepth(this.deps.depth + 0.1));
        }
        img.setDepth(this.deps.flyDepth);
        let at = 0;
        this.loop(b.fx, 100, () => {
          const up = at > 0.15 && at < 0.4;
          const landing = at > 0.8 && at < 0.97;
          if (up || landing) this.puff(img.x, img.y + 4, 0xffd27a, landing ? 0.7 : 1, this.deps.flyDepth - 0.01);
        });
        step = k => {
          at = k;
          let y = p.y;
          let x = p.x;
          if (k < 0.15) {
            x += Math.floor(k * 120) % 2 ? 3 : -3;
          } else {
            if (k < 0.4) {
              const u = (k - 0.15) / 0.25;
              y = p.y + (top - p.y) * u * u; // speeding up
            } else if (k < 0.62) {
              y = top;
            } else {
              const u = Math.min(1, (k - 0.62) / 0.35);
              y = top + (p.y - top) * (1 - (1 - u) * (1 - u)); // slowing down to land
            }
          }
          img.setPosition(x, y);
        };
        break;
      }
      case 'ufo': {
        const t = ufoTarget();
        const over = ufoAt(p, 0.5);
        const beam = this.extra(b, this.scene.add.graphics().setDepth(this.deps.flyDepth - 0.01).setAlpha(0));
        const y0 = over.y - h * 0.3;
        const ground = t.y + 50;
        beam.fillStyle(0xfff6a8, 0.5).fillTriangle(t.x - 26, y0, t.x + 26, y0, t.x + 110, ground)
          .fillTriangle(t.x - 26, y0, t.x - 110, ground, t.x + 110, ground)
          .fillStyle(0xffffff, 0.45).fillEllipse(t.x, ground, 240, 56);
        img.setDepth(this.deps.flyDepth);
        let lit = false;
        step = k => {
          const q = ufoAt(p, k);
          img.setPosition(q.x, q.y);
          beam.setAlpha(q.beam ? 0.7 + 0.3 * Math.sin(k * Math.PI * 24) : 0);
          if (q.beam && !lit) {
            lit = true;
            this.deps.sparkle(t.x, ground - 30);
          }
          if (q.beam) img.setTint([0xffffff, 0xbff7ff, 0xfff0b0][Math.floor(k * 30) % 3]);
          else img.clearTint();
        };
        break;
      }
      case 'dino': {
        let airborne = false;
        step = k => {
          const q = dinoAt(k);
          img.setPosition(p.x + q.dx, p.y + q.dy).setFlipX(q.left);
          if (q.dy < 0) {
            airborne = true;
          } else if (airborne) { // a landing: dust on both sides
            airborne = false;
            this.puff(img.x - 40, p.y - 4, 0xc8a878, 0.7);
            this.puff(img.x + 40, p.y - 4, 0xc8a878, 0.7);
          }
        };
        break;
      }
    }
    const t = { k: 0 };
    const show = this.scene.tweens.add({
      targets: t, k: 1, duration: SHOW_MS[id],
      onUpdate: () => { if (img.active && b.id === id) step(t.k); },
      onComplete: () => {
        const i = b.fx.indexOf(show);
        if (i >= 0) b.fx.splice(i, 1);
        if (img.active && b.id === id) this.setBig(slot, b, id);
      },
    });
    b.fx.push(show);
    return true;
  }

  /** Something drawn for a special's trick only. */
  private extra<T extends Phaser.GameObjects.GameObject>(b: BigView, o: T): T {
    b.extras.push(o);
    return o;
  }

  /** A first tap on a decoration without a trick: a quick squash, so the child sees it was touched. */
  wiggle(spot: SpotId): boolean {
    const v = this.spots.get(spot);
    if (!v?.id || v.id === 'pigeons') return false; // the flock has no picture of its own to squash
    const base = v.img.scaleX;
    this.scene.tweens.killTweensOf(v.img);
    v.img.setScale(base);
    this.scene.tweens.add({ targets: v.img, scaleY: base * 0.9, duration: 90, yoyo: true });
    return true;
  }

  /** A decoration's trick on a tap (pigeons, pond, bush); false for one without, or while it still runs. */
  trick(spot: SpotId): boolean {
    const id = this.spots.get(spot)?.id;
    if (id === 'pigeons') return this.flyPigeons(spot);
    if (id === 'pond') return this.jumpFish(spot);
    if (id === 'bush') return this.hopRabbit(spot);
    return false;
  }

  /**
   * A sprite owned by a spot's trick: it goes when the trick ends or the decoration does. It is
   * the drawn frame `name` from the decorations sheet (at CRITTER_SCALE) or, until that sheet is
   * loaded, the small pixel picture drawn in code.
   */
  private actor(v: SpotView, name: string, fallback: () => string, depth: number): Img {
    const art = this.art(name);
    const a = art
      ? this.scene.add.image(0, 0, art.key, name).setScale(CRITTER_SCALE)
      : this.scene.add.image(0, 0, fallback()).setScale(Math.max(3, Math.round(v.img.scaleX) + 1));
    a.setOrigin(0.5, 1).setDepth(depth);
    v.actors.push(a);
    return a;
  }

  /** The rabbit's pose: sitting, or stretched out in a hop (code-drawn rabbit: one pose). */
  private rabbitPose(r: Img, hop: boolean): void {
    const name = hop ? 'rabbitHop' : 'rabbit';
    const art = this.art(name);
    if (art && r.frame?.name !== name) r.setTexture(art.key, name);
  }

  private dropActor(v: SpotView, a: Img): void {
    const i = v.actors.indexOf(a);
    if (i >= 0) v.actors.splice(i, 1);
    a.destroy();
  }

  /** A red fish leaps out of the middle of the pond, arcs over and drops back in with a splash. */
  private jumpFish(spot: SpotId): boolean {
    const v = this.spots.get(spot)!;
    if (!this.busy.start(spot, FISH_JUMP_MS + 300, this.scene.time.now)) return false;
    const r = v.img.getBounds();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height * 0.6;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const span = Math.min(34, r.width * 0.25);
    const fish = this.actor(v, 'fish', () => pixelTexture(this.scene, 'px-fish', FISH_ROWS, FISH_PALETTE), (v.img.depth ?? 0) + 0.01);
    // the drawn koi already leaps nose-up: it turns from there to nose-down; the code fish lies flat
    const [a0, a1] = this.art('fish') ? [-15, 95] : [-60, 60];
    fish.setOrigin(0.5, 0.5).setFlipX(dir < 0).setPosition(cx - dir * span, cy).setAlpha(0);
    this.splash(cx - dir * span, cy);
    const t = { a: 0 };
    const jump = this.scene.tweens.add({
      targets: t, a: 1, duration: FISH_JUMP_MS,
      onUpdate: () => {
        if (!fish.active) return;
        const k = t.a;
        fish.setPosition(cx - dir * span + 2 * dir * span * k, cy - 4 * 120 * k * (1 - k));
        fish.setAngle(dir * (a0 + (a1 - a0) * k)); // nose up on the way out, nose down on the way in
        fish.setAlpha(Math.min(1, k * 10, (1 - k) * 10));
      },
      onComplete: () => {
        v.fx.splice(v.fx.indexOf(jump), 1);
        if (!fish.active) return;
        this.dropActor(v, fish);
        this.splash(cx + dir * span, cy);
      },
    });
    v.fx.push(jump);
    return true;
  }

  /** A rabbit hops out from behind the bush, looks round, turns and hops back in. */
  private hopRabbit(spot: SpotId): boolean {
    const v = this.spots.get(spot)!;
    if (!this.busy.start(spot, RABBIT_MS + 200, this.scene.time.now)) return false;
    const p = DECOR_SPOTS[spot];
    const r = v.img.getBounds();
    const dir = spot.endsWith('-0') ? 1 : -1; // out toward the middle of the pen, away from its fence
    const x0 = p.x + dir * r.width * 0.1;
    const x1 = p.x + dir * (r.width / 2 + 34);
    const ground = p.y - 4;
    // just behind the bush: it shows once it is out to the side
    const rabbit = this.actor(v, 'rabbit', () => pixelTexture(this.scene, 'px-rabbit', RABBIT_ROWS, RABBIT_PALETTE), (v.img.depth ?? 0) - 0.001);
    rabbit.setFlipX(dir < 0).setPosition(x0, ground);
    let turned = false;
    const t = { a: 0 };
    const run = this.scene.tweens.add({
      targets: t, a: 1, duration: RABBIT_MS,
      onUpdate: () => {
        if (!rabbit.active) return;
        const k = t.a;
        const hops = (u: number): number => Math.abs(Math.sin(u * Math.PI * 2)) * 18; // two hops
        if (k < 0.3) {
          const u = k / 0.3;
          rabbit.setPosition(x0 + (x1 - x0) * u, ground - hops(u));
          this.rabbitPose(rabbit, hops(u) > 3);
        } else if (k < 0.65) {
          rabbit.setPosition(x1, ground);
          this.rabbitPose(rabbit, false);
          if (!turned && k > 0.5) { turned = true; rabbit.setFlipX(dir > 0); } // looks round: back the way it came
        } else {
          const u = (k - 0.65) / 0.35;
          rabbit.setPosition(x1 + (x0 - x1) * u, ground - hops(u));
          this.rabbitPose(rabbit, hops(u) > 3);
        }
      },
      onComplete: () => {
        v.fx.splice(v.fx.indexOf(run), 1);
        if (rabbit.active) this.dropActor(v, rabbit);
      },
    });
    v.fx.push(run);
    return true;
  }

  /** Water thrown up where the fish breaks the surface: a widening ring and a few drops. */
  private splash(x: number, y: number): void {
    const ring = this.scene.add.graphics().setDepth(this.deps.depth + 0.2).setPosition(x, y);
    ring.lineStyle(3, 0xffffff, 0.9).strokeEllipse(0, 0, 26, 9);
    this.scene.tweens.add({ targets: ring, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    for (const dx of [-12, 0, 12]) {
      const d = this.scene.add.graphics().setDepth(this.deps.depth + 0.2).setPosition(x + dx * 0.3, y);
      d.fillStyle(0xd8f4ff, 1).fillCircle(0, 0, 3.5);
      this.scene.tweens.add({ targets: d, x: x + dx, y: y - 22 - Math.abs(dx) * 0.5, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
  }

  /** The pigeons take off, circle once and land again; false while they are still up. */
  flyPigeons(spot: SpotId): boolean {
    const v = this.spots.get(spot);
    if (!v || v.id !== 'pigeons' || !this.busy.start(spot, PIGEON_FLY_MS, this.scene.time.now)) return false;
    const p = DECOR_SPOTS[spot];
    v.birds.forEach((b, i) => {
      const home = { x: p.x + PIGEON_AT[i].x * p.w, y: p.y - PIGEON_AT[i].y };
      const r = 40 + i * 10;
      const phase = (i / v.birds.length) * Math.PI * 2;
      const t = { a: 0 };
      this.scene.tweens.killTweensOf(b);
      b.setAngle(0);
      this.pigeon(b, 2);
      // the flight tweens a plain number, so it is owned by the spot's fx: a swap stops it
      const fly = this.scene.tweens.add({
        targets: t, a: 1, duration: PIGEON_FLY_MS, ease: 'Sine.InOut',
        onUpdate: () => {
          if (!b.active) return;
          const lift = Math.sin(t.a * Math.PI) * 110;
          const ang = phase + t.a * Math.PI * 2;
          const k = Math.sin(t.a * Math.PI);
          b.setPosition(home.x + Math.cos(ang) * r * k, home.y - lift + Math.sin(ang) * r * 0.4 * k);
          b.setFlipX(Math.sin(ang) > 0);
        },
        onComplete: () => {
          v.fx.splice(v.fx.indexOf(fly), 1);
          if (!b.active) return;
          b.setPosition(home.x, home.y).setFlipX(i === 1);
          this.pigeon(b, 0);
        },
      });
      v.fx.push(fly);
    });
    return true;
  }

  /** A soft round cloud: smoke, flame, dust. */
  private puff(x: number, y: number, color: number, size: number, depth = this.deps.depth + 0.2): void {
    const g = this.scene.add.graphics().setDepth(depth).setPosition(x, y);
    g.fillStyle(color, 0.85).fillCircle(0, 0, 14 * size).fillCircle(-10 * size, 4, 10 * size).fillCircle(11 * size, 3, 11 * size);
    this.scene.tweens.add({
      targets: g, y: y - 26 * size, scaleX: 2, scaleY: 2, alpha: 0, duration: 750, onComplete: () => g.destroy(),
    });
  }

  sparkleSpot(s: SpotId): void {
    const p = DECOR_SPOTS[s];
    this.deps.sparkle(p.x, p.y - 40);
  }

  sparkleSlot(slot: 0 | 1): void {
    const p = BIG_SPOTS[slot];
    this.deps.sparkle(p.x, p.y - p.h / 2);
  }
}
