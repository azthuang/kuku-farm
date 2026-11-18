import Phaser from 'phaser';
import {
  DECOR, SPECIALS, SPOT_IDS, type DecorId, type DecorState, type SpecialId, type SpotId,
} from '../core/decor';
import { BIG_SPOTS, DECOR_SPOTS, bigBox, createBusy, spotFoot } from './decorLayout';
import { DECOR_LPC_FRAMES } from './decorAtlas';
import { DECOR_MADE_FRAMES, SPECIAL_FRAMES } from './decorMadeAtlas';

/** Texture keys of public/assets/decor/lpc.png and made.png (loaded by the scene). */
export const DECOR_LPC_TEX = 'decor-lpc';
export const DECOR_MADE_TEX = 'decor-made';
type Frames = Partial<Record<string, readonly [number, number, number, number]>>;
/**
 * A decoration fills its spot: the largest whole-pixel scale that fits the spot's width (two or
 * three tiles) and height limit, so its pixels stay crisp. Pigeons are drawn at PIGEON_SCALE.
 */
const PIGEON_SCALE = 3;
const fill = (w: number, h: number, boxW: number, boxH: number): number => Math.max(1, Math.floor(Math.min(boxW / w, boxH / h)));

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
const SHOW_MS: Record<SpecialId, number> = { xmasTree: 900, balloon: 4200, rocket: 5200, ufo: 1600, dino: 1000 };
export const PIGEON_FLY_MS = 1600;
/** Where the three pigeons stand, around the spot's foot. */
/** Where the three pigeons stand, as fractions of the spot's width and px up from its front. */
const PIGEON_AT = [{ x: -0.3, y: 6 }, { x: 0.02, y: 26 }, { x: 0.3, y: 2 }];

interface SpotView {
  img: Img;
  plus: Phaser.GameObjects.Container;
  birds: Img[];
  id: DecorId | null;
  open: boolean;
  fx: Fx[];
}
interface BigView { img: Img; id: SpecialId | null; fx: Fx[] }

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
      this.spots.set(s, { img, plus: this.makePlus(p.x, p.y - p.h * 0, depth), birds: [], id: null, open: false, fx: [] });
    }
    const big = (i: 0 | 1): BigView => {
      const p = BIG_SPOTS[i];
      const img = scene.add.image(p.x, p.y, '__MISSING').setOrigin(0.5, 1).setDepth(deps.depth + 0.1).setVisible(false);
      return { img, id: null, fx: [] };
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
    v.id = id;
    const p = DECOR_SPOTS[s];
    v.img.setVisible(!!id && id !== 'pigeons');
    if (!id) return;
    if (id !== 'pigeons') {
      const a = this.art(id);
      if (a) {
        v.img.setTexture(a.key, id).setScale(fill(a.w, a.h, p.w, p.h));
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
    const p = BIG_SPOTS[slot];
    b.id = id;
    b.img.setPosition(p.x, p.y).setAngle(0).setAlpha(1).clearTint().setVisible(!!id);
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
    for (const slot of [0, 1] as const) {
      const id = this.bigs[slot].id;
      if (id && inside(bigBox(slot))) return { slot, id };
    }
    return null;
  }

  /** The special's trick (rocket launch, UFO beam …); false while the last one still runs. */
  play(slot: 0 | 1): boolean {
    const b = this.bigs[slot];
    if (!b.id || !this.busy.start(`big${slot}`, SHOW_MS[b.id], this.scene.time.now)) return false;
    const p = BIG_SPOTS[slot];
    const img = b.img;
    const tw = this.scene.tweens;
    switch (b.id) {
      case 'xmasTree':
        this.deps.sparkle(p.x, p.y - img.displayHeight * 0.6);
        this.deps.sparkle(p.x, p.y - img.displayHeight * 0.3);
        tw.add({ targets: img, scaleX: img.scaleX * 1.06, scaleY: img.scaleY * 1.06, duration: 160, yoyo: true, repeat: 1 });
        break;
      case 'balloon':
        this.puff(p.x, p.y - img.displayHeight * 0.3, 0xff8a30, 1);
        tw.killTweensOf(img);
        tw.chain({
          targets: img,
          tweens: [
            { y: p.y - 150, x: p.x + 30, duration: 1500, ease: 'Sine.Out' },
            { y: p.y - 150, duration: 1000 },
            { y: p.y, x: p.x, duration: 1500, ease: 'Sine.InOut' },
          ],
          onComplete: () => { if (b.id === 'balloon') this.setBig(slot, b, 'balloon'); },
        });
        break;
      case 'rocket': {
        // a little shake for the countdown, then up and away, and back down again
        tw.chain({
          targets: img,
          tweens: [
            { x: p.x - 3, duration: 50, yoyo: true, repeat: 8 },
            { y: p.y - 1400, duration: 1100, ease: 'Quad.In' },
            { y: p.y - 1400, duration: 1400 },
            { y: p.y, duration: 1300, ease: 'Quad.Out' },
          ],
        });
        this.scene.time.delayedCall(950, () => {
          for (let i = 0; i < 5; i++) this.scene.time.delayedCall(i * 120, () => this.puff(p.x, p.y - 6, 0xeeeeee, 1.1));
        });
        break;
      }
      case 'ufo': {
        const beam = this.scene.add.graphics().setDepth(this.deps.depth + 0.05).setAlpha(0);
        const y0 = img.y - img.displayHeight * 0.35;
        beam.fillStyle(0xfff6a8, 0.55).fillTriangle(p.x - 18, y0, p.x + 18, y0, p.x + 56, p.y + 30)
          .fillTriangle(p.x - 18, y0, p.x - 56, p.y + 30, p.x + 56, p.y + 30);
        tw.add({ targets: beam, alpha: 1, duration: 220, yoyo: true, hold: 900, onComplete: () => beam.destroy() });
        this.deps.sparkle(p.x, p.y + 10);
        break;
      }
      case 'dino':
        tw.add({ targets: img, y: p.y - 26, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.Out' });
        for (const d of [300, 620]) this.scene.time.delayedCall(d, () => {
          this.puff(p.x - 40, p.y - 4, 0xc8a878, 0.8);
          this.puff(p.x + 40, p.y - 4, 0xc8a878, 0.8);
        });
        break;
    }
    return true;
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
  private puff(x: number, y: number, color: number, size: number): void {
    const g = this.scene.add.graphics().setDepth(this.deps.depth + 0.2).setPosition(x, y);
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
