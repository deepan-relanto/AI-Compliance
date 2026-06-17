"use client";

import { resolvePostLoginPath } from "@/lib/auth-routes";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function LoginRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const signedOut = searchParams.get("signedOut");
  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    if (signedOut) return;
    if (status !== "authenticated" || !session?.user?.email) return;
    const role = session.user.role ?? "user";
    router.replace(resolvePostLoginPath(callbackUrl, role));
  }, [session, status, signedOut, callbackUrl, router]);

  return null;
}
