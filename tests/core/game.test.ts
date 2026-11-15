import { describe, it, expect } from 'vitest';
import { Game } from '../../src/core/game';
import { createNewState } from '../../src/core/state';
import { isRipe } from '../../src/core/field';

let rngValue = 0.99;
function setRng(_g: Game, v: number) { rngValue = v; }
function newGame(t = 0): Game {
  rngValue = 0.99;
  return new Game(createNewState(t), { now: () => t }, () => rngValue);
}
function completeRow1(): Game {
  const g = newGame();
  g.startBasic(1);
  for (let b = 1; b <= 9; b++) g.answer(b);
  return g;
}

describe('Game', () => {
  it('新遊戲只有第 1 列可玩', () => {
    const g = newGame();
    expect(g.startBasic(2)).toBeNull();
    expect(g.startBasic(1)).toEqual({ a: 1, b: 1 });
  });
  it('基礎模式答對收成 1 個並加熟練', () => {
    const g = newGame(); g.startBasic(1);
    const r = g.answer(1)!;
    expect(r).toMatchObject({ kind: 'correct', crop: 'wheat', amount: 1, golden: false, next: { a: 1, b: 2 } });
    expect(g.state.inventory.wheat).toBe(1);
    expect(g.state.mastery['1,1']).toBe(1);
    expect(isRipe(g.state, 1, 1, 0)).toBe(false);
  });
  it('答錯排到最後重問，重問答對不加熟練但會收成', () => {
    const g = newGame(); g.startBasic(1);
    const w = g.answer(7)!;
    expect(w).toMatchObject({ kind: 'wrong', correctAnswer: 1, next: { a: 1, b: 2 } });
    for (let b = 2; b <= 9; b++) g.answer(b);
    expect(g.current).toEqual({ a: 1, b: 1 });
    const r = g.answer(1)!;
    expect(r).toMatchObject({ kind: 'correct', amount: 1, points: 0, unlockedRow: 2, next: null });
    expect(g.current).toBeNull();
    expect(g.mode).toBeNull();
  });
  it('跨輪累積解鎖進度', () => {
    const g = newGame(); g.startBasic(1);
    for (let b = 1; b <= 5; b++) g.answer(b);
    g.endRound();
    expect(g.startBasic(1)).toEqual({ a: 1, b: 6 });
    for (let b = 6; b <= 8; b++) expect(g.answer(b)!.kind).toBe('correct');
    expect((g.answer(9) as any).unlockedRow).toBe(2);
    expect(g.state.unlocked).toBe(2);
    expect(g.startBasic(2)).toEqual({ a: 2, b: 1 });
  });
  it('整列都在生長時無法開始並回報倒數', () => {
    const g = completeRow1();
    expect(g.startBasic(1)).toBeNull();
    expect(g.msUntilNextRipe(1)).toBe(300_000);
    expect(g.msUntilNextRipe(2)).toBe(0);
  });
  it('挑戰模式：只抽已解鎖的成熟格、答對得 2 個、金色得 4 個', () => {
    const g = completeRow1();
    const q = g.startChallenge()!;
    expect(q.a).toBe(2);
    expect(g.progress()).toEqual({ done: 0, total: 9 });
    setRng(g, 0.99); expect(g.answer(q.a * q.b)).toMatchObject({ amount: 2, golden: false });
    const q2 = g.current!; g.state.mastery[`${q2.a},${q2.b}`] = 6;
    setRng(g, 0); expect(g.answer(q2.a * q2.b)).toMatchObject({ amount: 4, golden: true });
  });
  it('挑戰模式不增加解鎖進度', () => {
    const g = completeRow1();
    g.startChallenge();
    while (g.current) g.answer(g.current.a * g.current.b);
    expect(g.state.cleared[2] ?? []).toEqual([]);
    expect(g.state.unlocked).toBe(2);
  });
  it('庫存上限 99', () => {
    const g = newGame(); g.state.inventory.wheat = 99; g.startBasic(1);
    expect(g.answer(1)).toMatchObject({ amount: 0, capped: true });
    expect(g.state.inventory.wheat).toBe(99);
  });
  it('沒有題目時 answer 回傳 null（連點 ✔ 不重複計分）', () => {
    const g = newGame(); expect(g.answer(1)).toBeNull();
  });
  it('每日統計以當地日期記錄', () => {
    const g = newGame(new Date(2026, 10, 15, 9).getTime()); g.startBasic(1);
    g.answer(1); g.answer(5);
    expect(g.state.daily['2026-11-15']).toEqual({ answered: 2, correct: 1 });
  });
  it('resume 會平移時間並清掉已成熟的格子', () => {
    let t = 10_000;
    const g = new Game(createNewState(t), { now: () => t }, () => 0.99);
    g.startBasic(1); g.answer(1);
    t = 4_000; g.resume();
    expect(g.msUntilNextRipe(1)).toBe(0);
    expect(g.state.growing['1,1']).toBe(4_000 + 300_000);
    t = 4_000 + 300_000; g.resume();
    expect(g.state.growing['1,1']).toBeUndefined();
  });
  it('resume 會把遠在未來的生長時間拉回 5 分鐘內', () => {
    const t = 50_000;
    const g = new Game(createNewState(t), { now: () => t }, () => 0.99);
    g.state.growing['1,1'] = t + 10 * 365 * 24 * 3600 * 1000;
    g.resume();
    expect(g.msUntilNextRipe(1)).toBe(0); // other cells are ripe
    expect(isRipe(g.state, 1, 1, t + 300_000)).toBe(true);
  });
  it('第 9 級是最後一級：清完最後一列不再解鎖', () => {
    const g = newGame();
    g.state.unlocked = 9;
    expect(g.startBasic(9)).toEqual({ a: 9, b: 1 });
    let last: ReturnType<Game['answer']> = null;
    for (let b = 1; b <= 9; b++) {
      last = g.answer(9 * b);
      expect(last).toMatchObject({ kind: 'correct', unlockedRow: null });
    }
    expect(g.state.cleared[9]).toHaveLength(9);
    expect(g.state.unlocked).toBe(9);
    expect(last).toMatchObject({ next: null });
  });
});
