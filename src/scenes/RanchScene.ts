/// <reference types="vite/client" />
import Phaser from 'phaser';
import { HUNGRY_SHOW_AT, MOOD_HAPPY, pageStatus, type Animal, type House, type PageStatus, type RanchState } from '../core/ranch';
import { PRODUCT_EMOJI, SPECIES, SPECIES_ORDER, type HouseKind, type SpeciesId } from '../core/species';
import { ASSETS, ASSET_RES, EMOJI_FONT, makePlaceholderTextures } from './assets';
import { VIEW } from './FieldScene';
import { HOUSE_ART, dashedRect, drawGrass, drawRun, hash, seeded } from './ranchArt';
import { PALETTES, recolor } from './recolor';

/** World units per scenery pixel: 5 canvas pixels at camera zoom ASSET_RES, so every pixel stays square. */
const PX = 2.5;
const INV = 1 / ASSET_RES;
const MAX_ITEMS_SHOWN = 6;
const FONT = '"Arial Rounded MT Bold","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';

/** Direction rows of the LPC sheets, top to bottom. */
const UP = 0;
const LEFT = 1;
const DOWN = 2;
const RIGHT = 3;

/**
 * How one species is drawn and touched. Distances are world units measured from the feet
 * (the sprite origin), taken from the frames' pixel bounds × scale. scale × ASSET_RES is an
 * integer so pixels stay square.
 */
interface Look {
  frame: number;
  scale: number;
  /** Ground row inside the frame (side view). */
  feet: number;
  /** Body centre above the feet (hit circle, effects). */
  body: number;
  hit: number;
  /** Name tag centre above the feet, standing / lying sick. Its hit box must clear the head. */
  tag: number;
  tagLying: number;
  /** Half the widest side view, and how far the front/back views reach below the feet. */
  halfW: number;
  below: number;
  sickX: number;
  sickY: number;
  sickTilt: number;
  speed: readonly [number, number];
  walkFps: number;
  eatFps: number;
  /** 128-px LPC animals: eat plays forward to start, loops frames 3–4, plays backward to stop. */
  big: boolean;
  hop: number;
  shadow: string;
  item: number;
}

const LOOK: Record<SpeciesId, Look> = {
  chicken: {
    frame: 32, scale: 2.5, feet: 29, body: 32, hit: 56, tag: 92, tagLying: 70, halfW: 40, below: 6,
    sickX: 1.18, sickY: 0.55, sickTilt: 14, speed: [40, 55], walkFps: 8, eatFps: 7, big: false, hop: 24,
    shadow: 'ck-shadow', item: 30,
  },
  cow: {
    frame: 128, scale: 2, feet: 88, body: 44, hit: 80, tag: 118, tagLying: 82, halfW: 90, below: 48,
    sickX: 1.12, sickY: 0.6, sickTilt: 5, speed: [28, 38], walkFps: 6, eatFps: 6, big: true, hop: 16,
    shadow: 'cow-shadow', item: 36,
  },
  pig: {
    frame: 128, scale: 2, feet: 84, body: 30, hit: 62, tag: 102, tagLying: 68, halfW: 64, below: 16,
    sickX: 1.12, sickY: 0.62, sickTilt: 6, speed: [30, 42], walkFps: 7, eatFps: 6, big: true, hop: 18,
    shadow: 'llama-shadow', item: 34,
  },
  sheep: {
    frame: 128, scale: 2, feet: 83, body: 38, hit: 64, tag: 108, tagLying: 72, halfW: 60, below: 18,
    sickX: 1.12, sickY: 0.62, sickTilt: 6, speed: [30, 42], walkFps: 7, eatFps: 6, big: true, hop: 18,
    shadow: 'llama-shadow', item: 34,
  },
  llama: {
    frame: 128, scale: 2, feet: 91, body: 64, hit: 74, tag: 156, tagLying: 100, halfW: 62, below: 10,
    sickX: 1.1, sickY: 0.6, sickTilt: 5, speed: [30, 40], walkFps: 7, eatFps: 6, big: true, hop: 18,
    shadow: 'llama-shadow', item: 34,
  },
};

const SHADOW_FILE: Record<string, string> = {
  'ck-shadow': 'chicken_shadow.png', 'cow-shadow': 'cow_shadow.png', 'llama-shadow': 'llama_shadow.png',
};

interface Rect { x: number; y: number; w: number; h: number }

/**
 * World layout: a 2-column × 3-row grid of VIEW-sized page cells, lot i (= SPECIES_ORDER[i]'s
 * house) in cell i, row-major; cell 5 is the blank "之後擴建" plot for later batches.
 * The care view frames one cell at zoom ASSET_RES; the overview fits the whole grid.
 */
const COLS = 2;
const ROWS = 3;
const PAGES = SPECIES_ORDER.length;
const GRID_W = COLS * VIEW;
const GRID_H = ROWS * VIEW;
const OVERVIEW_ZOOM = ASSET_RES * Math.min(VIEW / GRID_W, VIEW / GRID_H);
/** The lot inside its cell (multiples of PX so the baked pixel art lines up). */
const LOT_IN_CELL: Rect = { x: 30, y: 80, w: 540, h: 440 };

function cellRect(i: number): Rect {
  return {
    x: (i % COLS) * VIEW + LOT_IN_CELL.x, y: Math.floor(i / COLS) * VIEW + LOT_IN_CELL.y,
    w: LOT_IN_CELL.w, h: LOT_IN_CELL.h,
  };
}
const LOTS: readonly Rect[] = Array.from({ length: PAGES }, (_, i) => cellRect(i));
const KIND_OF_LOT: readonly HouseKind[] = SPECIES_ORDER.map(s => SPECIES[s].house);

/** Animals are y-sorted within [animal, animal + 0.18]; items sit above them so none is ever hidden. */
const DEPTH = { grass: 0, lot: 1, house: 2, ground: 5, animal: 10, item: 10.5, tag: 30, badge: 35, fx: 40, fly: 50 };

const TEX = {
  src: (sp: SpeciesId, kind: 'walk' | 'eat') => `${sp}-${kind}-src`,
  grass: 'ranch-grass',
  house: (k: HouseKind) => `ranch-house-${k}`,
  run: (k: HouseKind) => `ranch-run-${k}`,
  sheet: (sp: SpeciesId, kind: 'walk' | 'eat', coat: number) => `${sp}-${kind}-${coat}`,
  anim: (sp: SpeciesId, coat: number, kind: 'walk' | 'eat' | 'eatin' | 'eatout', dir: number) => `${sp}-${coat}-${kind}-${dir}`,
};

