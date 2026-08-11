/**
 * Short-lived process cache for course/PDF asset ACL checks.
 * Video Range requests hit ACL on every chunk — caching avoids repeated
 * users + JSON step joins for the same email+asset within a session.
 */

type CachedAllow = {
  allowed: boolean;
  expiresAt: number;
};

const cache = new Map<string, CachedAllow>();
const TTL_MS = 120_000;

function key(email: string, assetUrl: string): string {
  return `${email.toLowerCase()}::${assetUrl}`;
}

export function getCachedAssetAccess(
  email: string,
  assetUrl: string,
): boolean | null {
  const entry = cache.get(key(email, assetUrl));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key(email, assetUrl));
    return null;
  }
  return entry.allowed;
}

export function setCachedAssetAccess(
  email: string,
  assetUrl: string,
  allowed: boolean,
): void {
  cache.set(key(email, assetUrl), {
    allowed,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function clearAssetAccessCache(): void {
  cache.clear();
}
