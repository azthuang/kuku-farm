/**
 * The one farm an import replaced, kept so 「↩️ 復原」 can bring it back. Restoring swaps the two
 * farms (the imported one becomes the backup), so no tap in the settings ever loses a farm.
 * `kind`: 'before' holds the farm from before the import, 'after' the imported one.
 */
export interface ImportBackup { kind: 'before' | 'after'; text: string }

export function backupKeyOf(saveKey: string): string {
  return `${saveKey}-backup`;
}

/** The backup for this save, or null when there is none or it cannot be read. Never throws. */
export function readBackup(storage: Pick<Storage, 'getItem'>, saveKey: string): ImportBackup | null {
  try {
    const raw = storage.getItem(backupKeyOf(saveKey));
    if (raw === null) return null;
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof v !== 'object' || v === null) return null;
    if (v.kind !== 'before' && v.kind !== 'after') return null;
    if (typeof v.text !== 'string' || v.text === '') return null;
    return { kind: v.kind, text: v.text };
  } catch {
    return null;
  }
}

export function writeBackup(storage: Pick<Storage, 'setItem'>, saveKey: string, b: ImportBackup): void {
  storage.setItem(backupKeyOf(saveKey), JSON.stringify(b));
}
