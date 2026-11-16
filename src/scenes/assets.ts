import Phaser from 'phaser';
import { CROP_BY_ROW, type CropId } from '../core/levels';

/**
 * Asset manifest: every texture key the field scene uses lives here, so the
 * runtime placeholders below can later be swapped for CC0 art in one place.
 */
export const ASSETS = {
  soil: 'soil',
  tilled: 'tilled',
  lock: 'lock',
  crop: {
    wheat: 'crop-wheat',
    carrot: 'crop-carrot',
    corn: 'crop-corn',
    potato: 'crop-potato',
    tomato: 'crop-tomato',
    strawberry: 'crop-strawberry',
    pumpkin: 'crop-pumpkin',
    grape: 'crop-grape',
    watermelon: 'crop-watermelon',
  } as Record<CropId, string>,
  // effects (extra to the brief's minimum set)
  star: 'fx-star',
  sparkle: 'fx-sparkle',
  confetti: 'fx-confetti',
};

/** Texture pixels per logical pixel. Images are shown at scale 1 / ASSET_RES. */
export const ASSET_RES = 2;

/** Logical sizes of the generated textures. */
export const SIZE = { plot: 58, lock: 40, crop: 64, star: 20, sparkle: 16 };

const R = ASSET_RES;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

type G = Phaser.GameObjects.Graphics;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, Math.ceil(w * R), Math.ceil(h * R));
  g.destroy();
}

function pts(list: [number, number][]): Phaser.Math.Vector2[] {
  return list.map(([x, y]) => new Phaser.Math.Vector2(x * R, y * R));
}

/** Lens-shaped leaf from (x, y) pointing at `angle` (radians). */
function leaf(g: G, x: number, y: number, len: number, width: number, angle: number): void {
  const out: [number, number][] = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const steps = 10;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i <= steps; i++) {
      const t = side < 0 ? i / steps : 1 - i / steps;
      const along = t * len;
      const across = side * Math.sin(t * Math.PI) * width / 2;
      out.push([x + along * cos - across * sin, y + along * sin + across * cos]);
    }
  }
  g.fillPoints(pts(out), true);
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export function makePlaceholderTextures(scene: Phaser.Scene): void {
  const P = SIZE.plot;

  // Tilled plot: rounded, raised, with furrows.
  bake(scene, ASSETS.tilled, P, P, g => {
    g.fillStyle(0x6b4226, 1).fillRoundedRect(0, 3 * R, P * R, (P - 3) * R, 12 * R);
    g.fillStyle(0x9a6436, 1).fillRoundedRect(0, 0, P * R, (P - 4) * R, 12 * R);
    g.fillStyle(0xab7443, 1).fillRoundedRect(3 * R, 3 * R, (P - 6) * R, (P - 12) * R, 10 * R);
    g.fillStyle(0x8a5a30, 1);
    for (const y of [13, 25, 37]) g.fillRoundedRect(9 * R, y * R, (P - 18) * R, 4 * R, 2 * R);
    g.fillStyle(0xc99a68, 1);
    for (const [x, y] of [[8, 8], [46, 11], [14, 44], [44, 42], [30, 20]]) g.fillCircle(x * R, y * R, 1.6 * R);
  });

  // Untilled soil (locked rows, and the empty plots around a planted block): flat, dusty, grass tufts.
  bake(scene, ASSETS.soil, P, P, g => {
    g.fillStyle(0xb48d62, 1).fillRoundedRect(0, 2 * R, P * R, (P - 2) * R, 12 * R);
    g.fillStyle(0xcaa67a, 1).fillRoundedRect(0, 0, P * R, (P - 3) * R, 12 * R);
    g.fillStyle(0xb8946a, 1);
    for (const [x, y, r] of [[15, 16, 2.4], [40, 22, 1.8], [24, 38, 2], [45, 41, 2.6]]) g.fillCircle(x * R, y * R, r * R);
    g.fillStyle(0x7fbf55, 1);
    for (const [x, y] of [[8, 46], [49, 9]]) {
      leaf(g, x, y, 8, 3, -Math.PI / 2 - 0.4);
      leaf(g, x, y, 9, 3, -Math.PI / 2);
      leaf(g, x, y, 8, 3, -Math.PI / 2 + 0.4);
    }
  });

  // Padlock.
  const L = SIZE.lock;
  bake(scene, ASSETS.lock, L, L, g => {
    g.lineStyle(5 * R, 0x9aa0aa, 1);
    g.beginPath();
    g.arc(20 * R, 17 * R, 9 * R, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0x9aa0aa, 1).fillRect(8.5 * R, 16 * R, 5 * R, 4 * R).fillRect(26.5 * R, 16 * R, 5 * R, 4 * R);
    g.fillStyle(0xd99a1e, 1).fillRoundedRect(5 * R, 19 * R, 30 * R, 20 * R, 6 * R);
    g.fillStyle(0xffc93c, 1).fillRoundedRect(5 * R, 18 * R, 30 * R, 18 * R, 6 * R);
    g.fillStyle(0x6b4a1a, 1).fillCircle(20 * R, 25 * R, 3.2 * R);
    g.fillRect(18.6 * R, 25 * R, 2.8 * R, 7 * R);
  });

  // Star (white fill, tinted per use) with a darker rim.
  const ST = SIZE.star;
  bake(scene, ASSETS.star, ST, ST, g => {
    g.fillStyle(0x9a7a4a, 1).fillPoints(pts(starPoints(10, 10.5, 10, 4.6, 5)), true);
    g.fillStyle(0xffffff, 1).fillPoints(pts(starPoints(10, 10.5, 7.6, 3.4, 5)), true);
  });

  // Four-point twinkle.
  const SP = SIZE.sparkle;
  bake(scene, ASSETS.sparkle, SP, SP, g => {
    g.fillStyle(0xffffff, 1).fillPoints(pts(starPoints(8, 8, 8, 2, 4)), true);
    g.fillCircle(8 * R, 8 * R, 2.2 * R);
  });

  bake(scene, ASSETS.confetti, 10, 6, g => {
    g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, 10 * R, 6 * R, 1.5 * R);
  });

  // Crops: system emoji drawn onto a canvas texture (padded so tall glyphs don't clip).
  const C = SIZE.crop;
  for (const row of Object.keys(CROP_BY_ROW)) {
    const crop = CROP_BY_ROW[Number(row)];
    const key = ASSETS.crop[crop.id];
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, C * R, C * R);
    if (!tex) continue;
    const ctx = tex.context;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${46 * R}px ${EMOJI_FONT}`;
    ctx.fillText(crop.emoji, (C / 2) * R, (C / 2 + 2) * R);
    tex.refresh();
  }
}
