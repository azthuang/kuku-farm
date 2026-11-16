import { LEVEL_ORDER } from './levels';
import { starsOf } from './mastery';
import { cellKey, type GameState } from './state';

/**
 * The row the child should practise next on the idle map: the newest unlocked level while it is
 * not fully cleared in basic mode; once everything is unlocked and cleared, the unlocked row
 * with the fewest total stars (ties: earliest in LEVEL_ORDER).
 */
export function nextPracticeRow(state: GameState): number {
  const open = LEVEL_ORDER.slice(0, Math.max(1, state.unlocked));
  const newest = open[open.length - 1];
  if (new Set(state.cleared[newest] ?? []).size < 9) return newest;
  let best = open[0];
  let bestStars = Infinity;
  for (const row of open) {
    let sum = 0;
    for (let b = 1; b <= 9; b++) sum += starsOf(state.mastery[cellKey(row, b)] ?? 0);
    if (sum < bestStars) {
      best = row;
      bestStars = sum;
    }
  }
  return best;
}
