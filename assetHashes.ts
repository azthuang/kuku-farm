import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A short content hash of every file under public/assets, keyed by its path inside assets/
 * (e.g. 'decor/lpc.png'). Built into the game so each picture's URL changes exactly when the
 * picture does, and a browser never keeps showing an old one after a deploy.
 */
export function assetHashes(root = 'public/assets'): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(root, p).split('\\').join('/')] = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 10);
    }
  };
  walk(root);
  return out;
}
