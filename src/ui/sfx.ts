export type SfxName = 'cluck' | 'collect' | 'sweep' | 'buy' | 'heal' | 'nope';

export interface Sfx {
  play(name: SfxName): void;
  /**
   * A soft background sound (an idle cluck). Only on an already running context: never creates
   * one, and never queues up while suspended to burst out together on resume.
   */
  ambient(name: SfxName): void;
  unlock(): void;
  setEnabled(on: boolean): void;
}

const MAX_GAIN = 0.15;
/** Ambient sounds play at this fraction of the normal level. */
const AMBIENT_LEVEL = 0.35;

/** Short synthesized WebAudio sounds. Silent (never throws) without audio or when disabled. */
export function createSfx(ctxFactory: () => AudioContext | null, enabled: boolean): Sfx {
  let on = enabled;
  let ctx: AudioContext | null = null;
  let tried = false;
  /** Gain multiplier for the sound being played (1, or AMBIENT_LEVEL). */
  let level = 1;

  function getCtx(): AudioContext | null {
    if (!on) return null;
    if (!tried) {
      tried = true;
      try {
        ctx = ctxFactory();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  }

  function blip(c: AudioContext, t: number, f0: number, f1: number, dur: number, gain = MAX_GAIN, type: OscillatorType = 'sine'): void {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * level, t + 0.015);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function swish(c: AudioContext, t: number): void {
    const len = Math.max(1, Math.floor(c.sampleRate * 0.25));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(900, t);
    filt.frequency.linearRampToValueAtTime(2600, t + 0.22);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1 * level, t + 0.06);
    g.gain.linearRampToValueAtTime(0, t + 0.24);
    src.connect(filt);
    filt.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.stop(t + 0.26);
  }

  function arp(c: AudioContext, t: number, freqs: number[], step: number, dur: number, gain: number): void {
    freqs.forEach((f, i) => blip(c, t + i * step, f, f, dur, gain, 'triangle'));
  }

  function play(name: SfxName): void {
    const c = getCtx();
    if (!c) return;
    level = 1;
    emit(c, name);
  }

  function ambient(name: SfxName): void {
    if (!on || !ctx || (ctx.state as string) !== 'running') return;
    level = AMBIENT_LEVEL;
    emit(ctx, name);
    level = 1;
  }

  function emit(c: AudioContext, name: SfxName): void {
    try {
      const t = c.currentTime;
      switch (name) {
        case 'cluck':
          blip(c, t, 520, 700, 0.07, 0.13, 'triangle');
          blip(c, t + 0.1, 480, 640, 0.08, 0.13, 'triangle');
          break;
        case 'collect':
          arp(c, t, [660, 880, 1175], 0.07, 0.16, 0.12);
          break;
        case 'sweep':
          swish(c, t);
          break;
        case 'buy':
          arp(c, t, [784, 988, 1175, 1568, 1976], 0.06, 0.14, 0.1);
          break;
        case 'heal':
          blip(c, t, 400, 900, 0.3, 0.13);
          break;
        case 'nope':
          blip(c, t, 220, 200, 0.11, 0.14, 'triangle');
          blip(c, t + 0.15, 200, 170, 0.14, 0.14, 'triangle');
          break;
      }
    } catch {
      /* audio is optional */
    }
  }

  function unlock(): void {
    const c = getCtx();
    if (!c) return;
    try {
      // Safari reports 'interrupted' after a call or screen lock; both need a resume in a gesture.
      const st = c.state as string;
      if (st === 'suspended' || st === 'interrupted') void c.resume().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  return {
    play,
    ambient,
    unlock,
    setEnabled(v: boolean) {
      on = v;
    },
  };
}
