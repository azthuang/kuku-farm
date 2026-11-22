/**
 * One game per device at a time: the tab opened last owns the saves. Each tab writes its own
 * value under TAB_KEY when it opens; a tab that sees another value has lost the game and must stop
 * saving, so two tabs never overwrite each other's progress.
 */
export const TAB_KEY = 'kuku-farm-tab';

export interface TabLock {
  /** True while no other tab has opened the game since this one (or storage cannot be read). */
  owns(): boolean;
  /** owns(), and reports the loss (once) when another tab has taken over. */
  check(): boolean;
  stop(): void;
}

export function createTabLock(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  onLost: () => void,
): TabLock {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let claimed = false;
  try {
    storage.setItem(TAB_KEY, id);
    claimed = true;
  } catch { /* no storage: nothing is saved either, so there is nothing to protect */ }
  let lost = false;

  function owns(): boolean {
    if (!claimed) return true;
    try {
      const v = storage.getItem(TAB_KEY);
      return v === null || v === id; // cleared storage: nobody else has claimed it
    } catch {
      return true;
    }
  }

  function check(): boolean {
    if (owns()) return true;
    if (!lost) {
      lost = true;
      onLost();
    }
    return false;
  }

  const onStorage = (e: Event): void => {
    const { key, newValue } = e as StorageEvent;
    if (key === TAB_KEY && newValue !== null && newValue !== id) check();
  };
  // Background tabs (iPad Safari) may miss the storage event: look again when shown.
  const onShow = (): void => { check(); };
  win.addEventListener('storage', onStorage);
  win.addEventListener('pageshow', onShow);
  doc.addEventListener('visibilitychange', onShow);

  return {
    owns,
    check,
    stop() {
      win.removeEventListener('storage', onStorage);
      win.removeEventListener('pageshow', onShow);
      doc.removeEventListener('visibilitychange', onShow);
    },
  };
}
