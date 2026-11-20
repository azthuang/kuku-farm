import { SPECIES } from '../core/species';
import { lotRect } from './ranchScenery';

/**
 * The paths of the longer tricks, as pure functions of the trick's progress k (0 … 1), so they
 * can be checked without a canvas. Positions are a sprite's foot (bottom centre) in world units.
 */

interface Pt { x: number; y: number }

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Slow at both ends. */
const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;
/** -0 → 0, so a still sprite reads as exactly at rest. */
const z = (n: number): number => n || 0;

// ---------------------------------------------------------------- the hot-air balloon

export const BALLOON_MS = 10_000;
/** The loop round the farm: its middle, its size, and how small the balloon looks up there. */
const LOOP = { cx: 600, cy: 920, rx: 700, ry: 700, scale: 0.6 };
/** The take-off and the landing, each a share of the trick; the loop is the rest. */
const RISE = 0.15;

/** Where the balloon is: up from its spot, once round the farm, back down. */
export function balloonAt(home: Pt, k: number): Pt & { scale: number } {
  const a0 = Math.atan2((home.y - LOOP.cy) / LOOP.ry, (home.x - LOOP.cx) / LOOP.rx);
  const on = (a: number): Pt => ({ x: LOOP.cx + LOOP.rx * Math.cos(a), y: LOOP.cy + LOOP.ry * Math.sin(a) });
  const start = on(a0);
  if (k <= RISE || k >= 1 - RISE) {
    const t = ease(k <= RISE ? k / RISE : (1 - k) / RISE); // 0 at home, 1 on the loop
    return { x: lerp(home.x, start.x, t), y: lerp(home.y, start.y, t), scale: lerp(1, LOOP.scale, t) };
  }
  const p = on(a0 + 2 * Math.PI * ease((k - RISE) / (1 - 2 * RISE)));
  return { ...p, scale: LOOP.scale };
}

// ---------------------------------------------------------------- the UFO

export const UFO_MS = 6000;
/** How high over the pen's middle it hovers (its foot), and how high it arcs on the way. */
const HOVER = 110;
const ARC = 80;
/** Out, hover, back; the beam shines in the middle of the hover. */
const FLY = 0.28;
const BEAM = [0.32, 0.68] as const;

/** The middle of the cows' pen. */
export function ufoTarget(): Pt {
  const r = lotRect(SPECIES.cow.lot);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Where the UFO is: over to the cow pen, a hover with its beam on, and home again. */
export function ufoAt(home: Pt, k: number): Pt & { beam: boolean } {
  const t = ufoTarget();
  const over = { x: t.x, y: t.y - HOVER };
  const beam = k >= BEAM[0] && k <= BEAM[1];
  if (k <= FLY || k >= 1 - FLY) {
    const u = k <= FLY ? k / FLY : (1 - k) / FLY; // 0 at home, 1 over the pen
    const e = ease(u);
    return { x: lerp(home.x, over.x, e), y: lerp(home.y, over.y, e) - ARC * Math.sin(Math.PI * e), beam };
  }
  return { x: over.x, y: over.y - 6 * Math.sin(((k - FLY) / (1 - 2 * FLY)) * Math.PI * 4), beam };
}

// ---------------------------------------------------------------- the dinosaur

export const DINO_MS = 5000;
/** Where each hop lands, from its spot: left, back, right, back, left, back. */
const HOPS = [0, -40, 0, 40, 0, -40, 0];
const HOP_H = 45;
/** The share of each hop spent in the air; the rest is the landing. */
const AIR = 0.8;

/** The dinosaur's offset from its spot (dy < 0 is up) and whether it faces left. */
export function dinoAt(k: number): { dx: number; dy: number; left: boolean } {
  const n = HOPS.length - 1;
  const seg = Math.min(n - 1, Math.floor(k * n));
  const air = Math.min(1, (k * n - seg) / AIR);
  return {
    dx: z(lerp(HOPS[seg], HOPS[seg + 1], air)),
    dy: z(-4 * HOP_H * air * (1 - air)),
    left: HOPS[seg + 1] < HOPS[seg],
  };
}

// ---------------------------------------------------------------- the cat

/** How high the cat jumps for its fish. */
const SPIN_H = 70;

/**
 * The cat's jump with a whole turn in the air. The sprite's origin is at its feet, so to turn
 * round its middle (`mid` units above the feet) the feet swing round that point.
 */
export function spinJump(k: number, mid: number): { x: number; y: number; angle: number } {
  const angle = 360 * ease(k);
  const a = (angle * Math.PI) / 180;
  const up = -4 * SPIN_H * k * (1 - k);
  return { x: z(-mid * Math.sin(a)), y: z(up - mid + mid * Math.cos(a)), angle };
}
