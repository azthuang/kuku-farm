import type { CropId } from './levels';

export type SpeciesId = 'chicken' | 'cow' | 'pig' | 'sheep' | 'llama';
export type HouseKind = 'coop' | 'barn' | 'sty' | 'fold' | 'hut';
export type ProductId = 'egg' | 'milk' | 'truffle' | 'yarn' | 'fluff';
export type FeedId = 'feed' | 'feedCow' | 'feedPig' | 'feedSheep' | 'feedLlama';
export type SupplyId = FeedId | 'treat' | 'medicine';
export type Price = Partial<Record<CropId | ProductId, number>>;

const HOUR = 3_600_000;

export interface SpeciesDef {
  id: SpeciesId;
  house: HouseKind;
  houseCapacity: number;
  /** Fixed open lot (and page index) of the house. */
  lot: number;
  product: ProductId;
  feed: FeedId;
  housePrice: Price;
  animalPrice(countOfSpecies: number): Price;
  feedPrice: Price;
  /** Crops in the house price: the house stays locked until all their levels are unlocked. */
  lockCrop: CropId[];
  satietyPerHour: number;
  poopEveryMs: number;
  produceEveryMs: number;
  produceHappyEveryMs: number;
  maxWaiting: number;
  colors: readonly string[];
  names: readonly string[];
}

const COMMON = { satietyPerHour: 8, poopEveryMs: 3 * HOUR, maxWaiting: 3, houseCapacity: 2 } as const;

const CROP_IDS: readonly CropId[] = [
  'wheat', 'carrot', 'corn', 'potato', 'tomato', 'strawberry', 'pumpkin', 'grape', 'watermelon',
];

function cropsOf(p: Price): CropId[] {
  return CROP_IDS.filter((c) => p[c] !== undefined);
}

const CHICKEN_HOUSE: Price = { wheat: 150, carrot: 100 };
const COW_HOUSE: Price = { potato: 120, corn: 80 };
const PIG_HOUSE: Price = { tomato: 120, potato: 80 };
const SHEEP_HOUSE: Price = { strawberry: 120, tomato: 80 };
const LLAMA_HOUSE: Price = { grape: 120, pumpkin: 80 };

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  chicken: {
    ...COMMON,
    id: 'chicken', house: 'coop', houseCapacity: 4, lot: 0, product: 'egg', feed: 'feed',
    housePrice: CHICKEN_HOUSE,
    animalPrice: (n) => (n < 2 ? { wheat: 80, carrot: 50 } : { corn: 20, egg: 5 }),
    feedPrice: { wheat: 30, carrot: 10 },
    lockCrop: cropsOf(CHICKEN_HOUSE),
    produceEveryMs: 2 * HOUR,
    produceHappyEveryMs: 1.5 * HOUR,
    colors: ['白', '棕', '黑'],
    names: ['咕咕', '皮皮', '小米', '豆豆', '啾啾', '毛毛', '球球', '布丁'],
  },
  cow: {
    ...COMMON,
    id: 'cow', house: 'barn', lot: 1, product: 'milk', feed: 'feedCow',
    housePrice: COW_HOUSE,
    animalPrice: () => ({ potato: 60, egg: 10 }),
    feedPrice: { corn: 30, potato: 10 },
    lockCrop: cropsOf(COW_HOUSE),
    produceEveryMs: 3 * HOUR,
    produceHappyEveryMs: 2.25 * HOUR,
    colors: ['黑白花', '棕白花', '奶油色淡花'],
    names: ['哞哞', '花花', '奶茶', '大福', '乳酪', '雲朵'],
  },
  pig: {
    ...COMMON,
    id: 'pig', house: 'sty', lot: 2, product: 'truffle', feed: 'feedPig',
    housePrice: PIG_HOUSE,
    animalPrice: () => ({ tomato: 60, milk: 5 }),
    feedPrice: { potato: 30, tomato: 10 },
    lockCrop: cropsOf(PIG_HOUSE),
    produceEveryMs: 4 * HOUR,
    produceHappyEveryMs: 3 * HOUR,
    colors: ['粉紅', '棕', '黑'],
    names: ['嚕嚕', '粉粉', '肉圓', '波波', '團子', '小胖'],
  },
  sheep: {
    ...COMMON,
    id: 'sheep', house: 'fold', lot: 3, product: 'yarn', feed: 'feedSheep',
    housePrice: SHEEP_HOUSE,
    animalPrice: () => ({ strawberry: 60, truffle: 5 }),
    feedPrice: { tomato: 30, strawberry: 10 },
    lockCrop: cropsOf(SHEEP_HOUSE),
    produceEveryMs: 4 * HOUR,
    produceHappyEveryMs: 3 * HOUR,
    colors: ['白', '灰', '黑'],
    names: ['咩咩', '棉花', '雪球', '捲捲', '白白', '絨絨'],
  },
  llama: {
    ...COMMON,
    id: 'llama', house: 'hut', lot: 4, product: 'fluff', feed: 'feedLlama',
    housePrice: LLAMA_HOUSE,
    animalPrice: () => ({ watermelon: 60, yarn: 5 }),
    feedPrice: { pumpkin: 30, grape: 10 },
    lockCrop: cropsOf(LLAMA_HOUSE),
    produceEveryMs: 6 * HOUR,
    produceHappyEveryMs: 4.5 * HOUR,
    colors: ['白', '淺棕', '深棕'],
    names: ['駝駝', '草泥', '阿毛', '軟軟', '長長', '可可'],
  },
};

/** Page order of the ranch. */
export const SPECIES_ORDER: readonly SpeciesId[] = ['chicken', 'cow', 'pig', 'sheep', 'llama'];
export const HOUSE_KINDS: readonly HouseKind[] = SPECIES_ORDER.map((s) => SPECIES[s].house);
export const PRODUCT_IDS: readonly ProductId[] = SPECIES_ORDER.map((s) => SPECIES[s].product);
export const FEED_IDS: readonly FeedId[] = SPECIES_ORDER.map((s) => SPECIES[s].feed);
export const SUPPLY_IDS: readonly SupplyId[] = [...FEED_IDS, 'treat', 'medicine'];

/** Emoji shown for each product (ranch items, flights, overview badges, HUD). */
export const PRODUCT_EMOJI: Record<ProductId, string> = {
  egg: '🥚', milk: '🥛', truffle: '🍄', yarn: '🧶', fluff: '🧸',
};

export function speciesOfHouse(kind: HouseKind): SpeciesId {
  return SPECIES_ORDER.find((s) => SPECIES[s].house === kind)!;
}
