export type CropId =
  | 'wheat' | 'carrot' | 'corn' | 'potato' | 'tomato'
  | 'strawberry' | 'pumpkin' | 'grape' | 'watermelon';

export interface Crop {
  id: CropId;
  emoji: string;
  name: string;
  value: number;
}

export const LEVEL_ORDER: readonly number[] = [1, 2, 5, 4, 8, 3, 6, 7, 9];

export const CROP_BY_ROW: Record<number, Crop> = {
  1: { id: 'wheat', emoji: '🌾', name: '小麥', value: 1 },
  2: { id: 'carrot', emoji: '🥕', name: '紅蘿蔔', value: 1 },
  5: { id: 'corn', emoji: '🌽', name: '玉米', value: 2 },
  4: { id: 'potato', emoji: '🥔', name: '馬鈴薯', value: 3 },
  8: { id: 'tomato', emoji: '🍅', name: '番茄', value: 4 },
  3: { id: 'strawberry', emoji: '🍓', name: '草莓', value: 5 },
  6: { id: 'pumpkin', emoji: '🎃', name: '南瓜', value: 6 },
  7: { id: 'grape', emoji: '🍇', name: '葡萄', value: 7 },
  9: { id: 'watermelon', emoji: '🍉', name: '西瓜', value: 8 },
};

export function unlockedRows(unlocked: number): number[] {
  return LEVEL_ORDER.slice(0, unlocked);
}

export function nextRow(unlocked: number): number | null {
  return unlocked < LEVEL_ORDER.length ? LEVEL_ORDER[unlocked] : null;
}

export function cropPool(unlocked: number): Crop[] {
  return LEVEL_ORDER.slice(0, unlocked).map(r => CROP_BY_ROW[r]);
}

/**
 * Crops a question from this row can grow: the crops of every level up to and including it,
 * in unlock order, so the row's own crop is last. Rare crops come from practising hard levels.
 */
export function cropPoolForRow(row: number): Crop[] {
  const i = LEVEL_ORDER.indexOf(row);
  return LEVEL_ORDER.slice(0, i + 1).map(r => CROP_BY_ROW[r]);
}