/** Emoji images are baked at EMOJI_PX texture pixels; scale = wanted world size / EMOJI_PX. */
const EMOJI_PX = 80;
const SIZE = { poop: 32, icon: 34, pop: 34, fly: 36, badge: 92, lock: 130, lockCrop: 110 };
const HIT = { item: 40, poop: 38 };
/** Name pill height and the extra margin around it that still counts as a tag tap. */
const TAG_H = 30;
const TAG_HIT_PAD = 2;
/** Range of the gap between two ambient voices across the ranch (scene running time). */
const VOICE_MS = { min: 20_000, max: 40_000 };
/** Pointer thresholds in game pixels (the canvas is VIEW × ASSET_RES wide, ~3.5 per CSS px on a phone). */
const SWIPE_PX = 110;
const TAP_SLOP_PX = 60;
const PAN_MS = 380;
const ZOOM_MS = 480;

type Img = Phaser.GameObjects.Image;
type FxKind = 'jump' | 'eat' | 'brush' | 'treat' | 'heal' | 'weak' | 'shake';

export interface RanchHandlers {
  onAnimal(id: string): void;
  onPoop(houseId: string): void;
  /** A product (egg, milk, ...) beside the animal was tapped. */
  onEgg(animalId: string): void;
  /** An empty, unlocked lot was tapped. */
  onLot(lot: number): void;
  /** An empty lot whose house is still locked (its crop level not open) was tapped. */
  onLockedLot(kind: HouseKind): void;
  /** The name tag was tapped (rename). */
  onTag(animalId: string): void;
  /** Overview: a page cell was tapped (no care handler fires in the overview). */
  onPageTap(index: number): void;
  /** Care view: a horizontal swipe; +1 = next page (finger moved left). */
  onSwipe(dir: -1 | 1): void;
  /** A healthy animal on screen makes its sound now and then (at most one every VOICE_MS). */
  onIdleVoice?(animalId: string): void;
}

/** What the app knows that the ranch state does not: which empty lots are locked, and by which crop. */
export interface RanchView {
  locked: Record<HouseKind, boolean>;
  /** Emoji of the crop that keeps each locked house closed (shown as 🔒 + crop). */
  lockCrop?: Partial<Record<HouseKind, string>>;
}

/**
 * Which target wins when a tap hits an animal and an item/poop at once. 'items' (the ✋ tool):
 * products, then poop, then the animal. 'animals' (any other tool): the animal the child aimed at.
 */
export type TapPriority = 'items' | 'animals';

interface Run { x0: number; y0: number; x1: number; y1: number }

interface HouseView {
  id: string;
  lot: number;
  kind: HouseKind;
  /** Where items (poop, products) may lie. */
  run: Run;
  /** Fence-inner box below the house; each animal's own run is this inset by its look. */
  yard: Run;
  ground: Img;
  house: Img;
  poops: Img[];
  /** False until the first poop sync, which scatters existing poop instead of dropping it near an animal. */
  synced: boolean;
}

interface ItemView { img: Img; flying: boolean }

interface AnimalView {
  id: string;
  houseId: string;
  lot: number;
  sp: SpeciesId;
  look: Look;
  coat: number;
  /** Where this animal may stand (its feet), inside its house's fence. */
  run: Run;
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Container;
  pill: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  /** Width of the name pill in world units (its hit box). */
  tagW: number;
  icon: Img;
  heart: Img;
  name: string;
  iconKey: string;
  sick: boolean;
  /** Shows 🍽️ (satiety ≤ HUNGRY_SHOW_AT). */
  hungry: boolean;
  /** Satiety 0: walks slowly and sits a lot. */
  starving: boolean;
  happy: boolean;
  items: ItemView[];
  mode: 'idle' | 'walk' | 'eat';
  dir: number;
  tx: number;
  ty: number;
  speed: number;
  until: number;
  /** An fx owns the body until this time; then the pose is restored. 0 = not busy. */
  busyUntil: number;
  nextHeart: number;
  /** Big species' eat cycle: 0 none, 1 head going down, 2 chewing loop, 3 head coming up. */
  eatPhase: number;
  /** When to start lifting the head (0 = not scheduled). */
  eatStopAt: number;
}

interface Badges {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  hungry: Img;
  sick: Img;
  poop: Img;
  product: Img;
  count: Phaser.GameObjects.Text;
  /** Last shown status, to skip relayout when nothing changed. */
  last: string;
}

interface LotView {
  lot: number;
  kind: HouseKind;
  rect: Rect;
  plus: Phaser.GameObjects.Container;
  lock: Phaser.GameObjects.Container;
  lockCrop: Img;
  lockCropKey: string;
  state: 'house' | 'plus' | 'lock' | '';
  badges: Badges;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

const clamp = Phaser.Math.Clamp;

function coatIndex(sp: SpeciesId, color: string): number {
  return Math.max(0, SPECIES[sp].colors.indexOf(color));
}

/** Fence-inner box of a lot below its house (world units). */
function yardOf(lot: Rect, kind: HouseKind): Run {
  const art = HOUSE_ART[kind];
  return {
    x0: lot.x + 4 * PX,
    x1: lot.x + lot.w - 4 * PX,
    y0: lot.y + (art.y + art.h + 8) * PX,
    y1: lot.y + lot.h - 16 * PX,
  };
}

function runFor(yard: Run, look: Look): Run {
  return {
    x0: yard.x0 + look.halfW + 6,
    x1: yard.x1 - look.halfW - 6,
    y0: yard.y0,
    y1: yard.y1 - look.below - 4,
  };
}

/**
 * The ranch: five pages (one house lot each) laid out on a grid, a care view on one page and a
 * zoomed-out overview of all of them. Houses (procedurally drawn per kind) with fenced runs,
 * empty lots (＋, or 🔒 + crop when locked), wandering animals with shadows and name tags,
 * poop and products. render() only syncs what changed.
 */
export class RanchScene extends Phaser.Scene {
  private model: RanchState | null = null;
  private viewState: RanchView | null = null;
  private handlers: RanchHandlers = {
    onAnimal: () => {}, onPoop: () => {}, onEgg: () => {}, onLot: () => {}, onLockedLot: () => {},
    onTag: () => {}, onPageTap: () => {}, onSwipe: () => {},
  };
  private priority: TapPriority = 'items';
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
  /** Running-time ms until the next ambient voice; only counts down while the scene updates. */
  private voiceIn = 0;

  private pageIndex = 0;
  private isOverview = false;
  /** Camera centre and zoom: `cam` is what is shown (tweened), `camTarget` where it is heading. */
  private cam = { x: VIEW / 2, y: VIEW / 2, zoom: ASSET_RES };
  private camTarget = { x: VIEW / 2, y: VIEW / 2, zoom: ASSET_RES };
  private camTween: Phaser.Tweens.Tween | null = null;
  private tagsShown = true;
  private downX = 0;
  private downY = 0;
  private downActive = false;

  constructor() {
    super({ key: 'ranch' });
  }

  setHandlers(h: RanchHandlers): void {
    this.handlers = h;
  }

