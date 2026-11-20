import Phaser from 'phaser';
import type { Pet } from '../core/ranch';
import { PETS, type PetKind } from '../core/species';
import { nearestNode, route, type RoamGraph } from './petRoam';
import { SLEEP_COL, WALK_FPS, petFrame, walkCycle } from './petSheet';
import { spinJump } from './trickMoves';
import { assetUrl } from '../core/assetUrl';

/**
 * The dog and the cat: they walk the farm's paths, stop to sniff, and lie down to sleep at a
 * resting spot (💤). A tap makes one jump and call; a snack makes it eat and do a trick. They have
 * no needs at all. Each sheet holds four breeds side by side (layout in petSheet.ts).
 */

type Img = Phaser.GameObjects.Image;
type Dir = 'R' | 'U' | 'D' | 'L';

const ROW: Record<Dir, number> = { R: 0, U: 1, D: 2, L: 3 };
const EAT_ROW = 4;
/** Per sheet: frame size, drawn scale, ground row in the frame, tag height, eat frame order. */
interface SheetLook { frame: number; scale: number; feet: number; tagY: number; eat: number[] }
const LOOK: Record<PetKind, SheetLook> = {
  // four breeds each, drawn for this game: 40 px frames, shown at 2x
  dog: { frame: 40, scale: 2, feet: 38, tagY: 90, eat: [0, 1, 2, 1, 2, 3] },
  cat: { frame: 40, scale: 2, feet: 38, tagY: 90, eat: [0, 1, 2, 1, 2, 3] },
};
const HIT_R = 42;
const SPEED: Record<PetKind, number> = { dog: 62, cat: 46 };
const TAG_H = 30;
const EMOJI_SIZE = 34;
/** The cat's fish trick: a jump with a whole turn round its middle, this high above its feet. */
const CAT_SPIN_MS = 900;
const CAT_MID = 24;

export const PET_TEX: Record<PetKind, string> = { dog: 'pet-dog', cat: 'pet-cat' };

export interface PetDeps {
  /** A baked emoji image at (x, y), `size` world units. */
  emoji(x: number, y: number, emoji: string, size: number): Img;
  font: string;
  depth: { animal: number; tag: number; fx: number };
  resolution: number;
  /** A patrolling pet has stopped at a patrol stop (it looks around there for PATROL_LOOK_MS). */
  onPatrolStop?(petId: string, stop: PatrolStop): void;
}

/** A place a followed pet visits on its rounds: a node of the network and the plot it looks at. */
export interface PatrolStop { node: number; lot: number }

