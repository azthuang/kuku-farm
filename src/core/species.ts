import type { CropId } from './levels';

export type SpeciesId = 'chicken' | 'cow' | 'pig' | 'sheep' | 'llama';
export type HouseKind = 'coop' | 'barn' | 'sty' | 'fold' | 'hut';
export type ProductId = 'egg' | 'milk' | 'truffle' | 'yarn' | 'fluff';
export type FeedId = 'feed' | 'feedCow' | 'feedPig' | 'feedSheep' | 'feedLlama';
export type PetKind = 'dog' | 'cat';
export type PetSnackId = 'bone' | 'fish';
export type SupplyId = FeedId | 'treat' | 'medicine' | PetSnackId;
export type Price = Partial<Record<CropId | ProductId, number>>;

const HOUR = 3_600_000;

export interface SpeciesDef {
  id: SpeciesId;
  house: HouseKind;
  houseCapacity: number;
  /** Fixed lot (and ranch page) of the house: 1 … 5, after the garden at FARM_LOT. */
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

/** Each extra animal of a kind costs this much more than the one before. */
export const EXTRA_ANIMAL_FACTOR = 1.5;

/** `base` for the first `free` animals of a kind, then ×1.5 per extra one, rounded to tens. */
function rising(base: Price, free: number): (n: number) => Price {
  return (n) => {
    if (n < free) return { ...base };
    const k = Math.pow(EXTRA_ANIMAL_FACTOR, n - free + 1);
    return Object.fromEntries(Object.entries(base).map(([c, v]) => [c, Math.round(((v ?? 0) * k) / 10) * 10])) as Price;
  };
}

// Crops only (products buy the dog, the cat and their snacks). Each price leans on the crops the
// field yields most of at that stage and stays at or under 450 of any one crop.
const CHICKEN_HOUSE: Price = { wheat: 150, carrot: 100 };
const COW_HOUSE: Price = { potato: 450, corn: 300 };
const PIG_HOUSE: Price = { tomato: 450, potato: 230 };
const SHEEP_HOUSE: Price = { strawberry: 380, tomato: 300 };
const LLAMA_HOUSE: Price = { grape: 450, pumpkin: 380 };

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  chicken: {
    ...COMMON,
    id: 'chicken', house: 'coop', houseCapacity: 4, lot: 1, product: 'egg', feed: 'feed',
    housePrice: CHICKEN_HOUSE,
    animalPrice: rising({ wheat: 80, carrot: 50 }, 2),
    feedPrice: { wheat: 30, carrot: 10 },
    lockCrop: cropsOf(CHICKEN_HOUSE),
    produceEveryMs: 2 * HOUR,
    produceHappyEveryMs: 1.5 * HOUR,
    colors: ['白', '棕', '黑'],
    names: ['咕咕', '皮皮', '小米', '豆豆', '啾啾', '毛毛', '球球', '布丁'],
  },
  cow: {
    ...COMMON,
    id: 'cow', house: 'barn', lot: 2, product: 'milk', feed: 'feedCow',
    housePrice: COW_HOUSE,
    animalPrice: rising({ potato: 300, corn: 230 }, 1),
    feedPrice: { corn: 40, potato: 20 },
    lockCrop: cropsOf(COW_HOUSE),
    produceEveryMs: 3 * HOUR,
    produceHappyEveryMs: 2.25 * HOUR,
    colors: ['黑白花', '棕白花', '奶油色淡花'],
    names: ['哞哞', '花花', '奶茶', '大福', '乳酪', '雲朵'],
  },
  pig: {
    ...COMMON,
    id: 'pig', house: 'sty', lot: 3, product: 'truffle', feed: 'feedPig',
    housePrice: PIG_HOUSE,
    animalPrice: rising({ tomato: 380, corn: 150 }, 1),
    feedPrice: { potato: 40, tomato: 20 },
    lockCrop: cropsOf(PIG_HOUSE),
    produceEveryMs: 4 * HOUR,
    produceHappyEveryMs: 3 * HOUR,
    colors: ['粉紅', '棕', '黑'],
    names: ['嚕嚕', '粉粉', '肉圓', '波波', '團子', '小胖'],
  },
  sheep: {
    ...COMMON,
    id: 'sheep', house: 'fold', lot: 4, product: 'yarn', feed: 'feedSheep',
    housePrice: SHEEP_HOUSE,
    animalPrice: rising({ strawberry: 300, tomato: 230 }, 1),
    feedPrice: { tomato: 40, strawberry: 20 },
    lockCrop: cropsOf(SHEEP_HOUSE),
    produceEveryMs: 4 * HOUR,
    produceHappyEveryMs: 3 * HOUR,
    colors: ['白', '灰', '黑'],
    names: ['咩咩', '棉花', '雪球', '捲捲', '白白', '絨絨'],
  },
  llama: {
    ...COMMON,
    id: 'llama', house: 'hut', lot: 5, product: 'fluff', feed: 'feedLlama',
    housePrice: LLAMA_HOUSE,
    animalPrice: rising({ watermelon: 450, pumpkin: 300 }, 1),
    feedPrice: { pumpkin: 40, grape: 20 },
    lockCrop: cropsOf(LLAMA_HOUSE),
    produceEveryMs: 6 * HOUR,
    produceHappyEveryMs: 4.5 * HOUR,
    colors: ['白', '淺棕', '深棕'],
    names: ['駝駝', '草泥', '阿毛', '軟軟', '長長', '可可'],
  },
};