  setTapPriority(p: TapPriority): void {
    this.priority = p;
  }

  get page(): number {
    return this.pageIndex;
  }

  get overview(): boolean {
    return this.isOverview;
  }

  /** Care view of one page (0 … 4). Pans with a short tween unless animate is false. */
  showPage(index: number, animate = true): void {
    this.pageIndex = clamp(Math.round(index), 0, PAGES - 1);
    const wasOverview = this.isOverview;
    this.isOverview = false;
    const o = this.pageCentre(this.pageIndex);
    this.moveCamera(o.x, o.y, ASSET_RES, animate, wasOverview ? ZOOM_MS : PAN_MS);
    this.applyModeVisuals(animate);
  }

  /** Zoomed-out view of every page: look only, a tap goes back to that page via onPageTap. */
  showOverview(animate = true): void {
    this.isOverview = true;
    this.moveCamera(GRID_W / 2, GRID_H / 2, OVERVIEW_ZOOM, animate, ZOOM_MS);
    this.applyModeVisuals(animate);
  }

  preload(): void {
    const base = `${import.meta.env.BASE_URL}assets/ranch/`;
    for (const sp of SPECIES_ORDER) {
      for (const kind of ['walk', 'eat'] as const) {
        const key = TEX.src(sp, kind);
        if (!this.textures.exists(key)) this.load.image(key, `${base}${sp}_${kind}.png`);
      }
    }
    for (const [key, file] of Object.entries(SHADOW_FILE)) {
      const f = key === 'ck-shadow' ? 32 : 128;
      if (!this.textures.exists(key)) this.load.spritesheet(key, `${base}${file}`, { frameWidth: f, frameHeight: f });
    }
  }

