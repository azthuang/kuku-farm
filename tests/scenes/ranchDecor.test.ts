import { describe, it, expect, vi, afterEach } from 'vitest';

// Phaser needs a real canvas; the layer only uses one constant from it.
vi.mock('phaser', () => ({ default: { Textures: { FilterMode: { NEAREST: 1 } } } }));

import { DecorLayer, FADED_ALPHA, fitScale } from '../../src/scenes/ranchDecor';
import { createDecor, type DecorState } from '../../src/core/decor';
import { BIG_SPOTS, bigBox } from '../../src/scenes/decorLayout';
import { balloonAt, ufoAt } from '../../src/scenes/trickMoves';

/** A stand-in scene: records timers and tweens so a test can fire them, and images that throw once destroyed. */
function fakeScene() {
  const timers: { cb: () => void; removed: boolean; loop: boolean }[] = [];
  const tweens: { cfg: Record<string, unknown>; removed: boolean }[] = [];
  const chain = (): Record<string, unknown> => new Proxy({}, { get: (_t, k) => (k === 'destroy' ? () => {} : () => chain()) });
  const images: Record<string, unknown>[] = [];
  const image = (x = 0, y = 0, key = '', frame?: string) => {
    const img: Record<string, unknown> = {
      active: true, x, y, flipX: false, scaleX: 1, displayHeight: 60, texture: { key }, frameName: frame,
    };
    const live = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
      if (!img.active) throw new TypeError("Cannot read properties of undefined (reading 'sys')");
      fn(...a);
      return img;
    };
    Object.assign(img, {
      setOrigin: live(() => {}), setDepth: live((d) => { img.depth = d; }), setVisible: live(() => {}), setScale: live((k) => { img.scaleX = k; }),
      setTexture: live((k, f) => { (img.texture as { key: unknown }).key = k; img.frameName = f; }), setFlipX: live((f) => { img.flipX = f; }),
      setPosition: live((x, y) => { img.x = x; img.y = y; }), setAngle: live((a) => { img.angle = a; }), setAlpha: live((a) => { img.alpha = a; }), setTint: live(() => {}), clearTint: live(() => {}),
      getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      destroy: () => { img.active = false; },
    });
    images.push(img);
    return img;
  };
  const scene = {
    time: {
      now: 0,
      addEvent: (cfg: { callback: () => void; loop?: boolean }) => {
        const t = { cb: cfg.callback, removed: false, loop: !!cfg.loop };
        timers.push(t);
        return { remove: () => { t.removed = true; } };
      },
      delayedCall: (_ms: number, cb: () => void) => {
        const t = { cb, removed: false, loop: false };
        timers.push(t);
        return { remove: () => { t.removed = true; } };
      },
    },
    tweens: {
      add: (cfg: Record<string, unknown>) => {
        const t = { cfg, removed: false };
        tweens.push(t);
        return { remove: () => { t.removed = true; } };
      },
      chain: (cfg: Record<string, unknown>) => scene.tweens.add(cfg),
      killTweensOf: (target: unknown) => { for (const t of tweens) if (t.cfg.targets === target) t.removed = true; },
    },
    add: { image, graphics: chain, container: () => chain() },
    textures: {
      exists: () => true,
      get: () => ({ setFilter: () => {}, has: () => true, add: () => {} }),
    },
  };
  /** Fires every timer and tween callback still live, as the game loop would in the next frames. */
  const flush = (): void => {
    for (const t of [...timers]) if (!t.removed) t.cb();
    for (const t of [...tweens]) {
      if (t.removed) continue;
      (t.cfg.onUpdate as (() => void) | undefined)?.();
      (t.cfg.onComplete as (() => void) | undefined)?.();
    }
  };
  return { scene, timers, tweens, flush, images };
}

function decor(placed: DecorState['placed']): DecorState {
  return { ...createDecor(), placed };
}

afterEach(() => vi.restoreAllMocks());

