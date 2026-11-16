import { CROP_BY_ROW, unlockedRows, type CropId } from './levels';
import { starsOf } from './mastery';
import { nextPracticeRow } from './practice';
import { cellKey, type GameState } from './state';

export type Stars = 0 | 1 | 2 | 3;

export interface GardenRow {
  /** The times-table row, 1 … 9 (the garden lists them in number order, like the field). */
  row: number;
  crop: CropId;
  unlocked: boolean;
  /** Stars of row × 1 … row × 9: how big each plant has grown (all 0 while the row is locked). */
  stars: Stars[];
  /** Plants at 3 stars. */
  grown: number;
}

export interface Garden {
  rows: GardenRow[];
  /** 3-star plants over the whole garden, out of `total`. */
  grown: number;
  total: number;
  /** The row to practise next (the same row that glows on the field). */
  glowRow: number;
}

/** The ranch garden: one plant per fact, as big as its stars. Pure; nothing here is ever lost. */
export function gardenOf(state: GameState): Garden {
  const open = new Set(unlockedRows(Math.max(1, state.unlocked)));
  const rows: GardenRow[] = [];
  let grown = 0;
  for (let row = 1; row <= 9; row++) {
    const unlocked = open.has(row);
    const stars: Stars[] = [];
    for (let b = 1; b <= 9; b++) stars.push(unlocked ? starsOf(state.mastery[cellKey(row, b)] ?? 0) : 0);
    const g = stars.filter((s) => s === 3).length;
    grown += g;
    rows.push({ row, crop: CROP_BY_ROW[row].id, unlocked, stars, grown: g });
  }
  return { rows, grown, total: 81, glowRow: nextPracticeRow(state) };
}
