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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      _cache = {
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [1],
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      };
    }
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

// Endless Winter unlocks after completing Level 15.
export function isEndlessUnlocked(): boolean {
  return Array.isArray(_cache.completed) && _cache.completed.includes(15);
}

// ── Local notification opt-in (no push server; local flag only) ─────────────
const NOTIFY_KEY = 'frostborn_notify_optin';
let _notifyOptIn = false;
let _notifyLoaded = false;

export async function loadNotifyOptIn(): Promise<boolean> {
  if (_notifyLoaded) return _notifyOptIn;
  try {
    const v = await Storage.get(NOTIFY_KEY);
    _notifyOptIn = v === '1';
  } catch {}
  _notifyLoaded = true;
  return _notifyOptIn;
}

export function isNotifyOptedIn(): boolean { return _notifyOptIn; }

export async function setNotifyOptIn(v: boolean): Promise<void> {
  _notifyOptIn = v;
  await Storage.set(NOTIFY_KEY, v ? '1' : '0');
}

// ── Endless best record ─────────────────────────────────────────────────────
export interface EndlessBest { seconds: number; wave: number; }
const BEST_KEY = 'frostborn_endless_best';
let _bestCache: EndlessBest = { seconds: 0, wave: 0 };
let _bestLoaded = false;

export async function loadEndlessBest(): Promise<EndlessBest> {
  if (_bestLoaded) return _bestCache;
  try {
    const raw = await Storage.get(BEST_KEY);
    if (raw) _bestCache = JSON.parse(raw) as EndlessBest;
  } catch {}
  _bestLoaded = true;
  return _bestCache;
}
export function getEndlessBest(): EndlessBest { return _bestCache; }
export async function saveEndlessBest(seconds: number, wave: number): Promise<void> {
  const existing = _bestCache;
  // Rank by wave first, then by time
  const better = wave > existing.wave || (wave === existing.wave && seconds > existing.seconds);
  if (better) {
    _bestCache = { seconds, wave };
    await Storage.set(BEST_KEY, JSON.stringify(_bestCache));
  }
}
