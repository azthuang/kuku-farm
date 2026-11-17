import type { Clock, Rng } from './clock';
import { LEVEL_ORDER, cropPoolForRow, unlockedRows, type CropId } from './levels';
import { applyAnswer, challengeWeight, pickCrop, starsOf, weightedPick, type Mode } from './mastery';
import { CROP_CAP, cellKey, type GameState } from './state';

export interface Question { a: number; b: number; crop: CropId }

export type AnswerResult =
  | { kind: 'correct'; q: Question; crop: CropId; amount: number; capped: boolean;
      points: number; unlockedRow: number | null; next: Question | null }
  | { kind: 'wrong'; q: Question; correctAnswer: number; next: Question };

export const CHALLENGE_MAX = 10;
/** A challenge harvest is this many times a × b. */
export const CHALLENGE_MULTIPLIER = 2;

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
    const qs: Question[] = [];
    for (let b = 1; b <= 9; b++) qs.push(this.makeQuestion(row, b));
    this.begin('basic', qs);
    return this.current;
  }

  startChallenge(): Question | null {
    const pool: { a: number; b: number }[] = [];
    // 1× is no challenge: left out once any other row is open (alone, it is the only row to play)
    const rows = unlockedRows(this.state.unlocked);
    for (const a of rows.length > 1 ? rows.filter(r => r !== 1) : rows) {
      for (let b = 1; b <= 9; b++) pool.push({ a, b });
    }
    const picked: Question[] = [];
    const n = Math.min(CHALLENGE_MAX, pool.length);
    // Crops lean toward what the barn is short of, counting what this round's earlier questions
    // will already bring in.
    const stock = { ...this.state.inventory };
    for (let i = 0; i < n; i++) {
      const weights = pool.map(q => challengeWeight(this.state.mastery[cellKey(q.a, q.b)] ?? 0));
      const idx = weightedPick(pool, weights, this.rng);
      const fullness: Partial<Record<CropId, number>> = {};
      for (const c of Object.keys(stock) as CropId[]) fullness[c] = stock[c] / CROP_CAP;
      const q = this.makeQuestion(pool[idx].a, pool[idx].b, fullness);
      stock[q.crop] += q.a * q.b * CHALLENGE_MULTIPLIER;
      picked.push(q);
      pool.splice(idx, 1);
    }
    this.begin('challenge', picked);
    return this.current;
  }

  private makeQuestion(a: number, b: number, fullness?: Partial<Record<CropId, number>>): Question {
    const stars = starsOf(this.state.mastery[cellKey(a, b)] ?? 0);
    const crop = pickCrop(cropPoolForRow(a), stars, this.rng, fullness);
    return { a, b, crop };
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
    const want = q.a * q.b * (mode === 'challenge' ? CHALLENGE_MULTIPLIER : 1);
    const crop = q.crop;
    const amount = Math.max(0, Math.min(want, CROP_CAP - s.inventory[crop]));
    s.inventory[crop] += amount;
    const capped = amount < want;

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
    return { kind: 'correct', q, crop, amount, capped, points, unlockedRow, next };
  }

  endRound(): void {
    this._mode = null;
    this.queue = [];
    this.attempted.clear();
    this.done = 0;
    this.total = 0;
  }

  private begin(mode: Mode, qs: Question[]): void {
    this._mode = mode;
    this.queue = qs;
    this.attempted.clear();
    this.done = 0;
    this.total = qs.length;
  }
}
