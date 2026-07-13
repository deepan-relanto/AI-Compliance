"use client";

import { RelantoLogo } from "@/components/brand/relanto-logo";
import { Button } from "@/components/ui/button";
import { resolvePostLoginPath, isTrainingCallback } from "@/lib/auth-routes";
import { emailsMatch, normalizeEmail } from "@/lib/training-link";
import { motion } from "framer-motion";
import { signIn, signOut, useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Your account is not enrolled yet. Use your @relanto.ai Microsoft account or contact your administrator.",
  Configuration: "Microsoft sign-in is not available. See the setup message below.",
  OAuthSignin: "Could not start Microsoft sign-in. Please try again.",
  OAuthCallback:
    "Microsoft sign-in failed. Confirm the Web redirect URI in Azure matches the URL below.",
  Default: "Sign-in failed. Please try again with your @relanto.ai work account.",
};

type AuthStatus = {
  configured: boolean;
  callbackUrl: string;
  issues: string[];
  hints: string[];
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  const rawCallback = searchParams.get("callbackUrl");
  const forEmail = normalizeEmail(searchParams.get("forEmail"));
  const isTraining = isTrainingCallback(rawCallback);
  const sessionEmail = session?.user?.email ?? null;
  const wrongAccount =
    sessionStatus === "authenticated" &&
    isTraining &&
    !!forEmail &&
    !emailsMatch(sessionEmail, forEmail);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          setAuthStatus({
            configured: Boolean(data.configured),
            callbackUrl: data.callbackUrl ?? "",
            issues: data.issues ?? [],
            hints: data.hints ?? [],
          });
        }
      } catch {
        if (!cancelled) {
          setAuthStatus({
            configured: false,
            callbackUrl:
              "http://localhost:3000/api/auth/callback/microsoft-entra-id",
            issues: ["SERVER_UNREACHABLE"],
            hints: ["Start the dev server: npm run dev"],
          });
        }
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const errorCode = searchParams.get("error");
  const authConfigured = authStatus?.configured ?? false;
  const callbackUrl = authStatus?.callbackUrl ?? "";

  const setupMessage = authStatus?.issues.includes(
    "AUTH_AZURE_AD_CLIENT_SECRET_IS_SECRET_ID_NOT_VALUE",
  )
    ? "Wrong Azure secret in .env: you pasted the Secret ID (GUID). Create a new client secret in Azure and paste the Value (starts with letters like 3C~…), not the Secret ID."
    : !authConfigured && authStatus
      ? authStatus.hints[0] ??
        "Add AUTH_SECRET and Azure AD keys to .env, then restart npm run dev."
      : "";

  const error =
    !statusLoading && !authConfigured
      ? setupMessage
      : errorCode != null
        ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default)
        : "";

  const handleMicrosoftSignIn = useCallback(async () => {
    if (!authConfigured) return;
    setLoading(true);
    try {
      if (wrongAccount) {
        await signOut({ redirect: false });
      }
      const postLogin = resolvePostLoginPath(rawCallback, undefined);
      const authParams = isTraining ? { prompt: "select_account" as const } : undefined;
      await signIn(
        "microsoft-entra-id",
        {
          callbackUrl: postLogin,
          redirect: true,
        },
        authParams,
      );
    } finally {
      setLoading(false);
    }
  }, [authConfigured, rawCallback, isTraining, wrongAccount]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="w-full overflow-hidden rounded-[var(--radius-card)] border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]"
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]" />

      <div className="px-8 pb-8 pt-7 sm:px-10 sm:pb-10 sm:pt-8">
        <div className="mb-7 lg:hidden">
          <RelantoLogo size="md" showTagline />
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#2e3192] to-[#3d42a8] text-white shadow-md shadow-[#2e3192]/20">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#f15a24]">
            Relanto
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-[1.35rem]">
            Compliance Agent
          </h1>
          <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-zinc-500">
            {isTraining
              ? forEmail
                ? (
                  <>
                    Sign in as{" "}
                    <span className="font-semibold text-[#2e3192]">{forEmail}</span>{" "}
                    to begin your proctored assessment.
                  </>
                )
                : "Sign in with Microsoft to begin your proctored assessment."
              : (
                <>
                  Sign in with your{" "}
                  <span className="font-semibold text-[#2e3192]">@relanto.ai</span> Microsoft
                  work account.
                </>
              )}
          </p>
        </div>

        {statusLoading && (
          <p className="mt-6 text-center text-sm text-zinc-400">Checking sign-in…</p>
        )}

        {wrongAccount && !statusLoading && (
          <div className="mt-6 rounded-lg border border-amber-200/90 bg-amber-50 px-3.5 py-3 text-center text-sm leading-relaxed text-amber-950">
            You are signed in as{" "}
            <span className="font-semibold">{sessionEmail}</span>, but this training
            link was sent to{" "}
            <span className="font-semibold">{forEmail}</span>. Choose the correct
            Microsoft account below.
          </div>
        )}

        {error && !statusLoading && (
          <div className="mt-6 space-y-3">
            <p className="rounded-lg border border-red-200/90 bg-red-50 px-3.5 py-3 text-center text-sm leading-relaxed text-red-800">
              {error}
            </p>
            {callbackUrl && (
              <p className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-center font-mono text-[10px] leading-relaxed text-zinc-500 break-all">
                Azure Web redirect URI:
                <br />
                <span className="text-zinc-700">{callbackUrl}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-7">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full cursor-pointer gap-3 border border-zinc-200 bg-white text-[15px] font-semibold text-zinc-800 shadow-sm transition-all hover:border-[#2e3192]/30 hover:bg-zinc-50 hover:shadow-md disabled:opacity-50"
            disabled={loading || statusLoading || !authConfigured}
            onClick={() => void handleMicrosoftSignIn()}
          >
            <MicrosoftIcon className="h-5 w-5 shrink-0" />
            {loading
              ? "Redirecting…"
              : statusLoading
                ? "Please wait…"
                : wrongAccount
                  ? "Switch Microsoft account"
                  : "Continue with Microsoft"}
          </Button>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-400">
          Authorized @relanto.ai users only
        </p>
      </div>
    </motion.div>
  );
}
