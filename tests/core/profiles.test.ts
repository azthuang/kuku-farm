import { describe, expect, it } from 'vitest';
import {
  ICONS, MAX_PROFILES, PROFILES_KEY, addProfile, canDelete, cleanName, defaultProfiles, editProfile, freeIcon,
  loadProfiles, removeProfile, saveKeyOf, storeProfiles, type Profiles,
} from '../../src/core/profiles';

function mem(raw: string | null) {
  const m = new Map<string, string>();
  if (raw !== null) m.set(PROFILES_KEY, raw);
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const two = (): Profiles => addProfile(defaultProfiles(), '小華', '🐻')!.profiles;

describe('profiles', () => {
  it('starts with the first player on the old save', () => {
    expect(defaultProfiles()).toEqual({ list: [{ id: 'p1', name: '我的農場', icon: '🐔' }], last: 'p1', next: 2 });
    expect(ICONS).toEqual(['🐰', '🐻', '🐼', '🐱', '🐶', '🦊', '🐸', '🐯', '🐷', '🐮', '🐔', '🦄']);
    expect(MAX_PROFILES).toBe(4);
  });

  it('falls back to the first player when the list is missing or broken', () => {
    const bad = [
      null, '{bad', 'null', '[]', '{"list":[],"last":"p1"}',
      '{"list":[{"id":"p1","name":"","icon":"🐔"}],"last":"p1"}',
      '{"list":[{"id":"x","name":"a","icon":"🐔"}],"last":"x"}',
      '{"list":[{"id":"p1","name":"a","icon":"🍎"}],"last":"p1"}',
      '{"list":[{"id":"p1","name":"一二三四五六七","icon":"🐔"}],"last":"p1"}',
    ];
    for (const raw of bad) expect(loadProfiles(mem(raw)), String(raw)).toEqual(defaultProfiles());
    const throwing = { getItem: () => { throw new Error('x'); } };
    expect(loadProfiles(throwing)).toEqual(defaultProfiles());
  });

  it('reads a valid list back and points last at an existing player', () => {
    const p = { list: [{ id: 'p1', name: '小明', icon: '🐰' }, { id: 'p3', name: '小華', icon: '🐻' }], last: 'p3', next: 4 };
    const m = mem(null);
    storeProfiles(m, p);
    expect(loadProfiles(m)).toEqual(p);
    expect(loadProfiles(mem(JSON.stringify({ ...p, last: 'p9' }))).last).toBe('p1');
  });

  it('recomputes a missing or too small next id instead of dropping the list', () => {
    const list = [{ id: 'p1', name: '小明', icon: '🐰' }, { id: 'p3', name: '小華', icon: '🐻' }];
    expect(loadProfiles(mem(JSON.stringify({ list, last: 'p1' }))).next).toBe(4);
    expect(loadProfiles(mem(JSON.stringify({ list, last: 'p1', next: 2 }))).next).toBe(4);
    expect(loadProfiles(mem(JSON.stringify({ list, last: 'p1', next: 9 }))).next).toBe(9);
  });

  it('rejects duplicate ids and more than four players', () => {
    const a = { id: 'p1', name: 'a', icon: '🐰' };
    expect(loadProfiles(mem(JSON.stringify({ list: [a, a], last: 'p1' })))).toEqual(defaultProfiles());
    const five = [1, 2, 3, 4, 5].map(n => ({ id: `p${n}`, name: `${n}`, icon: '🐰' }));
    expect(loadProfiles(mem(JSON.stringify({ list: five, last: 'p1' })))).toEqual(defaultProfiles());
  });

  it('maps player 1 to the old save key', () => {
    expect(saveKeyOf('p1')).toBe('kuku-farm-save');
    expect(saveKeyOf('p2')).toBe('kuku-farm-save-p2');
  });

  it('cleanName trims and allows 1 to 6 characters', () => {
    expect(cleanName('  小明 ')).toBe('小明');
    expect(cleanName('一二三四五六')).toBe('一二三四五六');
    expect(cleanName('一二三四五六七')).toBeNull();
    expect(cleanName('🐰🐰🐰🐰🐰🐰')).toBe('🐰🐰🐰🐰🐰🐰');
    expect(cleanName('   ')).toBeNull();
  });

  it('adds up to four players with fresh ids', () => {
    let p = defaultProfiles();
    const r = addProfile(p, ' 小華 ', '🐻')!;
    expect(r.id).toBe('p2');
    expect(r.profiles.list[1]).toEqual({ id: 'p2', name: '小華', icon: '🐻' });
    p = r.profiles;
    p = addProfile(p, '三', '🐼')!.profiles;
    p = addProfile(p, '四', '🐱')!.profiles;
    expect(p.list).toHaveLength(4);
    expect(addProfile(p, '五', '🐶')).toBeNull();
    expect(addProfile(defaultProfiles(), ' ', '🐶')).toBeNull();
    expect(addProfile(defaultProfiles(), '五', '🍎')).toBeNull();
  });

  it('never reuses the id of a deleted player', () => {
    let p = two();
    p = addProfile(p, '三', '🐼')!.profiles;
    p = removeProfile(p, 'p2')!;
    expect(addProfile(p, '四', '🐱')!.id).toBe('p4');
  });

  it('edits a name and icon', () => {
    const p = editProfile(two(), 'p2', ' 阿華 ', '🦄')!;
    expect(p.list[1]).toEqual({ id: 'p2', name: '阿華', icon: '🦄' });
    expect(editProfile(two(), 'p2', '', '🦄')).toBeNull();
    expect(editProfile(two(), 'p9', '阿華', '🦄')).toBeNull();
  });

  it('removes a player but never the last one', () => {
    const one = removeProfile({ ...two(), last: 'p2' }, 'p2')!;
    expect(one.list.map(x => x.id)).toEqual(['p1']);
    expect(one.last).toBe('p1');
    expect(removeProfile(one, 'p1')).toBeNull();
    expect(removeProfile(two(), 'p9')).toBeNull();
  });

  it('picks the first icon nobody uses', () => {
    expect(freeIcon(defaultProfiles())).toBe('🐰');
    expect(freeIcon(addProfile(defaultProfiles(), 'a', '🐰')!.profiles)).toBe('🐻');
  });

  it('canDelete wants exactly 確定刪除', () => {
    expect(canDelete('確定刪除')).toBe(true);
    expect(canDelete(' 確定刪除 ')).toBe(true);
    expect(canDelete('確定')).toBe(false);
    expect(canDelete('刪除')).toBe(false);
    expect(canDelete('')).toBe(false);
  });
});
