import { describe, it, expect } from 'vitest';
import { BALLOON_MS, DINO_MS, balloonAt, dinoAt, spinJump, ufoAt, ufoTarget } from '../../src/scenes/trickMoves';
import { lotRect, SCENERY_WORLD } from '../../src/scenes/ranchScenery';
import { SPECIES } from '../../src/core/species';
import { BIG_SPOTS } from '../../src/scenes/decorLayout';

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 5);
  expect(a.y).toBeCloseTo(b.y, 5);
};

describe('the hot-air balloon flies once round the farm', () => {
  it('takes about ten seconds', () => {
    expect(BALLOON_MS).toBeGreaterThanOrEqual(9000);
    expect(BALLOON_MS).toBeLessThanOrEqual(11000);
  });

  for (const slot of [0, 1] as const) {
    const home = BIG_SPOTS[slot];
    it(`leaves from and lands on its own spot (slot ${slot})`, () => {
      near(balloonAt(home, 0), home);
      near(balloonAt(home, 1), home);
    });

    it(`goes all the way round the middle of the farm and stays over the map (slot ${slot})`, () => {
      const W = SCENERY_WORLD;
      let left = false, right = false, top = false, bottom = false;
      for (let i = 0; i <= 200; i++) {
        const p = balloonAt(home, i / 200);
        expect(p.x).toBeGreaterThan(W.x);
        expect(p.x).toBeLessThan(W.x + W.w);
        expect(p.y - 330).toBeGreaterThan(W.y - 1); // its top stays on the map (seen from above: no smaller up high)
        expect(p.y).toBeLessThanOrEqual(W.y + W.h);
        if (p.x < 100) left = true;
        if (p.x > 1100) right = true;
        if (p.y < 400) top = true;
        if (p.y > 1400) bottom = true;
      }
      expect([left, right, top, bottom]).toEqual([true, true, true, true]);
    });
  }
});

describe('the UFO visits the cow pen', () => {
  it('heads for the middle of the cows\' pen', () => {
    const r = lotRect(SPECIES.cow.lot);
    near(ufoTarget(), { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  });

  it('starts and ends at home, and shines its beam only while it hovers over the pen', () => {
    const home = BIG_SPOTS[0];
    near(ufoAt(home, 0), home);
    near(ufoAt(home, 1), home);
    expect(ufoAt(home, 0.1).beam).toBe(false);
    const mid = ufoAt(home, 0.5);
    expect(mid.beam).toBe(true);
    expect(Math.abs(mid.x - ufoTarget().x)).toBeLessThan(20);
    expect(mid.y).toBeLessThan(ufoTarget().y); // above the pen, the beam reaching down
    expect(ufoAt(home, 0.9).beam).toBe(false);
  });
});

describe('the dinosaur hops left and right', () => {
  it('takes about five seconds', () => {
    expect(DINO_MS).toBeGreaterThanOrEqual(4500);
    expect(DINO_MS).toBeLessThanOrEqual(5500);
  });

  it('starts and ends on its spot, goes both ways, faces where it hops and is in the air between', () => {
    expect(dinoAt(0)).toMatchObject({ dx: 0, dy: 0 });
    expect(dinoAt(1).dx).toBeCloseTo(0);
    expect(dinoAt(1).dy).toBeCloseTo(0);
    const xs = Array.from({ length: 101 }, (_, i) => dinoAt(i / 100));
    expect(Math.min(...xs.map(p => p.dx))).toBeLessThan(-20);
    expect(Math.max(...xs.map(p => p.dx))).toBeGreaterThan(20);
    expect(Math.min(...xs.map(p => p.dy))).toBeLessThan(-20); // up in the air (y grows downwards)
    const goingLeft = xs.find((p, i) => i > 0 && p.dx < xs[i - 1].dx - 0.5)!;
    const goingRight = xs.find((p, i) => i > 0 && p.dx > xs[i - 1].dx + 0.5)!;
    expect(goingLeft.left).toBe(true);
    expect(goingRight.left).toBe(false);
  });
});

describe('the cat jumps and spins', () => {
  it('takes off from and lands on its feet, upright', () => {
    expect(spinJump(0, 20)).toEqual({ x: 0, y: 0, angle: 0 });
    const end = spinJump(1, 20);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(0);
    expect(end.angle % 360).toBeCloseTo(0);
  });

  it('turns a whole circle round its middle, high in the air', () => {
    const mid = spinJump(0.5, 20);
    expect(mid.angle).toBeCloseTo(180);
    // upside down at the top: the feet are where the middle was, plus the middle's height again
    expect(mid.y).toBeLessThan(-60);
    expect(mid.x).toBeCloseTo(0);
  });
});
