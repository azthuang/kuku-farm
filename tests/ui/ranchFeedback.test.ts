import { describe, it, expect } from 'vitest';
import { careFeedback, TOAST_NEEDS_MEDICINE, TOAST_PAT_AGAIN } from '../../src/ui/ranchFeedback';

describe('careFeedback', () => {
  it('a pat on cooldown still jumps and clucks (the hand always works)', () => {
    expect(careFeedback('hand', { ok: false, reason: 'cooldown' }, false)).toEqual({ fx: 'jump', sound: 'cluck' });
    expect(careFeedback('hand', { ok: true }, false)).toEqual({ fx: 'jump', sound: 'cluck' });
  });

  it('a sick hen without medicine lifts her head weakly, on cooldown too', () => {
    const weak = { fx: 'weak', toast: TOAST_NEEDS_MEDICINE };
    expect(careFeedback('hand', { ok: true }, true)).toEqual(weak);
    expect(careFeedback('hand', { ok: false, reason: 'cooldown' }, true)).toEqual(weak);
  });

  it('healing', () => {
    expect(careFeedback('hand', { ok: true, healed: true }, false)).toEqual({ fx: 'heal', sound: 'heal' });
  });

  it('a brush on cooldown still sparkles', () => {
    expect(careFeedback('brush', { ok: false, reason: 'cooldown' }, false)).toEqual({ fx: 'brush', sound: 'sweep' });
    expect(careFeedback('brush', { ok: true }, false)).toEqual({ fx: 'brush', sound: 'sweep' });
  });

  it('wrong targets shake their head', () => {
    const shake = { fx: 'shake', sound: 'nope' };
    expect(careFeedback('feed', { ok: false, reason: 'full' }, false)).toEqual(shake);
    expect(careFeedback('brush', { ok: false, reason: 'sick' }, true)).toEqual(shake);
    expect(careFeedback('treat', { ok: false, reason: 'sick' }, true)).toEqual(shake);
    expect(careFeedback('medicine', { ok: false, reason: 'not-sick' }, false)).toEqual(shake);
    expect(careFeedback('medicine', { ok: false, reason: 'nothing' }, true)).toEqual(shake);
  });

  it('running out shakes and opens the shop at that supply', () => {
    expect(careFeedback('feed', { ok: false, reason: 'none-left' }, false)).toEqual({ fx: 'shake', sound: 'nope', shop: 'feed' });
    expect(careFeedback('medicine', { ok: false, reason: 'none-left' }, true)).toEqual({ fx: 'shake', sound: 'nope', shop: 'medicine' });
  });

  it('successes', () => {
    expect(careFeedback('feed', { ok: true }, false)).toEqual({ fx: 'eat', sound: 'cluck' });
    expect(careFeedback('treat', { ok: true }, false)).toEqual({ fx: 'treat', sound: 'cluck' });
    expect(careFeedback('medicine', { ok: true }, true)).toEqual({ fx: 'weak', toast: TOAST_PAT_AGAIN, nextTool: 'hand' });
  });
});
