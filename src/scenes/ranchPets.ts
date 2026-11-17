import Phaser from 'phaser';
import type { Pet } from '../core/ranch';
import { PETS, type PetKind } from '../core/species';
import { nearestNode, route, type RoamGraph } from './petRoam';

/**
 * The dog and the cat: they walk the farm's paths, stop to sniff, and lie down to sleep at a
 * resting spot (💤). A tap makes one jump and call; a snack makes it eat and do a trick. They have
 * no needs at all. Sprites: "[LPC] Cats and Dogs" by bluecarrot16 (CC-BY 3.0), 32 px frames, four
 * coats side by side (4 columns each); rows: walk right, up, down, left, then eat (facing down).
 */

type Img = Phaser.GameObjects.Image;
type Dir = 'R' | 'U' | 'D' | 'L';

const FRAME = 32;
const SHEET_COLS = 16;
const ROW: Record<Dir, number> = { R: 0, U: 1, D: 2, L: 3 };
const EAT_ROW = 4;
/** Lying-down frames: the fourth column of the right and left walk rows. */
const SLEEP_COL = 3;
const SCALE = 2.5;
const FEET = 28;
const TAG_Y = 74;
const HIT_R = 42;
const SPEED: Record<PetKind, number> = { dog: 62, cat: 46 };
const TAG_H = 30;
const EMOJI_SIZE = 34;

export const PET_TEX: Record<PetKind, string> = { dog: 'pet-dog', cat: 'pet-cat' };

export interface PetDeps {
  /** A baked emoji image at (x, y), `size` world units. */
  emoji(x: number, y: number, emoji: string, size: number): Img;
  font: string;
  depth: { animal: number; tag: number; fx: number };
  resolution: number;
}

