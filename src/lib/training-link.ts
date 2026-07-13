/** Normalize email for link matching and storage. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return !!left && !!right && left === right;
}

/** Login URL for a training invitation or retake email (binds link to recipient). */
export function trainingLoginUrl(
  moduleId: string,
  baseUrl: string,
  userEmail: string,
): string {
  const root = baseUrl.replace(/\/$/, "");
  const callback = `/training/${encodeURIComponent(moduleId)}`;
  const params = new URLSearchParams({
    callbackUrl: callback,
    forEmail: userEmail.trim().toLowerCase(),
  });
  return `${root}/login?${params.toString()}`;
}
