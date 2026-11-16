import { describe, expect, it, vi } from 'vitest';
import { createSfx } from '../../src/ui/sfx';

function fakeCtx() {
  const calls = { osc: 0, gain: 0, buf: 0, resume: 0, maxGain: 0 };
  const param = (track = false) => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => {
      if (track) calls.maxGain = Math.max(calls.maxGain, v);
    }),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: {},
    resume: vi.fn(() => {
      calls.resume++;
      return Promise.resolve();
    }),
    createOscillator: vi.fn(() => {
      calls.osc++;
      return { ...node(), type: 'sine', frequency: param() };
    }),
    createGain: vi.fn(() => {
      calls.gain++;
      return { ...node(), gain: param(true) };
    }),
    createBuffer: vi.fn((_c: number, len: number) => {
      calls.buf++;
      return { getChannelData: () => new Float32Array(len) };
    }),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null })),
    createBiquadFilter: vi.fn(() => ({ ...node(), frequency: param(), Q: param(), type: 'lowpass' })),
  };
  return { ctx: ctx as unknown as AudioContext, calls };
}

const NAMES = ['cluck', 'collect', 'sweep', 'buy', 'heal', 'nope'] as const;

describe('createSfx', () => {
  it('does not create the context or any node when disabled', () => {
    const factory = vi.fn(() => null);
    const sfx = createSfx(factory, false);
    for (const n of NAMES) sfx.play(n);
    sfx.unlock();
    expect(factory).not.toHaveBeenCalled();
  });

  it('is silent and safe when the factory returns null', () => {
    const sfx = createSfx(() => null, true);
    for (const n of NAMES) expect(() => sfx.play(n)).not.toThrow();
    expect(() => sfx.unlock()).not.toThrow();
  });

  it('is safe when the factory throws', () => {
    const sfx = createSfx(() => {
      throw new Error('no audio');
    }, true);
    expect(() => sfx.play('cluck')).not.toThrow();
  });

  it('makes nodes for every sound when enabled, quietly', () => {
    const { ctx, calls } = fakeCtx();
    const sfx = createSfx(() => ctx, true);
    for (const n of NAMES) {
      const before = calls.osc + calls.buf;
      sfx.play(n);
      expect(calls.osc + calls.buf).toBeGreaterThan(before);
    }
    expect(calls.maxGain).toBeGreaterThan(0);
    expect(calls.maxGain).toBeLessThanOrEqual(0.2);
  });

  it('ambient plays softly, only on a running context, and never creates one', () => {
    const factory = vi.fn(() => fakeCtx().ctx);
    createSfx(factory, true).ambient('cluck');
    expect(factory).not.toHaveBeenCalled();

    const { ctx, calls } = fakeCtx();
    const sfx = createSfx(() => ctx, true);
    sfx.unlock(); // creates the (suspended) context
    sfx.ambient('cluck');
    expect(calls.osc).toBe(0); // would otherwise queue and burst out on resume
    (ctx as unknown as { state: string }).state = 'running';
    sfx.ambient('cluck');
    expect(calls.osc).toBeGreaterThan(0);
    const soft = calls.maxGain;
    sfx.play('cluck');
    expect(soft).toBeGreaterThan(0);
    expect(calls.maxGain).toBeGreaterThan(soft * 2);
    sfx.setEnabled(false);
    const before = calls.osc;
    sfx.ambient('cluck');
    expect(calls.osc).toBe(before);
  });

  it('unlock resumes a suspended context', () => {
    const { ctx, calls } = fakeCtx();
    const sfx = createSfx(() => ctx, true);
    sfx.unlock();
    expect(calls.resume).toBe(1);
  });

  it('unlock is a no-op on a running context and resumes an interrupted one', () => {
    const { ctx, calls } = fakeCtx();
    const sfx = createSfx(() => ctx, true);
    (ctx as unknown as { state: string }).state = 'running';
    sfx.unlock();
    sfx.unlock();
    expect(calls.resume).toBe(0);
    (ctx as unknown as { state: string }).state = 'interrupted';
    sfx.unlock();
    expect(calls.resume).toBe(1);
  });

  it('unlock creates no context while sound is off', () => {
    const factory = vi.fn(() => fakeCtx().ctx);
    const sfx = createSfx(factory, false);
    sfx.unlock();
    expect(factory).not.toHaveBeenCalled();
  });

  it('setEnabled(false) stops sounds, setEnabled(true) restores them', () => {
    const { ctx, calls } = fakeCtx();
    const sfx = createSfx(() => ctx, true);
    sfx.setEnabled(false);
    sfx.play('cluck');
    expect(calls.osc).toBe(0);
    sfx.setEnabled(true);
    sfx.play('cluck');
    expect(calls.osc).toBeGreaterThan(0);
  });

  it('reuses one context across plays', () => {
    const { ctx } = fakeCtx();
    const factory = vi.fn(() => ctx);
    const sfx = createSfx(factory, true);
    sfx.play('cluck');
    sfx.play('buy');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
