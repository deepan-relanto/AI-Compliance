"use client";

import type { GamificationBadge } from "@/components/employee/badge-unlock";
import { Button } from "@/components/ui/button";
import { PASS_THRESHOLD_PERCENT, POINTS_PER_MCQ } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";

interface FinalResultScreenProps {
  moduleTitle: string;
  scorePercent: number;
  passed: boolean;
  mcqCorrect: number;
  mcqTotal: number;
  bestStreak: number;
  badges: GamificationBadge[];
  canRetake: boolean;
  retakeLoading?: boolean;
  onContinuePassed: () => void;
  onRetake: () => void;
}

function motivationalMessage(scorePercent: number): string {
  if (scorePercent >= 90) return "Outstanding performance. You demonstrated expert compliance judgment.";
  if (scorePercent >= 80) return "Excellent work. Your answers show strong understanding of the material.";
  if (scorePercent >= 70) return "Good job. You met the required passing threshold.";
  return "More review is needed. Revisit the material and attempt the assessment again.";
}

function ResultGauge({
  scorePercent,
  passed,
}: {
  scorePercent: number;
  passed: boolean;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, scorePercent)) / 100) * circumference;

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-zinc-200"
        />
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          className={passed ? "text-emerald-600" : "text-red-600"}
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.75, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-mono text-2xl font-bold tabular-nums",
            passed ? "text-emerald-700" : "text-red-700",
          )}
        >
          {scorePercent}%
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {passed ? "Pass" : "Fail"}
        </span>
      </div>
    </div>
  );
}

export function FinalResultScreen({
  moduleTitle,
  scorePercent,
  passed,
  mcqCorrect,
  mcqTotal,
  bestStreak,
  badges,
  canRetake,
  retakeLoading = false,
  onContinuePassed,
  onRetake,
}: FinalResultScreenProps) {
  const finalScore = mcqCorrect * POINTS_PER_MCQ;
  const totalScore = mcqTotal * POINTS_PER_MCQ;
  const wrongAnswers = Math.max(0, mcqTotal - mcqCorrect);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-zinc-950/80 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="w-full max-w-4xl overflow-hidden rounded-[var(--radius-card)] border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]"
      >
        <div
          className={cn(
            "relative border-b px-6 py-6 sm:px-8",
            passed ? "border-emerald-100 bg-emerald-50/70" : "border-red-100 bg-red-50/70",
          )}
        >
          <div className="absolute right-5 top-5 sm:right-8 sm:top-6">
            <ResultGauge scorePercent={scorePercent} passed={passed} />
          </div>
          <div className="max-w-2xl pr-36 sm:pr-40">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
                passed
                  ? "border-emerald-200 text-emerald-700"
                  : "border-red-200 text-red-700",
              )}
            >
              {passed ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Final result
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">
              {passed ? "Compliance Training Passed" : "Compliance Training Failed"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700">
              {passed
                ? "You have successfully completed the training."
                : `You did not achieve the minimum passing score of ${PASS_THRESHOLD_PERCENT}%. Please review the material and try again.`}
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-900">
              {motivationalMessage(scorePercent)}
            </p>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#2e3192]" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold text-zinc-950">Assessment Summary</h3>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              You scored {finalScore}/{totalScore} in {moduleTitle}.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Final Score", `${finalScore}/${totalScore}`],
                ["Percentage", `${scorePercent}%`],
                ["Status", passed ? "PASS" : "FAIL"],
                ["Correct Answers", String(mcqCorrect)],
                ["Wrong Answers", String(wrongAnswers)],
                ["Best Streak", String(bestStreak)],
              ].map(([label, value], index) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.22 }}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-zinc-950 tabular-nums">
                    {value}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold text-zinc-950">Badges Earned</h3>
            </div>
            {badges.length > 0 ? (
              <div className="mt-3 space-y-2">
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-amber-950">{badge.name}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                      {badge.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                No badges unlocked yet.
              </p>
            )}

            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-zinc-500" strokeWidth={1.75} />
                <p className="text-xs font-semibold text-zinc-700">
                  Passing threshold: {PASS_THRESHOLD_PERCENT}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-100 px-6 py-5 sm:px-8">
          {passed ? (
            <Button
              variant="primary"
              className="h-11 w-full cursor-pointer"
              onClick={onContinuePassed}
            >
              <ShieldCheck className="h-4 w-4" />
              Continue
            </Button>
          ) : canRetake ? (
            <Button
              variant="primary"
              className="h-11 w-full cursor-pointer"
              disabled={retakeLoading}
              onClick={onRetake}
            >
              <RotateCcw className="h-4 w-4" />
              {retakeLoading ? "Preparing retake..." : "Retake quiz only"}
            </Button>
          ) : (
            <p className="text-center text-sm text-zinc-600">
              Retake unavailable. Please contact your administrator for assistance.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
