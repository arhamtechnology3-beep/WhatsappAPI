/**
 * Client-Side In-Memory Cache with Stale-While-Revalidate.
 * Eliminates loading delays & spinners when switching between dashboard screens.
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30_000; // 30 seconds TTL

export function getCachedData<T>(key: string | null | undefined): T | null {
  if (!key) return null;
  const entry = memoryCache.get(key);
  if (!entry) return null;

  // Auto-expire entries older than TTL
  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }

  // Never return an empty cache object for contacts or lists
  if (typeof entry.data === 'object' && entry.data !== null) {
    if (Array.isArray(entry.data) && entry.data.length === 0) {
      return null;
    }
    const obj = entry.data as any;
    if (Array.isArray(obj.contacts) && obj.contacts.length === 0) {
      return null;
    }
  }

  return entry.data as T;
}

export function setCachedData<T>(key: string | null | undefined, data: T): void {
  if (!key || data === undefined || data === null) return;

  // Do not store empty list results as sticky cache
  if (Array.isArray(data) && data.length === 0) return;
  if (typeof data === 'object' && data !== null) {
    const obj = data as any;
    if (Array.isArray(obj.contacts) && obj.contacts.length === 0) return;
  }

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
