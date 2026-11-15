import type { Clock, Rng } from './clock';
import { CROP_BY_ROW, LEVEL_ORDER, unlockedRows, type CropId } from './levels';
import { applyAnswer, challengeWeight, goldenChance, starsOf, weightedPick, type Mode } from './mastery';
import { CROP_CAP, cellKey, type GameState } from './state';
import { harvestCell, isRipe, msUntilRipe, rebaseClock, refreshGrowing } from './field';

export interface Question { a: number; b: number }

export type AnswerResult =
  | { kind: 'correct'; q: Question; crop: CropId; amount: number; capped: boolean;
      golden: boolean; points: number; unlockedRow: number | null; next: Question | null }
  | { kind: 'wrong'; q: Question; correctAnswer: number; next: Question };

export const CHALLENGE_MAX = 10;

function localDateKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export class Game {
  readonly state: GameState;
  private clock: Clock;
  private rng: Rng;
  private _mode: Mode | null = null;
  private queue: Question[] = [];
  private attempted = new Set<string>();
  private done = 0;
  private total = 0;

  constructor(state: GameState, clock: Clock, rng: Rng) {
    this.state = state;
    this.clock = clock;
    this.rng = rng;
  }

  get mode(): Mode | null { return this._mode; }
  get current(): Question | null { return this.queue[0] ?? null; }

  progress(): { done: number; total: number } {
    return { done: this.done, total: this.total };
  }

  startBasic(row: number): Question | null {
    if (!unlockedRows(this.state.unlocked).includes(row)) return null;
    const now = this.clock.now();
    const qs: Question[] = [];
    for (let b = 1; b <= 9; b++) {
      if (isRipe(this.state, row, b, now)) qs.push({ a: row, b });
    }
    if (qs.length === 0) return null;
    this.begin('basic', qs);
    return this.current;
  }

  startChallenge(): Question | null {
    const now = this.clock.now();
    const pool: Question[] = [];
    for (const a of unlockedRows(this.state.unlocked)) {
      for (let b = 1; b <= 9; b++) {
        if (isRipe(this.state, a, b, now)) pool.push({ a, b });
      }
    }
    if (pool.length === 0) return null;
    const picked: Question[] = [];
    const n = Math.min(CHALLENGE_MAX, pool.length);
    for (let i = 0; i < n; i++) {
      const weights = pool.map(q => challengeWeight(this.state.mastery[cellKey(q.a, q.b)] ?? 0));
      const idx = weightedPick(pool, weights, this.rng);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    this.begin('challenge', picked);
    return this.current;
  }

  answer(value: number): AnswerResult | null {
    const mode = this._mode;
    const q = this.current;
    if (!mode || !q) return null;

    const s = this.state;
    const key = cellKey(q.a, q.b);
    const firstAttempt = !this.attempted.has(key);
    this.attempted.add(key);
    const dayKey = localDateKey(this.clock.now());
    const day = (s.daily[dayKey] ??= { answered: 0, correct: 0 });
    day.answered++;

    const prev = s.mastery[key] ?? 0;
    const correct = value === q.a * q.b;

    if (!correct) {
      s.mastery[key] = applyAnswer(prev, mode, false, firstAttempt);
      this.queue.shift();
      this.queue.push(q);
      return { kind: 'wrong', q, correctAnswer: q.a * q.b, next: this.queue[0] };
    }

    const points = applyAnswer(prev, mode, true, firstAttempt);
    s.mastery[key] = points;
    const golden = this.rng() < goldenChance(starsOf(points));
    const want = (mode === 'challenge' ? 2 : 1) * (golden ? 2 : 1);
    const crop = CROP_BY_ROW[q.a].id;
    const amount = Math.max(0, Math.min(want, CROP_CAP - s.inventory[crop]));
    s.inventory[crop] += amount;
    const capped = amount < want;
    harvestCell(s, q.a, q.b, this.clock.now());

    let unlockedRow: number | null = null;
    if (mode === 'basic') {
      const list = (s.cleared[q.a] ??= []);
      if (!list.includes(q.b)) list.push(q.b);
      const newest = LEVEL_ORDER[s.unlocked - 1];
      if (s.unlocked < LEVEL_ORDER.length && (s.cleared[newest]?.length ?? 0) >= 9) {
        s.unlocked++;
        unlockedRow = LEVEL_ORDER[s.unlocked - 1];
      }
    }
    day.correct++;

    this.queue.shift();
    this.done++;
    const next = this.current;
    if (!next) { this._mode = null; this.attempted.clear(); } // round over; progress() keeps final counts
    return { kind: 'correct', q, crop, amount, capped, golden, points, unlockedRow, next };
  }

  endRound(): void {
    this._mode = null;
    this.queue = [];
    this.attempted.clear();
    this.done = 0;
    this.total = 0;
  }

  /** Ms until the soonest cell of the row is ripe; 0 if one is ripe already. Also 0 for a locked row (callers check lock first). */
  msUntilNextRipe(row: number): number {
    if (!unlockedRows(this.state.unlocked).includes(row)) return 0;
    const now = this.clock.now();
    let min = Infinity;
    for (let b = 1; b <= 9; b++) min = Math.min(min, msUntilRipe(this.state, row, b, now));
    return min;
  }

  resume(): void {
    const now = this.clock.now();
    rebaseClock(this.state, now);
    refreshGrowing(this.state, now);
  }

  private begin(mode: Mode, qs: Question[]): void {
    this._mode = mode;
    this.queue = qs;
    this.attempted.clear();
    this.done = 0;
    this.total = qs.length;
  }
}
