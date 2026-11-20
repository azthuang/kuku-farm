/** Each file under public/assets with a short hash of its contents (filled in by vite.config.ts). */
declare const __ASSET_HASHES__: Record<string, string>;

/**
 * The URL of a file under public/assets ('decor/lpc.png'), with its content hash attached, so
 * a picture that changed gets a new URL and is fetched fresh instead of coming from the cache.
 */
export function assetUrl(path: string): string {
  const v = __ASSET_HASHES__[path];
  const url = `${import.meta.env.BASE_URL}assets/${path}`;
  return v ? `${url}?v=${v}` : url;
}
