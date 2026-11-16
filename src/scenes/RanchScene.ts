/// <reference types="vite/client" />
import Phaser from 'phaser';
import { MOOD_HAPPY, type Animal, type House, type RanchState } from '../core/ranch';
import { ASSETS, ASSET_RES, EMOJI_FONT, makePlaceholderTextures } from './assets';
import { VIEW } from './FieldScene';
import { CHICKEN_PALETTES, recolor } from './recolor';

/** World units per sprite pixel: 5 canvas pixels at camera zoom ASSET_RES, so every pixel stays square. */
const PX = 2.5;
const FRAME = 32;
/** Feet row inside a 32×32 chicken frame (the sprite's ground point). */
const FEET_ORIGIN = 29 / FRAME;
const INV = 1 / ASSET_RES;
const HUNGRY_ICON_AT = 20;
/** Lying sick: the side frame flattened and tilted head-down (never rotated onto its side). */
const SICK_SCALE_X = 1.18;
const SICK_SCALE_Y = 0.55;
const SICK_TILT = 14;
const MAX_EGGS_SHOWN = 6;
const FONT = '"Arial Rounded MT Bold","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';

/** Direction rows of the LPC sheets, top to bottom. */
const UP = 0;
const LEFT = 1;
const DOWN = 2;
const RIGHT = 3;

const COATS = ['white', 'brown', 'black'] as const;
type Coat = typeof COATS[number];
/** Animal.color holds the species colour name (白/棕/黑); English keys accepted too. */
const COAT_OF: Record<string, Coat> = {
  白: 'white', 棕: 'brown', 黑: 'black', white: 'white', brown: 'brown', black: 'black',
};

interface Rect { x: number; y: number; w: number; h: number }

/**
 * House lots in world units (multiples of PX so the baked pixel art lines up).
 * Batch 1 has lot 0 only; the strip below it is kept free for more lots later.
 */
const LOTS: readonly Rect[] = [{ x: 30, y: 20, w: 540, h: 440 }];

/** Coop texture size and its place inside a lot, in sprite pixels. */
const COOP_W = 60;
const COOP_H = 58;
const COOP_AT = { x: 8, y: 0 };

/**
 * Animals are y-sorted within [animal, animal + 0.6]. Eggs sit just above them so a chicken
 * standing on its egg never hides it from the child.
 */
const DEPTH = { grass: 0, lot: 1, coop: 2, ground: 5, animal: 10, egg: 10.9, tag: 30, fx: 40, fly: 50 };

const TEX = {
  walkSrc: 'ck-walk-src',
  eatSrc: 'ck-eat-src',
  shadow: 'ck-shadow',
  grass: 'ranch-grass',
  coop: 'ranch-coop',
  run: (w: number, h: number) => `ranch-run-${w}x${h}`,
  sheet: (kind: 'walk' | 'eat', coat: Coat) => `ck-${kind}-${coat}`,
  anim: (kind: 'walk' | 'eat', coat: Coat, dir: number) => `ck-${coat}-${kind}-${dir}`,
};

/** Emoji images are baked at EMOJI_PX texture pixels; scale = wanted world size / EMOJI_PX. */
const EMOJI_PX = 80;
const SIZE = { egg: 30, poop: 32, icon: 34, pop: 34, fly: 36 };
/** Tag centre above the feet (standing / lying sick). */
const TAG_DY = 82;
const TAG_DY_LYING = 62;
/** Body centre above the feet (hit tests and effects). */
const BODY_DY = 32;
const HIT = { egg: 40, poop: 38, animal: 56 };

type Img = Phaser.GameObjects.Image;
type FxKind = 'jump' | 'eat' | 'brush' | 'treat' | 'heal' | 'weak' | 'shake';

export interface RanchHandlers {
  onAnimal(id: string): void;
  onPoop(houseId: string): void;
  onEgg(animalId: string): void;
  onLot(lot: number): void;
}

interface Run { x0: number; y0: number; x1: number; y1: number }

interface HouseView {
  id: string;
  lot: number;
  run: Run;
  ground: Img;
  coop: Img;
  poops: Img[];
  /** False until the first poop sync, which scatters existing poop instead of dropping it near a chicken. */
  synced: boolean;
}

interface EggView { img: Img; flying: boolean }

interface AnimalView {
  id: string;
  houseId: string;
  coat: Coat;
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Container;
  pill: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  icon: Img;
  heart: Img;
  name: string;
  iconKey: string;
  sick: boolean;
  /** Shows 🍽️ (satiety ≤ HUNGRY_ICON_AT). */
  hungry: boolean;
  /** Satiety 0: walks slowly and sits a lot. */
  starving: boolean;
  happy: boolean;
  eggs: EggView[];
  mode: 'idle' | 'walk' | 'eat';
  dir: number;
  tx: number;
  ty: number;
  speed: number;
  until: number;
  /** An fx owns the body until this time; then the pose is restored. 0 = not busy. */
  busyUntil: number;
  nextHeart: number;
}

interface LotView { lot: number; rect: Rect; box: Phaser.GameObjects.Container; plus: Phaser.GameObjects.Container }

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** Small deterministic PRNG (mulberry32) so scenery and initial poop do not jump around. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function runOf(lot: Rect): Run {
  return {
    x0: lot.x + 24 * PX,
    x1: lot.x + lot.w - 24 * PX,
    y0: lot.y + (COOP_AT.y + COOP_H + 8) * PX,
    y1: lot.y + lot.h - 18 * PX,
  };
}

const clamp = Phaser.Math.Clamp;

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * The ranch: grass, house lots (a wooden coop with a fenced run, or an empty lot with ＋),
 * wandering chickens with shadows and name tags, poop and eggs. render() only syncs what changed.
 */
