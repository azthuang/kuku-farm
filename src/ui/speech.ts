export interface Speech {
  /**
   * Speaks a silent utterance so the browser allows speech (call it from a user gesture).
   * Resolves true when no further unlock attempts are needed (speech has started, or there is
   * no speech engine at all), false when this attempt failed and a later gesture should retry.
   */
  unlock(): Promise<boolean>;
  /** Cuts off anything playing and speaks text (fire and forget). */
  say(text: string): void;
  /**
   * Like say(), but resolves when the utterance ends or errors, after maxMs, or when it is
   * cut off by cancel()/say(). Resolves at once when speech is off or there is no zh voice.
   */
  sayAndWait(text: string, maxMs: number): Promise<void>;
  /** Stops all speech and settles any pending sayAndWait. */
  cancel(): void;
  setEnabled(on: boolean): void;
}

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'>;

const UNLOCK_TEXT = '。';
const UNLOCK_TIMEOUT_MS = 2000;
/** say() is fire and forget; this only bounds how long we hold the utterance reference. */
const SAY_HOLD_MS = 15000;

/** BCP 47-ish tag as lowercase subtags; accepts '_' separators (Android). */
const subtags = (lang: string) => lang.toLowerCase().replace(/_/g, '-').split('-');

/** Hong Kong / Macau / Cantonese voices read Mandarin numbers wrongly for a zh-TW learner. */
function isCantoneseRegion(tags: string[]): boolean {
  return tags[0] === 'yue' || tags.includes('hk') || tags.includes('mo');
}

/** Index of the best zh voice (zh-TW first; other zh except HK / MO / yue), or -1. */
export function pickVoice(voices: VoiceLike[]): number {
  const ok = voices.map(v => {
    const t = subtags(v.lang);
    return t[0] === 'zh' && !isCantoneseRegion(t) ? t : null;
  });
  const tw = ok.findIndex(t => t !== null && t.includes('tw'));
  if (tw >= 0) return tw;
  return ok.findIndex(t => t !== null);
}

export function createSpeech(synth: SpeechSynthesis | undefined, enabled: boolean): Speech {
  let on = enabled;
  let voice: SpeechSynthesisVoice | null = null;
  /** Set once any of our utterances has actually started: the browser allows speech now. */
  let unlocked = false;
  let unlocking: Promise<boolean> | null = null;
  /** Settles the current say/sayAndWait utterance (if any) as cut off. */
  let stopCurrent: (() => void) | null = null;
  /** In-flight utterances. Chrome may garbage-collect an unreferenced one and never fire onend. */
  const live = new Set<SpeechSynthesisUtterance>();

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
  // Some Safari versions never fire it, so say/sayAndWait/unlock also refresh while voice is null.
  try { synth?.addEventListener?.('voiceschanged', refresh); } catch { /* ignore */ }

  const make = (text: string): SpeechSynthesisUtterance => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'zh-TW'; }
    u.rate = 0.9;
    return u;
  };

  /**
   * Hooks u's events; onDone(ok) runs exactly once: on end (true), on start if doneOnStart (true),
   * on error or after maxMs (false), or when the returned stop() is called (false).
   */
  const watch = (
    u: SpeechSynthesisUtterance, maxMs: number, doneOnStart: boolean, onDone: (ok: boolean) => void,
  ): (() => void) => {
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      live.delete(u);
      onDone(ok);
    };
    let timer = setTimeout(() => finish(false), maxMs);
    live.add(u);
    u.onstart = () => {
      unlocked = true;
      if (doneOnStart) { finish(true); return; }
      // A cold speech engine can take seconds to start; give the utterance its full time from
      // when it actually starts speaking so chants are not cut off on the first answers.
      if (!finished) { clearTimeout(timer); timer = setTimeout(() => finish(false), maxMs); }
    };
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    return () => finish(false);
  };

  const stopAll = () => {
    stopCurrent?.();
    stopCurrent = null;
    try { synth?.cancel(); } catch { /* ignore */ }
  };

  const sayAndWait = (text: string, maxMs: number): Promise<void> => {
    if (!synth || !on) return Promise.resolve();
    if (!voice) refresh();
    if (!voice) return Promise.resolve();
    stopAll();
    return new Promise<void>(resolve => {
      let u: SpeechSynthesisUtterance;
      try { u = make(text); } catch { resolve(); return; }
      const stop = watch(u, maxMs, false, () => {
        if (stopCurrent === stop) stopCurrent = null;
        resolve();
      });
      stopCurrent = stop;
      try { synth.speak(u); } catch { stop(); } // speech must never break the game
    });
  };

  return {
    unlock() {
      if (unlocked || !synth) return Promise.resolve(true);
      if (unlocking) return unlocking; // pointerup, touchend and click all fire for one tap
      if (!voice) refresh();
      let u: SpeechSynthesisUtterance;
      try {
        u = make(UNLOCK_TEXT);
        u.volume = 0;
      } catch {
        return Promise.resolve(true); // no utterance support: nothing to unlock
      }
      let settled = false;
      const attempt = new Promise<boolean>(resolve => {
        const stop = watch(u, UNLOCK_TIMEOUT_MS, true, ok => {
          settled = true;
          unlocking = null;
          resolve(ok);
        });
        // No cancel(): the unlock must not cut off a question that is already speaking.
        try { synth.speak(u); } catch { stop(); }
      });
      if (!settled) unlocking = attempt; // a synchronous failure must not be cached
      return attempt;
    },
    say(text) { void sayAndWait(text, SAY_HOLD_MS); },
    sayAndWait,
    cancel: stopAll,
    setEnabled(v) {
      on = v;
      if (!v) stopAll();
    },
  };
}
