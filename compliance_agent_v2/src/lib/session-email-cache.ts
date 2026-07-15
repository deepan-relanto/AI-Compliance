/**
 * Short TTL cache for NextAuth session email.
 * Cuts auth() cost during rapid MCQ submits in the same process.
 */

type CachedSession = {
  email: string;
  expiresAt: number;
};

const TTL_MS = 45_000;
let cached: CachedSession | null = null;

export function getCachedSessionEmail(): string | null {
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    cached = null;
    return null;
  }
  return cached.email;
}

export function setCachedSessionEmail(email: string): void {
  cached = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + TTL_MS,
  };
}

export function clearCachedSessionEmail(): void {
  cached = null;
}
