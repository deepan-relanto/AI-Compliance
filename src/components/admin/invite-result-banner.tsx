"use client";

import type { InviteSendResult } from "@/lib/invite-result";
import { formatInviteSummary } from "@/lib/invite-result";
import { AlertCircle, CheckCircle2, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";

export function InviteResultBanner({
  invites,
  className,
}: {
  invites?: InviteSendResult;
  className?: string;
}) {
  const summary = formatInviteSummary(invites);
  const Icon = summary.isWarning
    ? summary.isSuccess
      ? MailWarning
      : AlertCircle
    : CheckCircle2;

  return (
    <div
      className={cn(
        "w-full max-w-lg rounded-xl border px-4 py-3 text-left text-sm",
        summary.isWarning
          ? summary.isSuccess
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-red-200 bg-red-50 text-red-950"
          : "border-emerald-200 bg-emerald-50 text-emerald-950",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            summary.isWarning
              ? summary.isSuccess
                ? "text-amber-600"
                : "text-red-600"
              : "text-emerald-600",
          )}
        />
        <div>
          <p className="font-semibold">{summary.headline}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">{summary.detail}</p>
          {invites && invites.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs opacity-80">
              {invites.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
