/**
 * Session email must come from auth() per request.
 * A process-global cache was removed because concurrent users could inherit
 * another user's identity (role mix-ups / wrong progress writes).
 */

export function getCachedSessionEmail(): string | null {
  return null;
}

export function setCachedSessionEmail(_email: string): void {
  /* intentionally no-op */
}

export function clearCachedSessionEmail(): void {
  /* intentionally no-op */
}
