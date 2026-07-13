import { emailsMatch, normalizeEmail } from "@/lib/training-link";

export { emailsMatch, normalizeEmail };

/** Safe in-app paths for post-login redirect (blocks open redirects). */
export function resolvePostLoginPath(
  callbackUrl: string | null | undefined,
  role: "admin" | "user" | undefined,
): string {
  if (
    callbackUrl &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//")
  ) {
    if (callbackUrl.startsWith("/admin") && role !== "admin") {
      return "/dashboard";
    }
    if (
      callbackUrl.startsWith("/training/") ||
      callbackUrl.startsWith("/dashboard") ||
      callbackUrl.startsWith("/admin")
    ) {
      return callbackUrl;
    }
  }
  return role === "admin" ? "/admin" : "/dashboard";
}

export function isTrainingCallback(callbackUrl: string | null | undefined): boolean {
  return !!callbackUrl?.startsWith("/training/");
}

/** Preserve return path when sending unauthenticated users to login. */
export function loginPathWithCallback(
  returnPath: string,
  forEmail?: string | null,
): string {
  const path = returnPath.startsWith("/") ? returnPath : "/dashboard";
  const params = new URLSearchParams({ callbackUrl: path });
  const intended = normalizeEmail(forEmail);
  if (intended) params.set("forEmail", intended);
  return `/login?${params.toString()}`;
}

/** Whether an existing session may auto-enter training from the login page. */
export function canAutoEnterTraining(
  sessionEmail: string | null | undefined,
  forEmail: string | null | undefined,
): boolean {
  const intended = normalizeEmail(forEmail);
  if (!intended) return true;
  return emailsMatch(sessionEmail, intended);
}
