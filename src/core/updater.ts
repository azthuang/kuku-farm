/**
 * Moves an open game onto a new deploy. A tab left open for days keeps running the code it loaded,
 * so when the game comes back on screen this asks the site for its page (past every cache) and
 * compares the entry script's name, which changes with every build. If it differs, the new page,
 * script and stylesheet are downloaded first and only then does the game reload onto them: a
 * network that drops halfway leaves the old version playing instead of a browser error page.
 * Offline, or on any failure, nothing happens; the next return to the game tries again.
 */

/** The address mark of a reload onto a new version (removed again on load). */
export const UPDATE_PARAM = 'u';
/**
 * At most one question to the site per this many ms. Each asks at a fresh address, so no cache
 * answers it; the gap only keeps a child flipping between apps from asking again and again.
 */
export const CHECK_GAP_MS = 60_000;
/** The page is small: give up on it quickly. */
export const CHECK_TIMEOUT_MS = 5_000;
/** The new script is large (about 1.5 MB): give a slow connection longer. */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

export type CheckResult = 'skip' | 'same' | 'unsafe' | 'failed' | 'applied';

/** The built entry script and stylesheet a page loads, as full URLs; null when it has none. */
export function entryOf(html: string, pageUrl: string): { js: string; css: string | null } | null {
  const js = /<script\b[^>]*\bsrc="([^"]*\/assets\/index-[\w-]+\.js)"/.exec(html)?.[1];
  if (!js) return null;
  const css = /<link\b[^>]*\bhref="([^"]*\/assets\/index-[\w-]+\.css)"/.exec(html)?.[1];
  return { js: new URL(js, pageUrl).href, css: css ? new URL(css, pageUrl).href : null };
}

/** Whether this load was an update reload, and the address without its mark. */
export function updatedFrom(href: string): { updated: boolean; clean: string } {
  const url = new URL(href);
  const parts = url.search.replace(/^\?/, '').split('&').filter(p => p !== '');
  const kept = parts.filter(p => p.split('=')[0] !== UPDATE_PARAM);
  const search = kept.length ? `?${kept.join('&')}` : '';
  return { updated: kept.length !== parts.length, clean: `${url.origin}${url.pathname}${search}${url.hash}` };
}

/** The page address with the update mark for `id` added (its other parameters kept as written). */
function markedUrl(pageUrl: string, id: string): string {
  const url = new URL(updatedFrom(pageUrl).clean);
  const mark = `${UPDATE_PARAM}=${encodeURIComponent(id)}`;
  return `${url.origin}${url.pathname}${url.search ? `${url.search}&${mark}` : `?${mark}`}${url.hash}`;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface UpdaterOptions {
  fetch: Fetch;
  now: () => number;
  /** False when the device says it is offline. */
  online: () => boolean;
  /** No round, no animation, no open dialog: a reload now loses nothing. */
  isSafe: () => boolean;
  /** The entry script this page is running (full URL). */
  currentJs: string;
  pageUrl: () => string;
  /** Saves and moves to `url` (already downloaded into the browser cache). */
  apply: (url: string) => void;
}

export interface Updater {
  check(): Promise<CheckResult>;
}

/** Runs `work` with an abort signal that fires after `ms`. */
async function within<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await work(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function createUpdater(o: UpdaterOptions): Updater {
  let last = -Infinity;
  let running = false;

  async function check(): Promise<CheckResult> {
    if (running || !o.online() || o.now() - last < CHECK_GAP_MS) return 'skip';
    running = true;
    last = o.now();
    try {
      const page = o.pageUrl();
      // a fresh address so neither the browser nor the site's cache answers with an old page
      const probe = new URL('./', page);
      probe.search = `?check=${o.now()}`;
      const html = await within(CHECK_TIMEOUT_MS, async signal => {
        const res = await o.fetch(probe.href, { cache: 'no-store', signal });
        return res.ok ? res.text() : null;
      });
      const entry = html === null ? null : entryOf(html, page);
      if (!entry) return 'failed';
      if (entry.js === o.currentJs) return 'same';
      if (!o.isSafe()) return 'unsafe';

      const id = entry.js.slice(entry.js.lastIndexOf('/') + 1).replace(/\.js$/, '');
      const target = markedUrl(page, id);
      const urls = [target, entry.js, ...(entry.css ? [entry.css] : [])];
      const ok = await within(DOWNLOAD_TIMEOUT_MS, signal => Promise.all(urls.map(async u => {
        const res = await o.fetch(u, { signal });
        if (!res.ok) return false;
        await res.text(); // read it all, so the whole file is in the cache
        return true;
      })));
      if (!ok.every(Boolean)) return 'failed';
      if (!o.isSafe()) return 'unsafe'; // a round may have started while downloading
      o.apply(target);
      return 'applied';
    } catch {
      return 'failed';
    } finally {
      running = false;
    }
  }

  return { check };
}
