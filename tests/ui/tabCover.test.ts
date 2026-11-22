// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { showTabCover } from '../../src/ui/tabCover';

describe('tab cover', () => {
  it('covers the game and offers to play here', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app')!;
    let resumed = 0;
    showTabCover(root, () => { resumed++; });
    showTabCover(root, () => { resumed++; }); // shown once only
    const covers = root.querySelectorAll<HTMLElement>('.tab-cover');
    expect(covers).toHaveLength(1);
    expect(covers[0].textContent).toContain('遊戲在另一個分頁打開了');
    const btn = covers[0].querySelector<HTMLButtonElement>('.tab-cover-btn')!;
    expect(btn.textContent).toBe('在這裡繼續玩');
    btn.click();
    expect(resumed).toBe(1);
  });
});
