"use client";

import { useAuthStore } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(user.role === "admin" ? "/admin" : "/dashboard");
  }, [user, isHydrated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-pulse rounded-md bg-zinc-200" />
    </div>
  );
}
