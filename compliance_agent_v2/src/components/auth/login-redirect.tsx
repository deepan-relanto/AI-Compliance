"use client";

import {
  canAutoEnterTraining,
  isTrainingCallback,
  resolvePostLoginPath,
} from "@/lib/auth-routes";
import { normalizeEmail } from "@/lib/training-link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function LoginRedirect() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const signedOut = searchParams.get("signedOut");
  const callbackUrl = searchParams.get("callbackUrl");
  const forEmail = normalizeEmail(searchParams.get("forEmail"));
  const isTraining = isTrainingCallback(callbackUrl);

  useEffect(() => {
    if (signedOut) return;
    if (status !== "authenticated" || !session?.user?.email) return;

    if (
      isTraining &&
      !canAutoEnterTraining(session.user.email, forEmail)
    ) {
      return;
    }

    const role = session.user.role ?? "user";
    router.replace(resolvePostLoginPath(callbackUrl, role));
  }, [session, status, signedOut, callbackUrl, forEmail, isTraining, router]);

  return null;
}
