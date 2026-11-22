import { SAVE_KEY } from './save';

/** Several players on one device, each with a farm (a save) of their own. */
export const PROFILES_KEY = 'kuku-farm-profiles';
export const MAX_PROFILES = 4;
export const MAX_NAME = 6;
export const ICONS: readonly string[] = ['🐰', '🐻', '🐼', '🐱', '🐶', '🦊', '🐸', '🐯', '🐷', '🐮', '🐔', '🦄'];
/** Typed in full before a player's farm can be deleted (hard for a child, easy for a parent). */
export const DELETE_WORD = '確定刪除';

export interface Profile { id: string; name: string; icon: string }
/** `next`: the number of the next new id (`p<next>`), so a deleted player's id never comes back. */
export interface Profiles { list: Profile[]; last: string; next: number }

const ID = /^p([1-9]\d{0,3})$/;
const idNum = (id: string): number => Number(ID.exec(id)?.[1] ?? 0);

export function defaultProfiles(): Profiles {
  return { list: [{ id: 'p1', name: '我的農場', icon: '🐔' }], last: 'p1', next: 2 };
}

/** Player 1 keeps the save key the game always used, so its farm loads in older versions too. */
export function saveKeyOf(id: string): string {
  return id === 'p1' ? SAVE_KEY : `${SAVE_KEY}-${id}`;
}

/** Trimmed name of 1 … MAX_NAME characters (counted by code point, so an emoji is one), or null. */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  const n = Array.from(name).length;
  return n >= 1 && n <= MAX_NAME ? name : null;
}

function validProfile(v: unknown): v is Profile {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && ID.test(p.id)
    && typeof p.name === 'string' && cleanName(p.name) === p.name
    && typeof p.icon === 'string' && ICONS.includes(p.icon);
}

/** The stored player list; anything missing or unreadable gives just the first player. Never throws. */
export function loadProfiles(storage: Pick<Storage, 'getItem'>): Profiles {
  try {
    const raw = storage.getItem(PROFILES_KEY);
    if (raw === null) return defaultProfiles();
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof v !== 'object' || v === null || !Array.isArray(v.list)) return defaultProfiles();
    const list = v.list as unknown[];
    if (list.length < 1 || list.length > MAX_PROFILES || !list.every(validProfile)) return defaultProfiles();
    const ids = list.map(p => p.id);
    if (new Set(ids).size !== ids.length) return defaultProfiles();
    const clean = list.map(({ id, name, icon }) => ({ id, name, icon }));
    const last = typeof v.last === 'string' && ids.includes(v.last) ? v.last : ids[0];
    const least = Math.max(...ids.map(idNum)) + 1;
    const next = Number.isInteger(v.next) && (v.next as number) >= least ? (v.next as number) : least;
    return { list: clean, last, next };
  } catch {
    return defaultProfiles();
  }
}

export function storeProfiles(storage: Pick<Storage, 'setItem'>, p: Profiles): void {
  storage.setItem(PROFILES_KEY, JSON.stringify(p));
}

export function addProfile(p: Profiles, name: string, icon: string): { profiles: Profiles; id: string } | null {
  const n = cleanName(name);
  if (!n || !ICONS.includes(icon) || p.list.length >= MAX_PROFILES) return null;
  const id = `p${p.next}`;
  return { profiles: { ...p, list: [...p.list, { id, name: n, icon }], next: p.next + 1 }, id };
}

export function editProfile(p: Profiles, id: string, name: string, icon: string): Profiles | null {
  const n = cleanName(name);
  if (!n || !ICONS.includes(icon) || !p.list.some(x => x.id === id)) return null;
  return { ...p, list: p.list.map(x => (x.id === id ? { id, name: n, icon } : x)) };
}

/** Null for an unknown id or the last player (there is always at least one farm). */
export function removeProfile(p: Profiles, id: string): Profiles | null {
  if (p.list.length <= 1 || !p.list.some(x => x.id === id)) return null;
  const list = p.list.filter(x => x.id !== id);
  return { ...p, list, last: p.last === id ? list[0].id : p.last };
}

/** The first icon no player uses yet (for a new player), or the first icon when all are taken. */
export function freeIcon(p: Profiles): string {
  return ICONS.find(i => !p.list.some(x => x.icon === i)) ?? ICONS[0];
}

export function canDelete(typed: string): boolean {
  return typed.trim() === DELETE_WORD;
}
