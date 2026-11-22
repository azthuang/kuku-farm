import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSpeech, pickVoice } from '../../src/ui/speech';

type V = { lang: string; name: string };
type U = {
  text: string; rate: number; volume: number;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e?: { error: string }) => void) | null;
};

function fakeSynth(initial: V[]) {
  let voices = initial;
  const listeners: Record<string, Array<() => void>> = {};
  const fake = {
    spoken: [] as string[],
    utterances: [] as U[],
    cancels: 0,
    rates: [] as number[],
    getVoices: () => voices,
    speak(u: U) { fake.spoken.push(u.text); fake.rates.push(u.rate); fake.utterances.push(u); },
    cancel() { fake.cancels++; },
    addEventListener(type: string, cb: () => void) { (listeners[type] ??= []).push(cb); },
    setVoices(v: V[]) { voices = v; },
    fire(type: string) { (listeners[type] ?? []).forEach(cb => cb()); },
    last(): U { return fake.utterances[fake.utterances.length - 1]; },
  };
  return fake;
}

/** Resolves to 'done' if p settled within the current microtask flush, else 'pending'. */
async function state(p: Promise<unknown>): Promise<'done' | 'pending'> {
  let done = false;
  void p.then(() => { done = true; });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done ? 'done' : 'pending';
}

beforeAll(() => {
  if (typeof (globalThis as any).SpeechSynthesisUtterance === 'undefined') {
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string; rate = 1; volume = 1; voice: unknown = null; lang = '';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text = '') { this.text = text; }
    };
  }
});

afterEach(() => { vi.useRealTimers(); });

describe('pickVoice', () => {
  it('prefers zh-TW, then other zh, excluding zh-HK / yue', () => {
    expect(pickVoice([{ lang: 'en-US', name: 'a' }, { lang: 'zh-HK', name: 'b' }, { lang: 'zh-TW', name: 'c' }])).toBe(2);
    expect(pickVoice([{ lang: 'zh-HK', name: 'b' }, { lang: 'zh-CN', name: 'd' }])).toBe(1);
    expect(pickVoice([{ lang: 'yue-HK', name: 'e' }, { lang: 'en-US', name: 'a' }])).toBe(-1);
    expect(pickVoice([{ lang: 'zh_tw', name: 'x' }])).toBe(0);
  });

  it('rejects every Hong Kong / Macau / Cantonese tag form', () => {
    for (const lang of ['zh-Hant-HK', 'zh_HK', 'yue-Hant-HK', 'zh-MO', 'zh_Hant_HK']) {
      expect(pickVoice([{ lang, name: 'x' }]), lang).toBe(-1);
      expect(pickVoice([{ lang, name: 'x' }, { lang: 'zh-CN', name: 'y' }]), lang).toBe(1);
    }
  });

  it('treats zh-Hant-TW as zh-TW', () => {
    expect(pickVoice([{ lang: 'zh-CN', name: 'a' }, { lang: 'zh-Hant-TW', name: 'b' }])).toBe(1);
  });
});

