/** The feed sack's shapes (viewBox 40 × 44), shared by the DOM icon and the ranch canvas. */
const SACK = {
  body: 'M11 12 C4 17 2 28 4 37 C5 41 9 42 20 42 C31 42 35 41 36 37 C38 28 36 17 29 12 Z',
  top: 'M11 12 L8 5 C14 8 26 8 32 5 L29 12 C24 14 16 14 11 12 Z',
  tie: 'M10.5 11.5 C16 14.5 24 14.5 29.5 11.5',
  stitch: 'M7 38.5 H33 M8 20 V30 M32 20 V30',
} as const;
const INK = '#8a5a24';

const SACK_SVG = `<svg viewBox="0 0 40 44" aria-hidden="true" focusable="false">
<path class="sack-body" d="${SACK.body}"/>
<path class="sack-top" d="${SACK.top}"/>
<path class="sack-tie" d="${SACK.tie}" />
<path class="sack-stitch" d="${SACK.stitch}"/>
</svg>`;

/** A feed sack with the species' head on its front. Sized by --sack (default 34px). */
export function feedIcon(emoji: string): HTMLElement {
  const sack = document.createElement('span');
  sack.className = 'feed-sack';
  sack.dataset.feedSack = '';
  sack.innerHTML = SACK_SVG;
  const face = document.createElement('span');
  face.className = 'feed-sack-emoji';
  face.textContent = emoji;
  sack.append(face);
  return sack;
}

/**
 * The same sack drawn on a canvas, `size` px tall and centred on (cx, cy), with `emoji` on its
 * front: the ranch's "hungry" sign looks like the feed button that answers it.
 */
export function drawSack(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, emoji: string, font: string): void {
  const k = size / 44;
  ctx.save();
  ctx.translate(cx - 20 * k, cy - 22 * k);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillStyle = '#d9a95f';
  ctx.fill(new Path2D(SACK.body));
  ctx.stroke(new Path2D(SACK.body));
  ctx.fillStyle = '#c4913f';
  ctx.fill(new Path2D(SACK.top));
  ctx.stroke(new Path2D(SACK.top));
  ctx.strokeStyle = '#b5473a';
  ctx.lineWidth = 3;
  ctx.stroke(new Path2D(SACK.tie));
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([2.5, 2.5]);
  ctx.stroke(new Path2D(SACK.stitch));
  ctx.restore();
  // the face sits like .feed-sack-emoji: 0.56 of the sack, its top at 30%
  const fs = size * 0.56;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(fs)}px ${font}`;
  ctx.fillText(emoji, cx, cy - size / 2 + size * 0.3 + fs / 2 + 1);
}
