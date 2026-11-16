import { describe, it, expect } from 'vitest';
import { careFeedback, TOAST_NEEDS_MEDICINE, TOAST_PAT_AGAIN } from '../../src/ui/ranchFeedback';

describe('careFeedback', () => {
  it('a pat on cooldown still jumps and clucks (the hand always works)', () => {
    expect(careFeedback('hand', { ok: false, reason: 'cooldown' }, false, 'chicken')).toEqual({ fx: 'jump', sound: 'cluck' });
    expect(careFeedback('hand', { ok: true }, false, 'chicken')).toEqual({ fx: 'jump', sound: 'cluck' });
  });

  it('a sick hen without medicine lifts her head weakly, on cooldown too', () => {
    const weak = { fx: 'weak', toast: TOAST_NEEDS_MEDICINE };
    expect(careFeedback('hand', { ok: true }, true, 'chicken')).toEqual(weak);
    expect(careFeedback('hand', { ok: false, reason: 'cooldown' }, true, 'chicken')).toEqual(weak);
  });

  it('healing', () => {
    expect(careFeedback('hand', { ok: true, healed: true }, false, 'chicken')).toEqual({ fx: 'heal', sound: 'heal' });
  });

  it('a brush on cooldown still sparkles', () => {
    expect(careFeedback('brush', { ok: false, reason: 'cooldown' }, false, 'chicken')).toEqual({ fx: 'brush', sound: 'sweep' });
    expect(careFeedback('brush', { ok: true }, false, 'chicken')).toEqual({ fx: 'brush', sound: 'sweep' });
  });

  it('wrong targets shake their head', () => {
    const shake = { fx: 'shake', sound: 'nope' };
    expect(careFeedback('feed', { ok: false, reason: 'full' }, false, 'chicken')).toEqual(shake);
    expect(careFeedback('brush', { ok: false, reason: 'sick' }, true, 'chicken')).toEqual(shake);
    expect(careFeedback('treat', { ok: false, reason: 'sick' }, true, 'chicken')).toEqual(shake);
    expect(careFeedback('medicine', { ok: false, reason: 'not-sick' }, false, 'chicken')).toEqual(shake);
    expect(careFeedback('medicine', { ok: false, reason: 'nothing' }, true, 'chicken')).toEqual(shake);
  });

  it('running out shakes and opens the shop at that supply', () => {
    expect(careFeedback('feed', { ok: false, reason: 'none-left' }, false, 'chicken')).toEqual({ fx: 'shake', sound: 'nope', shop: 'feed' });
    expect(careFeedback('medicine', { ok: false, reason: 'none-left' }, true, 'chicken')).toEqual({ fx: 'shake', sound: 'nope', shop: 'medicine' });
  });

  it('each species answers in its own voice; running out of feed opens that species feed', () => {
    expect(careFeedback('hand', { ok: true }, false, 'cow')).toEqual({ fx: 'jump', sound: 'moo' });
    expect(careFeedback('hand', { ok: false, reason: 'cooldown' }, false, 'pig')).toEqual({ fx: 'jump', sound: 'oink' });
    expect(careFeedback('feed', { ok: true }, false, 'sheep')).toEqual({ fx: 'eat', sound: 'baa' });
    expect(careFeedback('treat', { ok: true }, false, 'llama')).toEqual({ fx: 'treat', sound: 'hum' });
    expect(careFeedback('feed', { ok: false, reason: 'none-left' }, false, 'pig'))
      .toEqual({ fx: 'shake', sound: 'nope', shop: 'feedPig' });
    expect(careFeedback('brush', { ok: true }, false, 'cow')).toEqual({ fx: 'brush', sound: 'sweep' });
  });

  it('successes', () => {
    expect(careFeedback('feed', { ok: true }, false, 'chicken')).toEqual({ fx: 'eat', sound: 'cluck' });
    expect(careFeedback('treat', { ok: true }, false, 'chicken')).toEqual({ fx: 'treat', sound: 'cluck' });
    expect(careFeedback('medicine', { ok: true }, true, 'chicken')).toEqual({ fx: 'weak', toast: TOAST_PAT_AGAIN, nextTool: 'hand' });
  });
});