export class RanchScene extends Phaser.Scene {
  private model: RanchState | null = null;
  private handlers: RanchHandlers = { onAnimal: () => {}, onPoop: () => {}, onEgg: () => {}, onLot: () => {} };
  private built = false;
  private houses = new Map<string, HouseView>();
  private animals = new Map<string, AnimalView>();
  /** Same views as `animals`, for allocation-free iteration in update(). */
  private animalList: AnimalView[] = [];
  private lots: LotView[] = [];
  /** The poop the child tapped last, removed first when that house's count drops. */
  private tappedPoop: Img | null = null;
  private pending = new Set<() => void>();
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'ranch' });
  }

  setHandlers(h: RanchHandlers): void {
    this.handlers = h;
  }

  preload(): void {
    const base = `${import.meta.env.BASE_URL}assets/ranch/`;
    if (!this.textures.exists(TEX.walkSrc)) this.load.image(TEX.walkSrc, `${base}chicken_walk.png`);
    if (!this.textures.exists(TEX.eatSrc)) this.load.image(TEX.eatSrc, `${base}chicken_eat.png`);
    if (!this.textures.exists(TEX.shadow)) {
      this.load.spritesheet(TEX.shadow, `${base}chicken_shadow.png`, { frameWidth: FRAME, frameHeight: FRAME });
    }
  }

  create(): void {
    this.houses.clear();
    this.animals.clear();
    this.animalList = [];
    this.lots = [];
    this.tappedPoop = null;

    makePlaceholderTextures(this);
    this.makeChickenTextures();
    this.makeSceneryTextures();

    const cam = this.cameras.main;
    cam.setZoom(ASSET_RES);
    cam.centerOn(VIEW / 2, VIEW / 2);

    this.add.image(0, 0, TEX.grass).setOrigin(0).setScale(PX).setDepth(DEPTH.grass);
    LOTS.forEach((rect, lot) => this.lots.push(this.buildLot(lot, rect)));
    this.sparkles = this.add.particles(0, 0, ASSETS.sparkle, {
      emitting: false,
      speed: { min: 40, max: 170 },
      lifespan: { min: 350, max: 750 },
      scale: { start: INV * 1.2, end: 0 },
      rotate: { start: 0, end: 180 },
      tint: [0xffd23f, 0xfff4b0, 0xffffff],
      blendMode: 'ADD',
    }).setDepth(DEPTH.fx);

    this.input.on('pointerdown', this.onPointer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.built = true;
    if (this.model) this.render(this.model);
  }

  update(time: number, delta: number): void {
    if (!this.built) return;
    const dt = Math.min(delta, 100) / 1000;
    const list = this.animalList;
    for (let i = 0; i < list.length; i++) this.step(list[i], time, dt);
  }

  /** Syncs the view to the ranch state: adds/removes only what changed. Safe before create(). */
  render(r: RanchState): void {
    this.model = r;
    if (!this.built) return;

    const liveHouses = new Set<string>();
    const usedLots = new Set<number>();
    for (const h of r.houses) {
      if (h.lot < 0 || h.lot >= LOTS.length) continue;
      liveHouses.add(h.id);
      usedLots.add(h.lot);
      let hv = this.houses.get(h.id);
      if (hv && hv.lot !== h.lot) {
        this.removeHouse(hv);
        hv = undefined;
      }
      if (!hv) hv = this.addHouse(h);
      this.syncPoop(hv, h, r);
    }
    for (const hv of [...this.houses.values()]) if (!liveHouses.has(hv.id)) this.removeHouse(hv);
    for (const lv of this.lots) lv.box.setVisible(!usedLots.has(lv.lot));

    const liveAnimals = new Set<string>();
    for (const a of r.animals) {
      const hv = this.houses.get(a.houseId);
      if (!hv) continue;
      liveAnimals.add(a.id);
      let v = this.animals.get(a.id);
      if (v && v.houseId !== a.houseId) {
        v.houseId = a.houseId;
        this.placeAt(v, this.freeSpot(hv.run, v));
        this.enterIdle(v, this.time.now, 300, 900);
      }
      if (!v) v = this.addAnimal(a, hv);
      this.syncAnimal(v, a, hv);
    }
    for (const v of [...this.animalList]) if (!liveAnimals.has(v.id)) this.removeAnimal(v);
  }

  fx(animalId: string, kind: FxKind): void {
    const v = this.animals.get(animalId);
    if (!this.built || !v) return;
    const now = this.time.now;
    const { body, shadow, box } = v;
    this.tweens.killTweensOf(body);
    this.tweens.killTweensOf(shadow);
    body.setPosition(0, 0).setAngle(0);
    shadow.setScale(PX);
    if (!v.sick || kind === 'heal' || kind === 'eat') body.setScale(PX);
    const cx = box.x;
    const cy = box.y - BODY_DY;

    switch (kind) {
      case 'jump':
        this.stand(v);
        this.hop(v, 1, 24);
        this.pop(v, '💗');
        v.busyUntil = now + 450;
        break;
      case 'treat':
        this.stand(v);
        this.hop(v, 2, 30);
        this.pop(v, '💗');
        this.time.delayedCall(260, () => { if (this.animals.get(animalId) === v) this.pop(v, '💗', 22); });
        v.busyUntil = now + 800;
        break;
      case 'eat':
        body.play(TEX.anim('eat', v.coat, v.dir === UP ? DOWN : v.dir));
        v.busyUntil = now + 1800;
        break;
      case 'brush':
        this.sparkles.explode(14, cx, cy);
        this.tweens.add({ targets: body, angle: { from: -8, to: 8 }, duration: 110, yoyo: true, repeat: 3 });
        v.busyUntil = now + 900;
        break;
      case 'heal':
        v.sick = false;
        this.setIcon(v);
        this.sparkles.explode(30, cx, cy);
        this.stand(v);
        body.setScale(PX * SICK_SCALE_X, PX * SICK_SCALE_Y);
        this.tweens.chain({
          targets: body,
          tweens: [
            { scaleX: PX, scaleY: PX, angle: 0, duration: 380, ease: 'Back.Out', easeParams: [2.5] },
            { y: -26, duration: 170, ease: 'Quad.Out', yoyo: true },
          ],
        });
        this.time.delayedCall(380, () => { if (this.animals.get(animalId) === v) this.pop(v, '💗'); });
        v.busyUntil = now + 1000;
        break;
      case 'weak':
        // A sick chicken lifts itself a little and sinks back.
        this.tweens.add({ targets: body, scaleY: v.sick ? PX * 0.86 : PX * 1.06, y: -3, duration: 380, yoyo: true, ease: 'Sine.Out' });
        v.busyUntil = now + 820;
        break;
      case 'shake':
        this.tweens.add({ targets: body, x: { from: -5, to: 5 }, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 2 });
        v.busyUntil = now + 600;
        break;
    }
  }

  /** An emoji (an egg on collect) bounces up from the animal (its egg if shown) and flies off the top. */
  flyFrom(animalId: string, emoji: string): Promise<void> {
    const v = this.animals.get(animalId);
    if (!this.built || !v) return Promise.resolve();
    let x = v.box.x;
    let y = v.box.y - BODY_DY;
    const egg = v.eggs.find(e => !e.flying);
    if (egg) {
      egg.flying = true;
      this.tweens.killTweensOf(egg.img);
      egg.img.setVisible(false);
      x = egg.img.x;
      y = egg.img.y;
    }
    const s = SIZE.fly / EMOJI_PX;
    const img = this.add.image(x, y, this.emojiTex(emoji)).setScale(s).setDepth(DEPTH.fly);
    const tx = VIEW * 0.25;
    return this.settle(2500, done => {
      this.tweens.chain({
        targets: img,
        tweens: [
          { y: y - 46, scaleX: s * 1.35, scaleY: s * 1.35, duration: 220, ease: 'Quad.Out' },
          { y: y - 22, scaleX: s * 1.15, scaleY: s * 1.15, duration: 160, ease: 'Bounce.Out' },
          { x: tx, y: -40, scaleX: s * 0.7, scaleY: s * 0.7, angle: -25, duration: 520, ease: 'Cubic.In' },
        ],
        onComplete: done,
      });
    }, () => img.destroy());
  }

  // ---------------------------------------------------------------- textures

  private makeChickenTextures(): void {
    const nearest = Phaser.Textures.FilterMode.NEAREST;
    if (this.textures.exists(TEX.shadow)) this.textures.get(TEX.shadow).setFilter(nearest);
    for (const kind of ['walk', 'eat'] as const) {
      const srcKey = kind === 'walk' ? TEX.walkSrc : TEX.eatSrc;
      if (!this.textures.exists(srcKey)) continue;
      const src = this.textures.get(srcKey).getSourceImage() as HTMLImageElement;
      for (const coat of COATS) {
        const key = TEX.sheet(kind, coat);
        if (!this.textures.exists(key)) {
          const tex = this.textures.createCanvas(key, src.width, src.height);
          if (!tex) continue;
          const ctx = tex.context;
          ctx.drawImage(src, 0, 0);
          const data = ctx.getImageData(0, 0, src.width, src.height);
          recolor(data.data, CHICKEN_PALETTES[coat]);
          ctx.putImageData(data, 0, 0);
          const cols = Math.floor(src.width / FRAME);
          const rows = Math.floor(src.height / FRAME);
          for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * FRAME, Math.floor(i / cols) * FRAME, FRAME, FRAME);
          tex.refresh();
          tex.setFilter(nearest);
        }
        for (let dir = 0; dir < 4; dir++) {
          const anim = TEX.anim(kind, coat, dir);
          if (this.anims.exists(anim)) continue;
          this.anims.create({
            key: anim,
            frames: [0, 1, 2, 3].map(i => ({ key, frame: dir * 4 + i })),
            frameRate: kind === 'walk' ? 8 : 7,
            repeat: -1,
          });
        }
      }
    }
  }

  private pixelTex(key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.context);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private makeSceneryTextures(): void {
    const G = VIEW / PX;
    this.pixelTex(TEX.grass, G, G, ctx => {
      const rnd = seeded(7);
      px(ctx, '#8fd16a', 0, 0, G, G);
      for (let i = 0; i < 70; i++) px(ctx, '#a3dc80', Math.floor(rnd() * G), Math.floor(rnd() * G));
      for (let i = 0; i < 150; i++) {
        const x = Math.floor(rnd() * (G - 3));
        const y = Math.floor(rnd() * (G - 2));
        px(ctx, '#77bd55', x, y + 1);
        px(ctx, '#77bd55', x + 1, y);
        px(ctx, '#77bd55', x + 2, y + 1);
      }
      for (let i = 0; i < 22; i++) {
        const x = 1 + Math.floor(rnd() * (G - 3));
        const y = 1 + Math.floor(rnd() * (G - 3));
        const petal = rnd() < 0.5 ? '#ffffff' : '#ffb3c7';
        px(ctx, petal, x - 1, y);
        px(ctx, petal, x + 1, y);
        px(ctx, petal, x, y - 1);
        px(ctx, petal, x, y + 1);
        px(ctx, '#ffd23f', x, y);
      }
    });

    for (const rect of LOTS) {
      const w = rect.w / PX;
      const h = rect.h / PX;
      this.pixelTex(TEX.run(w, h), w, h, ctx => drawRun(ctx, w, h));
    }
    this.pixelTex(TEX.coop, COOP_W, COOP_H, drawCoop);
  }

  /**
   * Emoji baked once to a smooth (linear-filtered) texture; returns its key. `badge` puts it on a
   * small white disc so faint glyphs (🍽️) still read over the dirt.
   */
  private emojiTex(emoji: string, badge = false): string {
    const key = `emoji:${badge ? 'b:' : ''}${emoji}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, EMOJI_PX, EMOJI_PX);
    if (!tex) return '__MISSING';
    const ctx = tex.context;
    const c = EMOJI_PX / 2;
    if (badge) {
      ctx.beginPath();
      ctx.arc(c, c, c - 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,248,225,0.96)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c99a68';
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(EMOJI_PX * (badge ? 0.6 : 0.78))}px ${EMOJI_FONT}`;
    ctx.fillText(emoji, c, c + 3);
    tex.refresh();
    return key;
  }

  private emoji(x: number, y: number, emoji: string, size: number, badge = false): Img {
    return this.add.image(x, y, this.emojiTex(emoji, badge)).setScale(size / EMOJI_PX);
  }

  // ---------------------------------------------------------------- lots and houses

  private buildLot(lot: number, rect: Rect): LotView {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.14).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 22);
    g.lineStyle(6, 0xffffff, 0.9);
    dashedRect(g, rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 24, 16);
    const arm = 110;
    const thick = 30;
    const p = this.add.graphics();
    p.fillStyle(0x4f9a35, 0.35)
      .fillRoundedRect(-arm / 2 + 4, -thick / 2 + 6, arm, thick, 12)
      .fillRoundedRect(-thick / 2 + 4, -arm / 2 + 6, thick, arm, 12);
    p.fillStyle(0xffffff, 1)
      .fillRoundedRect(-arm / 2, -thick / 2, arm, thick, 12)
      .fillRoundedRect(-thick / 2, -arm / 2, thick, arm, 12);
    const plus = this.add.container(rect.x + rect.w / 2, rect.y + rect.h / 2, [p]);
    this.tweens.add({ targets: plus, scaleX: 1.08, scaleY: 1.08, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const box = this.add.container(0, 0, [g, plus]).setDepth(DEPTH.lot);
    return { lot, rect, box, plus };
  }

  private addHouse(h: House): HouseView {
    const rect = LOTS[h.lot];
    const ground = this.add.image(rect.x, rect.y, TEX.run(rect.w / PX, rect.h / PX))
      .setOrigin(0).setScale(PX).setDepth(DEPTH.lot);
    const coop = this.add.image(rect.x + COOP_AT.x * PX, rect.y + COOP_AT.y * PX, TEX.coop)
      .setOrigin(0).setScale(PX).setDepth(DEPTH.coop);
    const hv: HouseView = { id: h.id, lot: h.lot, run: runOf(rect), ground, coop, poops: [], synced: false };
    this.houses.set(h.id, hv);
    return hv;
  }

  private removeHouse(hv: HouseView): void {
    hv.ground.destroy();
    hv.coop.destroy();
    for (const p of hv.poops) {
      this.tweens.killTweensOf(p);
      p.destroy();
    }
    this.houses.delete(hv.id);
  }

  private syncPoop(hv: HouseView, h: House, r: RanchState): void {
    const want = Math.max(0, Math.floor(h.poop));
    const rnd = seeded(hash(hv.id) + hv.poops.length * 7919);
    while (hv.poops.length < want) {
      let x = 0;
      let y = 0;
      const near = hv.synced
        ? r.animals.filter(a => a.houseId === h.id && !a.sick).map(a => this.animals.get(a.id)).filter(v => !!v)
        : [];
      for (let tries = 0; tries < 12; tries++) {
        if (near.length > 0) {
          const v = near[Math.floor(Math.random() * near.length)];
          x = v.box.x + (Math.random() < 0.5 ? -1 : 1) * rand(30, 50);
          y = v.box.y + rand(-6, 14);
        } else {
          // Existing poop on first show: stable spots per house; otherwise anywhere in the run.
          const f = hv.synced ? Math.random : rnd;
          x = hv.run.x0 + f() * (hv.run.x1 - hv.run.x0);
          y = hv.run.y0 + 10 + f() * (hv.run.y1 - hv.run.y0 - 10);
        }
        x = clamp(x, hv.run.x0, hv.run.x1);
        y = clamp(y, hv.run.y0 + 8, hv.run.y1);
        if (hv.poops.every(p => Phaser.Math.Distance.Between(p.x, p.y, x, y) > 40)) break;
      }
      const img = this.emoji(x, y, '💩', SIZE.poop).setDepth(DEPTH.ground);
      if (hv.synced) {
        const s = img.scaleX;
        img.setScale(0);
        this.tweens.add({ targets: img, scaleX: s, scaleY: s, duration: 260, ease: 'Back.Out' });
      }
      hv.poops.push(img);
    }
    while (hv.poops.length > want) {
      let i = hv.poops.length - 1;
      if (this.tappedPoop) {
        const t = hv.poops.indexOf(this.tappedPoop);
        if (t >= 0) i = t;
        this.tappedPoop = null;
      }
      const [img] = hv.poops.splice(i, 1);
      this.sparkles.explode(12, img.x, img.y);
      this.tweens.killTweensOf(img);
      this.tweens.add({
        targets: img, scaleX: 0, scaleY: 0, alpha: 0, duration: 220, ease: 'Back.In',
        onComplete: () => img.destroy(),
      });
    }
    hv.synced = true;
  }

  // ---------------------------------------------------------------- animals

  private addAnimal(a: Animal, hv: HouseView): AnimalView {
    const coat = COAT_OF[a.color] ?? 'white';
    const dir = Math.floor(Math.random() * 4);
    const shadow = this.add.sprite(0, 0, TEX.shadow, dir).setOrigin(0.5, FEET_ORIGIN).setScale(PX);
    const body = this.add.sprite(0, 0, TEX.sheet('walk', coat), dir * 4).setOrigin(0.5, FEET_ORIGIN).setScale(PX);
    const box = this.add.container(0, 0, [shadow, body]);

    const pill = this.add.graphics();
    const label = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#4a3a2a', resolution: ASSET_RES,
    }).setOrigin(0.5, 0.5);
    const icon = this.emoji(0, 0, '🍽️', SIZE.icon, true).setVisible(false);
    const heart = this.emoji(0, 0, '💗', SIZE.icon, true).setVisible(false);
    const tag = this.add.container(0, 0, [pill, label, icon, heart]).setDepth(DEPTH.tag);

    const v: AnimalView = {
      id: a.id, houseId: a.houseId, coat, box, body, shadow, tag, pill, label, icon, heart,
      name: '', iconKey: '', sick: false, hungry: false, starving: false, happy: false, eggs: [],
      mode: 'idle', dir, tx: 0, ty: 0, speed: 0, until: 0, busyUntil: 0,
      nextHeart: this.time.now + rand(2000, 8000),
    };
    this.animals.set(a.id, v);
    this.animalList.push(v);
    this.placeAt(v, this.freeSpot(hv.run, v));
    this.enterIdle(v, this.time.now, 200, 1500);
    return v;
  }

  private removeAnimal(v: AnimalView): void {
    this.tweens.killTweensOf([v.body, v.shadow, v.heart]);
    for (const e of v.eggs) {
      this.tweens.killTweensOf(e.img);
      e.img.destroy();
    }
    v.box.destroy();
    v.tag.destroy();
    this.animals.delete(v.id);
    const i = this.animalList.indexOf(v);
    if (i >= 0) this.animalList.splice(i, 1);
  }

  private syncAnimal(v: AnimalView, a: Animal, hv: HouseView): void {
    const coat = COAT_OF[a.color] ?? 'white';
    if (coat !== v.coat) {
      v.coat = coat;
      if (!v.busyUntil) this.applyPose(v, this.time.now);
    }
    if (a.name !== v.name) {
      v.name = a.name;
      v.label.setText(a.name);
      const w = Math.max(40, v.label.width + 18);
      const h = 30;
      v.pill.clear()
        .fillStyle(0x6b4226, 0.35).fillRoundedRect(-w / 2, -h / 2 + 2, w, h, 12)
        .fillStyle(0xfff8e1, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 12)
        .lineStyle(2, 0xc99a68, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
      v.icon.setX(w / 2 + 19);
      v.heart.setX(w / 2 + 19);
    }
    v.hungry = a.satiety <= HUNGRY_ICON_AT;
    v.starving = a.satiety <= 0;
    v.happy = a.mood >= MOOD_HAPPY;
    if (a.sick !== v.sick) {
      v.sick = a.sick;
      if (!v.busyUntil) this.applyPose(v, this.time.now);
    }
    this.setIcon(v);
    this.syncEggs(v, a, hv);
  }

  private setIcon(v: AnimalView): void {
    const key = v.sick ? '🤒' : v.hungry ? '🍽️' : '';
    if (key === v.iconKey) return;
    v.iconKey = key;
    if (!key) {
      v.icon.setVisible(false);
      return;
    }
    v.icon.setTexture(this.emojiTex(key, true)).setVisible(true);
    v.heart.setVisible(false);
    const s = SIZE.icon / EMOJI_PX;
    v.icon.setScale(0);
    this.tweens.add({ targets: v.icon, scaleX: s, scaleY: s, duration: 240, ease: 'Back.Out' });
  }

  private syncEggs(v: AnimalView, a: Animal, hv: HouseView): void {
    const want = clamp(Math.floor(a.waiting), 0, MAX_EGGS_SHOWN);
    if (v.eggs.length < want) {
      const side = v.box.x > (hv.run.x0 + hv.run.x1) / 2 ? -1 : 1;
      let last = v.eggs.length > 0 ? v.eggs[v.eggs.length - 1].img : null;
      while (v.eggs.length < want) {
        const x = last ? last.x + side * 20 : v.box.x + side * 40;
        const y = last ? (last.getData('baseY') as number) + (v.eggs.length % 2 === 0 ? -8 : 8) : v.box.y + 2;
        const cx = clamp(x, hv.run.x0 - 10, hv.run.x1 + 10);
        const cy = clamp(y, hv.run.y0 + 4, hv.run.y1 + 6);
        const img = this.emoji(cx, cy, '🥚', SIZE.egg).setDepth(DEPTH.egg).setData('baseY', cy);
        const s = img.scaleX;
        img.setScale(0);
        this.tweens.add({ targets: img, scaleX: s, scaleY: s, duration: 280, ease: 'Back.Out' });
        this.tweens.add({
          targets: img, y: cy - 5, duration: 520, ease: 'Sine.InOut', yoyo: true, repeat: -1,
          delay: Math.floor(Math.random() * 600), repeatDelay: 900,
        });
        v.eggs.push({ img, flying: false });
        last = img;
      }
    }
    while (v.eggs.length > want) {
      // Eggs already flown by flyFrom go first, then from the end.
      let i = v.eggs.findIndex(e => e.flying);
      if (i < 0) i = v.eggs.length - 1;
      const [e] = v.eggs.splice(i, 1);
      this.tweens.killTweensOf(e.img);
      e.img.destroy();
    }
  }

  /** A spot in the run away from the other animals. */
  private freeSpot(run: Run, self: AnimalView): { x: number; y: number } {
    let best = { x: (run.x0 + run.x1) / 2, y: (run.y0 + run.y1) / 2 };
    let bestD = -1;
    for (let tries = 0; tries < 10; tries++) {
      const x = rand(run.x0, run.x1);
      const y = rand(run.y0, run.y1);
      let d = Infinity;
      for (const o of this.animalList) {
        if (o !== self) d = Math.min(d, Phaser.Math.Distance.Between(o.box.x, o.box.y, x, y));
      }
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
      if (d > 90) break;
    }
    return best;
  }

  private placeAt(v: AnimalView, p: { x: number; y: number }): void {
    v.box.setPosition(p.x, p.y).setDepth(DEPTH.animal + p.y / 1000);
    v.tag.setPosition(p.x, p.y - TAG_DY);
  }

  /** Back to the resting pose after an fx (or on a coat / sick change). */
  private applyPose(v: AnimalView, time: number): void {
    const { body, shadow } = v;
    this.tweens.killTweensOf(body);
    this.tweens.killTweensOf(shadow);
    body.setPosition(0, 0).setAngle(0);
    shadow.setScale(PX).setAlpha(1);
    if (v.sick) {
      // Lying down: the side frame squashed flat, breathing slowly (alive, just unwell).
      const side = v.dir === LEFT ? LEFT : RIGHT;
      v.dir = side;
      body.anims.stop();
      body.setTexture(TEX.sheet('walk', v.coat), side * 4)
        .setScale(PX * SICK_SCALE_X, PX * SICK_SCALE_Y)
        .setAngle(side === LEFT ? -SICK_TILT : SICK_TILT) // head drooping toward the ground
        .setY(2);
      shadow.setFrame(side).setScale(PX * 1.1, PX);
      this.tweens.add({ targets: body, scaleY: PX * (SICK_SCALE_Y + 0.05), duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      v.mode = 'idle';
    } else {
      body.setScale(PX);
      this.enterIdle(v, time, 300, 900);
    }
  }

  /** Stand up straight (for effects that need the full body). */
  private stand(v: AnimalView): void {
    v.body.anims.stop();
    v.body.setTexture(TEX.sheet('walk', v.coat), v.dir * 4).setScale(PX);
  }

  private hop(v: AnimalView, times: number, height: number): void {
    this.tweens.add({ targets: v.body, y: -height, duration: 160, ease: 'Quad.Out', yoyo: true, repeat: times - 1 });
    this.tweens.add({ targets: v.shadow, scaleX: PX * 0.8, scaleY: PX * 0.8, duration: 160, yoyo: true, repeat: times - 1 });
  }

  /** A one-shot emoji that rises from the animal's head and fades. */
  private pop(v: AnimalView, emoji: string, dx = 0): void {
    const s = SIZE.pop / EMOJI_PX;
    const img = this.emoji(v.box.x + dx, v.box.y - 60, emoji, SIZE.pop).setDepth(DEPTH.fx).setScale(0);
    this.tweens.chain({
      targets: img,
      tweens: [
        { scaleX: s, scaleY: s, y: img.y - 18, duration: 220, ease: 'Back.Out' },
        { y: img.y - 48, alpha: 0, duration: 650, ease: 'Sine.In' },
      ],
      onComplete: () => img.destroy(),
    });
  }

  private enterIdle(v: AnimalView, time: number, lo: number, hi: number): void {
    v.mode = 'idle';
    v.until = time + rand(lo, hi);
    v.body.anims.stop();
    v.body.setTexture(TEX.sheet('walk', v.coat), v.dir * 4);
    // Hungry chickens sit down while they rest.
    v.body.setScale(PX, v.starving ? PX * 0.88 : PX);
  }

  private enterWalk(v: AnimalView, time: number, run: Run): void {
    const { x, y } = v.box;
    let tx = x;
    let ty = y;
    for (let tries = 0; tries < 4; tries++) {
      tx = clamp(x + rand(-170, 170), run.x0, run.x1);
      ty = clamp(y + rand(-110, 110), run.y0, run.y1);
      if (Math.abs(tx - x) + Math.abs(ty - y) > 40) break;
    }
    const dx = tx - x;
    const dy = ty - y;
    v.dir = Math.abs(dx) >= Math.abs(dy) * 0.8 ? (dx < 0 ? LEFT : RIGHT) : (dy < 0 ? UP : DOWN);
    v.tx = tx;
    v.ty = ty;
    v.speed = v.starving ? 20 : rand(40, 55);
    v.mode = 'walk';
    v.until = time + 12000; // safety: never walk forever
    v.body.setScale(PX);
    v.body.anims.play(TEX.anim('walk', v.coat, v.dir), true);
    v.body.anims.timeScale = v.starving ? 0.55 : 1;
    v.shadow.setFrame(v.dir);
  }

  private enterEat(v: AnimalView, time: number): void {
    v.mode = 'eat';
    v.until = time + rand(1200, 2600);
    v.body.setScale(PX);
    v.body.anims.play(TEX.anim('eat', v.coat, v.dir), true);
    v.body.anims.timeScale = v.starving ? 0.6 : 1;
  }

  /** Per-frame AI: no allocations. */
  private step(v: AnimalView, time: number, dt: number): void {
    const box = v.box;
    v.tag.setPosition(box.x, box.y - (v.sick ? TAG_DY_LYING : TAG_DY));

    if (v.busyUntil) {
      if (time < v.busyUntil) return;
      v.busyUntil = 0;
      this.applyPose(v, time);
    }
    if (v.sick) return;

    if (v.happy && !v.hungry && time >= v.nextHeart) {
      v.nextHeart = time + rand(7000, 14000);
      this.heartBlip(v);
    }

    if (v.mode === 'walk') {
      const dx = v.tx - box.x;
      const dy = v.ty - box.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const move = v.speed * dt;
      if (dist <= move || time >= v.until) {
        box.setPosition(v.tx, v.ty);
        this.enterIdle(v, time, v.starving ? 2500 : 700, v.starving ? 6000 : 2400);
      } else {
        box.setPosition(box.x + (dx / dist) * move, box.y + (dy / dist) * move);
      }
      box.setDepth(DEPTH.animal + box.y / 1000);
      return;
    }

    if (time < v.until) return;
    const hv = this.houses.get(v.houseId);
    if (!hv) return;
    if (Math.random() < (v.starving ? 0.15 : 0.35)) this.enterEat(v, time);
    else this.enterWalk(v, time, hv.run);
  }

  private heartBlip(v: AnimalView): void {
    const h = v.heart;
    const s = SIZE.icon / EMOJI_PX;
    this.tweens.killTweensOf(h);
    h.setVisible(true).setAlpha(1).setScale(0).setY(0);
    this.tweens.chain({
      targets: h,
      tweens: [
        { scaleX: s, scaleY: s, duration: 220, ease: 'Back.Out' },
        { y: -14, alpha: 0, delay: 900, duration: 500, ease: 'Sine.In' },
      ],
      onComplete: () => h.setVisible(false).setY(0),
    });
  }

  // ---------------------------------------------------------------- input and lifecycle

  private onPointer(p: Phaser.Input.Pointer): void {
    if (!this.built) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const dist = Phaser.Math.Distance.Between;

    // Eggs first: a chicken standing on its egg must not block collecting it.
    let egg: AnimalView | null = null;
    let best = HIT.egg;
    for (const v of this.animalList) {
      for (const e of v.eggs) {
        if (e.flying) continue;
        const d = dist(w.x, w.y, e.img.x, e.img.y);
        if (d < best) {
          best = d;
          egg = v;
        }
      }
    }
    if (egg) {
      this.handlers.onEgg(egg.id);
      return;
    }

    let poop: { hv: HouseView; img: Img } | null = null;
    best = HIT.poop;
    for (const hv of this.houses.values()) {
      for (const img of hv.poops) {
        const d = dist(w.x, w.y, img.x, img.y);
        if (d < best) {
          best = d;
          poop = { hv, img };
        }
      }
    }

    let animal: AnimalView | null = null;
    let bestA = HIT.animal;
    for (const v of this.animalList) {
      const dBody = dist(w.x, w.y, v.box.x, v.box.y - BODY_DY);
      const dTag = dist(w.x, w.y, v.tag.x, v.tag.y) + 8;
      const d = Math.min(dBody, dTag);
      if (d < bestA) {
        bestA = d;
        animal = v;
      }
    }

    // A poop under the finger wins unless the tap is clearly nearer a chicken's body.
    if (poop && (!animal || best <= bestA + 12)) {
      this.tappedPoop = poop.img;
      this.handlers.onPoop(poop.hv.id);
      return;
    }
    if (animal) {
      this.handlers.onAnimal(animal.id);
      return;
    }
    for (const lv of this.lots) {
      const r = lv.rect;
      if (lv.box.visible && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) {
        this.tweens.add({ targets: lv.box, alpha: 0.6, duration: 80, yoyo: true });
        this.handlers.onLot(lv.lot);
        return;
      }
    }
  }

  /** Resolves when `run` calls done, or after maxMs (scene asleep, tween killed). Cleanup runs once. */
  private settle(maxMs: number, run: (done: () => void) => void, cleanup: () => void): Promise<void> {
    return new Promise(resolve => {
      let finished = false;
      const done = (): void => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        this.pending.delete(done);
        cleanup();
        resolve();
      };
      const timer = window.setTimeout(done, maxMs);
      this.pending.add(done);
      run(done);
    });
  }

  private onShutdown(): void {
    this.built = false;
    for (const done of [...this.pending]) done();
    this.pending.clear();
    this.input.off('pointerdown', this.onPointer, this);
    this.houses.clear();
    this.animals.clear();
    this.animalList = [];
    this.lots = [];
    this.tappedPoop = null;
  }
}

// ---------------------------------------------------------------- pixel art

function dashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, dash: number, gap: number): void {
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.lineBetween(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}

const WOOD = { light: '#e0a868', mid: '#b8773f', dark: '#7a4a24', line: '#5a3418' };

/** Dirt-and-straw run with a wooden fence around it, w × h sprite pixels. */
function drawRun(ctx: Ctx, w: number, h: number): void {
  const rnd = seeded(11);
  // ground
  px(ctx, '#dcc08a', 2, 8, w - 4, h - 14);
  px(ctx, '#c9a873', 2, 8, w - 4, 3);
  for (let i = 0; i < 120; i++) px(ctx, '#cfb07a', 3 + Math.floor(rnd() * (w - 6)), 11 + Math.floor(rnd() * (h - 20)));
  for (let i = 0; i < 45; i++) {
    px(ctx, '#efdaa0', 4 + Math.floor(rnd() * (w - 10)), 12 + Math.floor(rnd() * (h - 24)), 2 + Math.floor(rnd() * 2), 1);
  }
  for (let i = 0; i < 18; i++) {
    const x = 6 + Math.floor(rnd() * (w - 12));
    const y = 14 + Math.floor(rnd() * (h - 30));
    px(ctx, '#8fc160', x, y + 1);
    px(ctx, '#8fc160', x + 1, y);
    px(ctx, '#8fc160', x + 2, y + 1);
  }

  // decor right of the coop: hay bale and water trough
  const hx = w - 62;
  const hy = 24;
  px(ctx, WOOD.line, hx - 1, hy - 1, 26, 15);
  px(ctx, '#e8c25a', hx, hy, 24, 13);
  px(ctx, '#f5d978', hx, hy, 24, 3);
  px(ctx, '#c99a35', hx, hy + 10, 24, 3);
  for (let i = 2; i < 24; i += 4) px(ctx, '#c99a35', hx + i, hy + 4, 1, 5);
  px(ctx, '#a0522d', hx + 7, hy, 1, 13);
  px(ctx, '#a0522d', hx + 16, hy, 1, 13);
  const tx = w - 112;
  const ty = 34;
  px(ctx, WOOD.line, tx - 1, ty - 1, 24, 10);
  px(ctx, WOOD.mid, tx, ty, 22, 8);
  px(ctx, '#6cc4f0', tx + 2, ty + 1, 18, 3);
  px(ctx, '#a6e0ff', tx + 3, ty + 1, 6, 1);
  px(ctx, WOOD.dark, tx, ty + 6, 22, 2);

  // side fences: a rail with short posts
  for (const fx of [0, w - 4]) {
    px(ctx, WOOD.light, fx + 1, 8, 2, h - 12);
    px(ctx, WOOD.dark, fx + 3, 8, 1, h - 12);
    for (let y = 8; y < h - 8; y += 18) {
      px(ctx, WOOD.line, fx, y, 4, 8);
      px(ctx, WOOD.mid, fx, y, 3, 7);
      px(ctx, WOOD.light, fx, y, 1, 7);
    }
  }
  // back and front fences: two rails and posts
  for (const top of [2, h - 16]) {
    for (const ry of [top + 4, top + 9]) {
      px(ctx, WOOD.light, 0, ry, w, 2);
      px(ctx, WOOD.dark, 0, ry + 2, w, 1);
    }
    for (let x = 0; x <= w - 4; x += 18) post(ctx, x, top);
    post(ctx, w - 4, top);
  }
}

function post(ctx: Ctx, x: number, y: number): void {
  px(ctx, WOOD.line, x, y, 4, 14);
  px(ctx, WOOD.mid, x, y, 3, 13);
  px(ctx, WOOD.light, x, y + 1, 1, 12);
  px(ctx, '#f0c48a', x, y, 3, 1);
}

/** Little wooden coop with a red roof, arched door and ramp (COOP_W × COOP_H sprite pixels). */
function drawCoop(ctx: Ctx): void {
  const W = COOP_W;
  const cx = W / 2;
  // shadow on the ground
  ctx.fillStyle = 'rgba(70,45,20,0.28)';
  ctx.fillRect(4, 50, W - 6, 4);

  // walls
  px(ctx, WOOD.line, 5, 18, W - 10, 35);
  px(ctx, '#d9a066', 6, 18, W - 12, 33);
  for (let x = 12; x < W - 6; x += 7) px(ctx, '#b47a45', x, 19, 1, 32);
  px(ctx, '#a8703f', 6, 18, W - 12, 3);
  px(ctx, '#e6b47c', 6, 49, W - 12, 1);

  // roof (stepped triangle with shingle rows)
  for (let y = 0; y < 22; y++) {
    const hw = Math.min(cx, 3 + Math.round(y * 1.35));
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    const shingle = y % 4 === 3 ? '#a83f2c' : '#c9503a';
    px(ctx, shingle, x0, y, x1 - x0, 1);
    px(ctx, '#7d2c20', x0, y, 1, 1);
    px(ctx, '#7d2c20', x1 - 1, y, 1, 1);
    if (y < 18) px(ctx, '#e0705a', x0 + 1, y, 1, 1);
  }
  px(ctx, '#7d2c20', 0, 21, W, 2);
  px(ctx, '#f0d0a0', cx - 3, 8, 6, 6); // round vent
  px(ctx, WOOD.dark, cx - 2, 9, 4, 4);

  // arched door
  px(ctx, WOOD.line, 21, 30, 18, 23);
  px(ctx, WOOD.line, 23, 28, 14, 2);
  px(ctx, '#4a2c17', 23, 31, 14, 22);
  px(ctx, '#4a2c17', 25, 30, 10, 1);
  px(ctx, '#6b4226', 23, 31, 2, 22);
  px(ctx, '#e8c25a', 26, 47, 8, 4); // straw inside

  // window
  px(ctx, WOOD.line, 42, 24, 11, 10);
  px(ctx, '#fff1b8', 43, 25, 9, 8);
  px(ctx, WOOD.dark, 47, 25, 1, 8);
  px(ctx, WOOD.dark, 43, 28, 9, 1);
  px(ctx, '#7fbf55', 42, 34, 11, 2); // flower box
  px(ctx, '#ff6b8a', 44, 33, 1, 1);
  px(ctx, '#ffd23f', 48, 33, 1, 1);
  px(ctx, '#ff6b8a', 51, 33, 1, 1);

  // ramp
  px(ctx, WOOD.line, 23, 52, 14, 6);
  px(ctx, '#c99058', 24, 52, 12, 5);
  for (let y = 53; y < 57; y += 2) px(ctx, '#9a6436', 24, y, 12, 1);
}
