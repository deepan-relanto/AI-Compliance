"use client";

import { useAuthStore } from "@/lib/auth-store";
import { preferredClientRole } from "@/lib/access-policy";
import type { AuthUser } from "@/lib/types";
import { invalidateLearnerDashboardClientCache } from "@/lib/progress-api";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

function SessionSync({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const setUser = useAuthStore((s) => s.setUser);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && session?.user?.email) {
      const u = session.user;
      const role = u.role as AuthUser["role"] | undefined;
      // Never invent a role — missing claim caused admin↔dashboard bounce loops.
      if (!role) {
        setHydrated();
        return;
      }
      const nextEmail = u.email!;
      const current = useAuthStore.getState().user;
      if (current?.username && current.username.toLowerCase() !== nextEmail.toLowerCase()) {
        invalidateLearnerDashboardClientCache();
      }
      const authUser: AuthUser = {
        username: nextEmail,
        role: preferredClientRole(role, current?.role),
        batchId: (u.batchId && u.batchId.trim()) || current?.batchId || "",
        displayName: u.displayName ?? u.name ?? nextEmail.split("@")[0],
      };
      setUser(authUser);
    } else if (status === "unauthenticated") {
      invalidateLearnerDashboardClientCache();
      setUser(null);
    }
    setHydrated();
  }, [session, status, setUser, setHydrated]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SessionSync>{children}</SessionSync>
    </SessionProvider>
  );
}
