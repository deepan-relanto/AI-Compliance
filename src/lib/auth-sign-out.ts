"use client";

import { useAuthStore } from "@/lib/auth-store";
import { signOut } from "next-auth/react";

/** Clear app + NextAuth session and land on login without auto-redirect. */
export async function signOutCompletely(): Promise<void> {
  useAuthStore.getState().logout();
  useAuthStore.persist.clearStorage();
  await signOut({ redirect: false });
  window.location.href = "/login?signedOut=1";
}
