import type { CareResult } from '../core/ranch';
import type { ShopItemId } from '../core/shop';
import { SPECIES, type SpeciesId } from '../core/species';
import { voiceOf, type SfxName } from './sfx';
import type { Tool } from './ranchUi';

export type CareFx = 'jump' | 'eat' | 'brush' | 'treat' | 'heal' | 'weak' | 'shake';

export interface CareFeedback {
  fx: CareFx;
  sound?: SfxName;
  toast?: string;
  /** Open the shop at this item (the selected supply ran out). */
  shop?: ShopItemId;
  /** Switch to this tool next (after medicine, the pat that heals). */
  nextTool?: Tool;
}

export const TOAST_NEEDS_MEDICINE = '💊 要先吃藥';
export const TOAST_PAT_AGAIN = '✋ 再摸摸牠';
/** Said when a pet snack meets the wrong animal. */
export const TOAST_SNACK_FOR = { bone: '🦴 是給狗狗的', fish: '🐟 是給貓咪的' } as const;
/** A pet given a snack that is not its own (a 🍪, or the other pet's). */
export const TOAST_PET_EATS = { dog: '狗狗只吃 🦴', cat: '貓咪只吃 🐟' } as const;

/** The supply a tool uses on an animal of this species (feed is per species). */
function supplyOf(tool: Tool, species: SpeciesId): ShopItemId | undefined {
  if (tool === 'feed') return SPECIES[species].feed;
  return tool === 'treat' || tool === 'medicine' || tool === 'bone' || tool === 'fish' ? tool : undefined;
}

function pat(stillSick: boolean, voice: SfxName): CareFeedback {
  return stillSick
    ? { fx: 'weak', toast: TOAST_NEEDS_MEDICINE } // not well until it has had medicine
    : { fx: 'jump', sound: voice };
}

/**
 * What the child sees and hears after using `tool` on an animal. `stillSick` is the animal's
 * state after the action. A pat or brush on cooldown looks like a normal one (the hand always
 * works; the core just stops counting the mood gain); only a wrong target shakes its head.
 * Happy answers use the species' own voice (cluck, moo, oink, baa, hum).
 */
export function careFeedback(tool: Tool, res: CareResult, stillSick: boolean, species: SpeciesId): CareFeedback {
  const voice = voiceOf(species);
  if (!res.ok) {
    if ((tool === 'bone' || tool === 'fish') && res.reason === 'nothing') return { fx: 'shake', sound: 'nope', toast: TOAST_SNACK_FOR[tool] };
    if (res.reason === 'cooldown') {
      if (tool === 'hand') return pat(stillSick, voice);
      if (tool === 'brush') return { fx: 'brush', sound: 'sweep' };
    }
    const shop = res.reason === 'none-left' ? supplyOf(tool, species) : undefined;
    return shop ? { fx: 'shake', sound: 'nope', shop } : { fx: 'shake', sound: 'nope' };
  }
  switch (tool) {
    case 'hand': return res.healed ? { fx: 'heal', sound: 'heal' } : pat(stillSick, voice);
    case 'feed': return { fx: 'eat', sound: voice };
    case 'brush': return { fx: 'brush', sound: 'sweep' };
    case 'treat': case 'bone': case 'fish': return { fx: 'treat', sound: voice };
    case 'medicine': return { fx: 'weak', toast: TOAST_PAT_AGAIN, nextTool: 'hand' };
  }
}
