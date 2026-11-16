import type { CareResult } from '../core/ranch';
import type { ShopItemId } from '../core/shop';
import type { SfxName } from './sfx';
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

export const TOAST_NEEDS_MEDICINE = '🤒 要先吃藥 💊';
export const TOAST_PAT_AGAIN = '✋ 再摸摸牠';

const SUPPLY_OF: Partial<Record<Tool, ShopItemId>> = { feed: 'feed', treat: 'treat', medicine: 'medicine' };

function pat(stillSick: boolean): CareFeedback {
  return stillSick
    ? { fx: 'weak', toast: TOAST_NEEDS_MEDICINE } // not well until it has had medicine
    : { fx: 'jump', sound: 'cluck' };
}

/**
 * What the child sees and hears after using `tool` on an animal. `stillSick` is the animal's
 * state after the action. A pat or brush on cooldown looks like a normal one (the hand always
 * works; the core just stops counting the mood gain); only a wrong target shakes its head.
 */
export function careFeedback(tool: Tool, res: CareResult, stillSick: boolean): CareFeedback {
  if (!res.ok) {
    if (res.reason === 'cooldown') {
      if (tool === 'hand') return pat(stillSick);
      if (tool === 'brush') return { fx: 'brush', sound: 'sweep' };
    }
    const shop = res.reason === 'none-left' ? SUPPLY_OF[tool] : undefined;
    return shop ? { fx: 'shake', sound: 'nope', shop } : { fx: 'shake', sound: 'nope' };
  }
  switch (tool) {
    case 'hand': return res.healed ? { fx: 'heal', sound: 'heal' } : pat(stillSick);
    case 'feed': return { fx: 'eat', sound: 'cluck' };
    case 'brush': return { fx: 'brush', sound: 'sweep' };
    case 'treat': return { fx: 'treat', sound: 'cluck' };
    case 'medicine': return { fx: 'weak', toast: TOAST_PAT_AGAIN, nextTool: 'hand' };
  }
}
