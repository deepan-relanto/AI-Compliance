/**
 * Lightweight in-process TTL cache for API route handlers (per Node server instance).
 * Use for read-heavy admin endpoints; invalidate on writes that affect the payload.
 */

type CacheEntry<T> = { data: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export const CACHE_TTL = {
  batches: 60_000,
  analytics: 45_000,
  batchPerformance: 30_000,
  courseLibrary: 60_000,
} as const;

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Delete keys matching prefix, or clear entire cache when prefix omitted. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const data = await loader();
  setCached(key, data, ttlMs);
  return data;
}
