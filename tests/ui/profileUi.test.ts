// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createProfileUi } from '../../src/ui/profileUi';
import { addProfile, defaultProfiles, type Profiles } from '../../src/core/profiles';

function setup() {
  document.body.innerHTML = '<div id="root"></div><div id="slot"></div>';
  const root = document.getElementById('root')!;
  const slot = document.getElementById('slot')!;
  const ui = createProfileUi(root, slot);
  const log: unknown[][] = [];
  ui.onPick(id => log.push(['pick', id]));
  ui.onResume(() => log.push(['resume']));
  ui.onCreate((name, icon) => log.push(['create', name, icon]));
  ui.onEdit((id, name, icon) => log.push(['edit', id, name, icon]));
  ui.onDelete(id => log.push(['delete', id]));
  return { root, slot, ui, log };
}

const named = (): Profiles => {
  const p = addProfile(defaultProfiles(), '小華', '🐻')!.profiles;
  return { ...p, list: [{ ...p.list[0], name: '小明', icon: '🐰' }, p.list[1]] };
};
const four = (): Profiles => {
  let p = named();
  p = addProfile(p, '三', '🐼')!.profiles;
  return addProfile(p, '四', '🐱')!.profiles;
};
const q = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const type = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input')); };
const visible = (sel: string) => { const el = q(sel); return !!el && !el.hidden; };

describe('profile picker', () => {
  it('shows a card per player, ➕ below four, ↩️ only when resuming', () => {
    const { ui } = setup();
    ui.showPicker(named(), false);
    expect(visible('.pf-picker')).toBe(true);
    expect(q('.pf-picker h2')!.textContent).toBe('誰要玩？');
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.pf-card:not(.pf-add)'));
    expect(cards.map(c => c.textContent)).toEqual(['🐰小明', '🐻小華']);
    expect(q('.pf-add')!.textContent).toBe('➕ 新增');
    expect(q('.pf-resume')).toBeNull();
    ui.showPicker(four(), true);
    expect(document.querySelectorAll('.pf-card')).toHaveLength(4);
    expect(q('.pf-add')).toBeNull();
    expect(q('.pf-resume')!.textContent).toBe('↩️ 回去繼續玩');
    expect(ui.pickerOpen()).toBe(true);
  });

  it('tapping a card picks that player', () => {
    const { ui, log } = setup();
    ui.showPicker(named(), false);
    document.querySelectorAll<HTMLElement>('.pf-card')[1].click();
    expect(log).toEqual([['pick', 'p2']]);
    ui.hidePicker();
    expect(ui.pickerOpen()).toBe(false);
  });

  it('↩️ resumes and closes', () => {
    const { ui, log } = setup();
    ui.showPicker(named(), true);
    q('.pf-resume')!.click();
    expect(log).toEqual([['resume']]);
    expect(ui.pickerOpen()).toBe(false);
  });
});

describe('profile editor', () => {
  it('➕ opens 新增玩家 with a free icon; 好了 waits for a valid name', () => {
    const { ui, log } = setup();
    ui.showPicker(named(), false);
    q('.pf-add')!.click();
    expect(visible('.pf-editor')).toBe(true);
    expect(q('.pf-editor h2')!.textContent).toBe('新增玩家');
    expect(document.querySelectorAll('.pf-icon')).toHaveLength(12);
    expect(q('.pf-icon.chosen')!.textContent).toBe('🐼');
    const ok = q<HTMLButtonElement>('.pf-ok')!;
    expect(ok.textContent).toBe('✔ 好了');
    expect(ok.disabled).toBe(true);
    const name = q<HTMLInputElement>('.pf-name')!;
    type(name, '一二三四五六七');
    expect(ok.disabled).toBe(true);
    type(name, ' 小美 ');
    expect(ok.disabled).toBe(false);
    document.querySelectorAll<HTMLElement>('.pf-icon')[11].click();
    expect(q('.pf-icon.chosen')!.textContent).toBe('🦄');
    ok.click();
    expect(log).toEqual([['create', '小美', '🦄']]);
    expect(visible('.pf-editor')).toBe(false);
  });

  it('取消 closes the editor without reporting', () => {
    const { ui, log } = setup();
    ui.showPicker(named(), false);
    q('.pf-add')!.click();
    q('.pf-cancel')!.click();
    expect(visible('.pf-editor')).toBe(false);
    expect(log).toEqual([]);
  });

  it('✏️ in settings opens 編輯玩家 filled in and reports onEdit', () => {
    const { ui, log, slot } = setup();
    ui.renderManage(named());
    expect(slot.querySelector('h3')!.textContent).toBe('👥 玩家');
    slot.querySelectorAll<HTMLElement>('.pf-edit')[1].click();
    expect(q('.pf-editor h2')!.textContent).toBe('編輯玩家');
    expect(q<HTMLInputElement>('.pf-name')!.value).toBe('小華');
    expect(q('.pf-icon.chosen')!.textContent).toBe('🐻');
    type(q<HTMLInputElement>('.pf-name')!, '阿華');
    q('.pf-ok')!.click();
    expect(log).toEqual([['edit', 'p2', '阿華', '🐻']]);
  });
});

describe('profile delete', () => {
  it('🗑️ appears only with two or more players', () => {
    const { ui, slot } = setup();
    ui.renderManage(defaultProfiles());
    expect(slot.querySelectorAll('.pf-row')).toHaveLength(1);
    expect(slot.querySelectorAll('.pf-del')).toHaveLength(0);
    ui.renderManage(named());
    expect(slot.querySelectorAll('.pf-del')).toHaveLength(2);
  });

  it('names the farm and deletes only after 確定刪除 is typed', () => {
    const { ui, log, slot } = setup();
    ui.renderManage(named());
    slot.querySelectorAll<HTMLElement>('.pf-del')[0].click();
    expect(visible('.pf-delete')).toBe(true);
    const text = q('.pf-delete')!.textContent!;
    expect(text).toContain('刪除小明的農場？刪了就找不回來');
    expect(text).toContain('建議先 💾 匯出存檔');
    const input = q<HTMLInputElement>('.pf-del-input')!;
    expect(input.placeholder).toBe('請輸入「確定刪除」');
    const ok = q<HTMLButtonElement>('.pf-del-ok')!;
    expect(ok.textContent).toBe('🗑️ 刪除');
    expect(ok.disabled).toBe(true);
    type(input, '確定');
    expect(ok.disabled).toBe(true);
    type(input, '確定刪除');
    expect(ok.disabled).toBe(false);
    ok.click();
    expect(log).toEqual([['delete', 'p1']]);
    expect(visible('.pf-delete')).toBe(false);
  });

  it('取消 closes the delete dialog and clears what was typed', () => {
    const { ui, log, slot } = setup();
    ui.renderManage(named());
    slot.querySelectorAll<HTMLElement>('.pf-del')[1].click();
    type(q<HTMLInputElement>('.pf-del-input')!, '確定刪除');
    q('.pf-del-cancel')!.click();
    expect(visible('.pf-delete')).toBe(false);
    expect(log).toEqual([]);
    slot.querySelectorAll<HTMLElement>('.pf-del')[1].click();
    expect(q<HTMLInputElement>('.pf-del-input')!.value).toBe('');
    expect(q<HTMLButtonElement>('.pf-del-ok')!.disabled).toBe(true);
  });
});
