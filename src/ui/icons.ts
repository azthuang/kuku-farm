/**
 * Icons drawn as SVG instead of font glyphs: ✕ and ⌫ come out small and off-centre in some
 * fonts (an iPad's among them), a drawn icon is the same size on every device. Each sizes to its
 * button's font-size (see .x-icon, .back-icon in styles.css).
 */
export const X_ICON = '<svg class="x-icon" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" fill="none"/></svg>';

export const BACK_ICON = '<svg class="back-icon" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12Z" stroke="currentColor"'
  + ' stroke-width="2.4" stroke-linejoin="round" fill="none"/>'
  + '<path d="M11.5 9l6 6M17.5 9l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
