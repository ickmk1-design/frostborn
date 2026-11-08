import { Storage } from './services/storage';

const STORAGE_KEY = 'frostborn_progress';

interface Progress {
  unlocked: number[];
  completed: number[];
}

const UNLOCK_CHAIN: Record<number, number> = {
  1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8,
  8: 9, 9: 10, 10: 11, 11: 12, 12: 13, 13: 14, 14: 15,
};

let _cache: Progress = { unlocked: [1], completed: [] };
let _loaded = false;

export async function loadProgress(): Promise<Progress> {
  if (_loaded) return _cache;
  try {
    const raw = await Storage.get(STORAGE_KEY);
    if (raw) _cache = JSON.parse(raw) as Progress;
  } catch {}
  if (!_cache.unlocked.includes(1)) _cache.unlocked.push(1);
  _loaded = true;
  return _cache;
}

async function persist(): Promise<void> {
  await Storage.set(STORAGE_KEY, JSON.stringify(_cache));
}

// Sync accessors work after loadProgress() has been awaited at least once
export function getProgress(): Progress { return _cache; }
export function isUnlocked(levelNum: number): boolean { return _cache.unlocked.includes(levelNum); }
export function isCompleted(levelNum: number): boolean { return _cache.completed.includes(levelNum); }

export async function markComplete(levelNum: number): Promise<void> {
  if (!_cache.completed.includes(levelNum)) _cache.completed.push(levelNum);
  const next = UNLOCK_CHAIN[levelNum];
  if (next && !_cache.unlocked.includes(next)) _cache.unlocked.push(next);
  await persist();
}

export function levelNumToKey(n: number): string {
  return `level${String(n).padStart(2, '0')}`;
}
