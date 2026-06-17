"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, RotateCcw, TrendingUp } from "lucide-react";

export interface EncouragementRetakeNoticeProps {
  open: boolean;
  moduleTitle: string;
  scorePercent: number;
  mcqCorrect: number;
  mcqTotal: number;
  attemptNumber: number;
  canRetake: boolean;
  retakeLoading?: boolean;
  onTryAgain: () => void;
}

export function EncouragementRetakeNotice({
  open,
  moduleTitle,
  scorePercent,
  mcqCorrect,
  mcqTotal,
  attemptNumber,
  canRetake,
  retakeLoading = false,
  onTryAgain,
}: EncouragementRetakeNoticeProps) {
  const isSecondOrMore = attemptNumber >= 2;
  const gap = PASS_THRESHOLD_PERCENT - scorePercent;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[76] bg-zinc-950/50 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-auto fixed left-1/2 top-1/2 z-[77] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
              <BrandPanelHeader
                eyebrow={isSecondOrMore ? "Keep going" : "You've got this"}
                title="It's okay — try again"
                description="Everyone learns at their own pace. A quiz-only round is ready when you are — same room, just the questions."
                icon={Heart}
              />

              <div className="space-y-4 px-6 py-5">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Your score", `${scorePercent}%`, "text-[#2e3192]"],
                    ["Correct", `${mcqCorrect}/${mcqTotal}`, "text-[#3d42a8]"],
                    ["Goal", `${PASS_THRESHOLD_PERCENT}%`, "text-[#f15a24]"],
                  ].map(([label, value, color], i) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.05 }}
                      className="rounded-lg border border-zinc-100 bg-zinc-50/90 px-2 py-3 text-center"
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                        {label}
                      </p>
                      <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums", color)}>
                        {value}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div className="flex items-start gap-2.5 rounded-lg border border-[#2e3192]/10 bg-gradient-to-r from-[#2e3192]/5 to-[#f15a24]/5 px-3.5 py-3 text-xs text-zinc-700">
                  <TrendingUp className="h-4 w-4 shrink-0 text-[#2e3192] mt-0.5" />
                  <p className="leading-relaxed">
                    {gap > 0 ? (
                      <>
                        You&apos;re <span className="font-bold text-[#2e3192]">{gap}%</span> from
                        passing on <span className="font-semibold text-zinc-900">{moduleTitle}</span>.
                        Take a breath — we believe in you.
                      </>
                    ) : (
                      <>
                        You&apos;re close on{" "}
                        <span className="font-semibold text-zinc-900">{moduleTitle}</span>. One more
                        focused attempt can do it.
                      </>
                    )}
                  </p>
                </div>

                {isSecondOrMore && (
                  <p className="text-center text-[11px] text-zinc-500">
                    Attempt {attemptNumber} recorded for administrators.
                  </p>
                )}

                <div className="flex flex-col gap-2.5 pt-1">
                  {canRetake ? (
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button
                        type="button"
                        autoFocus
                        disabled={retakeLoading}
                        className="h-11 w-full cursor-pointer border-0 bg-gradient-to-r from-[#2e3192] to-[#3d42a8] text-white shadow-[0_6px_20px_rgba(46,49,146,0.35)] hover:opacity-95"
                        onClick={onTryAgain}
                      >
                        <RotateCcw
                          className={cn("h-4 w-4", retakeLoading && "animate-spin")}
                        />
                        {retakeLoading ? "Starting quiz retake…" : "Let's try again — quiz only"}
                      </Button>
                    </motion.div>
                  ) : (
                    <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-center text-xs font-medium text-red-800">
                      Retake limit reached. An administrator will follow up with you.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
