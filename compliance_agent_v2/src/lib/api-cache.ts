/**
 * Lightweight in-memory server-side cache for expensive API routes.
 * Works in both dev and production Next.js (server components run in Node).
 * Cache lives in the Node process; it is invalidated on writes/mutations.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __apiCache: Map<string, CacheEntry<unknown>> | undefined;
}

function getStore(): Map<string, CacheEntry<unknown>> {
  if (!globalThis.__apiCache) {
    globalThis.__apiCache = new Map();
  }
  return globalThis.__apiCache;
}

/** Read a cached value; returns undefined if missing or expired. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = getStore().get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    getStore().delete(key);
    return undefined;
  }
  return entry.data;
}

/** Write a value to cache with a TTL in seconds (default 45s). */
export function cacheSet<T>(key: string, data: T, ttlSeconds = 45): void {
  getStore().set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Invalidate one or more cache keys (supports glob-style prefix with '*'). */
export function cacheInvalidate(...keys: string[]): void {
  const store = getStore();
  for (const key of keys) {
    if (key.endsWith("*")) {
      const prefix = key.slice(0, -1);
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    } else {
      store.delete(key);
    }
  }
}

/** Course-era helper: invalidate by prefix or clear all. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    getStore().clear();
    return;
  }
  cacheInvalidate(prefix.endsWith("*") ? prefix : `${prefix}*`);
}

/** TTL values in milliseconds (used by cachedFetch). */
export const CACHE_TTL = {
  batches: 60_000,
  analytics: 45_000,
  batchPerformance: 30_000,
  courseLibrary: 60_000,
} as const;

/** Fetch-through cache used by content library routes. */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const data = await loader();
  getStore().set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ── Well-known cache keys ─────────────────────────────────────────────────────
export const CACHE_KEYS = {
  analytics: "analytics:main",
  batches: "batches:list",
  monitoringViolations: (
    page: number,
    statusFilter: string,
    moduleId: string,
    sort: string,
  ) => `monitoring:violations:${page}:${statusFilter}:${moduleId}:${sort}`,
  monitoringReviews: (page: number, statusFilter: string) =>
    `monitoring:reviews:${page}:${statusFilter}`,
  monitoringAudit: (page: number, actionFilter: string) =>
    `monitoring:audit:${page}:${actionFilter}`,
  monitoringSummary: "monitoring:summary",
  courseMonitoringViolations: (
    page: number,
    statusFilter: string,
    moduleId: string,
    sort: string,
  ) => `course-monitoring:violations:${page}:${statusFilter}:${moduleId}:${sort}`,
  courseMonitoringReviews: (page: number, statusFilter: string) =>
    `course-monitoring:reviews:${page}:${statusFilter}`,
  courseMonitoringAudit: (page: number, actionFilter: string) =>
    `course-monitoring:audit:${page}:${actionFilter}`,
  courseMonitoringSummary: "course-monitoring:summary",
  batchPerformance: (id: string) => `batch:perf:${id}`,
} as const;