  create(): void {
    this.houses.clear();
    this.animals.clear();
    this.animalList = [];
    this.lots = [];
    this.tappedPoop = null;
    this.camTween = null;
    this.downActive = false;
    this.voiceIn = rand(VOICE_MS.min, VOICE_MS.max);

    makePlaceholderTextures(this);
    for (const key of Object.keys(SHADOW_FILE)) {
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.makeSceneryTextures();

    for (let i = 0; i < COLS * ROWS; i++) {
      this.add.image((i % COLS) * VIEW, Math.floor(i / COLS) * VIEW, TEX.grass)
        .setOrigin(0).setScale(PX).setDepth(DEPTH.grass);
    }
    LOTS.forEach((rect, lot) => this.lots.push(this.buildLot(lot, rect)));
    this.buildLaterPlot(cellRect(PAGES));
    this.sparkles = this.add.particles(0, 0, ASSETS.sparkle, {
      emitting: false,
      speed: { min: 40, max: 170 },
      lifespan: { min: 350, max: 750 },
      scale: { start: INV * 1.2, end: 0 },
      rotate: { start: 0, end: 180 },
      tint: [0xffd23f, 0xfff4b0, 0xffffff],
      blendMode: 'ADD',
    }).setDepth(DEPTH.fx);

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUpOutside, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.snapCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.built = true;
    // Apply whatever page/overview was asked for before create, without animation.
    if (this.isOverview) this.showOverview(false);
    else this.showPage(this.pageIndex, false);
    if (this.model && this.viewState) this.render(this.model, this.viewState);
  }

  update(time: number, delta: number): void {
    if (!this.built) return;
    const dt = Math.min(delta, 100) / 1000;
    const list = this.animalList;
    for (let i = 0; i < list.length; i++) this.step(list[i], time, dt);
    this.voiceIn -= dt * 1000;
    if (this.voiceIn <= 0) {
      this.voiceIn = rand(VOICE_MS.min, VOICE_MS.max);
      this.idleVoice();
    }
  }

  /** One random healthy animal on screen makes its sound (sick ones stay quiet). */
  private idleVoice(): void {
    let pick: AnimalView | null = null;
    let seen = 0;
    for (const v of this.animalList) {
      if (v.sick || (!this.isOverview && v.lot !== this.pageIndex)) continue;
      seen++;
      if (Math.random() * seen < 1) pick = v; // reservoir pick: no allocation
    }
    if (pick) this.handlers.onIdleVoice?.(pick.id);
  }

  /** Syncs the view to the ranch state: adds/removes only what changed. Safe before create(). */
  render(r: RanchState, view: RanchView): void {
    this.model = r;
    this.viewState = view;
    if (!this.built) return;

    const liveHouses = new Set<string>();
    const usedLots = new Set<number>();
    for (const h of r.houses) {
      if (h.lot < 0 || h.lot >= LOTS.length || usedLots.has(h.lot)) continue;
      liveHouses.add(h.id);
      usedLots.add(h.lot);
      let hv = this.houses.get(h.id);
      if (hv && (hv.lot !== h.lot || hv.kind !== h.kind)) {
        this.removeHouse(hv);
        hv = undefined;
      }
      if (!hv) hv = this.addHouse(h);
      this.syncPoop(hv, h, r);
    }
    for (const hv of [...this.houses.values()]) if (!liveHouses.has(hv.id)) this.removeHouse(hv);

    const liveAnimals = new Set<string>();
    for (const a of r.animals) {
      const hv = this.houses.get(a.houseId);
      if (!hv) continue;
      liveAnimals.add(a.id);
      let v = this.animals.get(a.id);
      if (v && v.sp !== a.species) {
        this.removeAnimal(v);
        v = undefined;
      }
      if (v && v.houseId !== a.houseId) {
        v.houseId = a.houseId;
        v.lot = hv.lot;
        v.run = runFor(hv.yard, v.look);
        this.placeAt(v, this.freeSpot(v.run, v));
        this.enterIdle(v, this.time.now, 300, 900);
      }
      if (!v) v = this.addAnimal(a, hv);
      this.syncAnimal(v, a, hv);
    }
    for (const v of [...this.animalList]) if (!liveAnimals.has(v.id)) this.removeAnimal(v);

    const status = pageStatus(r);
    for (const lv of this.lots) {
      const state = usedLots.has(lv.lot) ? 'house' : view.locked[lv.kind] ? 'lock' : 'plus';
      if (state !== lv.state) {
        lv.state = state;
        lv.plus.setVisible(state === 'plus');
        lv.lock.setVisible(state === 'lock');
      }
      const crop = view.lockCrop?.[lv.kind] ?? '';
      if (state === 'lock' && crop !== lv.lockCropKey) {
        lv.lockCropKey = crop;
        lv.lockCrop.setVisible(crop !== '');
        if (crop) lv.lockCrop.setTexture(this.emojiTex(crop));
      }
      this.syncBadges(lv, status[lv.lot]);
    }
  }

  fx(animalId: string, kind: FxKind): void {
    const v = this.animals.get(animalId);
    if (!this.built || !v) return;
    const now = this.time.now;
    const { body, shadow, box, look } = v;
    const S = look.scale;
    this.tweens.killTweensOf(body);
    this.tweens.killTweensOf(shadow);
    v.eatPhase = 0;
    v.eatStopAt = 0;
    // Start every fx from a still rest pose: lying flat when sick, otherwise standing on the idle
    // frame (stops a walk cycle so a halted animal never moonwalks). Tweens below are relative to it.
    this.rest(v);
    const a0 = body.angle;
    const y0 = body.y;
    const sy = body.scaleY;
    const cx = box.x;
    const cy = box.y - look.body;

    switch (kind) {
      case 'jump':
        this.stand(v);
        this.hop(v, 1, look.hop);
        this.pop(v, '💗');
        v.busyUntil = now + 450;
        break;
      case 'treat':
        this.stand(v);
        this.hop(v, 2, look.hop * 1.25);
        this.pop(v, '💗');
        this.time.delayedCall(260, () => { if (this.animals.get(animalId) === v) this.pop(v, '💗', 22); });
        v.busyUntil = now + 800;
        break;
      case 'eat': {
        body.setScale(S).setAngle(0).setY(0);
        shadow.setScale(S);
        if (v.dir === UP) v.dir = DOWN;
        this.startEat(v);
        const chew = look.big ? 1700 : 1800;
        if (look.big) v.eatStopAt = now + chew;
        v.busyUntil = now + chew + (look.big ? this.eatOutMs(look) : 0);
        break;
      }
      case 'brush':
        this.sparkles.explode(14, cx, cy);
        this.tweens.add({
          targets: body, angle: { from: a0 - 8, to: a0 + 8 }, duration: 110, yoyo: true, repeat: 3,
          onComplete: () => body.setAngle(a0),
        });
        v.busyUntil = now + 900;
        break;
      case 'heal':
        v.sick = false;
        this.setIcon(v);
        this.sparkles.explode(30, cx, cy);
        // Stand up from lying, whether render() already cleared `sick` or not.
        this.lie(v);
        shadow.setScale(S);
        this.tweens.chain({
          targets: body,
          tweens: [
            { scaleX: S, scaleY: S, angle: 0, y: 0, duration: 380, ease: 'Back.Out', easeParams: [2.5] },
            { y: -look.hop - 2, duration: 170, ease: 'Quad.Out', yoyo: true },
          ],
        });
        this.time.delayedCall(380, () => { if (this.animals.get(animalId) === v) this.pop(v, '💗'); });
        v.busyUntil = now + 1000;
        break;
      case 'weak':
        // A sick animal lifts itself a little and sinks back.
        this.tweens.add({ targets: body, scaleY: sy + S * (v.sick ? 0.28 : 0.06), y: y0 - 5, duration: 380, yoyo: true, ease: 'Sine.Out' });
        v.busyUntil = now + 820;
        break;
      case 'shake':
        this.tweens.add({
          targets: body, x: { from: -5, to: 5 }, angle: { from: a0 - 6, to: a0 + 6 }, duration: 90, yoyo: true, repeat: 2,
          onComplete: () => body.setPosition(0, y0).setAngle(a0),
        });
        v.busyUntil = now + 600;
        break;
    }
  }

  /** An emoji (a product on collect) bounces up from the animal (its item if shown) and flies off the top. */
  flyFrom(animalId: string, emoji: string): Promise<void> {
    const v = this.animals.get(animalId);
    if (!this.built || !v) return Promise.resolve();
    let x = v.box.x;
    let y = v.box.y - v.look.body;
    const item = v.items.find(e => !e.flying);
    if (item) {
      item.flying = true;
      this.tweens.killTweensOf(item.img);
      item.img.setVisible(false);
      x = item.img.x;
      y = item.img.y;
    }
    const s = SIZE.fly / EMOJI_PX;
    const img = this.add.image(x, y, this.emojiTex(emoji)).setScale(s).setDepth(DEPTH.fly);
    // Toward the top-left of whatever the camera is heading to (the HUD is above the canvas).
    const t = this.camTarget;
    const halfView = VIEW * ASSET_RES / t.zoom / 2;
    const tx = t.x - halfView / 2;
    const ty = t.y - halfView - 40;
    return this.settle(2500, done => {
      this.tweens.chain({
        targets: img,
        tweens: [
          { y: y - 46, scaleX: s * 1.35, scaleY: s * 1.35, duration: 220, ease: 'Quad.Out' },
          { y: y - 22, scaleX: s * 1.15, scaleY: s * 1.15, duration: 160, ease: 'Bounce.Out' },
          { x: tx, y: ty, scaleX: s * 0.7, scaleY: s * 0.7, angle: -25, duration: 520, ease: 'Cubic.In' },
        ],
        onComplete: done,
      });
    }, () => img.destroy());
  }

  // ---------------------------------------------------------------- camera

  private pageCentre(i: number): { x: number; y: number } {
    return { x: (i % COLS) * VIEW + VIEW / 2, y: Math.floor(i / COLS) * VIEW + VIEW / 2 };
  }

  private moveCamera(x: number, y: number, zoom: number, animate: boolean, ms: number): void {
    const t = this.camTarget;
    t.x = x;
    t.y = y;
    t.zoom = zoom;
    if (!this.built) return;
    if (this.camTween) {
      this.camTween.remove();
      this.camTween = null;
    }
    const c = this.cam;
    // Already there (e.g. a swipe past the first/last page): no tween, so taps are not blocked.
    const there = c.x === x && c.y === y && c.zoom === zoom;
    if (!animate || there || !this.sys.isActive()) {
      this.snapCamera();
      return;
    }
    this.camTween = this.tweens.add({
      targets: this.cam, x, y, zoom, duration: ms, ease: 'Sine.InOut',
      onUpdate: () => this.applyCamera(),
      onComplete: () => {
        this.camTween = null;
        this.applyCamera();
        this.applyModeVisuals(true, true);
      },
    });
  }

  /** Jump straight to the target (no animation; also on wake, as tweens froze while asleep). */
  private snapCamera(): void {
    if (!this.built) return;
    if (this.camTween) {
      this.camTween.remove();
      this.camTween = null;
    }
    this.cam.x = this.camTarget.x;
    this.cam.y = this.camTarget.y;
    this.cam.zoom = this.camTarget.zoom;
    this.applyCamera();
    this.applyModeVisuals(false, true);
  }

  private applyCamera(): void {
    const c = this.cameras.main;
    c.setZoom(this.cam.zoom);
    c.centerOn(this.cam.x, this.cam.y);
  }

  private get cameraMoving(): boolean {
    return this.camTween !== null;
  }

  /**
   * Tags only in the care view (unreadable when zoomed out); badges only in the overview.
   * Going out hides tags at once; coming in shows them when the camera has arrived.
   */
  private applyModeVisuals(animate: boolean, arrived = false): void {
    if (!this.built) return;
    const showTags = !this.isOverview && (arrived || !animate);
    if (this.isOverview || showTags) {
      if (showTags !== this.tagsShown) {
        this.tagsShown = showTags;
        for (const v of this.animalList) v.tag.setVisible(showTags);
      }
    }
    for (const lv of this.lots) {
      const b = lv.badges.box;
      this.tweens.killTweensOf(b);
      if (this.isOverview && (arrived || !animate)) {
        b.setVisible(true);
        if (animate) {
          b.setAlpha(0);
          this.tweens.add({ targets: b, alpha: 1, duration: 200 });
        } else {
          b.setAlpha(1);
        }
      } else if (!this.isOverview) {
        b.setVisible(false);
      }
    }
  }

  // ---------------------------------------------------------------- textures

  /** Recoloured walk/eat sheets and anims for one species coat, made on first use. */
  private ensureCoat(sp: SpeciesId, coat: number): void {
    const look = LOOK[sp];
    const F = look.frame;
    const swaps = PALETTES[sp][SPECIES[sp].colors[coat]] ?? [];
    for (const kind of ['walk', 'eat'] as const) {
      const key = TEX.sheet(sp, kind, coat);
      if (!this.textures.exists(key)) {
        const srcKey = TEX.src(sp, kind);
        if (!this.textures.exists(srcKey)) continue;
        const src = this.textures.get(srcKey).getSourceImage() as HTMLImageElement;
        const tex = this.textures.createCanvas(key, src.width, src.height);
        if (!tex) continue;
        const ctx = tex.context;
        ctx.drawImage(src, 0, 0);
        const data = ctx.getImageData(0, 0, src.width, src.height);
        recolor(data.data, swaps);
        ctx.putImageData(data, 0, 0);
        const cols = Math.floor(src.width / F);
        const rows = Math.floor(src.height / F);
        for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * F, Math.floor(i / cols) * F, F, F);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      for (let dir = 0; dir < 4; dir++) {
        const f = (i: number) => ({ key, frame: dir * 4 + i });
        if (kind === 'walk' || !look.big) {
          const anim = TEX.anim(sp, coat, kind, dir);
          if (!this.anims.exists(anim)) {
            this.anims.create({
              key: anim, frames: [0, 1, 2, 3].map(f),
              frameRate: kind === 'walk' ? look.walkFps : look.eatFps, repeat: -1,
            });
          }
          continue;
        }
        // Big species: head down (forward), chew on frames 3–4, head up (backward).
        const defs: [string, number[], number][] = [
          [TEX.anim(sp, coat, 'eatin', dir), [0, 1, 2, 3], 0],
          [TEX.anim(sp, coat, 'eat', dir), [2, 3], -1],
          [TEX.anim(sp, coat, 'eatout', dir), [3, 2, 1, 0], 0],
        ];
        for (const [anim, frames, repeat] of defs) {
          if (!this.anims.exists(anim)) {
            this.anims.create({ key: anim, frames: frames.map(f), frameRate: look.eatFps, repeat });
          }
        }
      }
    }
  }

  private pixelTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.context);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private makeSceneryTextures(): void {
    const G = VIEW / PX;
    this.pixelTex(TEX.grass, G, G, ctx => drawGrass(ctx, G));
    const w = LOT_IN_CELL.w / PX;
    const h = LOT_IN_CELL.h / PX;
    for (const kind of KIND_OF_LOT) {
      this.pixelTex(TEX.run(kind), w, h, ctx => drawRun(ctx, w, h, kind));
      const art = HOUSE_ART[kind];
      this.pixelTex(TEX.house(kind), art.w, art.h, art.draw);
    }
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
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

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
    const cross = this.add.container(cx, cy, [p]);
    this.tweens.add({ targets: cross, scaleX: 1.08, scaleY: 1.08, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const plus = this.add.container(0, 0, [g, cross]).setDepth(DEPTH.lot).setVisible(false);

    const lg = this.add.graphics();
    lg.fillStyle(0x3d5a2a, 0.16).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 22);
    lg.lineStyle(6, 0xf2f2e8, 0.7);
    dashedRect(lg, rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 24, 16);
    const padlock = this.emoji(cx - 62, cy, '🔒', SIZE.lock);
    const lockCrop = this.emoji(cx + 68, cy, '❔', SIZE.lockCrop).setVisible(false);
    const lock = this.add.container(0, 0, [lg, padlock, lockCrop]).setDepth(DEPTH.lot).setVisible(false);

    return {
      lot, kind: KIND_OF_LOT[lot], rect, plus, lock, lockCrop, lockCropKey: '', state: '',
      badges: this.buildBadges(rect),
    };
  }

  /** The sixth cell: a faint plot labelled for the next batch. */
  private buildLaterPlot(rect: Rect): void {
    const g = this.add.graphics().setDepth(DEPTH.lot);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 22);
    g.lineStyle(6, 0xffffff, 0.45);
    dashedRect(g, rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 24, 16);
    this.add.text(rect.x + rect.w / 2, rect.y + rect.h / 2, '之後擴建', {
      fontFamily: FONT, fontSize: '76px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#5fae45', strokeThickness: 10, resolution: ASSET_RES,
    }).setOrigin(0.5).setDepth(DEPTH.lot).setAlpha(0.9);
  }