interface PetView {
  id: string;
  kind: PetKind;
  coat: number;
  name: string;
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  box: Phaser.GameObjects.Container;
  tag: Phaser.GameObjects.Container;
  pill: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  tagW: number;
  zz: Img;
  node: number;
  prev: number;
  path: number[];
  mode: 'walk' | 'pause' | 'sleep' | 'trick';
  until: number;
  dir: Dir;
  /** Running time when it next heads for a resting spot. */
  restAt: number;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export class RanchPets {
  private views = new Map<string, PetView>();
  private seeded = false;
  private tagsShown = true;

  constructor(private scene: Phaser.Scene, private graph: RoamGraph, private deps: PetDeps) {}

  static preload(scene: Phaser.Scene, base: string): void {
    for (const kind of ['dog', 'cat'] as const) {
      if (!scene.textures.exists(PET_TEX[kind])) {
        scene.load.spritesheet(PET_TEX[kind], `${base}${kind}.png`, { frameWidth: FRAME, frameHeight: FRAME });
      }
    }
  }

  private frame(v: { coat: number }, row: number, col: number): number {
    return row * SHEET_COLS + v.coat * 4 + col;
  }

  private ensureAnims(kind: PetKind, coat: number): void {
    const a = this.scene.anims;
    const tex = PET_TEX[kind];
    const f = (row: number, col: number) => ({ key: tex, frame: row * SHEET_COLS + coat * 4 + col });
    for (const d of ['R', 'U', 'D', 'L'] as const) {
      const key = `${tex}-${coat}-walk-${d}`;
      if (!a.exists(key)) a.create({ key, frames: [f(ROW[d], 0), f(ROW[d], 1), f(ROW[d], 2), f(ROW[d], 1)], frameRate: 8, repeat: -1 });
    }
    const eat = `${tex}-${coat}-eat`;
    if (!a.exists(eat)) a.create({ key: eat, frames: [0, 1, 2, 3, 2, 3].map(c => f(EAT_ROW, c)), frameRate: 6, repeat: 0 });
  }

  /** Adds, removes and renames pet views to match the ranch. New pets (after the first sync) appear near `near`. */
  sync(pets: readonly Pet[], near: { x: number; y: number }): void {
    if (!this.scene.textures.exists(PET_TEX.dog) || this.graph.nodes.length === 0) return;
    const live = new Set<string>();
    for (const p of pets) {
      live.add(p.id);
      let v = this.views.get(p.id);
      if (!v) v = this.add(p, this.seeded ? near : null);
      if (v.name !== p.name) this.setName(v, p.name, this.seeded);
    }
    for (const v of [...this.views.values()]) if (!live.has(v.id)) this.remove(v);
    this.seeded = true;
  }

  private add(p: Pet, near: { x: number; y: number } | null): PetView {
    const d = PETS[p.kind];
    const coat = Math.max(0, d.colors.indexOf(p.color));
    this.ensureAnims(p.kind, coat);
    const g = this.graph;
    // a new pet appears on a through path, not on the dead end before a pen's gate
    const start = near ? nearestNode(g, near.x, near.y, n => g.adj[n].length >= 2)
      : g.rest[Math.floor(Math.random() * g.rest.length)] ?? 0;
    const at = g.nodes[start];
    const shadow = this.scene.add.ellipse(0, 0, 44, 12, 0x1d3a12, 0.28);
    const body = this.scene.add.sprite(0, 0, PET_TEX[p.kind], this.frame({ coat }, ROW.D, 1))
      .setOrigin(0.5, FEET / FRAME).setScale(SCALE);
    const box = this.scene.add.container(at.x, at.y, [shadow, body]);
    const pill = this.scene.add.graphics();
    const label = this.scene.add.text(0, 0, '', {
      fontFamily: this.deps.font, fontSize: '22px', fontStyle: 'bold', color: '#4a3a2a', resolution: this.deps.resolution,
    }).setOrigin(0.5);
    const tag = this.scene.add.container(0, 0, [pill, label]).setDepth(this.deps.depth.tag).setVisible(this.tagsShown);
    const zz = this.deps.emoji(0, 0, '💤', EMOJI_SIZE).setDepth(this.deps.depth.fx - 1).setVisible(false);
    const v: PetView = {
      id: p.id, kind: p.kind, coat, name: '', body, shadow, box, tag, pill, label, tagW: 40, zz,
      node: start, prev: -1, path: [], mode: 'pause', until: 0, dir: 'D',
      restAt: this.scene.time.now + rand(40_000, 90_000),
    };
    this.views.set(p.id, v);
    this.place(v);
    if (near) {
      this.jump(p.id);
      this.pause(v, 1500, 2500);
    } else {
      this.sleep(v);
    }
    return v;
  }

  private remove(v: PetView): void {
    this.scene.tweens.killTweensOf([v.body, v.box, v.tag, v.zz]);
    v.box.destroy();
    v.tag.destroy();
    v.zz.destroy();
    this.views.delete(v.id);
  }

  private setName(v: PetView, name: string, bump: boolean): void {
    v.name = name;
    v.label.setText(name);
    const w = Math.max(40, v.label.width + 18);
    v.tagW = w;
    v.pill.clear()
      .fillStyle(0x6b4226, 0.35).fillRoundedRect(-w / 2, -TAG_H / 2 + 2, w, TAG_H, 12)
      .fillStyle(0xfff8e1, 0.96).fillRoundedRect(-w / 2, -TAG_H / 2, w, TAG_H, 12)
      .lineStyle(2, 0xc99a68, 1).strokeRoundedRect(-w / 2, -TAG_H / 2, w, TAG_H, 12);
    if (bump) this.scene.tweens.add({ targets: v.tag, scaleX: 1.25, scaleY: 1.25, duration: 110, yoyo: true });
  }

  private place(v: PetView): void {
    const { x, y } = v.box;
    v.box.setDepth(this.deps.depth.animal + y / 10000);
    v.tag.setPosition(x, y - TAG_Y);
    v.zz.setPosition(x + 26, y - 52);
  }

  setTagsVisible(on: boolean): void {
    this.tagsShown = on;
    for (const v of this.views.values()) v.tag.setVisible(on);
  }

  update(time: number, dt: number): void {
    for (const v of this.views.values()) this.step(v, time, dt);
  }

  private step(v: PetView, time: number, dt: number): void {
    if (v.mode === 'trick') return;
    if (v.mode === 'pause' || v.mode === 'sleep') {
      if (time < v.until) return;
      if (v.mode === 'sleep') this.wake(v);
      this.walkOn(v, time);
      return;
    }
    const g = this.graph;
    const target = g.nodes[v.path[0]];
    if (!target) {
      this.walkOn(v, time);
      return;
    }
    const dx = target.x - v.box.x;
    const dy = target.y - v.box.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = SPEED[v.kind] * dt;
    if (dist <= stepLen) {
      v.box.setPosition(target.x, target.y);
      v.prev = v.node;
      v.node = v.path.shift()!;
      this.place(v);
      if (v.path.length > 0) return;
      if (g.rest.includes(v.node) && time >= v.restAt) {
        v.restAt = time + rand(60_000, 120_000);
        this.sleep(v);
      } else if (Math.random() < 0.3) {
        this.pause(v, 1200, 3500); // stop and sniff
      } else {
        this.walkOn(v, time);
      }
      return;
    }
    v.box.setPosition(v.box.x + (dx / dist) * stepLen, v.box.y + (dy / dist) * stepLen);
    this.face(v, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'), true);
    this.place(v);
  }

  /** Picks where to go next: now and then a resting spot, otherwise the next stretch of path. */
  private walkOn(v: PetView, time: number): void {
    const g = this.graph;
    if (time >= v.restAt && g.rest.length > 0) {
      const spot = g.rest[Math.floor(Math.random() * g.rest.length)];
      v.path = route(g, v.node, spot).slice(1);
      if (v.path.length === 0) {
        v.restAt = time + rand(60_000, 120_000);
        this.sleep(v);
        return;
      }
    } else {
      const ns = g.adj[v.node];
      const choices = ns.length > 1 ? ns.filter(n => n !== v.prev) : ns;
      if (choices.length === 0) {
        this.pause(v, 2000, 4000);
        return;
      }
      v.path = [choices[Math.floor(Math.random() * choices.length)]];
    }
    v.mode = 'walk';
  }

  private face(v: PetView, dir: Dir, walking: boolean): void {
    const key = `${PET_TEX[v.kind]}-${v.coat}-walk-${dir}`;
    if (walking) {
      if (v.dir !== dir || !v.body.anims.isPlaying || v.body.anims.currentAnim?.key !== key) v.body.play(key);
    } else {
      v.body.anims.stop();
      v.body.setFrame(this.frame(v, ROW[dir], 1));
    }
    v.dir = dir;
  }

  private pause(v: PetView, lo: number, hi: number): void {
    v.mode = 'pause';
    v.until = this.scene.time.now + rand(lo, hi);
    this.face(v, v.dir, false);
  }

  private sleep(v: PetView): void {
    v.mode = 'sleep';
    v.until = this.scene.time.now + rand(20_000, 50_000);
    v.body.anims.stop();
    v.body.setFrame(this.frame(v, v.dir === 'L' ? ROW.L : ROW.R, SLEEP_COL));
    v.zz.setVisible(true).setAlpha(0.9);
    this.scene.tweens.add({ targets: v.zz, y: v.zz.y - 10, alpha: 0.4, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  private wake(v: PetView): void {
    this.scene.tweens.killTweensOf(v.zz);
    v.zz.setVisible(false);
    this.place(v);
  }

  /** The pet under (x, y) in world units, nearest first, or null. */
  hit(x: number, y: number): string | null {
    let best: string | null = null;
    let bd = HIT_R;
    for (const v of this.views.values()) {
      const d = Math.hypot(v.box.x - x, v.box.y - 30 - y);
      if (d < bd) { bd = d; best = v.id; }
    }
    return best;
  }

  /** The pet whose name tag is under (x, y), or null. */
  hitTag(x: number, y: number): string | null {
    if (!this.tagsShown) return null;
    for (const v of this.views.values()) {
      if (Math.abs(x - v.tag.x) <= v.tagW / 2 + 2 && Math.abs(y - v.tag.y) <= TAG_H / 2 + 2) return v.id;
    }
    return null;
  }

  busy(id: string): boolean {
    return this.views.get(id)?.mode === 'trick';
  }

  /** A hop and a heart (a tap). Wakes a sleeping pet; ignored mid-trick. */
  jump(id: string): void {
    const v = this.views.get(id);
    if (!v || v.mode === 'trick') return;
    if (v.mode === 'sleep') this.wake(v);
    this.scene.tweens.killTweensOf(v.body);
    v.body.y = 0;
    this.face(v, 'D', false);
    this.scene.tweens.add({ targets: v.body, y: -26, duration: 170, ease: 'Quad.Out', yoyo: true });
    this.pop(v, '💗');
    this.pause(v, 1500, 3000);
  }

  /** Eats a snack, then the dog spins round and the cat stretches; hearts all round. */
  trick(id: string): void {
    const v = this.views.get(id);
    if (!v || v.mode === 'trick') return;
    if (v.mode === 'sleep') this.wake(v);
    v.mode = 'trick';
    v.body.y = 0;
    this.scene.tweens.killTweensOf(v.body);
    v.body.play(`${PET_TEX[v.kind]}-${v.coat}-eat`);
    this.pop(v, PETS[v.kind].snack === 'bone' ? '🦴' : '🐟');
    v.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (!this.views.has(v.id)) return;
      const done = (): void => {
        this.pop(v, '💗', -14);
        this.scene.time.delayedCall(180, () => this.views.has(v.id) && this.pop(v, '💗', 14));
        this.pause(v, 2000, 3500);
      };
      if (v.kind === 'dog') {
        const order: Dir[] = ['D', 'L', 'U', 'R', 'D', 'L', 'U', 'R', 'D'];
        order.forEach((d, i) => this.scene.time.delayedCall(i * 110, () => {
          if (this.views.has(v.id)) v.body.setFrame(this.frame(v, ROW[d], 1));
          if (i === order.length - 1 && this.views.has(v.id)) done();
        }));
      } else {
        v.body.setFrame(this.frame(v, ROW.R, 1));
        this.scene.tweens.add({
          targets: v.body, scaleX: SCALE * 1.18, scaleY: SCALE * 0.9, duration: 420, yoyo: true, ease: 'Sine.InOut',
          onComplete: () => this.views.has(v.id) && done(),
        });
      }
    });
  }

  private pop(v: PetView, emoji: string, dx = 0): void {
    const img = this.deps.emoji(v.box.x + dx, v.box.y - TAG_Y + 30, emoji, EMOJI_SIZE).setDepth(this.deps.depth.fx);
    const s = img.scaleX;
    img.setScale(0);
    this.scene.tweens.chain({
      targets: img,
      tweens: [
        { scaleX: s, scaleY: s, y: img.y - 18, duration: 220, ease: 'Back.Out' },
        { y: img.y - 48, alpha: 0, duration: 650, ease: 'Sine.In' },
      ],
      onComplete: () => img.destroy(),
    });
  }

  clear(): void {
    for (const v of [...this.views.values()]) this.remove(v);
    this.seeded = false;
  }
}