describe('createSpeech', () => {
  it('does nothing without a synth', () => {
    expect(() => createSpeech(undefined, true).say('二乘三')).not.toThrow();
  });

  it('stays silent with no voices, then speaks once voiceschanged brings one', () => {
    const fake = fakeSynth([]);
    const sp = createSpeech(fake as any, true);
    sp.say('x');
    expect(fake.spoken).toEqual([]);
    fake.setVoices([{ lang: 'zh-TW', name: 'c' }]);
    fake.fire('voiceschanged');
    sp.say('二乘三');
    expect(fake.spoken).toEqual(['二乘三']);
    expect(fake.cancels).toBeGreaterThan(0);
    expect(fake.rates[0]).toBe(0.9);
    sp.setEnabled(false);
    sp.say('x');
    expect(fake.spoken).toEqual(['二乘三']);
  });

  it('picks up late voices even if voiceschanged never fires', () => {
    const fake = fakeSynth([]);
    const sp = createSpeech(fake as any, true);
    sp.say('x');
    expect(fake.spoken).toEqual([]);
    fake.setVoices([{ lang: 'zh-TW', name: 'c' }]); // no 'voiceschanged' event
    sp.say('二乘三');
    expect(fake.spoken).toEqual(['二乘三']);
  });

  it('unlock speaks a short non-empty utterance at volume 0', () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    void sp.unlock();
    expect(fake.utterances).toHaveLength(1);
    expect(fake.last().text.length).toBeGreaterThan(0);
    expect(fake.last().volume).toBe(0);
    expect(fake.cancels).toBe(0); // unlock must not cut off anything already speaking
  });

  it('unlock resolves true once an utterance starts; false on error, and can retry', async () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const first = sp.unlock();
    void sp.unlock(); // a second gesture event while the first attempt is pending
    expect(fake.utterances).toHaveLength(1);
    fake.last().onerror?.();
    expect(await first).toBe(false);
    const second = sp.unlock();
    expect(fake.utterances).toHaveLength(2);
    fake.last().onstart?.();
    expect(await second).toBe(true);
    expect(await sp.unlock()).toBe(true); // already unlocked: no new utterance
    expect(fake.utterances).toHaveLength(2);
  });

  it('sayAndWait resolves on onend', async () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('二二得四', 3000);
    expect(fake.spoken).toEqual(['二二得四']);
    expect(await state(p)).toBe('pending');
    fake.last().onend?.();
    expect(await state(p)).toBe('done');
  });

  it('sayAndWait resolves on onerror', async () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('二二得四', 3000);
    fake.last().onerror?.();
    expect(await state(p)).toBe('done');
  });

  it('sayAndWait resolves after maxMs when the synth never reports back', async () => {
    vi.useFakeTimers();
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('二二得四', 3000);
    vi.advanceTimersByTime(2999);
    expect(await state(p)).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(await state(p)).toBe('done');
  });

  it('sayAndWait restarts its maxMs window when the utterance actually starts (cold engine)', async () => {
    vi.useFakeTimers();
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('九九八十一', 3000);
    vi.advanceTimersByTime(2000);                 // engine slow to start
    fake.last().onstart?.();
    vi.advanceTimersByTime(2999);                 // 4999ms after speak(), 2999ms after start
    expect(await state(p)).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(await state(p)).toBe('done');
  });

  it('sayAndWait resolves immediately when disabled, without a synth, or without a voice', async () => {
    const off = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    expect(await state(createSpeech(off as any, false).sayAndWait('x', 3000))).toBe('done');
    expect(off.spoken).toEqual([]);
    expect(await state(createSpeech(undefined, true).sayAndWait('x', 3000))).toBe('done');
    const mute = fakeSynth([{ lang: 'en-US', name: 'a' }]);
    expect(await state(createSpeech(mute as any, true).sayAndWait('x', 3000))).toBe('done');
    expect(mute.spoken).toEqual([]);
  });

  it('cancel stops speech and settles a pending sayAndWait', async () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('二二得四', 3000);
    const before = fake.cancels;
    sp.cancel();
    expect(fake.cancels).toBe(before + 1);
    expect(await state(p)).toBe('done');
  });

  it('a new say settles the previous sayAndWait', async () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    const p = sp.sayAndWait('二二得四', 3000);
    sp.say('二乘三');
    expect(await state(p)).toBe('done');
  });
});

describe('speech failure hint', () => {
  const zh = [{ lang: 'zh-TW', name: 'a' }];

  it('reports a failed utterance once, however often it fails', () => {
    const fake = fakeSynth(zh);
    const fails: string[] = [];
    const sp = createSpeech(fake as any, true, e => fails.push(e));
    sp.say('二乘三');
    fake.last().onerror?.({ error: 'synthesis-failed' });
    sp.say('二乘四');
    fake.last().onerror?.({ error: 'synthesis-failed' });
    expect(fails).toEqual(['synthesis-failed']);
  });

  it('counts a failed unlock too', () => {
    const fake = fakeSynth(zh);
    const fails: string[] = [];
    const sp = createSpeech(fake as any, true, e => fails.push(e));
    void sp.unlock();
    fake.last().onerror?.({ error: 'audio-busy' });
    expect(fails).toEqual(['audio-busy']);
  });

  it('ignores speech we cut off ourselves and speech blocked before the first tap', () => {
    const fake = fakeSynth(zh);
    const fails: string[] = [];
    const sp = createSpeech(fake as any, true, e => fails.push(e));
    for (const error of ['interrupted', 'canceled', 'not-allowed']) {
      sp.say('二乘三');
      fake.last().onerror?.({ error });
    }
    sp.say('二乘三');
    fake.last().onerror?.();
    expect(fails).toEqual([]);
  });
});