/** How long a patrolling pet stands at each stop, looking. */
export const PATROL_LOOK_MS = 2600;

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
  /** The pet the child follows walks its rounds (stops in order) instead of wandering and napping. */
  private patrol: { id: string; stops: PatrolStop[]; next: number } | null = null;

  constructor(private scene: Phaser.Scene, private graph: RoamGraph, private deps: PetDeps) {}

  static preload(scene: Phaser.Scene): void {
    for (const kind of ['dog', 'cat'] as const) {
      if (!scene.textures.exists(PET_TEX[kind])) {
        scene.load.spritesheet(PET_TEX[kind], assetUrl(`ranch/${kind}.png`), { frameWidth: LOOK[kind].frame, frameHeight: LOOK[kind].frame });
      }
    }
  }

  private frame(v: { coat: number }, row: number, col: number): number {
    return petFrame(v.coat, row, col);
  }

  private ensureAnims(kind: PetKind, coat: number): void {
    // crisp pixels at the integer scale
    this.scene.textures.get(PET_TEX[kind]).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const a = this.scene.anims;
    const tex = PET_TEX[kind];
    const f = (row: number, col: number) => ({ key: tex, frame: petFrame(coat, row, col) });
    for (const d of ['R', 'U', 'D', 'L'] as const) {
      const key = `${tex}-${coat}-walk-${d}`;
      if (!a.exists(key)) a.create({ key, frames: walkCycle(coat, ROW[d]).map(frame => ({ key: tex, frame })), frameRate: WALK_FPS, repeat: -1 });
    }
    const eat = `${tex}-${coat}-eat`;
    if (!a.exists(eat)) a.create({ key: eat, frames: LOOK[kind].eat.map(c => f(EAT_ROW, c)), frameRate: 6, repeat: 0 });
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
      .setOrigin(0.5, LOOK[p.kind].feet / LOOK[p.kind].frame).setScale(LOOK[p.kind].scale);
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
    v.tag.setPosition(x, y - LOOK[v.kind].tagY);
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
      if (time < v.until && !(v.mode === 'sleep' && this.patrol?.id === v.id)) return;
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
      const pt = this.patrol?.id === v.id ? this.patrol : null;
      if (pt) {
        const stop = pt.stops[pt.next % pt.stops.length];
        if (stop && stop.node === v.node) {
          pt.next = (pt.next + 1) % pt.stops.length;
          this.face(v, 'U', false); // looking at the pen through its gate
          v.mode = 'pause';
          v.until = time + PATROL_LOOK_MS;
          this.deps.onPatrolStop?.(v.id, stop);
          return;
        }
        this.walkOn(v, time);
      } else if (g.rest.includes(v.node) && time >= v.restAt) {
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
    const pt = this.patrol?.id === v.id ? this.patrol : null;
    if (pt && pt.stops.length > 0) {
      const stop = pt.stops[pt.next % pt.stops.length];
      v.path = route(g, v.node, stop.node).slice(1);
      if (v.path.length === 0) v.path = [stop.node];
      v.mode = 'walk';
      return;
    }
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
  hit(x: number, y: number, radius = HIT_R): string | null {
    let best: string | null = null;
    let bd = radius;
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

  /** Where a pet stands (world units), or null if there is no such pet. */
  posOf(id: string): { x: number; y: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.box.x, y: v.box.y } : null;
  }

  /**
   * Starts (or with null, ends) the rounds of a followed pet: it wakes, then walks to each stop in
   * turn, starting with the one nearest it, and looks there for a moment.
   */
  setPatrol(id: string | null, stops: readonly PatrolStop[] = []): void {
    this.patrol = null;
    const v = id ? this.views.get(id) : undefined;
    if (!v || stops.length === 0) return;
    let first = 0;
    let bd = Infinity;
    stops.forEach((s, i) => {
      const n = this.graph.nodes[s.node];
      const d = Math.hypot(n.x - v.box.x, n.y - v.box.y);
      if (d < bd) { bd = d; first = i; }
    });
    this.patrol = { id: v.id, stops: [...stops], next: first };
    if (v.mode === 'sleep') this.wake(v);
    if (v.mode !== 'trick') {
      v.path = [];
      this.walkOn(v, this.scene.time.now);
    }
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

  /** Eats a snack (its own bone or fish unless told), then the dog spins round and the cat jumps with a whole turn in the air; hearts all round. */
  trick(id: string, snack?: string): void {
    const v = this.views.get(id);
    if (!v || v.mode === 'trick') return;
    if (v.mode === 'sleep') this.wake(v);
    v.mode = 'trick';
    v.body.setPosition(0, 0).setAngle(0);
    this.scene.tweens.killTweensOf(v.body);
    v.body.play(`${PET_TEX[v.kind]}-${v.coat}-eat`);
    this.pop(v, snack ?? (PETS[v.kind].snack === 'bone' ? '🦴' : '🐟'));
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
        const t = { k: 0 };
        this.scene.tweens.add({
          targets: t, k: 1, duration: CAT_SPIN_MS, ease: 'Linear',
          onUpdate: () => {
            if (!this.views.has(v.id)) return;
            const q = spinJump(t.k, CAT_MID);
            v.body.setPosition(q.x, q.y).setAngle(q.angle);
            v.shadow.setScale(1 + q.y / 200); // smaller while it is up
            v.tag.setY(v.box.y - LOOK[v.kind].tagY + q.lift); // the name rises with it, never over it
          },
          onComplete: () => {
            if (!this.views.has(v.id)) return;
            v.body.setPosition(0, 0).setAngle(0);
            v.shadow.setScale(1);
            this.place(v); // the name back in its place
            done();
          },
        });
      }
    });
  }

  private pop(v: PetView, emoji: string, dx = 0): void {
    const img = this.deps.emoji(v.box.x + dx, v.box.y - LOOK[v.kind].tagY + 30, emoji, EMOJI_SIZE).setDepth(this.deps.depth.fx);
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
