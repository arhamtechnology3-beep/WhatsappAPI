/**
 * Client-Side In-Memory Cache with Stale-While-Revalidate.
 * Eliminates loading delays & spinners when switching between dashboard screens.
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000; // 60 seconds

export function getCachedData<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function setCachedData<T>(key: string, data: T): void {
  if (data === undefined || data === null) return;
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function isCacheStale(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const entry = memoryCache.get(key);
  if (!entry) return true;
  return Date.now() - entry.timestamp > ttlMs;
}

export function clearCachedData(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}
