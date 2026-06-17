"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface CompletionNoticeProps {
  open: boolean;
  title: string;
  message: string;
  acknowledgeLabel?: string;
  variant?: "success" | "info";
  /** Auto-run onAcknowledge after this many ms (success flow). */
  autoCloseAfterMs?: number;
  showAcknowledgeButton?: boolean;
  onAcknowledge: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function CompletionNotice({
  open,
  title,
  message,
  acknowledgeLabel = "Acknowledge",
  variant = "success",
  autoCloseAfterMs,
  showAcknowledgeButton = true,
  onAcknowledge,
  onDismiss,
  className,
}: CompletionNoticeProps) {
  const isSuccess = variant === "success";
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const onAcknowledgeRef = useRef(onAcknowledge);

  useEffect(() => {
    onAcknowledgeRef.current = onAcknowledge;
  }, [onAcknowledge]);

  useEffect(() => {
    if (!open || !autoCloseAfterMs) {
      setSecondsLeft(null);
      return;
    }

    const endAt = Date.now() + autoCloseAfterMs;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    const timeout = window.setTimeout(() => onAcknowledgeRef.current(), autoCloseAfterMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [open, autoCloseAfterMs]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-zinc-950/40 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-notice-title"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className={cn(
              "pointer-events-auto fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
              className,
            )}
          >
            <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
              <div className="h-1.5 w-full bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]" />
              <div className="relative p-5 sm:p-6">
                {onDismiss && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="absolute right-3 top-3 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <div className="flex gap-4 pr-6">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                      isSuccess
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-blue-100 bg-blue-50 text-[#2e3192]",
                    )}
                  >
                    <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                      {isSuccess ? "Compliance training" : "Next step"}
                    </p>
                    <h2
                      id="completion-notice-title"
                      className="text-base font-semibold leading-snug text-zinc-950 sm:text-lg"
                    >
                      {title}
                    </h2>
                    <p className="text-sm leading-relaxed text-zinc-600">{message}</p>
                    {autoCloseAfterMs && secondsLeft != null && (
                      <p className="text-xs text-zinc-500">
                        This window will close in {secondsLeft} second{secondsLeft === 1 ? "" : "s"}…
                      </p>
                    )}
                  </div>
                </div>
                {showAcknowledgeButton && (
                  <Button
                    type="button"
                    autoFocus
                    className={cn(
                      "mt-5 w-full cursor-pointer text-white",
                      isSuccess
                        ? "bg-gradient-to-r from-[#2e3192] to-[#3d42a8] hover:opacity-95"
                        : "bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24] hover:opacity-95",
                    )}
                    onClick={onAcknowledge}
                  >
                    {acknowledgeLabel}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
