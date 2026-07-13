"use client";

import { useAuthStore } from "@/lib/auth-store";
import type { AuthUser } from "@/lib/types";
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
      const authUser: AuthUser = {
        username: u.email!,
        role: (u.role as AuthUser["role"]) ?? "user",
        batchId: u.batchId ?? "",
        displayName: u.displayName ?? u.name ?? u.email!.split("@")[0],
      };
      setUser(authUser);
    } else if (status === "unauthenticated") {
      setUser(null);
    }
    setHydrated();
  }, [session, status, setUser, setHydrated]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SessionSync>{children}</SessionSync>
    </SessionProvider>
  );
}
