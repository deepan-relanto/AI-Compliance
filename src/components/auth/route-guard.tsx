"use client";

import { loginPathWithCallback } from "@/lib/auth-routes";
import { useAuthStore } from "@/lib/auth-store";
import type { UserRole } from "@/lib/types";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const storeUser = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const sessionLoading = sessionStatus === "loading";
  // Prefer NextAuth role over persisted zustand (stale persist caused redirect loops).
  const sessionRole = session?.user?.role as UserRole | undefined;
  const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  const role = sessionRole ?? storeUser?.role;
  const email = sessionEmail ?? storeUser?.username ?? null;

  const waitingForSync =
    sessionStatus === "authenticated" && (!email || !role);

  useEffect(() => {
    if (sessionLoading || !isHydrated || waitingForSync) return;
    if (!email && sessionStatus === "unauthenticated") {
      router.replace(loginPathWithCallback(pathname));
      return;
    }
    if (email && role && allowedRoles && !allowedRoles.includes(role)) {
      router.replace(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [
    email,
    role,
    isHydrated,
    allowedRoles,
    router,
    pathname,
    sessionLoading,
    sessionStatus,
    waitingForSync,
  ]);

  if (sessionLoading || !isHydrated || waitingForSync || !email || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-pulse rounded-md bg-zinc-200" />
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
