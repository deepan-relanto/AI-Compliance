"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

export default function SubmittedPage() {
  useEffect(() => {
    const tryClose = () => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    };
    tryClose();
    const t1 = window.setTimeout(tryClose, 1500);
    const t2 = window.setTimeout(tryClose, 4000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h1 className="mt-6 text-xl font-semibold text-zinc-900">Training submitted</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-600">
        Thank you. Your assessment, attestation, and feedback are on record. This tab
        will close automatically — you can also close it manually.
      </p>
    </div>
  );
}
