import { describe, it, expect } from 'vitest';
import { Game } from '../../src/core/game';
import { createNewState } from '../../src/core/state';

let rngValue = 0.99;
function setRng(v: number) { rngValue = v; }
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
    expect(g.startBasic(1)).toEqual({ a: 1, b: 1, crop: 'wheat' });
  });
  it('基礎模式答對收成 a×b 個並加熟練', () => {
    const g = newGame(); g.state.unlocked = 2; g.startBasic(2);
    g.answer(2); g.answer(4); g.answer(6);
    const r = g.answer(8)!;
    expect(r).toMatchObject({ kind: 'correct', amount: 8, q: { a: 2, b: 4 } });
    const crop = (r as any).crop;
    expect(g.state.inventory[crop as 'wheat' | 'carrot']).toBeGreaterThanOrEqual(8);
    expect(g.state.mastery['2,4']).toBe(1);
  });
  it('收成進入該題作物的庫存', () => {
    const g = newGame(); g.state.unlocked = 2; g.startBasic(2);
    const q = g.current!;
    const r = g.answer(q.a * q.b)! as any;
    expect(r.crop).toBe(q.crop);
    expect(g.state.inventory[q.crop]).toBe(q.a * q.b);
  });
  it('答錯排到最後重問，作物不變，重問答對不加熟練但會收成', () => {
    const g = newGame(); g.state.unlocked = 2; g.startBasic(2);
    setRng(0);
    const first = g.current!;
    const w = g.answer(99)!;
    expect(w).toMatchObject({ kind: 'wrong', correctAnswer: 2, next: { a: 2, b: 2 } });
    setRng(0.99);
    for (let b = 2; b <= 9; b++) g.answer(2 * b);
    expect(g.current).toEqual(first);
    expect(g.current!.crop).toBe(first.crop);
    const r = g.answer(2)!;
    expect(r).toMatchObject({ kind: 'correct', amount: 2, points: 0, next: null });
    expect(g.current).toBeNull();
    expect(g.mode).toBeNull();
  });
  it('跨輪累積解鎖進度，答完一輪可立刻再玩同一列', () => {
    const g = newGame(); g.startBasic(1);
    for (let b = 1; b <= 5; b++) g.answer(b);
    g.endRound();
    expect(g.startBasic(1)).toMatchObject({ a: 1, b: 1 });
    for (let b = 1; b <= 8; b++) expect(g.answer(b)!.kind).toBe('correct');
    expect((g.answer(9) as any).unlockedRow).toBe(2);
    expect(g.state.unlocked).toBe(2);
    expect(g.startBasic(2)).toMatchObject({ a: 2, b: 1 });
  });
  it('第一輪全部答完後可再次開始同一列', () => {
    const g = completeRow1();
    expect(g.startBasic(1)).toMatchObject({ a: 1, b: 1 });
    expect(g.progress().total).toBe(9);
  });
  it('挑戰模式答對 a×b×2', () => {
    const g = completeRow1();
    const q = g.startChallenge()!;
    expect(g.progress()).toEqual({ done: 0, total: 10 });
    expect(g.answer(q.a * q.b)).toMatchObject({ amount: q.a * q.b * 2 });
  });
  it('只解鎖教學級時挑戰出 9 題，解鎖 2 級後出 10 題', () => {
    const g = newGame();
    expect(g.startChallenge()).not.toBeNull();
    expect(g.progress().total).toBe(9);
    const g2 = completeRow1();
    g2.startChallenge();
    expect(g2.progress().total).toBe(10);
  });
  it('挑戰模式不增加解鎖進度', () => {
    const g = completeRow1();
    g.startChallenge();
    while (g.current) g.answer(g.current.a * g.current.b);
    expect(g.state.cleared[2] ?? []).toEqual([]);
    expect(g.state.unlocked).toBe(2);
  });
  it('庫存上限 999：950 時挑戰 9×9 只加 49', () => {
    const g = newGame(); g.state.unlocked = 9;
    g.startChallenge();
    const q = g.current!;
    g.state.inventory[q.crop] = 950;
    // force a 9x9 question at the head
    (g as any).queue[0] = { a: 9, b: 9, crop: q.crop };
    const r = g.answer(81)!;
    expect(r).toMatchObject({ amount: 49, capped: true });
    expect(g.state.inventory[q.crop]).toBe(999);
  });
  it('沒有題目時 answer 回傳 null（連點 ✔ 不重複計分）', () => {
    const g = newGame(); expect(g.answer(1)).toBeNull();
  });
  it('每日統計以當地日期記錄', () => {
    const g = newGame(new Date(2026, 10, 15, 9).getTime()); g.startBasic(1);
    g.answer(1); g.answer(5);
    expect(g.state.daily['2026-11-15']).toEqual({ answered: 2, correct: 1 });
  });
  it('第 9 級是最後一級：清完最後一列不再解鎖', () => {
    const g = newGame();
    g.state.unlocked = 9;
    expect(g.startBasic(9)).toMatchObject({ a: 9, b: 1 });
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
