export interface Speech { unlock(): void; say(text: string): void; setEnabled(on: boolean): void }

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'>;

const norm = (lang: string) => lang.toLowerCase().replace('_', '-');

/** Index of the best zh voice (zh-TW first; other zh except zh-HK / yue), or -1. */
export function pickVoice(voices: VoiceLike[]): number {
  const tw = voices.findIndex(v => norm(v.lang) === 'zh-tw');
  if (tw >= 0) return tw;
  return voices.findIndex(v => {
    const l = norm(v.lang);
    return l.startsWith('zh') && l !== 'zh-hk' && !l.startsWith('yue');
  });
}

export function createSpeech(synth: SpeechSynthesis | undefined, enabled: boolean): Speech {
  let on = enabled;
  let voice: SpeechSynthesisVoice | null = null;

  const refresh = () => {
    try {
      const voices = synth ? synth.getVoices() : [];
      const i = pickVoice(voices);
      voice = i >= 0 ? voices[i] : null;
    } catch {
      voice = null;
    }
  };
  refresh();
  // Chrome loads voices asynchronously: getVoices() is [] until voiceschanged fires.
  try { synth?.addEventListener?.('voiceschanged', refresh); } catch { /* ignore */ }

  const speak = (text: string) => {
    if (!synth) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'zh-TW'; }
      u.rate = 0.9;
      synth.speak(u);
    } catch { /* speech must never break the game */ }
  };

  return {
    unlock() { speak(''); },
    say(text) {
      if (!synth || !on || !voice) return;
      try { synth.cancel(); } catch { /* ignore */ }
      speak(text);
    },
    setEnabled(v) {
      on = v;
      if (!v) { try { synth?.cancel(); } catch { /* ignore */ } }
    },
  };
}
