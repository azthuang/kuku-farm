import type { SpeciesId } from '../core/species';

export type SfxName = 'cluck' | 'collect' | 'sweep' | 'buy' | 'heal' | 'nope' | 'moo' | 'oink' | 'baa' | 'hum' | 'woof' | 'meow'
  // batch 3: the specials (tree, balloon, rocket, UFO, dinosaur) and the pigeons
  | 'jingle' | 'burner' | 'rocket' | 'ufo' | 'roar' | 'flap' | 'splash' | 'hop';

const VOICES: Record<SpeciesId, SfxName> = { chicken: 'cluck', cow: 'moo', pig: 'oink', sheep: 'baa', llama: 'hum' };

/** The sound an animal of this species makes. */
export function voiceOf(species: SpeciesId): SfxName {
  return VOICES[species];
}

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

  /** Filtered noise sweeping f0 → f1: a hiss, a roar of flame, wings. */
  function noise(c: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'bandpass'): void {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * level, t + Math.min(0.08, dur / 3));
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A bleat: a sawtooth with a wavering pitch from a low-frequency oscillator. */
  function vibrato(c: AudioContext, t: number, f: number, dur: number, gain: number): void {
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const depth = c.createGain();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    lfo.frequency.setValueAtTime(22, t);
    depth.gain.setValueAtTime(28, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * level, t + 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
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
        case 'moo':
          blip(c, t, 190, 130, 0.55, 0.14, 'triangle');
          break;
        case 'oink':
          blip(c, t, 320, 240, 0.09, 0.13, 'sawtooth');
          blip(c, t + 0.14, 300, 220, 0.1, 0.13, 'sawtooth');
          break;
        case 'baa':
          vibrato(c, t, 360, 0.5, 0.13);
          break;
        case 'hum':
          blip(c, t, 250, 270, 0.6, 0.1, 'sine');
          break;
        case 'woof':
          // two short, bright barks
          blip(c, t, 420, 260, 0.09, 0.15, 'square');
          blip(c, t + 0.16, 440, 270, 0.1, 0.15, 'square');
          break;
        case 'meow':
          // a rising then falling mew
          blip(c, t, 560, 820, 0.16, 0.11, 'triangle');
          blip(c, t + 0.15, 820, 520, 0.24, 0.11, 'triangle');
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
        case 'jingle':
          // little bells: two quick high runs
          arp(c, t, [1568, 1976, 2349], 0.08, 0.22, 0.09);
          arp(c, t + 0.3, [1760, 2349, 2637], 0.08, 0.26, 0.09);
          break;
        case 'burner':
          noise(c, t, 0.7, 300, 900, 0.16, 'lowpass');
          break;
        case 'rocket':
          // 3, 2, 1 … whoosh
          for (let i = 0; i < 3; i++) blip(c, t + i * 0.3, 880, 880, 0.08, 0.1, 'square');
          noise(c, t + 0.9, 0.6, 200, 2400, 0.16, 'bandpass');
          break;
        case 'ufo':
          // wee-ooo wee-ooo
          blip(c, t, 600, 1200, 0.25, 0.08, 'sine');
          blip(c, t + 0.25, 1200, 600, 0.25, 0.08, 'sine');
          blip(c, t + 0.5, 600, 1200, 0.25, 0.08, 'sine');
          blip(c, t + 0.75, 1200, 600, 0.25, 0.08, 'sine');
          break;
        case 'roar':
          // a friendly rumble, not a scare: low, short, soft-edged
          blip(c, t, 150, 95, 0.55, 0.14, 'sawtooth');
          noise(c, t, 0.5, 500, 250, 0.08, 'lowpass');
          break;
        case 'flap':
          for (let i = 0; i < 4; i++) noise(c, t + i * 0.09, 0.07, 1200, 700, 0.1, 'bandpass');
          break;
        case 'splash':
          // a bloop as the fish leaves the water, a splash as it falls back in
          blip(c, t, 520, 260, 0.12, 0.1, 'sine');
          noise(c, t + 0.75, 0.3, 1800, 500, 0.12, 'lowpass');
          break;
        case 'hop':
          for (let i = 0; i < 2; i++) blip(c, t + i * 0.18, 420, 760, 0.07, 0.08, 'triangle');
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
