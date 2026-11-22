import { describe, expect, it } from 'vitest';
import { voiceReport } from '../../src/ui/audioDiag';

describe('voiceReport', () => {
  it('counts every voice and lists only the Chinese ones, marking the one the game picks', () => {
    const r = voiceReport([
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'zh-HK', name: 'Sinji' },
      { lang: 'zh-TW', name: 'Meijia' },
      { lang: 'cmn-Hant-TW', name: 'Google 國語' },
    ]);
    expect(r.total).toBe(4);
    expect(r.lines).toEqual(['zh-HK Sinji', '★ zh-TW Meijia', 'cmn-Hant-TW Google 國語']);
  });

  it('says so when there are no voices at all', () => {
    expect(voiceReport([])).toEqual({ total: 0, lines: [] });
  });
});
