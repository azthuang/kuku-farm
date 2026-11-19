import Phaser from 'phaser';

/**
 * Small pixel sprites drawn in code (the pond's fish, the bush's rabbit): rows of palette letters,
 * '.' transparent. outlined() rings the picture with 'o', the dark edge LPC sprites have.
 */
export function outlined(rows: readonly string[]): string[] {
  const h = rows.length + 2;
  const w = Math.max(...rows.map(r => r.length)) + 2;
  const at = (x: number, y: number): string => rows[y - 1]?.[x - 1] ?? '.';
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c !== '.') line += c;
      else line += [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(n => n !== '.') ? 'o' : '.';
    }
    out.push(line);
  }
  return out;
}

/** Makes (once) a texture from outlined rows; colours as 0xRRGGBB per letter, 'o' included. */
export function pixelTexture(scene: Phaser.Scene, key: string, rows: readonly string[], palette: Record<string, number>): string {
  if (scene.textures.exists(key)) return key;
  const px = outlined(rows);
  const t = scene.textures.createCanvas(key, px[0].length, px.length);
  if (!t) return key;
  const ctx = t.getContext();
  px.forEach((line, y) => [...line].forEach((c, x) => {
    const col = palette[c];
    if (c === '.' || col === undefined) return;
    ctx.fillStyle = `#${col.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, 1, 1);
  }));
  t.refresh();
  t.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** A red fish, facing right. */
export const FISH_ROWS = [
  '......DD......',
  '....RRRRRR....',
  'D..RRRRRRRRR..',
  'DDRRRRRRRRWKR.',
  'DDRRRRRRRRRRRR',
  'D..LLLLLLLLLL.',
  '....LLLLLLL...',
  '......D.......',
];
export const FISH_PALETTE = { R: 0xe8473c, D: 0xb02a22, L: 0xffa08a, W: 0xffffff, K: 0x1a1010, o: 0x4a1610 };

/** A brown rabbit sitting up, facing right. */
export const RABBIT_ROWS = [
  '..........BB...',
  '..........BPB..',
  '...........BPB.',
  '...........BBB.',
  '.........BBBBBB',
  '...BBBBBBBBBKBP',
  '.BBBBBBBBBBBBBB',
  'WBBBBBBBBBBBBB.',
  'WWBBBBBBBBLLB..',
  '.BBBBBBBBLLL...',
  '.bBBBBBBBLL....',
  '..bbBB..Bb.....',
  '.bbbb..bb......',
];
export const RABBIT_PALETTE = { B: 0xa8835e, b: 0x7d5c3e, L: 0xeadbc4, P: 0xf0a0a8, W: 0xffffff, K: 0x1a1010, o: 0x3a2618 };
