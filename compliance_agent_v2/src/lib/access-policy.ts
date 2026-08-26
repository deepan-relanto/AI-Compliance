import type { UserRole } from "@/lib/types";

/** Roles that may open /dashboard and /training (admins can also be batch members). */
export const LEARNER_PAGE_ROLES: UserRole[] = ["user", "admin"];

export function canOpenAdminPages(
  role: UserRole | string | null | undefined,
): boolean {
  return role === "admin";
}

export function canOpenLearnerPages(
  role: UserRole | string | null | undefined,
): boolean {
  return role === "admin" || role === "user";
}

/** Prefer admin if any source says so — never demote an admin in the client store. */
export function preferredClientRole(
  ...roles: Array<UserRole | string | null | undefined>
): UserRole {
  if (roles.some((role) => role === "admin")) return "admin";
  return "user";
}

/** Anyone who can sit on a batch roster and receive outreach. */
export function isRosterMemberRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === "admin" || role === "user";
}

export function isAdminAppPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isLearnerAppPath(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/training/")
  );
}

export function canAccessAppPath(
  pathname: string,
  role: UserRole | string | null | undefined,
): boolean {
  if (isAdminAppPath(pathname)) return canOpenAdminPages(role);
  if (isLearnerAppPath(pathname)) return canOpenLearnerPages(role);
  return true;
}
