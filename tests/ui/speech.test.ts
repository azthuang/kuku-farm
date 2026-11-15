import { beforeAll, describe, expect, it } from 'vitest';
import { createSpeech, pickVoice } from '../../src/ui/speech';

type V = { lang: string; name: string };

function fakeSynth(initial: V[]) {
  let voices = initial;
  const listeners: Record<string, Array<() => void>> = {};
  const fake = {
    spoken: [] as string[],
    cancels: 0,
    rates: [] as number[],
    getVoices: () => voices,
    speak(u: { text: string; rate: number }) { fake.spoken.push(u.text); fake.rates.push(u.rate); },
    cancel() { fake.cancels++; },
    addEventListener(type: string, cb: () => void) { (listeners[type] ??= []).push(cb); },
    setVoices(v: V[]) { voices = v; },
    fire(type: string) { (listeners[type] ?? []).forEach(cb => cb()); },
  };
  return fake;
}

beforeAll(() => {
  if (typeof (globalThis as any).SpeechSynthesisUtterance === 'undefined') {
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string; rate = 1; voice: unknown = null; lang = '';
      constructor(text = '') { this.text = text; }
    };
  }
});

describe('pickVoice', () => {
  it('prefers zh-TW, then other zh, excluding zh-HK / yue', () => {
    expect(pickVoice([{ lang: 'en-US', name: 'a' }, { lang: 'zh-HK', name: 'b' }, { lang: 'zh-TW', name: 'c' }])).toBe(2);
    expect(pickVoice([{ lang: 'zh-HK', name: 'b' }, { lang: 'zh-CN', name: 'd' }])).toBe(1);
    expect(pickVoice([{ lang: 'yue-HK', name: 'e' }, { lang: 'en-US', name: 'a' }])).toBe(-1);
    expect(pickVoice([{ lang: 'zh_tw', name: 'x' }])).toBe(0);
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

  it('picks up voices already present at creation; unlock speaks an empty string', () => {
    const fake = fakeSynth([{ lang: 'zh-TW', name: 'c' }]);
    const sp = createSpeech(fake as any, true);
    sp.unlock();
    expect(fake.spoken).toEqual(['']);
  });
});
