"use client";

import { RelantoLogo } from "@/components/brand/relanto-logo";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { signOutCompletely } from "@/lib/auth-sign-out";
import Link from "next/link";

interface EmployeeShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function EmployeeShell({ children, title, subtitle }: EmployeeShellProps) {
  const user = useAuthStore((s) => s.user);

  const batchLabel = user?.batchId
    ? user.batchId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="min-h-screen page-bg">
      <header className="sticky top-0 z-30 w-full glass-header">
        <div className="flex h-[64px] w-full items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/dashboard" className="rounded-lg outline-offset-2 focus-visible:ring-2 focus-visible:ring-[#2e3192]/30">
            <RelantoLogo size="sm" showTagline className="justify-start" />
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden items-center gap-3 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-1.5 sm:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2e3192] text-[11px] font-semibold text-white">
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="text-left leading-tight">
                  <p className="max-w-[180px] truncate text-xs font-medium text-zinc-800">
                    {user.displayName || user.username}
                  </p>
                  {batchLabel && (
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      {batchLabel}
                    </p>
                  )}
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-600"
              onClick={() => void signOutCompletely()}
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {(title || subtitle) && (
        <div className="border-b border-zinc-200/50 bg-white/50">
          <div className="mx-auto w-full max-w-7xl px-5 py-9 sm:px-8 lg:px-10">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[1.75rem]">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      <main
        className={cn(
          "mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10",
          title ? "pb-12" : "py-10",
        )}
      >
        {children}
      </main>
    </div>
  );
}