/** Species in ranch page order (pages 1 … 5, after the garden). */
export const SPECIES_ORDER: readonly SpeciesId[] = ['chicken', 'cow', 'pig', 'sheep', 'llama'];
/** The ranch's first lot and page: the garden that shows the times-table progress. */
export const FARM_LOT = 0;
/** Lots (and ranch pages): the garden, then one per species. */
export const LOT_COUNT = SPECIES_ORDER.length + 1;

/** The species whose house stands on `lot`, or null for the garden (or no lot). */
export function speciesOfLot(lot: number): SpeciesId | null {
  return SPECIES_ORDER.find((s) => SPECIES[s].lot === lot) ?? null;
}
export const HOUSE_KINDS: readonly HouseKind[] = SPECIES_ORDER.map((s) => SPECIES[s].house);
export const PRODUCT_IDS: readonly ProductId[] = SPECIES_ORDER.map((s) => SPECIES[s].product);
export const FEED_IDS: readonly FeedId[] = SPECIES_ORDER.map((s) => SPECIES[s].feed);
export const PET_SNACK_IDS: readonly PetSnackId[] = ['bone', 'fish'];
export const SUPPLY_IDS: readonly SupplyId[] = [...FEED_IDS, 'treat', 'medicine', ...PET_SNACK_IDS];

export interface PetDef {
  kind: PetKind;
  emoji: string;
  /** One of each, bought with products only. */
  price: Price;
  snack: PetSnackId;
  snackPrice: Price;
  /** Coat names in the sprite sheet's column order. */
  colors: readonly string[];
  names: readonly string[];
}

/** The dog and the cat: they roam the farm, never get hungry and only ask to be played with. */
export const PETS: Record<PetKind, PetDef> = {
  dog: {
    kind: 'dog', emoji: '🐕', price: { egg: 30, milk: 15, truffle: 10 },
    snack: 'bone', snackPrice: { egg: 6, truffle: 2 },
    colors: ['白', '棕', '黃', '黑'],
    names: ['旺財', '小白', '豆豆', '來福', '阿黃', '黑輪'],
  },
  cat: {
    kind: 'cat', emoji: '🐈', price: { milk: 20, yarn: 10, fluff: 10 },
    snack: 'fish', snackPrice: { milk: 3, yarn: 2, fluff: 2 },
    colors: ['白', '橘', '咖啡', '黑'],
    names: ['咪咪', '橘子', '小花', '麻糬', '湯圓', '芝麻'],
  },
};
export const PET_KINDS: readonly PetKind[] = ['dog', 'cat'];
export const PET_SNACK_EMOJI: Record<PetSnackId, string> = { bone: '🦴', fish: '🐟' };

/** Each species' face: page titles, feed sacks and the hungry sign on the ranch. */
export const SPECIES_EMOJI: Record<SpeciesId, string> = {
  chicken: '🐔', cow: '🐄', pig: '🐖', sheep: '🐑', llama: '🦙',
};

/** Emoji shown for each product (ranch items, flights, overview badges, HUD). */
export const PRODUCT_EMOJI: Record<ProductId, string> = {
  egg: '🥚', milk: '🥛', truffle: '🍄', yarn: '🧶', fluff: '🧸',
};

export function speciesOfHouse(kind: HouseKind): SpeciesId {
  return SPECIES_ORDER.find((s) => SPECIES[s].house === kind)!;
}
