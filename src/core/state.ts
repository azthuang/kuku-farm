import type { CropId } from './levels';

export const CROP_CAP = 999;

export interface DailyStat { answered: number; correct: number }

export interface GameState {
  version: 2;
  unlocked: number;
  cleared: Record<number, number[]>;
  mastery: Record<string, number>;
  inventory: Record<CropId, number>;
  daily: Record<string, DailyStat>;
  settings: { speech: boolean; sound: boolean };
  lastSeenAt: number;
}

export function createNewState(now: number): GameState {
  return {
    version: 2,
    unlocked: 1,
    cleared: {},
    mastery: {},
    inventory: {
      wheat: 0, carrot: 0, corn: 0, potato: 0, tomato: 0,
      strawberry: 0, pumpkin: 0, grape: 0, watermelon: 0,
    },
    daily: {},
    settings: { speech: true, sound: true },
    lastSeenAt: now,
  };
}

export function cellKey(a: number, b: number): string {
  return `${a},${b}`;
}
