import { CROP_BY_ROW, type CropId } from './levels';
import { CROP_CAP, type DailyStat, type GameState } from './state';

export const SAVE_KEY = 'kuku-farm-save';
export const CORRUPT_KEY = 'kuku-farm-save-corrupt';

export type ParseResult =
  | { ok: true; state: GameState }
  | { ok: false; error: 'invalid' | 'newer-version' };

const MAX_MASTERY = 6;
const CELL_KEY = /^[1-9],[1-9]$/;
const ROW_KEY = /^[1-9]$/;

class Invalid extends Error {}
class Newer extends Error {}

function fail(): never { throw new Invalid(); }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function rec(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : fail();
}

function validate(data: unknown): GameState {
  const o = rec(data);
  if (typeof o.version !== 'number' || Number.isNaN(o.version)) fail();
  if (o.version > 2) throw new Newer();
  if (o.version !== 1 && o.version !== 2) fail();
  // v1 carried a `growing` map; it is ignored (even if malformed) and dropped.

  if (!isIntIn(o.unlocked, 1, 9)) fail();

  const invIn = rec(o.inventory);
  const inventory = {} as Record<CropId, number>;
  for (const row of Object.keys(CROP_BY_ROW)) {
    const id = CROP_BY_ROW[Number(row)].id;
    const n = Object.prototype.hasOwnProperty.call(invIn, id) ? invIn[id] : undefined;
    if (!isIntIn(n, 0, CROP_CAP)) fail();
    inventory[id] = n;
  }

  const mastery: Record<string, number> = {};
  const mIn = rec(o.mastery);
  for (const k of Object.keys(mIn)) {
    if (!CELL_KEY.test(k) || !isIntIn(mIn[k], 0, MAX_MASTERY)) fail();
    mastery[k] = mIn[k] as number;
  }

  const cleared: Record<number, number[]> = {};
  const cIn = rec(o.cleared);
  for (const k of Object.keys(cIn)) {
    const v = cIn[k];
    if (!ROW_KEY.test(k) || !Array.isArray(v)) fail();
    if (!v.every((x) => isIntIn(x, 1, 9))) fail();
    cleared[Number(k)] = [...new Set(v as number[])]; // duplicates must not count toward unlocking
  }

  const sIn = rec(o.settings);
  if (typeof sIn.speech !== 'boolean' || typeof sIn.sound !== 'boolean') fail();

  const daily: Record<string, DailyStat> = {};
  const dIn = rec(o.daily);
  for (const k of Object.keys(dIn)) {
    const d = rec(dIn[k]);
    if (!isNonNegInt(d.answered) || !isNonNegInt(d.correct)) fail();
    daily[k] = { answered: d.answered, correct: d.correct };
  }

  if (typeof o.lastSeenAt !== 'number' || !Number.isFinite(o.lastSeenAt)) fail();

  return {
    version: 2,
    unlocked: o.unlocked,
    cleared,
    mastery,
    inventory,
    daily,
    settings: { speech: sIn.speech, sound: sIn.sound },
    lastSeenAt: o.lastSeenAt,
  };
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function parseSave(raw: string): ParseResult {
  try {
    return { ok: true, state: validate(JSON.parse(raw)) };
  } catch (e) {
    return { ok: false, error: e instanceof Newer ? 'newer-version' : 'invalid' };
  }
}

export type LoadResult =
  | { kind: 'ok'; state: GameState }
  | { kind: 'empty' }
  | { kind: 'corrupt' }
  | { kind: 'newer' };

export function loadFrom(storage: Pick<Storage, 'getItem' | 'setItem'>): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { kind: 'empty' };
    const r = parseSave(raw);
    if (r.ok) return { kind: 'ok', state: r.state };
    if (r.error === 'newer-version') return { kind: 'newer' }; // never touch storage
    try { storage.setItem(CORRUPT_KEY, raw); } catch { /* backup is best-effort */ }
    return { kind: 'corrupt' };
  } catch {
    return { kind: 'empty' };
  }
}

export function saveTo(storage: Pick<Storage, 'setItem'>, s: GameState): void {
  storage.setItem(SAVE_KEY, serialize(s));
}

export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `kuku-farm-save-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}
