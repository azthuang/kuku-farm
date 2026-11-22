import { pickVoice } from './speech';

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'name'>;

/** The voice count, and the Chinese voices (zh / cmn / yue) as "lang name", ★ on the one the game picks. */
export function voiceReport(voices: VoiceLike[]): { total: number; lines: string[] } {
  const picked = pickVoice(voices);
  const lines: string[] = [];
  voices.forEach((v, i) => {
    if (!/^(zh|cmn|yue)([-_]|$)/i.test(v.lang)) return;
    lines.push(`${i === picked ? '★ ' : ''}${v.lang} ${v.name}`);
  });
  return { total: voices.length, lines };
}

/**
 * A sound check for one device, opened with ?diag in the address: what voices the browser has,
 * which one the game would use, and test buttons for speech and for a sound effect, each logging
 * what the browser reports (start / end / error code, audio context state).
 */
export function showAudioDiag(): void {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:8px;z-index:9999;overflow:auto;background:#fff;color:#222;'
    + 'border:2px solid #333;border-radius:8px;padding:12px;font:14px/1.5 sans-serif;white-space:pre-wrap;word-break:break-all';
  const info = document.createElement('div');
  const log = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:10px 0';
  box.append(info, row, log);
  document.body.append(box);

  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  let ctx: AudioContext | null = null;
  const live = new Set<SpeechSynthesisUtterance>(); // keep utterances alive until they finish

  const add = (msg: string): void => {
    const t = new Date().toLocaleTimeString();
    log.textContent = `${t} ${msg}\n${log.textContent ?? ''}`;
  };

  // Log every speak / cancel the game itself makes, with what the browser then reports.
  if (synth) {
    const s = synth;
    const speak0 = s.speak.bind(s);
    const cancel0 = s.cancel.bind(s);
    let n = 0;
    s.speak = (u: SpeechSynthesisUtterance) => {
      const id = ++n;
      const what = `#${id}「${u.text.slice(0, 12)}」${u.volume === 0 ? '(無聲)' : ''}`;
      add(`→ speak ${what}${s.speaking ? '，正在講' : ''}${s.pending ? '，有排隊' : ''}`);
      u.addEventListener('start', () => add(`  ${what} 開始`));
      u.addEventListener('end', () => add(`  ${what} 結束`));
      u.addEventListener('error', e => add(`  ${what} 錯誤 ${(e as SpeechSynthesisErrorEvent).error}`));
      speak0(u);
    };
    s.cancel = () => {
      add(`→ cancel${s.speaking ? '（正在講）' : ''}${s.pending ? '（有排隊）' : ''}`);
      cancel0();
    };
  }

  const render = (): void => {
    let voices: SpeechSynthesisVoice[] = [];
    try { voices = synth ? synth.getVoices() : []; } catch { /* ignore */ }
    const r = voiceReport(voices);
    info.textContent = [
      '🔧 聲音檢查（截圖給爸媽 / 開發者）',
      `瀏覽器：${navigator.userAgent}`,
      `語音引擎：${synth ? '有' : '沒有'}`,
      `聲音總數：${r.total}，中文聲音：${r.lines.length}`,
      ...r.lines.map(l => `  ${l}`),
      `遊戲會用的聲音：${pickVoice(voices) >= 0 ? '有（★）' : '沒有 → 遊戲不會唸'}`,
      `音效引擎：${Ctor ? '有' : '沒有'}，狀態：${ctx ? ctx.state : '尚未建立'}`,
      `audioSession：${nav.audioSession ? nav.audioSession.type : '不支援'}`,
    ].join('\n');
  };

  const speak = (useVoice: boolean): void => {
    if (!synth) { add('沒有語音引擎'); return; }
    const voices = synth.getVoices();
    const i = pickVoice(voices);
    const u = new SpeechSynthesisUtterance('三乘七等於二十一');
    if (useVoice && i >= 0) { u.voice = voices[i]; u.lang = voices[i].lang; } else { u.lang = 'zh-TW'; }
    u.rate = 0.9;
    const tag = useVoice ? (i >= 0 ? `用 ${voices[i].lang} ${voices[i].name}` : '沒有可選的聲音，改用 zh-TW') : '只指定 zh-TW';
    live.add(u);
    u.onstart = () => add(`語音開始（${tag}）`);
    u.onend = () => { live.delete(u); add('語音結束'); };
    u.onerror = e => { live.delete(u); add(`語音錯誤：${(e as SpeechSynthesisErrorEvent).error}（${tag}）`); };
    add(`送出語音（${tag}）`);
    try { synth.cancel(); synth.speak(u); } catch (err) { add(`語音丟出例外：${String(err)}`); }
    window.setTimeout(() => {
      if (live.has(u)) add(`3 秒內沒有開始也沒有錯誤（speaking=${synth.speaking}, pending=${synth.pending}）`);
    }, 3000);
  };

  const beep = (): void => {
    if (!Ctor) { add('沒有音效引擎'); return; }
    try {
      if (!ctx) ctx = new Ctor();
      add(`音效：狀態 ${ctx.state}`);
      void ctx.resume().then(() => { add(`音效：resume 後狀態 ${ctx?.state}`); render(); }, err => add(`音效：resume 失敗 ${String(err)}`));
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(660, t);
      g.gain.setValueAtTime(0.2, t);
      g.gain.linearRampToValueAtTime(0, t + 0.4);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.42);
      add('音效：已播放「嗶」');
    } catch (err) { add(`音效丟出例外：${String(err)}`); }
    render();
  };

  const button = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'font-size:16px;padding:8px 12px';
    b.addEventListener('click', fn);
    row.append(b);
  };
  button('🗣️ 測試語音（遊戲的聲音）', () => speak(true));
  button('🗣️ 測試語音（只指定 zh-TW）', () => speak(false));
  button('🔈 測試音效', beep);
  button('🔄 重新整理', render);
  let small = false;
  button('↕️ 縮小／放大', () => {
    small = !small;
    info.hidden = small;
    box.style.inset = small ? 'auto 8px 8px 8px' : '8px';
    box.style.maxHeight = small ? '30vh' : '';
    box.style.opacity = small ? '0.92' : '1';
  });
  button('✖️ 關閉', () => box.remove());

  try { synth?.addEventListener?.('voiceschanged', render); } catch { /* ignore */ }
  render();
}
