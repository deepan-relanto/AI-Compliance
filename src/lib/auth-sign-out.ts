"use client";

import { useAuthStore } from "@/lib/auth-store";
import { signOut } from "next-auth/react";

/**
 * Clear app + NextAuth session and land on login.
 * Next Microsoft sign-in uses prompt=select_account so the account picker appears.
 */
export async function signOutCompletely(): Promise<void> {
  useAuthStore.getState().logout();
  useAuthStore.persist.clearStorage();
  await signOut({ redirect: false });
  // signedOut=1 skips any stale auto-redirect; picker is enforced on Sign in.
  window.location.href = "/login?signedOut=1";
}
