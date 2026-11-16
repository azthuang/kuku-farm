/** Whole row-by-row count (wrong-answer hint) never takes longer than this. */
export const COUNT_MAX_MS = 12000;
/** Longest wait for one row's spoken number. */
export const ROW_SPEECH_MAX_MS = 1500;
/** Each row stays lit at least this long, also with speech off (never below 500 ms). */
export const ROW_MIN_MS = 800;

/**
 * Per-row timing for counting `rows` rows: wait for the spoken total to end, up to the per-row cap `speechMaxMs`, but at
 * least `minMs`. Big blocks get shorter rows so rows × speechMaxMs ≤ COUNT_MAX_MS.
 */
export function countRowTiming(rows: number): { minMs: number; speechMaxMs: number } {
  const speechMaxMs = Math.min(ROW_SPEECH_MAX_MS, Math.floor(COUNT_MAX_MS / Math.max(1, rows)));
  return { minMs: Math.min(ROW_MIN_MS, speechMaxMs), speechMaxMs };
}
