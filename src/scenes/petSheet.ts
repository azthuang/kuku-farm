/**
 * Layout of the dog and cat sheets (public/assets/ranch/dog.png, cat.png): four breeds side by
 * side, BREED_COLS columns each. Rows: walk right (+ asleep), walk up, walk down, walk left
 * (+ asleep), then eat (facing the viewer). A walk is four steps, one paw in the air at a time,
 * in the real order (hind, front on one side, then the other), played 1-2-3-4 and looped.
 */
export const BREED_COLS = 5;
export const BREEDS = 4;
export const SHEET_COLS = BREED_COLS * BREEDS;
export const WALK_FRAMES = 4;
/** Lying-down frames: the last column of the right and left walk rows. */
export const SLEEP_COL = WALK_FRAMES;

export function petFrame(coat: number, row: number, col: number): number {
  return row * SHEET_COLS + coat * BREED_COLS + col;
}

export function walkCycle(coat: number, row: number): number[] {
  return Array.from({ length: WALK_FRAMES }, (_, c) => petFrame(coat, row, c));
}
