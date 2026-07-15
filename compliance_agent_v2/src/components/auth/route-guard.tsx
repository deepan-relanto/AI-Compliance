"use client";

import { loginPathWithCallback } from "@/lib/auth-routes";
import { useAuthStore } from "@/lib/auth-store";
import { LOCAL_ADMIN_BYPASS_ENABLED, getLocalAdminUser } from "@/lib/local-dev-auth";
import type { UserRole } from "@/lib/types";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const storedUser = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const { status: sessionStatus } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const user = LOCAL_ADMIN_BYPASS_ENABLED ? getLocalAdminUser() : storedUser;

  const sessionLoading = sessionStatus === "loading";
  const waitingForSync =
    !LOCAL_ADMIN_BYPASS_ENABLED && sessionStatus === "authenticated" && !user;

  useEffect(() => {
    if (sessionLoading || !isHydrated || waitingForSync) return;
    if (!user && sessionStatus === "unauthenticated") {
      router.replace(loginPathWithCallback(pathname));
      return;
    }
    if (user && allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [
    user,
    isHydrated,
    allowedRoles,
    router,
    pathname,
    sessionLoading,
    sessionStatus,
    waitingForSync,
  ]);

  if (sessionLoading || !isHydrated || waitingForSync || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-pulse rounded-md bg-zinc-200" />
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