describe('decoration layer: pigeons', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, flyDepth: 50, ySort: (y: number) => 10 + y / 10000 };
  const open = () => true;

  it('taking the pigeons away mid-peck leaves no callback on a destroyed bird', () => {
    const { scene, timers, flush } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'pigeons' }), open, false);
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // a peck, not a step
    for (const t of timers) if (t.loop && !t.removed) t.cb(); // the peck starts: head down, up again in 320 ms
    layer.sync(decor({ '1-0': 'well' }), open, false); // swapped for a well before the head comes up
    expect(flush).not.toThrow();
  });

  it('taking the pigeons away mid-flight leaves no callback on a destroyed bird', () => {
    const { scene, flush } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'pigeons' }), open, false);
    expect(layer.flyPigeons('1-0')).toBe(true);
    layer.sync(decor({}), open, false); // stored while the flock is up
    expect(flush).not.toThrow();
  });

  it('a tap plays the pond (a fish jumps), the bush (a rabbit hops out) and the pigeons, once at a time', () => {
    const { scene } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'pond', '1-1': 'bush', '2-0': 'pigeons', '2-1': 'flowers' }), open, false);
    expect(layer.trick('1-0')).toBe(true);
    expect(layer.trick('1-0')).toBe(false); // the fish is still in the air
    expect(layer.trick('1-1')).toBe(true);
    expect(layer.trick('2-0')).toBe(true);
    expect(layer.trick('2-1')).toBe(false); // flower beds have no trick
  });

  it('a first tap on a decoration without a trick wiggles it; an empty spot has nothing to wiggle', () => {
    const { scene } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '2-1': 'flowers' }), open, false);
    expect(layer.wiggle('2-1')).toBe(true);
    expect(layer.wiggle('2-0')).toBe(false);
  });

  it('storing the pond or the bush mid-trick takes the fish and the rabbit with it', () => {
    const { scene, flush, images } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'pond', '1-1': 'bush' }), open, false);
    const before = images.length;
    layer.trick('1-0');
    layer.trick('1-1');
    const actors = images.slice(before);
    expect(actors).toHaveLength(2);
    layer.sync(decor({}), open, false);
    expect(actors.every(a => a.active === false)).toBe(true);
    expect(flush).not.toThrow();
  });
});

describe('decoration layer: the fish and the rabbit', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, flyDepth: 50, ySort: (y: number) => 10 + y / 10000 };
  const move = (tweens: { cfg: Record<string, unknown>; removed: boolean }[], k: number) => {
    for (const t of tweens) {
      const target = t.cfg.targets as { a?: number };
      if (t.removed || typeof target?.a !== 'number') continue;
      target.a = k;
      (t.cfg.onUpdate as () => void)();
    }
  };

  it('the fish is the drawn koi, at twice its pixel size', () => {
    const { scene, images } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'pond' }), () => true, false);
    const before = images.length;
    layer.trick('1-0');
    const fish = images.slice(before).find(i => i.frameName === 'fish')!;
    expect(fish).toBeDefined();
    expect(fish.scaleX).toBe(2);
  });

  it('the rabbit sits in its sitting pose and hops in its hopping one', () => {
    const { scene, images, tweens } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-1': 'bush' }), () => true, false);
    const before = images.length;
    layer.trick('1-1');
    const rabbit = images[before];
    move(tweens, 0.075); // in the air on its first hop
    expect(rabbit.frameName).toBe('rabbitHop');
    move(tweens, 0.45); // sitting, looking round
    expect(rabbit.frameName).toBe('rabbit');
    expect(rabbit.scaleX).toBe(2);
  });
});

describe('decoration layer: nothing hides behind a decoration', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, flyDepth: 50, ySort: (y: number) => 10 + y / 10000 };

  it('fades a decoration while an animal or poop is behind it, and back when it is gone', () => {
    const { scene, images } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync(decor({ '1-0': 'well' }), () => true, false);
    const well = images.find(i => i.frameName === 'well')!;
    layer.fade([{ x: 5, y: 5 }]); // the fake picture's bounds are 0…10
    expect(well.alpha).toBe(FADED_ALPHA);
    layer.fade([{ x: 50, y: 50 }]);
    expect(well.alpha).toBe(1);
  });
});

describe('decoration layer: the overview finds a special', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, flyDepth: 50, ySort: (y: number) => 10 + y / 10000 };

  it('a tap on a shown special finds it (the overview plays it), and only a special', () => {
    const { scene } = fakeScene();
    const layer = new DecorLayer(scene as never, deps);
    layer.sync({ ...createDecor(), placed: { '1-0': 'well' }, specials: ['balloon', 'ufo'], big: ['balloon', 'ufo'] }, () => true, true);
    const mid = (slot: 0 | 1) => { const b = bigBox(slot); return [b.x + b.w / 2, b.y + b.h / 2] as const; };
    expect(layer.hitSpecial(...mid(0))).toEqual({ slot: 0, id: 'balloon' });
    expect(layer.hitSpecial(...mid(1))).toEqual({ slot: 1, id: 'ufo' });
    expect(layer.hitSpecial(5, 5)).toBeNull(); // the well's fake bounds: a decoration, not a special
  });
});

