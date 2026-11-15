// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createNumpad } from '../../src/ui/numpad';

describe('numpad', () => {
  it('limits to 2 digits, locks after submit, ignores empty submit', () => {
    const root = document.createElement('div');
    const got: number[] = [];
    const pad = createNumpad(root, n => got.push(n));
    const press = (label: string) =>
      (root.querySelector(`[data-key="${label}"]`) as HTMLButtonElement).click();
    press('1'); press('2'); press('3');
    expect(pad.value()).toBe('12');
    press('back'); expect(pad.value()).toBe('1');
    press('ok'); press('ok');
    expect(got).toEqual([1]);
    press('5'); expect(pad.value()).toBe('1');
    pad.setLocked(false); pad.clear(); press('ok');
    expect(got).toEqual([1]);
  });
});
