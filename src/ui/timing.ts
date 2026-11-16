/** Whole column-by-column count (wrong-answer hint) never takes longer than this. */
export const COUNT_MAX_MS = 12000;
/** Longest wait for one step's spoken number. */
export const STEP_SPEECH_MAX_MS = 1500;
/** Each step stays lit at least this long, also with speech off (never below 500 ms). */
export const STEP_MIN_MS = 800;

/**
 * Per-row timing for counting `steps` columns: wait for the spoken total to end, up to the per-step cap `speechMaxMs`, but at
 * least `minMs`. Big blocks get shorter steps so steps × speechMaxMs ≤ COUNT_MAX_MS.
 */
export function countTiming(steps: number): { minMs: number; speechMaxMs: number } {
  const speechMaxMs = Math.min(STEP_SPEECH_MAX_MS, Math.floor(COUNT_MAX_MS / Math.max(1, steps)));
  return { minMs: Math.min(STEP_MIN_MS, speechMaxMs), speechMaxMs };
}
