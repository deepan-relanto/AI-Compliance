/**
 * Lightweight in-memory rate limiter for hot/sensitive API routes.
 * Per-process only — sufficient for single-instance Render deploys.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: Math.max(1, bucket.resetAt - now) };
  }

  bucket.count += 1;
  return { ok: true };
}

/** Build a stable key from request metadata. */
export function rateLimitKey(
  scope: string,
  ip: string | null,
  suffix?: string,
): string {
  const identity = ip?.trim() || "unknown";
  return suffix ? `${scope}:${identity}:${suffix}` : `${scope}:${identity}`;
}

export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    {
      ok: false,
      error: "Too many requests. Please wait and try again.",
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "Cache-Control": "no-store",
      },
    },
  );
}
