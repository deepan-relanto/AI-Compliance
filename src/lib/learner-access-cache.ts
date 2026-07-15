/**
 * Process-level cache for `verifyModuleAccess` results.
 *
 * A learner's batch assignment is stable for the duration of an assessment
 * session — caching the result eliminates 3 DB roundtrips per MCQ submission.
 * TTL is short (60s) so admin changes propagate quickly.
 */

type CachedAccess = {
  batchId: string;
  expiresAt: number;
};

const cache = new Map<string, CachedAccess>();
const TTL_MS = 60_000;

function key(email: string, moduleId: string): string {
  return `${email.toLowerCase()}::${moduleId}`;
}

export function getCachedLearnerAccess(
  email: string,
  moduleId: string,
): string | null {
  const entry = cache.get(key(email, moduleId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key(email, moduleId));
    return null;
  }
  return entry.batchId;
}

export function setCachedLearnerAccess(
  email: string,
  moduleId: string,
  batchId: string,
): void {
  cache.set(key(email, moduleId), {
    batchId,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateLearnerAccess(email: string, moduleId?: string): void {
  if (moduleId) {
    cache.delete(key(email, moduleId));
    return;
  }
  const prefix = `${email.toLowerCase()}::`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
