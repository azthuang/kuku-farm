const SACK_SVG = `<svg viewBox="0 0 40 44" aria-hidden="true" focusable="false">
<path class="sack-body" d="M11 12 C4 17 2 28 4 37 C5 41 9 42 20 42 C31 42 35 41 36 37 C38 28 36 17 29 12 Z"/>
<path class="sack-top" d="M11 12 L8 5 C14 8 26 8 32 5 L29 12 C24 14 16 14 11 12 Z"/>
<path class="sack-tie" d="M10.5 11.5 C16 14.5 24 14.5 29.5 11.5" />
<path class="sack-stitch" d="M7 38.5 H33 M8 20 V30 M32 20 V30"/>
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
