import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_PARAM, createUpdater, entryOf, updatedFrom } from '../../src/core/updater';

const PAGE = 'https://example.org/kuku-farm/';
const OLD_JS = 'https://example.org/kuku-farm/assets/index-OLD111.js';
const html = (js: string, css = 'index-CSS222') =>
  `<!doctype html><head><script type="module" crossorigin src="/kuku-farm/assets/${js}.js"></script>
  <link rel="stylesheet" crossorigin href="/kuku-farm/assets/${css}.css"></head>`;

type Reply = { ok: boolean; text?: string } | 'reject' | 'hang';

/** A fetch that answers by URL path (+ search) and logs every request. */
function fakeFetch(replies: (url: URL) => Reply) {
  const log: { url: string; cache?: RequestCache }[] = [];
  const f = (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    log.push({ url: url.href, cache: init?.cache });
    const r = replies(url);
    if (r === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
    if (r === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return Promise.resolve({ ok: r.ok, text: () => Promise.resolve(r.text ?? '') } as Response);
  };
  return { f, log };
}

function setup(replies: (url: URL) => Reply, opts: { online?: boolean; safe?: boolean; page?: string } = {}) {
  const { f, log } = fakeFetch(replies);
  let t = 1_000_000;
  const applied: string[] = [];
  const u = createUpdater({
    fetch: f,
    now: () => t,
    online: () => opts.online ?? true,
    isSafe: () => opts.safe ?? true,
    currentJs: OLD_JS,
    pageUrl: () => opts.page ?? PAGE,
    apply: url => applied.push(url),
  });
  return { u, log, applied, advance: (ms: number) => { t += ms; } };
}

const newVersion = (url: URL): Reply =>
  url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ? { ok: true } : { ok: true, text: html('index-NEW999') };

afterEach(() => vi.useRealTimers());

describe('entryOf', () => {
  it('finds the entry script and stylesheet of a built page, as full URLs', () => {
    expect(entryOf(html('index-AbC_12-x'), PAGE)).toEqual({
      js: 'https://example.org/kuku-farm/assets/index-AbC_12-x.js',
      css: 'https://example.org/kuku-farm/assets/index-CSS222.css',
    });
  });

  it('gives null for a page without a built entry (dev server, an error page)', () => {
    expect(entryOf('<script type="module" src="/kuku-farm/src/main.ts"></script>', PAGE)).toBeNull();
    expect(entryOf('<h1>404</h1>', PAGE)).toBeNull();
    expect(entryOf('', PAGE)).toBeNull();
  });

  it('works without a stylesheet', () => {
    expect(entryOf('<script type="module" src="/kuku-farm/assets/index-A1.js"></script>', PAGE))
      .toEqual({ js: 'https://example.org/kuku-farm/assets/index-A1.js', css: null });
  });
});

describe('updatedFrom', () => {
  it('reads and strips the update mark from the address', () => {
    expect(updatedFrom(`${PAGE}?${UPDATE_PARAM}=index-NEW999`)).toEqual({ updated: true, clean: PAGE });
    expect(updatedFrom(`${PAGE}?diag&${UPDATE_PARAM}=x#top`)).toEqual({ updated: true, clean: `${PAGE}?diag#top` });
    expect(updatedFrom(`${PAGE}?diag`)).toEqual({ updated: false, clean: `${PAGE}?diag` });
  });
});

describe('updater', () => {
  it('does nothing offline, without asking the network', async () => {
    const { u, log, applied } = setup(newVersion, { online: false });
    expect(await u.check()).toBe('skip');
    expect(log).toEqual([]);
    expect(applied).toEqual([]);
  });

  it('asks for the page past every cache, and stays put when the version is the same', async () => {
    const { u, log, applied } = setup(() => ({ ok: true, text: html('index-OLD111') }));
    expect(await u.check()).toBe('same');
    expect(log).toHaveLength(1);
    expect(log[0].cache).toBe('no-store');
    expect(new URL(log[0].url).pathname).toBe('/kuku-farm/');
    expect(applied).toEqual([]);
  });

  it('asks at most once a minute', async () => {
    const { u, log, advance } = setup(() => ({ ok: true, text: html('index-OLD111') }));
    await u.check();
    advance(59_000);
    expect(await u.check()).toBe('skip');
    advance(1_000);
    expect(await u.check()).toBe('same');
    expect(log).toHaveLength(2);
  });

  it('downloads the new version first, then reloads onto it', async () => {
    const { u, log, applied } = setup(newVersion);
    expect(await u.check()).toBe('applied');
    const target = `${PAGE}?${UPDATE_PARAM}=index-NEW999`;
    expect(applied).toEqual([target]);
    // the page at the exact address it reloads to, and its script and stylesheet
    expect(log.slice(1).map(l => l.url).sort()).toEqual([
      'https://example.org/kuku-farm/assets/index-CSS222.css',
      'https://example.org/kuku-farm/assets/index-NEW999.js',
      target,
    ].sort());
  });

  it('keeps the address’s own parameters', async () => {
    const { u, applied } = setup(newVersion, { page: `${PAGE}?diag` });
    await u.check();
    expect(applied).toEqual([`${PAGE}?diag&${UPDATE_PARAM}=index-NEW999`]);
  });

  it('waits when the game is busy (a round, a dialog)', async () => {
    const { u, log, applied } = setup(newVersion, { safe: false });
    expect(await u.check()).toBe('unsafe');
    expect(log).toHaveLength(1); // nothing big downloaded
    expect(applied).toEqual([]);
  });

  it('keeps playing when the network fails', async () => {
    const { u, applied } = setup(() => 'reject');
    expect(await u.check()).toBe('failed');
    expect(applied).toEqual([]);
  });

  it('does not reload when a download of the new version fails', async () => {
    for (const bad of ['.js', '.css', '?u=']) {
      const { u, applied } = setup(url =>
        (url.href.includes(bad) ? (bad === '.js' ? 'reject' : { ok: false }) : newVersion(url)));
      expect(await u.check()).toBe('failed');
      expect(applied).toEqual([]);
    }
  });

  it('does not reload for an error page', async () => {
    const { u, applied } = setup(() => ({ ok: false, text: '<h1>503</h1>' }));
    expect(await u.check()).toBe('failed');
    expect(applied).toEqual([]);
  });

  it('gives up on a network that does not answer', async () => {
    vi.useFakeTimers();
    const { u, applied } = setup(() => 'hang');
    const p = u.check();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBe('failed');
    expect(applied).toEqual([]);
  });

  it('one check at a time', async () => {
    vi.useFakeTimers();
    const { u } = setup(() => 'hang');
    const first = u.check();
    expect(await u.check()).toBe('skip');
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
  });

  it('checks again after the game became safe', async () => {
    let safe = false;
    const { f } = fakeFetch(newVersion);
    let t = 0;
    const applied: string[] = [];
    const u = createUpdater({
      fetch: f, now: () => t, online: () => true, isSafe: () => safe,
      currentJs: OLD_JS, pageUrl: () => PAGE, apply: url => applied.push(url),
    });
    expect(await u.check()).toBe('unsafe');
    safe = true;
    t += 60_000;
    expect(await u.check()).toBe('applied');
    expect(applied).toHaveLength(1);
  });
});
