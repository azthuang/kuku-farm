/**
 * Layout of the dog and cat sheets (public/assets/ranch/dog.png, cat.png): four breeds side by
 * side, BREED_COLS columns each. Rows: walk right (+ asleep), walk up, walk down, walk left
 * (+ asleep), then eat (facing the viewer). A walk is two poses, looped: from the side, legs spread
 * (hind back, front forward) then gathered under the body. Columns 2-3 repeat them.
 */
export const BREED_COLS = 5;
export const BREEDS = 4;
export const SHEET_COLS = BREED_COLS * BREEDS;
export const WALK_FRAMES = 2;
export const WALK_FPS = 6;
/** Lying-down frames: the last column of the right and left walk rows. */
export const SLEEP_COL = 4;

export function petFrame(coat: number, row: number, col: number): number {
  return row * SHEET_COLS + coat * BREED_COLS + col;
}

export function walkCycle(coat: number, row: number): number[] {
  return Array.from({ length: WALK_FRAMES }, (_, c) => petFrame(coat, row, c));
}
