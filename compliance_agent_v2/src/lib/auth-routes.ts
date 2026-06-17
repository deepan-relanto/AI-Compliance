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
export function loginPathWithCallback(returnPath: string): string {
  const path = returnPath.startsWith("/") ? returnPath : "/dashboard";
  return `/login?callbackUrl=${encodeURIComponent(path)}`;
}
