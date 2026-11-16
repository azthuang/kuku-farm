export type SpeciesId = 'chicken';
export type ProductId = 'egg';
export type SupplyId = 'feed' | 'treat' | 'medicine';
export type HouseKind = 'coop';

const HOUR = 3_600_000;

export interface SpeciesDef {
  id: SpeciesId;
  house: HouseKind;
  houseCapacity: number;
  product: ProductId;
  satietyPerHour: number;
  poopEveryMs: number;
  produceEveryMs: number;
  produceHappyEveryMs: number;
  maxWaiting: number;
  colors: readonly string[];
  names: readonly string[];
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  chicken: {
    id: 'chicken',
    house: 'coop',
    houseCapacity: 4,
    product: 'egg',
    satietyPerHour: 8,
    poopEveryMs: 3 * HOUR,
    produceEveryMs: 2 * HOUR,
    produceHappyEveryMs: 1.5 * HOUR,
    maxWaiting: 3,
    colors: ['白', '棕', '黑'],
    names: ['咕咕', '皮皮', '小米', '豆豆', '啾啾', '毛毛', '球球', '布丁'],
  },
};
