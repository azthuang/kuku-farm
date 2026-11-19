import { describe, it, expect, vi, afterEach } from 'vitest';

// Phaser needs a real canvas; the layer only uses one constant from it.
vi.mock('phaser', () => ({ default: { Textures: { FilterMode: { NEAREST: 1 } } } }));

import { DecorLayer, FADED_ALPHA, fitScale } from '../../src/scenes/ranchDecor';
import { createDecor, type DecorState } from '../../src/core/decor';
import { bigBox } from '../../src/scenes/decorLayout';

/** A stand-in scene: records timers and tweens so a test can fire them, and images that throw once destroyed. */
function fakeScene() {
  const timers: { cb: () => void; removed: boolean; loop: boolean }[] = [];
  const tweens: { cfg: Record<string, unknown>; removed: boolean }[] = [];
  const chain = (): Record<string, unknown> => new Proxy({}, { get: (_t, k) => (k === 'destroy' ? () => {} : () => chain()) });
  const images: Record<string, unknown>[] = [];
  const image = () => {
    const img: Record<string, unknown> = {
      active: true, x: 0, y: 0, flipX: false, scaleX: 1, displayHeight: 60, texture: { key: '' },
    };
    const live = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
      if (!img.active) throw new TypeError("Cannot read properties of undefined (reading 'sys')");
      fn(...a);
      return img;
    };
    Object.assign(img, {
      setOrigin: live(() => {}), setDepth: live(() => {}), setVisible: live(() => {}), setScale: live(() => {}),
      setTexture: live((k, f) => { (img.texture as { key: unknown }).key = k; img.frameName = f; }), setFlipX: live((f) => { img.flipX = f; }),
      setPosition: live(() => {}), setAngle: live(() => {}), setAlpha: live((a) => { img.alpha = a; }), setTint: live(() => {}), clearTint: live(() => {}),
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
  return { scene, timers, flush, images };
}

function decor(placed: DecorState['placed']): DecorState {
  return { ...createDecor(), placed };
}

afterEach(() => vi.restoreAllMocks());

describe('decoration layer: pigeons', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, ySort: (y: number) => 10 + y / 10000 };
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
});

describe('decoration layer: nothing hides behind a decoration', () => {
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, ySort: (y: number) => 10 + y / 10000 };

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
  const deps = { emojiTex: () => 'e', emojiPx: 80, sparkle: () => {}, depth: 3, ySort: (y: number) => 10 + y / 10000 };

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
