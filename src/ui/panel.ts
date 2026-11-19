import { X_ICON } from './icons';
import type { Mode } from '../core/mastery';
import type { Question } from '../core/game';
import { createNumpad, type Numpad } from './numpad';

export interface Panel {
  showIdle(mode: Mode, hint: string): void;
  showQuestion(q: Question, progress: { done: number; total: number }): void;
  /** Neutral overlay while the field counts the rows: hides the numpad, does not reveal the answer. */
  showCounting(q: Question): void;
  showWrong(q: Question, answer: number): void;
  showCorrect(q: Question, answer: number): void;
  onModeChange(cb: (m: Mode) => void): void;
  onStartChallenge(cb: () => void): void;
  onExit(cb: () => void): void;
  onSubmit(cb: (n: number) => void): void; // numpad ✔ (extra to brief: needed to route answers)
  numpad: Numpad;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createPanel(root: HTMLElement): Panel {
  let modeCb: (m: Mode) => void = () => {};
  let startCb: () => void = () => {};
  let exitCb: () => void = () => {};
  let submitCb: (n: number) => void = () => {};
  const idle = el('div', 'panel-idle');
  const question = el('div', 'panel-question');
  root.append(idle, question);

  const exitBtn = el('button', 'exit-btn', '');
  exitBtn.type = 'button';
  exitBtn.innerHTML = X_ICON;
  exitBtn.setAttribute('aria-label', '離開');
  exitBtn.addEventListener('click', () => exitCb());
  const qText = el('div', 'q-text');
  const progress = el('div', 'q-progress');
  const head = el('div', 'q-head');
  head.append(qText, progress, exitBtn);
  const feedback = el('div', 'q-feedback');
  const numpadHost = el('div', 'q-numpad');
  question.append(head, feedback, numpadHost);
  const numpad = createNumpad(numpadHost, n => submitCb(n));

  const setView = (v: 'idle' | 'question') => {
    root.classList.toggle('is-idle', v === 'idle');
    root.classList.toggle('is-question', v === 'question');
  };
  const setHead = (q: Question) => { qText.textContent = `${q.a} × ${q.b} = ?`; };

  return {
    numpad,
    showIdle(mode, hint) {
      setView('idle');
      idle.replaceChildren();
      const toggle = el('div', 'mode-toggle');
      for (const [m, label] of [['basic', '基礎'], ['challenge', '挑戰']] as const) {
        const b = el('button', 'mode-btn' + (m === mode ? ' active' : ''), label);
        b.type = 'button';
        b.dataset.mode = m;
        b.addEventListener('click', () => modeCb(m));
        toggle.appendChild(b);
      }
      idle.appendChild(toggle);
      if (mode === 'challenge') {
        const s = el('button', 'start-btn', '開始挑戰');
        s.type = 'button';
        s.addEventListener('click', () => startCb());
        idle.appendChild(s);
      }
      idle.appendChild(el('div', 'hint', hint));
    },
    showQuestion(q, p) {
      setView('question');
      setHead(q);
      progress.textContent = p.total > 0 ? `${p.done} / ${p.total}` : '';
      feedback.replaceChildren();
      feedback.className = 'q-feedback';
      numpad.clear();
      numpad.setLocked(false);
    },
    showCounting(q) {
      setView('question');
      setHead(q);
      numpad.setLocked(true);
      feedback.replaceChildren();
      feedback.className = 'q-feedback counting';
      feedback.appendChild(el('div', 'ans', '一起數數看 👀'));
    },
    showWrong(q, answer) {
      setView('question');
      setHead(q);
      feedback.replaceChildren();
      feedback.className = 'q-feedback wrong';
      // The field counts the rows; the panel only shows the answer.
      feedback.appendChild(el('div', 'ans', `${q.a} × ${q.b} = ${answer}`));
    },
    showCorrect(q, answer) {
      setView('question');
      setHead(q);
      feedback.replaceChildren();
      feedback.className = 'q-feedback correct';
      feedback.appendChild(el('div', 'ans', `🎉 ${q.a} × ${q.b} = ${answer}`));
    },
    onModeChange(cb) { modeCb = cb; },
    onStartChallenge(cb) { startCb = cb; },
    onExit(cb) { exitCb = cb; },
    onSubmit(cb) { submitCb = cb; },
  };
}
