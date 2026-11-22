import { describe, expect, it } from 'vitest';
import { backupKeyOf, readBackup, writeBackup } from '../../src/core/importBackup';
import { nameFromFile } from '../../src/core/profiles';

function mem() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

describe('nameFromFile', () => {
  it('reads the player name an export put in the file name', () => {
    expect(nameFromFile('kuku-farm-save-小華-20261122.json')).toBe('小華');
    expect(nameFromFile('kuku-farm-save-a-b-20261122.json')).toBe('a-b');
    expect(nameFromFile('kuku-farm-save-🐰小華-20261122.json')).toBe('🐰小華');
  });

  it('copes with the number a browser adds to a second download', () => {
    expect(nameFromFile('kuku-farm-save-小華-20261122 (1).json')).toBe('小華');
    expect(nameFromFile('kuku-farm-save-小華-20261122(2).json')).toBe('小華');
  });

  it('gives null when there is no usable name', () => {
    expect(nameFromFile('kuku-farm-save-20261122.json')).toBeNull();
    expect(nameFromFile('kuku-farm-save-超過六個字的名字-20261122.json')).toBeNull();
    expect(nameFromFile('my-farm.json')).toBeNull();
    expect(nameFromFile('')).toBeNull();
  });
});

describe('import backup', () => {
  it('sits next to the save', () => {
    expect(backupKeyOf('kuku-farm-save')).toBe('kuku-farm-save-backup');
    expect(backupKeyOf('kuku-farm-save-p2')).toBe('kuku-farm-save-p2-backup');
  });

  it('round-trips the farm text and which side of the import it is', () => {
    const s = mem();
    writeBackup(s, 'kuku-farm-save-p2', { kind: 'before', text: '{"v":5}' });
    expect(readBackup(s, 'kuku-farm-save-p2')).toEqual({ kind: 'before', text: '{"v":5}' });
    writeBackup(s, 'kuku-farm-save-p2', { kind: 'after', text: '{"v":6}' });
    expect(readBackup(s, 'kuku-farm-save-p2')).toEqual({ kind: 'after', text: '{"v":6}' });
    expect(readBackup(s, 'kuku-farm-save')).toBeNull();
  });

  it('gives null for anything unreadable, and never throws', () => {
    const s = mem();
    for (const raw of ['{bad', 'null', '[]', '{"kind":"x","text":"a"}', '{"kind":"before","text":3}', '{"kind":"before","text":""}']) {
      s.m.set('k-backup', raw);
      expect(readBackup(s, 'k')).toBeNull();
    }
    const broken = { getItem: () => { throw new Error('denied'); } };
    expect(readBackup(broken, 'k')).toBeNull();
  });
});
