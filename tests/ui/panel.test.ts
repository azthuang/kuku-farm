// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createPanel } from '../../src/ui/panel';

describe('panel feedback', () => {
  it('does not reveal the answer while counting, then shows it', () => {
    const root = document.createElement('div');
    const panel = createPanel(root);
    const q = { a: 2, b: 4, crop: 'wheat' as const };
    panel.showCounting(q);
    const fb = root.querySelector('.q-feedback')!;
    expect(fb.classList.contains('counting')).toBe(true);
    expect(fb.classList.contains('wrong')).toBe(false);
    expect(fb.textContent).not.toContain('8');
    expect(fb.textContent).not.toBe('');
    panel.showWrong(q, 8);
    expect(fb.textContent).toContain('2 × 4 = 8');
  });
});
