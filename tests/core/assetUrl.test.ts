import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assetUrl } from '../../src/core/assetUrl';

const B = import.meta.env.BASE_URL;
const hashOf = (rel: string) =>
  createHash('sha256').update(readFileSync(`public/assets/${rel}`)).digest('hex').slice(0, 10);

describe('asset URLs carry a version, so new art shows up as soon as it is deployed', () => {
  it('adds a fingerprint of the file itself: a changed picture gets a new URL', () => {
    expect(assetUrl('decor/lpc.png')).toBe(`${B}assets/decor/lpc.png?v=${hashOf('decor/lpc.png')}`);
    expect(assetUrl('ranch/dog.png')).toBe(`${B}assets/ranch/dog.png?v=${hashOf('ranch/dog.png')}`);
  });

  it('different files get different fingerprints', () => {
    expect(assetUrl('decor/lpc.png').split('?v=')[1]).not.toBe(assetUrl('decor/made.png').split('?v=')[1]);
  });

  it('leaves an unknown file as a plain URL', () => {
    expect(assetUrl('nope/missing.png')).toBe(`${B}assets/nope/missing.png`);
  });
});

describe('every picture the game loads goes through assetUrl', () => {
  it('no source file builds an assets/ URL by hand', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('core/assetUrl.ts')) files.push(p);
      }
    };
    walk('src');
    const raw = files.filter(f => /BASE_URL\}assets\//.test(readFileSync(f, 'utf8')));
    expect(raw).toEqual([]);
  });
});