describe('decoration size', () => {
  it('the three small flower beds span their spot exactly, the little tree grows in half steps, the rest in whole ones', () => {
    expect(fitScale('roses', 68, 38, 128, 150) * 68).toBeCloseTo(128); // just wider than two tiles: no longer 1
    expect(fitScale('flowers', 67, 42, 192, 180) * 67).toBeCloseTo(192); // on a three-tile spot: no longer 2
    expect(fitScale('bluebells', 67, 40, 128, 150) * 67).toBeCloseTo(128);
    expect(fitScale('tree', 43, 50, 128, 150)).toBe(2.5);
    expect(fitScale('pond', 64, 38, 128, 150)).toBe(2); // the parent liked these as they were
    expect(fitScale('pumpkins', 51, 44, 192, 180)).toBe(3);
    expect(fitScale('well', 41, 60, 128, 150)).toBe(2);
    expect(fitScale('tree', 300, 300, 128, 150)).toBe(0.5); // never vanishes
  });
});

describe('decoration layer: the tricks of the specials', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, flyDepth: 50, ySort: (y: number) => 10 + y / 10000 };
  const show = (id: 'xmasTree' | 'balloon' | 'rocket' | 'ufo' | 'dino') => {
    const f = fakeScene();
    const layer = new DecorLayer(f.scene as never, deps);
    layer.sync({ ...createDecor(), specials: [id], big: [id, null] }, () => true, true);
    const img = f.images.find(i => i.frameName === id)!;
    return { ...f, layer, img };
  };
  /** Moves every running trick to `k` of the way through, as the game loop would. */
  const at = (tweens: { cfg: Record<string, unknown>; removed: boolean }[], k: number) => {
    for (const t of tweens) {
      const target = t.cfg.targets as { k?: number };
      if (t.removed || typeof target?.k !== 'number') continue;
      target.k = k;
      (t.cfg.onUpdate as () => void)();
    }
  };

  for (const id of ['xmasTree', 'balloon', 'rocket', 'ufo', 'dino'] as const) {
    it(`${id}: one show at a time, and afterwards it is back on its spot, upright, at its own depth`, () => {
      const { layer, img, flush } = show(id);
      const size = img.scaleX;
      expect(layer.play(0)).toBe(true);
      expect(layer.play(0)).toBe(false);
      flush();
      expect([img.x, img.y]).toEqual([BIG_SPOTS[0].x, BIG_SPOTS[0].y]);
      expect([img.angle, img.flipX, img.scaleX, img.depth]).toEqual([0, false, size, deps.depth + 0.1]);
    });
  }

  it('the balloon flies its round above everything else, the same size all the way (the map is seen from above)', () => {
    const { layer, img, tweens } = show('balloon');
    const size = img.scaleX as number;
    layer.play(0);
    at(tweens, 0.5);
    const want = balloonAt(BIG_SPOTS[0], 0.5);
    expect(img.x).toBeCloseTo(want.x);
    expect(img.y).toBeCloseTo(want.y);
    expect(img.scaleX).toBe(size);
    expect(img.depth).toBe(deps.flyDepth);
  });

  it('the UFO hovers over the cow pen, and storing it mid-flight puts it back', () => {
    const { layer, img, tweens, flush } = show('ufo');
    layer.play(0);
    at(tweens, 0.5);
    expect(img.x).toBeCloseTo(ufoAt(BIG_SPOTS[0], 0.5).x);
    expect(img.depth).toBe(deps.flyDepth);
    layer.sync({ ...createDecor(), specials: ['ufo'], big: [null, null] }, () => true, true);
    expect([img.x, img.y, img.depth]).toEqual([BIG_SPOTS[0].x, BIG_SPOTS[0].y, deps.depth + 0.1]);
    expect(flush).not.toThrow();
  });

  it('the rocket goes up out of sight before it lands again, leaving its launch pad on the ground', () => {
    const { layer, img, tweens, images, flush } = show('rocket');
    layer.play(0);
    at(tweens, 0.5);
    expect(img.y).toBeLessThan(0); // above the top of the map
    expect(img.frameName).toBe('rocketBody');
    const pad = images.find(i => i.frameName === 'rocketPad')!;
    expect([pad.x, pad.y, pad.active]).toEqual([BIG_SPOTS[0].x, BIG_SPOTS[0].y, true]);
    flush(); // landed: one picture again
    expect(img.frameName).toBe('rocket');
    expect(pad.active).toBe(false);
  });
});
