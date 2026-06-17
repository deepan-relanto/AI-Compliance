"use client";

import { CheckCircle2 } from "lucide-react";

export function TrainingCompletedGate({ moduleTitle }: { moduleTitle: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-100 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h1 className="mt-6 text-xl font-semibold text-zinc-900">Training already completed</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-600">
        You have already submitted <strong>{moduleTitle}</strong>. This assessment can only be
        taken once — retakes are not available from this link.
      </p>
      <p className="mt-4 text-xs text-zinc-500">
        Contact your administrator if you believe this is an error.
      </p>
    </div>
  );
}
