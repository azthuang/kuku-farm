// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLayout } from '../../src/ui/layout';
import { createNewState } from '../../src/core/state';

function setup() {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  return { root, layout: createLayout(root, createNewState(0)) };
}

describe('layout player badge', () => {
  it('shows the player in the HUD and reports taps', () => {
    const { root, layout } = setup();
    const badge = root.querySelector<HTMLButtonElement>('.hud-player')!;
    expect(badge.hidden).toBe(true);
    let taps = 0;
    layout.onPlayerTap(() => { taps++; });
    layout.setPlayer({ name: '小明', icon: '🐰' });
    expect(badge.hidden).toBe(false);
    expect(badge.querySelector('.hud-player-icon')!.textContent).toBe('🐰');
    expect(badge.querySelector('.hud-player-name')!.textContent).toBe('小明');
    badge.click();
    expect(taps).toBe(1);
    layout.setPlayer(null);
    expect(badge.hidden).toBe(true);
  });

  it('has a players slot in the settings and can close them', () => {
    const { root, layout } = setup();
    expect(layout.players.classList.contains('set-players')).toBe(true);
    expect(root.querySelector('.settings-card')!.contains(layout.players)).toBe(true);
    root.querySelector<HTMLElement>('.hud-gear')!.click();
    expect(root.querySelector<HTMLElement>('.settings')!.hidden).toBe(false);
    layout.closeSettings();
    expect(root.querySelector<HTMLElement>('.settings')!.hidden).toBe(true);
  });
});

describe('layout import undo', () => {
  it('shows the undo button only when there is something to undo', () => {
    const { root, layout } = setup();
    const btn = root.querySelector<HTMLButtonElement>('.set-undo')!;
    expect(btn.hidden).toBe(true);
    let taps = 0;
    layout.onUndo(() => { taps++; });
    layout.setUndo('↩️ 復原匯入前的農場');
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toBe('↩️ 復原匯入前的農場');
    btn.click();
    expect(taps).toBe(1);
    layout.setUndo(null);
    expect(btn.hidden).toBe(true);
  });
});

describe('layout ranch holiday', () => {
  it('a settings switch shows whether the ranch is on holiday and reports changes', () => {
    const { root, layout } = setup();
    const box = root.querySelector<HTMLInputElement>('.set-holiday')!;
    expect(root.querySelector('.settings-card')!.contains(box)).toBe(true);
    expect(box.checked).toBe(false);
    const got: boolean[] = [];
    layout.onHolidayToggle(on => { got.push(on); });
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(got).toEqual([true]);
    const s = createNewState(0);
    s.ranch.paused = true;
    box.checked = false;
    layout.updateHud(s);
    expect(box.checked).toBe(true);
  });
});
