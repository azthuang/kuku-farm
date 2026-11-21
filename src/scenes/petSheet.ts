/**
 * Layout of the dog and cat sheets (public/assets/ranch/dog.png, cat.png): four breeds side by
 * side, BREED_COLS columns each. Rows: walk right (+ asleep), walk up, walk down, walk left
 * (+ asleep), then eat (facing the viewer). A walk is four steps, looped: one side's legs spread
 * (hind back, front forward) while the other side's are gathered, the legs passing under the body
 * (two planted, two lifted), the same with the sides swapped, passing again. A breed whose walk is
 * still two poses has each pose twice (columns 0, 0, 1, 1), so it keeps its old pace.
 */
export const BREED_COLS = 5;
export const BREEDS = 4;
export const SHEET_COLS = BREED_COLS * BREEDS;
export const WALK_FRAMES = 4;
export const WALK_FPS = 6;
/** Lying-down frames: the last column of the right and left walk rows. */
export const SLEEP_COL = 4;

export function petFrame(coat: number, row: number, col: number): number {
  return row * SHEET_COLS + coat * BREED_COLS + col;
}

export function walkCycle(coat: number, row: number): number[] {
  return Array.from({ length: WALK_FRAMES }, (_, c) => petFrame(coat, row, c));
}
