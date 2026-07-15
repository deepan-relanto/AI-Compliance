import type { AuthUser } from "@/lib/types";

export const LOCAL_ADMIN_BYPASS_ENABLED =
  process.env.NEXT_PUBLIC_LOCAL_ADMIN_BYPASS === "true";

export function getLocalAdminUser(): AuthUser {
  return {
    username:
      process.env.NEXT_PUBLIC_LOCAL_ADMIN_EMAIL?.trim() ||
      "local.admin@relanto.ai",
    role: "admin",
    batchId: "",
    displayName:
      process.env.NEXT_PUBLIC_LOCAL_ADMIN_NAME?.trim() || "Local Admin",
  };
}