  /** Overview corner badges (🍽️ 🤒 💩 product×n), sized to read at the overview zoom. */
  private buildBadges(rect: Rect): Badges {
    const bg = this.add.graphics();
    const make = (e: string) => this.emoji(0, 0, e, SIZE.badge, true).setVisible(false);
    const hungry = make('🍽️');
    const sick = make('🤒');
    const poop = make('💩');
    const product = make('🥚');
    const count = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#6b4226', strokeThickness: 10, resolution: ASSET_RES,
    }).setOrigin(0, 0.5).setVisible(false);
    const box = this.add.container(rect.x + 24, rect.y + 24, [bg, hungry, sick, poop, product, count])
      .setDepth(DEPTH.badge).setVisible(false);
    return { box, bg, hungry, sick, poop, product, count, last: '' };
  }

  private syncBadges(lv: LotView, s: PageStatus): void {
    const b = lv.badges;
    const productEmoji = PRODUCT_EMOJI[SPECIES[SPECIES_ORDER[lv.lot]].product];
    const key = `${+s.hungry}${+s.sick}${+s.poop}${s.products}`;
    if (key === b.last) return;
    b.last = key;
    const step = SIZE.badge + 10;
    let x = SIZE.badge / 2;
    const y = SIZE.badge / 2;
    for (const [img, on] of [[b.hungry, s.hungry], [b.sick, s.sick], [b.poop, s.poop]] as const) {
      img.setVisible(on);
      if (on) {
        img.setPosition(x, y);
        x += step;
      }
    }
    const hasProducts = s.products > 0;
    b.product.setVisible(hasProducts);
    b.count.setVisible(hasProducts);
    if (hasProducts) {
      b.product.setTexture(this.emojiTex(productEmoji, true)).setPosition(x, y);
      b.count.setText(`×${s.products}`).setPosition(x + SIZE.badge / 2 + 4, y);
      x += SIZE.badge / 2 + 8 + b.count.width;
    } else {
      x -= SIZE.badge / 2 + 10;
    }
    b.bg.clear();
    if (x > SIZE.badge / 2) {
      b.bg.fillStyle(0x6b4226, 0.35).fillRoundedRect(-14, -10, x + 28, SIZE.badge + 20, 30);
    }
  }

  private addHouse(h: House): HouseView {
    const rect = LOTS[h.lot];
    const art = HOUSE_ART[h.kind];
    const ground = this.add.image(rect.x, rect.y, TEX.run(h.kind))
      .setOrigin(0).setScale(PX).setDepth(DEPTH.lot);
    if (!this.textures.exists(TEX.house(h.kind))) this.pixelTex(TEX.house(h.kind), art.w, art.h, art.draw);
    const house = this.add.image(rect.x + art.x * PX, rect.y + art.y * PX, TEX.house(h.kind))
      .setOrigin(0).setScale(PX).setDepth(DEPTH.house);
    const yard = yardOf(rect, h.kind);
    const run = { x0: yard.x0 + 40, x1: yard.x1 - 40, y0: yard.y0 + 10, y1: yard.y1 - 6 };
    const hv: HouseView = { id: h.id, lot: h.lot, kind: h.kind, run, yard, ground, house, poops: [], synced: false };
    this.houses.set(h.id, hv);
    return hv;
  }

  private removeHouse(hv: HouseView): void {
    hv.ground.destroy();
    hv.house.destroy();
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
          x = v.box.x + (Math.random() < 0.5 ? -1 : 1) * (v.look.halfW * 0.5 + rand(20, 40));
          y = v.box.y + rand(-6, 14);
        } else {
          // Existing poop on first show: stable spots per house; otherwise anywhere in the run.
          const f = hv.synced ? Math.random : rnd;
          x = hv.run.x0 + f() * (hv.run.x1 - hv.run.x0);
          y = hv.run.y0 + f() * (hv.run.y1 - hv.run.y0);
        }
        x = clamp(x, hv.run.x0, hv.run.x1);
        y = clamp(y, hv.run.y0, hv.run.y1);
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
    const sp = a.species;
    const look = LOOK[sp];
    const coat = coatIndex(sp, a.color);
    this.ensureCoat(sp, coat);
    const dir = Math.floor(Math.random() * 4);
    const origin = look.feet / look.frame;
    const shadow = this.add.sprite(0, 0, look.shadow, dir).setOrigin(0.5, origin).setScale(look.scale);
    const body = this.add.sprite(0, 0, TEX.sheet(sp, 'walk', coat), dir * 4).setOrigin(0.5, origin).setScale(look.scale);
    const box = this.add.container(0, 0, [shadow, body]);

    const pill = this.add.graphics();
    const label = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#4a3a2a', resolution: ASSET_RES,
    }).setOrigin(0.5, 0.5);
    const icon = this.emoji(0, 0, '🍽️', SIZE.icon, true).setVisible(false);
    const heart = this.emoji(0, 0, '💗', SIZE.icon, true).setVisible(false);
    const tag = this.add.container(0, 0, [pill, label, icon, heart]).setDepth(DEPTH.tag).setVisible(this.tagsShown);

    const v: AnimalView = {
      id: a.id, houseId: a.houseId, lot: hv.lot, sp, look, coat, run: runFor(hv.yard, look),
      box, body, shadow, tag, pill, label, tagW: 40, icon, heart,
      name: '', iconKey: '', sick: false, hungry: false, starving: false, happy: false, items: [],
      mode: 'idle', dir, tx: 0, ty: 0, speed: 0, until: 0, busyUntil: 0,
      nextHeart: this.time.now + rand(2000, 8000), eatPhase: 0, eatStopAt: 0,
    };
    this.animals.set(a.id, v);
    this.animalList.push(v);
    this.placeAt(v, this.freeSpot(v.run, v));
    this.enterIdle(v, this.time.now, 200, 1500);
    return v;
  }

  private removeAnimal(v: AnimalView): void {
    this.tweens.killTweensOf([v.body, v.shadow, v.heart, v.icon, v.tag]);
    for (const e of v.items) {
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
    const coat = coatIndex(v.sp, a.color);
    if (coat !== v.coat) {
      v.coat = coat;
      this.ensureCoat(v.sp, coat);
      if (!v.busyUntil) this.applyPose(v, this.time.now);
    }
    if (a.name !== v.name) {
      const renamed = v.name !== '';
      v.name = a.name;
      v.label.setText(a.name);
      const w = Math.max(40, v.label.width + 18);
      v.tagW = w;
      if (renamed) {
        this.tweens.killTweensOf(v.tag);
        v.tag.setScale(1);
        this.tweens.add({ targets: v.tag, scaleX: 1.25, scaleY: 1.25, duration: 110, yoyo: true, ease: 'Quad.Out' });
      }
      const h = TAG_H;
      v.pill.clear()
        .fillStyle(0x6b4226, 0.35).fillRoundedRect(-w / 2, -h / 2 + 2, w, h, 12)
        .fillStyle(0xfff8e1, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 12)
        .lineStyle(2, 0xc99a68, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
      v.icon.setX(w / 2 + 19);
      v.heart.setX(w / 2 + 19);
    }
    v.hungry = a.satiety <= HUNGRY_SHOW_AT;
    v.starving = a.satiety <= 0;
    v.happy = a.mood >= MOOD_HAPPY;
    if (a.sick !== v.sick) {
      v.sick = a.sick;
      if (!v.busyUntil) this.applyPose(v, this.time.now);
    }
    this.setIcon(v);
    this.syncItems(v, a, hv);
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

  /** Waiting products (🥚 🥛 🍄 🧶 🧸) lie on the ground beside the animal and bob gently. */
  private syncItems(v: AnimalView, a: Animal, hv: HouseView): void {
    const want = clamp(Math.floor(a.waiting), 0, MAX_ITEMS_SHOWN);
    if (v.items.length < want) {
      const emoji = PRODUCT_EMOJI[SPECIES[v.sp].product];
      const size = v.look.item;
      const side = v.box.x > (hv.run.x0 + hv.run.x1) / 2 ? -1 : 1;
      let last = v.items.length > 0 ? v.items[v.items.length - 1].img : null;
      while (v.items.length < want) {
        const x = last ? last.x + side * (size * 0.7) : v.box.x + side * (v.look.halfW * 0.9 + 12);
        const y = last ? (last.getData('baseY') as number) + (v.items.length % 2 === 0 ? -8 : 8) : v.box.y + 2;
        const cx = clamp(x, hv.run.x0 - 10, hv.run.x1 + 10);
        const cy = clamp(y, hv.run.y0 - 6, hv.run.y1 + 6);
        const img = this.emoji(cx, cy, emoji, size).setDepth(DEPTH.item).setData('baseY', cy);
        const s = img.scaleX;
        img.setScale(0);
        this.tweens.add({ targets: img, scaleX: s, scaleY: s, duration: 280, ease: 'Back.Out' });
        this.tweens.add({
          targets: img, y: cy - 5, duration: 520, ease: 'Sine.InOut', yoyo: true, repeat: -1,
          delay: Math.floor(Math.random() * 600), repeatDelay: 900,
        });
        v.items.push({ img, flying: false });
        last = img;
      }
    }
    while (v.items.length > want) {
      // Items already flown by flyFrom go first, then from the end.
      let i = v.items.findIndex(e => e.flying);
      if (i < 0) i = v.items.length - 1;
      const [e] = v.items.splice(i, 1);
      this.tweens.killTweensOf(e.img);
      e.img.destroy();
    }
  }

  /** A spot in the run away from the other animals of that page. */
  private freeSpot(run: Run, self: AnimalView): { x: number; y: number } {
    let best = { x: (run.x0 + run.x1) / 2, y: (run.y0 + run.y1) / 2 };
    let bestD = -1;
    const enough = self.look.halfW * 2.2;
    for (let tries = 0; tries < 10; tries++) {
      const x = rand(run.x0, Math.max(run.x0, run.x1));
      const y = rand(run.y0, Math.max(run.y0, run.y1));
      let d = Infinity;
      for (const o of this.animalList) {
        if (o !== self && o.lot === self.lot) d = Math.min(d, Phaser.Math.Distance.Between(o.box.x, o.box.y, x, y));
      }
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
      if (d > enough) break;
    }
    return best;
  }

  private placeAt(v: AnimalView, p: { x: number; y: number }): void {
    v.box.setPosition(p.x, p.y).setDepth(DEPTH.animal + p.y / 10000);
    v.tag.setPosition(p.x, p.y - v.look.tag);
  }

  /** Back to the resting pose after an fx (or on a coat / sick change). */
  private applyPose(v: AnimalView, time: number): void {
    const { body, shadow, look } = v;
    this.tweens.killTweensOf(body);
    this.tweens.killTweensOf(shadow);
    v.eatPhase = 0;
    v.eatStopAt = 0;
    body.setPosition(0, 0).setAngle(0);
    shadow.setScale(look.scale).setAlpha(1);
    if (v.sick) {
      this.lie(v);
      this.tweens.add({
        targets: body, scaleY: look.scale * (look.sickY + 0.05), duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      v.mode = 'idle';
    } else {
      body.setScale(look.scale);
      this.enterIdle(v, time, 300, 900);
    }
  }

  /** Lying down: the side frame squashed flat and drooping head-down (alive, just unwell). Static. */
  private lie(v: AnimalView): void {
    const { look } = v;
    const side = v.dir === LEFT ? LEFT : RIGHT;
    v.dir = side;
    v.body.anims.stop();
    v.body.setTexture(TEX.sheet(v.sp, 'walk', v.coat), side * 4)
      .setScale(look.scale * look.sickX, look.scale * look.sickY)
      .setAngle(side === LEFT ? -look.sickTilt : look.sickTilt)
      .setPosition(0, 2);
    v.shadow.setFrame(side).setScale(look.scale * 1.1, look.scale);
  }

  /** Still rest pose for the current state: lying when sick, else standing on the idle frame. */
  private rest(v: AnimalView): void {
    if (v.sick) {
      this.lie(v);
    } else {
      this.stand(v);
      v.body.setPosition(0, 0).setAngle(0);
      v.shadow.setFrame(v.dir).setScale(v.look.scale);
    }
  }

  /** Stand up straight on the idle frame (stops any walk/eat cycle). */
  private stand(v: AnimalView): void {
    v.body.anims.stop();
    v.body.anims.timeScale = 1;
    v.body.setTexture(TEX.sheet(v.sp, 'walk', v.coat), v.dir * 4).setScale(v.look.scale);
  }

  private hop(v: AnimalView, times: number, height: number): void {
    const S = v.look.scale;
    this.tweens.add({ targets: v.body, y: -height, duration: 160, ease: 'Quad.Out', yoyo: true, repeat: times - 1 });
    this.tweens.add({ targets: v.shadow, scaleX: S * 0.8, scaleY: S * 0.8, duration: 160, yoyo: true, repeat: times - 1 });
  }

  /** A one-shot emoji that rises from the animal's head and fades. */
  private pop(v: AnimalView, emoji: string, dx = 0): void {
    const s = SIZE.pop / EMOJI_PX;
    const img = this.emoji(v.box.x + dx, v.box.y - v.look.tag + 32, emoji, SIZE.pop).setDepth(DEPTH.fx).setScale(0);
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
    v.eatPhase = 0;
    v.eatStopAt = 0;
    v.body.anims.stop();
    v.body.setTexture(TEX.sheet(v.sp, 'walk', v.coat), v.dir * 4);
    // Hungry animals sit down while they rest.
    const S = v.look.scale;
    v.body.setScale(S, v.starving ? S * 0.88 : S);
  }

  private enterWalk(v: AnimalView, time: number): void {
    const run = v.run;
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
    const [lo, hi] = v.look.speed;
    v.speed = v.starving ? lo * 0.5 : rand(lo, hi);
    v.mode = 'walk';
    v.eatPhase = 0;
    v.eatStopAt = 0;
    v.until = time + 12000; // safety: never walk forever
    v.body.setScale(v.look.scale);
    v.body.anims.play(TEX.anim(v.sp, v.coat, 'walk', v.dir), true);
    v.body.anims.timeScale = v.starving ? 0.55 : 1;
    v.shadow.setFrame(v.dir);
  }

  /** Plays the eat animation for the current direction: big species start with the head going down. */
  private startEat(v: AnimalView): void {
    if (v.look.big) {
      v.eatPhase = 1;
      v.body.anims.play(TEX.anim(v.sp, v.coat, 'eatin', v.dir));
    } else {
      v.body.anims.play(TEX.anim(v.sp, v.coat, 'eat', v.dir), true);
    }
  }

  private eatOutMs(look: Look): number {
    return Math.ceil((4 / look.eatFps) * 1000) + 60;
  }

  private enterEat(v: AnimalView, time: number): void {
    v.mode = 'eat';
    const chew = rand(1200, 2600);
    v.body.setScale(v.look.scale);
    this.startEat(v);
    v.body.anims.timeScale = v.starving ? 0.6 : 1;
    if (v.look.big) {
      v.eatStopAt = time + chew;
      v.until = time + chew + this.eatOutMs(v.look) / v.body.anims.timeScale;
    } else {
      v.until = time + chew;
    }
  }

  /** Per-frame AI: no allocations. */
  private step(v: AnimalView, time: number, dt: number): void {
    const box = v.box;
    v.tag.setPosition(box.x, box.y - (v.sick ? v.look.tagLying : v.look.tag));

    // Big species' eat phases (also during an fx 'eat').
    if (v.eatPhase !== 0) {
      const anims = v.body.anims;
      if (v.eatPhase === 1 && !anims.isPlaying) {
        v.eatPhase = 2;
        anims.play(TEX.anim(v.sp, v.coat, 'eat', v.dir));
      }
      if (v.eatStopAt !== 0 && time >= v.eatStopAt && v.eatPhase !== 3) {
        v.eatStopAt = 0;
        v.eatPhase = 3;
        anims.play(TEX.anim(v.sp, v.coat, 'eatout', v.dir));
      } else if (v.eatPhase === 3 && !anims.isPlaying) {
        v.eatPhase = 0;
      }
    }

    if (v.busyUntil) {
      if (time < v.busyUntil) return;
      v.busyUntil = 0;
      this.applyPose(v, time);
    }
    if (v.sick) return;

    if (v.happy && !v.hungry && time >= v.nextHeart) {
      v.nextHeart = time + rand(7000, 14000);
      if (this.tagsShown) this.heartBlip(v);
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
      box.setDepth(DEPTH.animal + box.y / 10000);
      return;
    }

    if (time < v.until) return;
    if (Math.random() < (v.starving ? 0.15 : 0.35)) this.enterEat(v, time);
    else this.enterWalk(v, time);
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

  private onDown(p: Phaser.Input.Pointer): void {
    this.downX = p.x;
    this.downY = p.y;
    this.downActive = true;
  }

  /**
   * Taps fire on release so a swipe never also counts as a tap: a mostly-horizontal drag of
   * SWIPE_PX (care view) is a swipe; a press that stayed within TAP_SLOP_PX is a tap at the
   * press point; anything in between is ignored.
   */
  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.built || !this.downActive) return;
    this.downActive = false;
    if (p.wasCanceled) return; // the browser took the touch (e.g. a system gesture): neither tap nor swipe
    const dx = p.x - this.downX;
    const dy = p.y - this.downY;
    if (!this.isOverview && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      this.handlers.onSwipe(dx < 0 ? 1 : -1);
      return;
    }
    if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX || this.cameraMoving) return;
    this.tapAt(this.downX, this.downY);
  }

  /** Released outside the canvas: only a swipe can count. */
  private onUpOutside(p: Phaser.Input.Pointer): void {
    if (!this.built || !this.downActive) return;
    this.downActive = false;
    if (p.wasCanceled) return;
    const dx = p.x - this.downX;
    const dy = p.y - this.downY;
    if (!this.isOverview && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      this.handlers.onSwipe(dx < 0 ? 1 : -1);
    }
  }

  private tapAt(sx: number, sy: number): void {
    const w = this.cameras.main.getWorldPoint(sx, sy);

    // Overview is look-only: any tap just picks the page under it.
    if (this.isOverview) {
      const col = Math.floor(w.x / VIEW);
      const row = Math.floor(w.y / VIEW);
      const i = row * COLS + col;
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && i < PAGES) this.handlers.onPageTap(i);
      return;
    }

    const page = this.pageIndex;
    const dist = Phaser.Math.Distance.Between;

    let animal: AnimalView | null = null;
    let bestA = Infinity;
    for (const v of this.animalList) {
      if (v.lot !== page) continue;
      const d = dist(w.x, w.y, v.box.x, v.box.y - v.look.body);
      if (d < v.look.hit && d < bestA) {
        bestA = d;
        animal = v;
      }
    }
    // With a care tool in hand the child is aiming at the animal, not at its tag or what lies under it.
    if (animal && this.priority === 'animals') {
      this.handlers.onAnimal(animal.id);
      return;
    }

    // Name tags next: they float above everything and are small, deliberate targets.
    let tagged: AnimalView | null = null;
    let bestT = Infinity;
    for (const v of this.animalList) {
      if (v.lot !== page) continue;
      const dx = Math.abs(w.x - v.tag.x);
      const dy = Math.abs(w.y - v.tag.y);
      if (dx <= v.tagW / 2 + TAG_HIT_PAD && dy <= TAG_H / 2 + TAG_HIT_PAD && dx + dy < bestT) {
        bestT = dx + dy;
        tagged = v;
      }
    }
    if (tagged) {
      this.handlers.onTag(tagged.id);
      return;
    }

    // Products next: an animal standing on its product must not block collecting it.
    let owner: AnimalView | null = null;
    let best = HIT.item;
    for (const v of this.animalList) {
      if (v.lot !== page) continue;
      for (const e of v.items) {
        if (e.flying) continue;
        const d = dist(w.x, w.y, e.img.x, e.img.y);
        if (d < best) {
          best = d;
          owner = v;
        }
      }
    }
    if (owner) {
      this.handlers.onEgg(owner.id);
      return;
    }

    let poop: { hv: HouseView; img: Img } | null = null;
    best = HIT.poop;
    for (const hv of this.houses.values()) {
      if (hv.lot !== page) continue;
      for (const img of hv.poops) {
        const d = dist(w.x, w.y, img.x, img.y);
        if (d < best) {
          best = d;
          poop = { hv, img };
        }
      }
    }

    // A poop under the finger wins unless the tap is clearly nearer an animal's body.
    if (poop && (!animal || best <= bestA + 12)) {
      this.tappedPoop = poop.img;
      this.handlers.onPoop(poop.hv.id);
      return;
    }
    if (animal) {
      this.handlers.onAnimal(animal.id);
      return;
    }
    const lv = this.lots[page];
    const r = lv?.rect;
    if (r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) {
      if (lv.state === 'plus') {
        this.tweens.add({ targets: lv.plus, alpha: 0.6, duration: 80, yoyo: true });
        this.handlers.onLot(lv.lot);
      } else if (lv.state === 'lock') {
        this.tweens.add({ targets: lv.lock, x: { from: -6, to: 6 }, duration: 60, yoyo: true, repeat: 1, onComplete: () => lv.lock.setX(0) });
        this.handlers.onLockedLot(lv.kind);
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
    this.input.off('pointerdown', this.onDown, this);
    this.input.off('pointerup', this.onUp, this);
    this.input.off('pointerupoutside', this.onUpOutside, this);
    this.events.off(Phaser.Scenes.Events.WAKE, this.snapCamera, this);
    this.houses.clear();
    this.animals.clear();
    this.animalList = [];
    this.lots = [];
    this.tappedPoop = null;
    this.camTween = null;
    this.tagsShown = true;
  }
}
