/**
 * Lightweight in-memory server-side cache for expensive API routes.
 * Works in both dev and production Next.js (server components run in Node).
 * Cache lives in the Node process; it is invalidated on writes/mutations.
 *
 * Supports stale-while-revalidate: soft TTL marks data revalidatable while
 * hard TTL is the absolute miss boundary (industry-standard SWR pattern).
 */

interface CacheEntry<T> {
  data: T;
  softExpiresAt: number;
  hardExpiresAt: number;
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

/** Read a cached value; returns undefined if missing or past hard TTL. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = getStore().get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.hardExpiresAt) {
    getStore().delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Stale-while-revalidate read.
 * - fresh: within soft TTL — serve as-is
 * - stale: past soft TTL but within hard TTL — serve immediately, caller should refresh
 */
export function cacheGetSWR<T>(
  key: string,
): { data: T; fresh: boolean } | undefined {
  const entry = getStore().get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  const now = Date.now();
  if (now > entry.hardExpiresAt) {
    getStore().delete(key);
    return undefined;
  }
  return { data: entry.data, fresh: now <= entry.softExpiresAt };
}

/**
 * Write a value to cache.
 * @param softTtlSeconds — serve as fresh for this long (default 45s)
 * @param hardTtlSeconds — absolute expiry; defaults to 3× soft TTL for SWR
 */
export function cacheSet<T>(
  key: string,
  data: T,
  softTtlSeconds = 45,
  hardTtlSeconds?: number,
): void {
  const softMs = Math.max(1, softTtlSeconds) * 1000;
  const hardMs = Math.max(softMs, (hardTtlSeconds ?? softTtlSeconds * 3) * 1000);
  const now = Date.now();
  getStore().set(key, {
    data,
    softExpiresAt: now + softMs,
    hardExpiresAt: now + hardMs,
  });
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
  batches: 90_000,
  analytics: 180_000,
  batchPerformance: 90_000,
  courseLibrary: 90_000,
  emailMonitoring: 90_000,
  learnerDashboard: 90_000,
  monitoring: 45_000,
  employeeFacets: 300_000,
  feedbackList: 60_000,
} as const;

/** Fetch-through cache used by content library routes. */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGetSWR<T>(key);
  if (hit?.fresh) return hit.data;
  if (hit && !hit.fresh) {
    // Return stale immediately; refresh in background.
    queueMicrotask(() => {
      void loader()
        .then((data) => {
          cacheSet(key, data, Math.ceil(ttlMs / 1000));
        })
        .catch(() => undefined);
    });
    return hit.data;
  }
  const data = await loader();
  cacheSet(key, data, Math.ceil(ttlMs / 1000));
  return data;
}

/**
 * SWR helper for JSON API routes: return cached data instantly,
 * refresh in the background when soft TTL has elapsed.
 */
export async function swrLoad<T>(
  key: string,
  softTtlSeconds: number,
  hardTtlSeconds: number,
  loader: () => Promise<T>,
): Promise<{ data: T; status: "HIT" | "STALE" | "MISS" }> {
  const hit = cacheGetSWR<T>(key);
  if (hit) {
    if (!hit.fresh) {
      queueMicrotask(() => {
        void loader()
          .then((data) => cacheSet(key, data, softTtlSeconds, hardTtlSeconds))
          .catch(() => undefined);
      });
      return { data: hit.data, status: "STALE" };
    }
    return { data: hit.data, status: "HIT" };
  }
  const data = await loader();
  cacheSet(key, data, softTtlSeconds, hardTtlSeconds);
  return { data, status: "MISS" };
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
  monitoringFacets: "monitoring:facets",
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
  courseMonitoringFacets: "course-monitoring:facets",
  batchPerformance: (id: string, track = "compliance") => `batch:perf:${id}:${track}`,
  moduleDetail: (id: string, email: string) =>
    `module:detail:${id}:${email.toLowerCase()}`,
  employeeFacets: "employees:facets",
  feedbackList: "feedback:list",
  courseFeedbackList: "course-feedback:list",
} as const;
