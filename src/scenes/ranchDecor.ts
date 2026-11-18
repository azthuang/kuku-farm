import Phaser from 'phaser';
import {
  DECOR, SPECIALS, SPOT_IDS, type DecorId, type DecorState, type SpecialId, type SpotId,
} from '../core/decor';
import { BIG_SIZE, BIG_SPOTS, DECOR_SPOTS, SPOT_SIZE, bigBox, spotBox } from './decorLayout';

type Img = Phaser.GameObjects.Image;

export interface DecorDeps {
  /** Texture key of an emoji image (the stand-in until the art lands) and its size in texture pixels. */
  emojiTex(emoji: string): string;
  emojiPx: number;
  /** Stars at a world point. */
  sparkle(x: number, y: number): void;
  depth: number;
}

export type DecorHit = { spot: SpotId } | { slot: 0 | 1; id: SpecialId };

/** World size of a decoration and of a special (their height; emoji are square). */
const DECOR_PX = 64;
const SPECIAL_PX = 150;
/** A tap this far outside a spot's box still counts (small fingers, small targets). */
const HIT_PAD = 10;

interface SpotView { img: Img; plus: Phaser.GameObjects.Container; id: DecorId | null; open: boolean }
interface BigView { img: Img; id: SpecialId | null }

/**
 * The decorations on the map: one image per spot (or a faint wooden ＋ sign on an open, empty
 * spot in the care view) and the two specials. Looks only; the scene asks hit() on a tap.
 */
export class DecorLayer {
  private spots = new Map<SpotId, SpotView>();
  private bigs: [BigView, BigView];
  private overview = false;

  constructor(private scene: Phaser.Scene, private deps: DecorDeps) {
    for (const s of SPOT_IDS) {
      const p = DECOR_SPOTS[s];
      const img = scene.add.image(p.x, p.y, '__MISSING').setOrigin(0.5, 1).setDepth(deps.depth).setVisible(false);
      this.spots.set(s, { img, plus: this.makePlus(p.x, p.y), id: null, open: false });
    }
    this.bigs = [0, 1].map((i) => {
      const p = BIG_SPOTS[i];
      const img = scene.add.image(p.x, p.y, '__MISSING').setOrigin(0.5, 1).setDepth(deps.depth + 0.1).setVisible(false);
      return { img, id: null };
    }) as [BigView, BigView];
  }

  /** A small wooden sign with a white ＋, standing on the spot. */
  private makePlus(x: number, y: number): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    const w = 46;
    const h = 34;
    g.fillStyle(0x7a5230, 1).fillRect(-4, -26, 8, 26); // post
    g.fillStyle(0x5c3b1f, 0.35).fillRoundedRect(-w / 2 + 3, -26 - h + 3, w, h, 7);
    g.fillStyle(0xc8945a, 1).fillRoundedRect(-w / 2, -26 - h, w, h, 7);
    g.lineStyle(3, 0x8a5a2b, 1).strokeRoundedRect(-w / 2, -26 - h, w, h, 7);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-13, -26 - h / 2 - 3.5, 26, 7, 3).fillRoundedRect(-3.5, -26 - h / 2 - 13, 7, 26, 3);
    const c = this.scene.add.container(x, y, [g]).setDepth(this.deps.depth).setAlpha(0.8).setVisible(false);
    this.scene.tweens.add({ targets: c, alpha: 0.55, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return c;
  }

  private show(img: Img, emoji: string, px: number): void {
    const key = this.deps.emojiTex(emoji);
    if (img.texture.key !== key) img.setTexture(key);
    img.setScale(px / this.deps.emojiPx).setVisible(true);
  }

  sync(d: DecorState, open: (s: SpotId) => boolean, overview: boolean): void {
    this.overview = overview;
    for (const [s, v] of this.spots) {
      v.id = d.placed[s] ?? null;
      v.open = open(s);
      if (v.id) this.show(v.img, DECOR[v.id].emoji, DECOR_PX);
      else v.img.setVisible(false);
      v.plus.setVisible(!v.id && v.open && !overview);
    }
    this.bigs.forEach((b, i) => {
      b.id = d.big[i];
      if (b.id) this.show(b.img, SPECIALS[b.id].emoji, SPECIAL_PX);
      else b.img.setVisible(false);
    });
  }

  /** The ＋ signs are for the care view only. */
  setOverview(on: boolean): void {
    this.overview = on;
    for (const v of this.spots.values()) v.plus.setVisible(!v.id && v.open && !on);
  }

  /** What a tap at a world point lands on: a decorated or open spot, or a shown special. */
  hit(x: number, y: number): DecorHit | null {
    const inside = (r: { x: number; y: number; w: number; h: number }): boolean =>
      x >= r.x - HIT_PAD && x <= r.x + r.w + HIT_PAD && y >= r.y - HIT_PAD && y <= r.y + r.h + HIT_PAD;
    for (const [s, v] of this.spots) if ((v.id || v.open) && inside(spotBox(s))) return { spot: s };
    for (const slot of [0, 1] as const) {
      const id = this.bigs[slot].id;
      if (id && inside(bigBox(slot))) return { slot, id };
    }
    return null;
  }

  sparkleSpot(s: SpotId): void {
    const p = DECOR_SPOTS[s];
    this.deps.sparkle(p.x, p.y - SPOT_SIZE.h / 2);
  }

  sparkleSlot(slot: 0 | 1): void {
    const p = BIG_SPOTS[slot];
    this.deps.sparkle(p.x, p.y - BIG_SIZE.h / 2);
  }
}
