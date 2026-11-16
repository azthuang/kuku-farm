import type Phaser from 'phaser';
import type { HouseKind } from '../core/species';

/**
 * Procedural pixel art for the ranch: fenced runs and one house per kind. Everything is
 * drawn at sprite-pixel resolution on a canvas and shown NEAREST-scaled by the scene.
 */

export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Small deterministic PRNG (mulberry32) so scenery and initial poop do not jump around. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function dashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, dash: number, gap: number): void {
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

// ---------------------------------------------------------------- houses

export interface HouseArt {
  /** Texture size in sprite pixels. */
  w: number;
  h: number;
  /** Top-left inside the lot, in sprite pixels. The run starts 8 px below the house. */
  x: number;
  y: number;
  draw(ctx: Ctx): void;
}

/** Little wooden coop with a red roof, arched door and ramp. */
function drawCoop(ctx: Ctx): void {
  const W = 60;
  const cx = W / 2;
  ctx.fillStyle = 'rgba(70,45,20,0.28)';
  ctx.fillRect(4, 50, W - 6, 4);

  px(ctx, WOOD.line, 5, 18, W - 10, 35);
  px(ctx, '#d9a066', 6, 18, W - 12, 33);
  for (let x = 12; x < W - 6; x += 7) px(ctx, '#b47a45', x, 19, 1, 32);
  px(ctx, '#a8703f', 6, 18, W - 12, 3);
  px(ctx, '#e6b47c', 6, 49, W - 12, 1);

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
  px(ctx, '#f0d0a0', cx - 3, 8, 6, 6);
  px(ctx, WOOD.dark, cx - 2, 9, 4, 4);

  px(ctx, WOOD.line, 21, 30, 18, 23);
  px(ctx, WOOD.line, 23, 28, 14, 2);
  px(ctx, '#4a2c17', 23, 31, 14, 22);
  px(ctx, '#4a2c17', 25, 30, 10, 1);
  px(ctx, '#6b4226', 23, 31, 2, 22);
  px(ctx, '#e8c25a', 26, 47, 8, 4);

  px(ctx, WOOD.line, 42, 24, 11, 10);
  px(ctx, '#fff1b8', 43, 25, 9, 8);
  px(ctx, WOOD.dark, 47, 25, 1, 8);
  px(ctx, WOOD.dark, 43, 28, 9, 1);
  px(ctx, '#7fbf55', 42, 34, 11, 2);
  px(ctx, '#ff6b8a', 44, 33, 1, 1);
  px(ctx, '#ffd23f', 48, 33, 1, 1);
  px(ctx, '#ff6b8a', 51, 33, 1, 1);

  px(ctx, WOOD.line, 23, 52, 14, 6);
  px(ctx, '#c99058', 24, 52, 12, 5);
  for (let y = 53; y < 57; y += 2) px(ctx, '#9a6436', 24, y, 12, 1);
}

/** Big red barn: gambrel roof, white trim, X-braced double door, hay in the loft. 84 × 66. */
function drawBarn(ctx: Ctx): void {
  const W = 84;
  const cx = W / 2;
  const RED = '#c0412f';
  const RED_D = '#98301f';
  const TRIM = '#f6efe2';
  ctx.fillStyle = 'rgba(70,45,20,0.28)';
  ctx.fillRect(4, 61, W - 6, 4);

  // walls
  px(ctx, '#5a2418', 5, 26, W - 10, 37);
  px(ctx, RED, 6, 26, W - 12, 35);
  for (let x = 10; x < W - 6; x += 5) px(ctx, RED_D, x, 27, 1, 34);
  px(ctx, TRIM, 6, 26, 2, 35);
  px(ctx, TRIM, W - 8, 26, 2, 35);
  px(ctx, TRIM, 6, 59, W - 12, 2);

  // gambrel roof: gentle upper slope, steep lower slope
  for (let y = 0; y < 28; y++) {
    const hw = y < 12 ? 12 + Math.round(y * 1.5) : Math.min(cx, 30 + Math.round((y - 12) * 0.85));
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    px(ctx, y % 3 === 2 ? '#4e3a33' : '#64493f', x0, y, x1 - x0, 1);
    px(ctx, '#2f211c', x0, y, 1, 1);
    px(ctx, '#2f211c', x1 - 1, y, 1, 1);
  }
  px(ctx, TRIM, 0, 26, W, 2);
  // loft door with hay
  px(ctx, TRIM, cx - 7, 9, 14, 12);
  px(ctx, '#3a2414', cx - 6, 10, 12, 10);
  px(ctx, '#e8c25a', cx - 6, 15, 12, 5);
  px(ctx, '#f5d978', cx - 5, 15, 3, 1);
  px(ctx, '#f5d978', cx + 1, 16, 4, 1);

  // double door with X braces
  const dx = cx - 13;
  const dy = 36;
  px(ctx, TRIM, dx - 2, dy - 2, 30, 27);
  px(ctx, RED_D, dx, dy, 26, 25);
  px(ctx, TRIM, cx - 1, dy, 2, 25);
  for (const ox of [dx, cx + 1]) {
    for (let i = 0; i < 12; i++) {
      const yy = dy + Math.round(i * 25 / 12);
      px(ctx, TRIM, ox + i, yy, 1, 2);
      px(ctx, TRIM, ox + 11 - i, yy, 1, 2);
    }
  }
  // small windows
  for (const wx of [12, W - 22]) {
    px(ctx, TRIM, wx, 34, 10, 9);
    px(ctx, '#fff1b8', wx + 1, 35, 8, 7);
    px(ctx, TRIM, wx + 4, 35, 2, 7);
  }
}

/** Small wooden pig hut with a slanted plank roof and a low opening. 48 × 40. */
function drawSty(ctx: Ctx): void {
  const W = 48;
  ctx.fillStyle = 'rgba(70,45,20,0.28)';
  ctx.fillRect(3, 36, W - 4, 4);
  // back wall and sides
  px(ctx, WOOD.line, 4, 14, W - 8, 25);
  px(ctx, '#c98d55', 5, 14, W - 10, 23);
  for (let y = 18; y < 37; y += 4) px(ctx, '#a8703f', 5, y, W - 10, 1);
  // opening
  px(ctx, WOOD.line, 15, 22, 18, 17);
  px(ctx, '#3e2614', 16, 23, 16, 16);
  px(ctx, '#e8c25a', 17, 33, 14, 5);
  // slanted roof (higher at the back-left)
  for (let y = 0; y < 15; y++) {
    const x0 = 1;
    const x1 = W - 1;
    px(ctx, y % 3 === 2 ? '#8a5a30' : '#a0693a', x0, y + Math.round((y / 15) * 0), x1 - x0, 1);
  }
  for (let x = 1; x < W - 1; x += 6) px(ctx, '#6b4226', x, 0, 1, 15);
  px(ctx, WOOD.line, 0, 14, W, 2);
  px(ctx, '#c08850', 1, 0, W - 2, 1);
  // a little sign with a pink dot
  px(ctx, WOOD.line, 37, 20, 8, 7);
  px(ctx, '#f2d7a8', 38, 21, 6, 5);
  px(ctx, '#ff8fb1', 40, 22, 2, 3);
}

/** Open sheep shelter: green lean-to roof on four posts, hay rack inside. 60 × 44. */
function drawFold(ctx: Ctx): void {
  const W = 60;
  ctx.fillStyle = 'rgba(70,45,20,0.25)';
  ctx.fillRect(3, 40, W - 4, 4);
  // back wall inside (shade)
  px(ctx, '#8a6a48', 6, 16, W - 12, 25);
  px(ctx, '#735638', 6, 16, W - 12, 4);
  // hay rack
  px(ctx, '#e8c25a', 12, 26, W - 24, 9);
  px(ctx, '#f5d978', 12, 26, W - 24, 2);
  for (let x = 13; x < W - 12; x += 4) px(ctx, WOOD.dark, x, 24, 1, 12);
  px(ctx, WOOD.dark, 11, 24, W - 22, 1);
  // posts
  for (const x of [4, W - 8]) {
    px(ctx, WOOD.line, x, 14, 4, 29);
    px(ctx, WOOD.mid, x, 14, 3, 28);
    px(ctx, WOOD.light, x, 14, 1, 28);
  }
  // lean-to roof, green boards
  for (let y = 0; y < 16; y++) {
    const inset = Math.max(0, 6 - y);
    px(ctx, y % 4 === 3 ? '#4f8f45' : '#62a858', inset, y, W - inset * 2, 1);
  }
  for (let x = 6; x < W - 4; x += 8) px(ctx, '#3f7537', x, 2, 1, 14);
  px(ctx, '#2f5a2a', 0, 15, W, 2);
  px(ctx, '#8fd17f', 6, 0, W - 12, 1);
}

/** A-frame llama hut: steep teal shingle roof to the ground, wooden gable with a round door. 56 × 60. */
function drawHut(ctx: Ctx): void {
  const W = 56;
  const cx = W / 2;
  ctx.fillStyle = 'rgba(70,45,20,0.28)';
  ctx.fillRect(2, 56, W - 2, 4);
  for (let y = 0; y < 58; y++) {
    const hw = Math.min(cx, 2 + Math.round(y * 0.46));
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    px(ctx, y % 4 === 3 ? '#3f7c80' : '#4f9a9e', x0, y, x1 - x0, 1);
    px(ctx, '#24484a', x0, y, 1, 1);
    px(ctx, '#24484a', x1 - 1, y, 1, 1);
  }
  // wooden gable front (inner triangle)
  for (let y = 14; y < 58; y++) {
    const hw = Math.min(cx - 6, Math.round((y - 14) * 0.42));
    if (hw <= 0) continue;
    px(ctx, (y % 5 === 0) ? '#b47a45' : '#d9a066', Math.round(cx - hw), y, hw * 2, 1);
  }
  // round door
  px(ctx, WOOD.line, cx - 7, 40, 14, 18);
  px(ctx, WOOD.line, cx - 5, 38, 10, 2);
  px(ctx, '#4a2c17', cx - 6, 41, 12, 17);
  px(ctx, '#4a2c17', cx - 4, 40, 8, 1);
  px(ctx, '#e8c25a', cx - 5, 53, 10, 4);
  // round window and a little flag
  px(ctx, WOOD.line, cx - 3, 24, 6, 6);
  px(ctx, '#fff1b8', cx - 2, 25, 4, 4);
  px(ctx, '#5a3418', cx, 0, 1, 6);
  px(ctx, '#ff6b8a', cx + 1, 0, 4, 3);
}

export const HOUSE_ART: Record<HouseKind, HouseArt> = {
  coop: { w: 60, h: 58, x: 8, y: 0, draw: drawCoop },
  barn: { w: 84, h: 66, x: 6, y: 0, draw: drawBarn },
  sty: { w: 48, h: 40, x: 10, y: 6, draw: drawSty },
  fold: { w: 60, h: 44, x: 8, y: 4, draw: drawFold },
  hut: { w: 56, h: 60, x: 8, y: 0, draw: drawHut },
};

// ---------------------------------------------------------------- runs

interface Ground { base: string; edge: string; speck: string; straw: string; tuft: string }

const GROUND: Record<HouseKind, Ground> = {
  coop: { base: '#dcc08a', edge: '#c9a873', speck: '#cfb07a', straw: '#efdaa0', tuft: '#8fc160' },
  barn: { base: '#d6c48e', edge: '#c2ad75', speck: '#c9b47c', straw: '#f0dc96', tuft: '#86bd5a' },
  sty: { base: '#c9a77a', edge: '#ad8c62', speck: '#b8966a', straw: '#e3cc99', tuft: '#8fc160' },
  fold: { base: '#9fd472', edge: '#86bd5a', speck: '#b0de87', straw: '#c7ea9f', tuft: '#74b552' },
  hut: { base: '#d8cc9c', edge: '#c3b583', speck: '#cbbd8a', straw: '#ece0ad', tuft: '#8fc160' },
};

/** Fenced run for a house kind, w × h sprite pixels (the house is drawn on top by the scene). */
export function drawRun(ctx: Ctx, w: number, h: number, kind: HouseKind): void {
  const g = GROUND[kind];
  const rnd = seeded(11 + kind.length * 31 + kind.charCodeAt(0));
  px(ctx, g.base, 2, 8, w - 4, h - 14);
  px(ctx, g.edge, 2, 8, w - 4, 3);
  for (let i = 0; i < 120; i++) px(ctx, g.speck, 3 + Math.floor(rnd() * (w - 6)), 11 + Math.floor(rnd() * (h - 20)));
  for (let i = 0; i < 45; i++) {
    px(ctx, g.straw, 4 + Math.floor(rnd() * (w - 10)), 12 + Math.floor(rnd() * (h - 24)), 2 + Math.floor(rnd() * 2), 1);
  }
  for (let i = 0; i < (kind === 'fold' ? 40 : 18); i++) {
    const x = 6 + Math.floor(rnd() * (w - 12));
    const y = 14 + Math.floor(rnd() * (h - 30));
    px(ctx, g.tuft, x, y + 1);
    px(ctx, g.tuft, x + 1, y);
    px(ctx, g.tuft, x + 2, y + 1);
  }
  if (kind === 'fold') {
    for (let i = 0; i < 14; i++) {
      const x = 8 + Math.floor(rnd() * (w - 16));
      const y = 70 + Math.floor(rnd() * (h - 90));
      px(ctx, '#ffffff', x, y);
      px(ctx, '#ffd23f', x + 1, y);
    }
  }
  if (kind === 'sty') {
    mud(ctx, 40, 110, 34, 12);
    mud(ctx, 150, 128, 26, 10);
    mud(ctx, 120, 80, 18, 7);
  }

  // decor right of the house: trough everywhere, plus hay (or a mud wallow for the pigs)
  if (kind === 'sty') mud(ctx, w - 50, 30, 20, 8);
  else hay(ctx, w - 62, 24);
  if (kind === 'hut') {
    // a few rocks
    for (const [x, y] of [[w - 30, 50], [w - 24, 53], [w - 140, 140]] as const) {
      px(ctx, '#7d7a72', x, y, 5, 3);
      px(ctx, '#a6a298', x, y, 3, 1);
    }
  }
  trough(ctx, w - 112, 34);

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

function hay(ctx: Ctx, hx: number, hy: number): void {
  px(ctx, WOOD.line, hx - 1, hy - 1, 26, 15);
  px(ctx, '#e8c25a', hx, hy, 24, 13);
  px(ctx, '#f5d978', hx, hy, 24, 3);
  px(ctx, '#c99a35', hx, hy + 10, 24, 3);
  for (let i = 2; i < 24; i += 4) px(ctx, '#c99a35', hx + i, hy + 4, 1, 5);
  px(ctx, '#a0522d', hx + 7, hy, 1, 13);
  px(ctx, '#a0522d', hx + 16, hy, 1, 13);
}

function trough(ctx: Ctx, tx: number, ty: number): void {
  px(ctx, WOOD.line, tx - 1, ty - 1, 24, 10);
  px(ctx, WOOD.mid, tx, ty, 22, 8);
  px(ctx, '#6cc4f0', tx + 2, ty + 1, 18, 3);
  px(ctx, '#a6e0ff', tx + 3, ty + 1, 6, 1);
  px(ctx, WOOD.dark, tx, ty + 6, 22, 2);
}

/** A rounded mud puddle centred at (cx, cy) with radii rx, ry. */
function mud(ctx: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    if (half <= 0) continue;
    px(ctx, '#7a5638', cx - half, cy + y, half * 2, 1);
  }
  for (let y = -ry + 2; y <= ry - 2; y++) {
    const half = Math.round((rx - 3) * Math.sqrt(1 - (y * y) / ((ry - 2) * (ry - 2))));
    if (half <= 0) continue;
    px(ctx, '#8d6748', cx - half, cy + y, half * 2, 1);
  }
  px(ctx, '#a98463', cx - Math.round(rx / 2), cy - Math.round(ry / 2), Math.round(rx / 3), 1);
  px(ctx, '#a98463', cx + 2, cy + 1, Math.round(rx / 4), 1);
}
