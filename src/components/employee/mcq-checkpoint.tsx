"use client";

import { StreakCounter } from "@/components/employee/streak-counter";
import { CheckpointSignal } from "@/components/employee/checkpoint-signal";
import { Button } from "@/components/ui/button";
import { POINTS_PER_MCQ } from "@/lib/constants";
import { formatExplanationLines, normalizeMcqExplanation } from "@/lib/mcq-explanation";
import { parseCorrectOptionIds } from "@/lib/mcq-multi-select";
import type { McqQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function shouldBlockCheckpointKey(e: KeyboardEvent): boolean {
  if (
    e.key === "Tab" ||
    e.key === "F5" ||
    e.key === "F11" ||
    e.key === "F12" ||
    e.key.startsWith("Arrow")
  ) {
    return true;
  }
  if (e.altKey) return true;
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (["w", "r", "t", "n", "l", "tab", "p"].includes(k)) return true;
  }
  return false;
}

interface MCQCheckpointProps {
  moduleId: string;
  question: McqQuestion;
  open: boolean;
  userEmail?: string;
  moduleTitle?: string;
  batchId?: string;
  totalSlides?: number;
  currentStreak: number;
  bestStreak?: number;
  score: number;
  totalScore: number;
  checkpointNumber: number;
  totalCheckpoints: number;
  assignedMcqCount?: number;
  variant?: "modal" | "panel";
  onAnswered: (
    wasCorrect: boolean,
    meta?: { mcqCorrect?: number; mcqTotal?: number },
  ) => void;
  onContinue: (wasCorrect: boolean) => void;
}

function stripGeneratedCheckpointPrefix(prompt: string): string {
  return prompt
    .replace(/^\s*(checkpoint|question)\s+\d+\s*(?:of\s+\d+)?\s*[:.)-]\s*/i, "")
    .trim();
}

function ExplanationLines({ explanation }: { explanation: string }) {
  const lines = formatExplanationLines(explanation);
  if (!lines.length) return null;

  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <p key={line} className="text-sm leading-relaxed text-inherit">
          {line}
        </p>
      ))}
    </div>
  );
}

export function MCQCheckpoint({
  moduleId,
  question,
  open,
  userEmail,
  moduleTitle,
  batchId,
  totalSlides,
  currentStreak,
  bestStreak = 0,
  score,
  totalScore,
  checkpointNumber,
  totalCheckpoints,
  assignedMcqCount,
  variant = "modal",
  onAnswered,
  onContinue,
}: MCQCheckpointProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [answerExplanation, setAnswerExplanation] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSubmitted(false);
      setWasCorrect(false);
      setCorrectOptionId(null);
      setAnswerExplanation(null);
      setValidating(false);
      setError(null);
    }
  }, [open, question.id]);

  const correctOption = useMemo(
    () => question.options.find((opt) => opt.id === correctOptionId),
    [question.options, correctOptionId],
  );
  const displayPrompt = useMemo(
    () => stripGeneratedCheckpointPrefix(question.prompt),
    [question.prompt],
  );
  const displayOptions = useMemo(
    () => [...question.options].sort((a, b) => a.id.localeCompare(b.id)),
    [question.options],
  );
  const checkpointProgress =
    totalCheckpoints > 0
      ? Math.min(100, Math.max(0, (checkpointNumber / totalCheckpoints) * 100))
      : 0;
  const signalState = submitted ? (wasCorrect ? "success" : "warning") : "active";

  const allowMultiple = Boolean(question.allowMultiple);
  const correctOptionIds = useMemo(
    () => new Set(parseCorrectOptionIds(correctOptionId ?? "")),
    [correctOptionId],
  );

  const handleSubmit = async (overrideOptionIds?: string[]) => {
    const optionsToSubmit = overrideOptionIds ?? selected;
    if (optionsToSubmit.length === 0 || validating || submitted) return;

    if (question.id === "gate-fallback") {
      setWasCorrect(true);
      setCorrectOptionId(optionsToSubmit[0] ?? "");
      setAnswerExplanation(
        "This checkpoint confirms you can continue when no generated question is available.",
      );
      setSubmitted(true);
      onAnswered(true);
      return;
    }

    setValidating(true);
    setError(null);
    try {
      const payload =
        allowMultiple || optionsToSubmit.length > 1
          ? { optionIds: optionsToSubmit }
          : { optionId: optionsToSubmit[0] };
      const res = await fetch(
        `/api/modules/${encodeURIComponent(moduleId)}/mcq/${encodeURIComponent(question.id)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            userEmail,
            moduleTitle,
            batchId,
            totalSlides,
            assignedMcqCount,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not validate your answer.");
        return;
      }
      const correct = Boolean(data.correct);
      const resolvedCorrectId = data.correctOptionId ?? null;
      const correctLabel =
        question.options.find((opt) => opt.id === resolvedCorrectId)?.label ?? "";
      setWasCorrect(correct);
      setCorrectOptionId(resolvedCorrectId);
      setAnswerExplanation(
        normalizeMcqExplanation(question.explanation, correctLabel),
      );
      setSubmitted(true);
      onAnswered(correct, {
        mcqCorrect:
          typeof data.mcqCorrect === "number" ? data.mcqCorrect : undefined,
        mcqTotal:
          typeof data.mcqTotal === "number" ? data.mcqTotal : undefined,
      });
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setValidating(false);
    }
  };

  const handleContinue = () => {
    onContinue(wasCorrect);
    setSelected([]);
    setSubmitted(false);
    setWasCorrect(false);
    setCorrectOptionId(null);
    setAnswerExplanation(null);
  };

  const panelMode = variant === "panel";
  const modalMode = !panelMode;
  const submittedLayout = modalMode && submitted;

  const bannerHeight = submittedLayout ? "h-14" : modalMode ? "h-16" : "h-24";
  const signalWidth = submittedLayout
    ? "w-24 min-w-[6rem]"
    : modalMode
      ? "w-28 min-w-[7rem]"
      : "w-full";

  const blockCheckpointShortcuts = useCallback((e: KeyboardEvent) => {
    if (!shouldBlockCheckpointKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (!open || panelMode) return;
    window.addEventListener("keydown", blockCheckpointShortcuts, true);
    return () => window.removeEventListener("keydown", blockCheckpointShortcuts, true);
  }, [open, panelMode, blockCheckpointShortcuts]);

  const securityBanner = modalMode ? (
    <div className={cn("mb-2.5 shrink-0", submittedLayout && "mb-2")}>
      <div className="flex flex-nowrap items-stretch gap-2 sm:gap-2.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2",
            bannerHeight,
          )}
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#2e3192]" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Secure checkpoint
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600">
              {submittedLayout
                ? "Review your answer, then continue."
                : "Choose the response that follows policy and the required approval path."}
            </p>
          </div>
        </div>
        <CheckpointSignal
          key={signalState}
          state={signalState}
          progress={checkpointProgress}
          className={cn(bannerHeight, signalWidth, "shrink-0 rounded-lg")}
        />
      </div>
    </div>
  ) : null;

  const questionBlock = (
    <div className={cn("shrink-0", modalMode && "min-h-0 max-h-[5.5rem] overflow-y-auto overscroll-contain")}>
      <h2
        className={cn(
          "font-semibold tracking-tight text-zinc-900",
          modalMode
            ? submittedLayout
              ? "text-[0.9375rem] leading-snug"
              : "text-base leading-snug"
            : submittedLayout
              ? "text-base leading-snug"
              : "text-lg leading-snug",
        )}
      >
        {displayPrompt}
      </h2>
      {!submitted && !modalMode && (
        <p className="mt-1.5 text-sm text-zinc-500">
          {allowMultiple
            ? "Select all that apply, then submit your answer."
            : "Answer this checkpoint to unlock the next step."}
        </p>
      )}
    </div>
  );

  const optionsList = (
    <ul
      className={cn(
        "shrink-0",
        modalMode ? "mt-2 space-y-1.5" : "mt-4 space-y-2.5",
      )}
    >
      {displayOptions.map((opt) => {
        const isSelected = selected.includes(opt.id);
        const showCorrect =
          submitted && correctOptionIds.size > 0 && correctOptionIds.has(opt.id);
        const showWrong =
          submitted &&
          isSelected &&
          correctOptionIds.size > 0 &&
          !correctOptionIds.has(opt.id);

        return (
          <motion.li
            key={opt.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              disabled={submitted || validating}
              onClick={() => {
                if (allowMultiple) {
                  setSelected((prev) =>
                    prev.includes(opt.id)
                      ? prev.filter((id) => id !== opt.id)
                      : [...prev, opt.id],
                  );
                } else {
                  setSelected([opt.id]);
                }
              }}
              className={cn(
                "relative flex w-full cursor-pointer items-start gap-2.5 overflow-hidden rounded-lg border text-left transition-all duration-150",
                modalMode
                  ? submittedLayout
                    ? "px-3 py-2 text-[0.8125rem] leading-snug"
                    : "px-3.5 py-2.5 text-sm leading-snug"
                  : submittedLayout
                    ? "px-3.5 py-2.5 text-sm"
                    : "px-4 py-3.5 text-base",
                "hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm",
                isSelected && !submitted
                  ? "border-[#2e3192]/45 bg-[#2e3192]/5 text-zinc-900 shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-700",
                showCorrect && "border-emerald-300 bg-emerald-50 text-emerald-950",
                showWrong && "border-red-200 bg-red-50 text-red-950",
                submitted && "cursor-default",
              )}
            >
              {isSelected && !submitted && (
                <motion.span
                  layoutId="selected-answer-glow"
                  className="absolute inset-y-0 left-0 w-1 bg-[#2e3192]"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  "mt-0.5 flex shrink-0 items-center justify-center rounded-md border border-zinc-200 font-mono uppercase text-zinc-500",
                  modalMode
                    ? submittedLayout
                      ? "h-5 w-5 text-[10px]"
                      : "h-6 w-6 text-[10px]"
                    : submittedLayout
                      ? "h-5 w-5 text-[10px]"
                      : "h-7 w-7 text-xs",
                )}
              >
                {opt.id}
              </span>
              <span className="flex-1 leading-snug">{opt.label}</span>
              {showCorrect && (
                <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />
              )}
              {showWrong && (
                <XCircle className="ml-auto h-4 w-4 shrink-0 text-red-500" />
              )}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );

  const feedbackBlock =
    submitted ? (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-lg border",
          modalMode ? "mt-2 p-3" : "mt-3 p-3.5 sm:mt-4 sm:p-4",
          submittedLayout && "flex min-h-0 flex-1 flex-col",
          wasCorrect
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-red-200 bg-red-50 text-red-950",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start gap-2.5">
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-white",
                wasCorrect ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700",
              )}
            >
              {wasCorrect ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold", modalMode ? "text-sm" : "text-base")}>
                {wasCorrect ? `Correct. +${POINTS_PER_MCQ} points.` : "Incorrect. +0 points."}
              </p>
            </div>
          </div>
          {(answerExplanation || correctOption) && (
            <div
              className={cn(
                "mt-2 flex min-h-0 flex-1 gap-1.5 pl-8 text-sm leading-relaxed",
                submittedLayout && "min-h-[10rem]",
              )}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <p className="font-semibold">
                  {wasCorrect ? "Why this is correct" : "Why this was wrong?"}
                </p>
                {answerExplanation ? (
                  <div className="mt-1.5">
                    <ExplanationLines explanation={answerExplanation} />
                  </div>
                ) : (
                  <p className="mt-1.5 leading-relaxed">
                    Your response has been recorded for this checkpoint.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    ) : null;

  const card = (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
      <div className="h-1 shrink-0 bg-zinc-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${checkpointProgress}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="h-full bg-[#f15a24]"
        />
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-col gap-1.5 border-b border-zinc-100 bg-zinc-50/90 sm:flex-row sm:items-center sm:justify-between",
          modalMode ? "px-5 py-2 sm:px-6" : "gap-3 px-4 py-3 sm:px-6 sm:py-4",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f15a24]/20 bg-white text-[#f15a24]">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#f15a24] sm:text-sm">
            Checkpoint {Math.min(checkpointNumber, Math.max(totalCheckpoints, 1))} of{" "}
            {Math.max(totalCheckpoints, 1)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {modalMode && (
            <StreakCounter
              currentStreak={currentStreak}
              bestStreak={bestStreak}
              compact
              tone="light"
              className="min-w-0 px-2 py-1"
            />
          )}
          <div className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700 sm:px-2.5 sm:py-1 sm:text-sm">
            <BarChart3 className="h-3 w-3 text-zinc-400 sm:h-3.5 sm:w-3.5" />
            Score{" "}
            <span className="font-mono tabular-nums">
              {score}/{totalScore}
            </span>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 sm:px-2.5 sm:py-1 sm:text-sm">
            <Plus className="mr-0.5 inline h-3 w-3" />
            {POINTS_PER_MCQ}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          modalMode ? "overflow-hidden" : "overflow-y-auto overscroll-contain",
          modalMode ? "px-5 py-3 sm:px-6" : "p-4 sm:p-5",
        )}
      >
        {securityBanner}

        {!modalMode && (
          <div className="mb-4 grid shrink-0 gap-3 sm:mb-5 sm:grid-cols-[1fr_10rem] sm:items-stretch">
            <div
              className={cn(
                "flex flex-col justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3",
                bannerHeight,
              )}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#2e3192]" strokeWidth={1.75} />
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Secure checkpoint
                </p>
              </div>
              {!submitted && (
                <p className="mt-1 text-sm leading-snug text-zinc-600">
                  Choose the response that best follows the training policy and required approval path.
                </p>
              )}
              <div className="mt-3 max-w-[180px]">
                <StreakCounter
                  currentStreak={currentStreak}
                  bestStreak={bestStreak}
                  compact
                  tone="light"
                />
              </div>
            </div>
            <CheckpointSignal
              key={signalState}
              state={signalState}
              progress={checkpointProgress}
              className={cn(bannerHeight, "shrink-0")}
            />
          </div>
        )}

        {questionBlock}
        {optionsList}

        {error && (
          <p className="mt-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {feedbackBlock}
      </div>

      <div
        className={cn(
          "shrink-0 border-t border-zinc-100 bg-white",
          modalMode ? (submittedLayout ? "px-5 py-3 sm:px-6" : "px-5 py-2.5 sm:px-6") : "p-4 sm:px-6 sm:pb-5",
        )}
      >
        {!submitted ? (
          <Button
            variant="primary"
            className="w-full"
            disabled={selected.length === 0 || validating}
            onClick={() => {
              if (selected.length > 0 && !submitted && !validating) {
                void handleSubmit(selected);
              }
            }}
          >
            {validating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking answer...
              </>
            ) : (
              "Submit answer"
            )}
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={handleContinue}>
            Continue to next question
          </Button>
        )}
      </div>
    </div>
  );

  const modalLayer =
    open && !panelMode ? (
      <AnimatePresence>
        <motion.div
          key="checkpoint-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-zinc-900/55 backdrop-blur-[2px]"
        />
        <motion.div
          key="checkpoint-dialog"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.99, y: 4 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed inset-0 z-[201] flex items-center justify-center overflow-hidden p-3 sm:p-4"
          onKeyDown={(e) => {
            if (shouldBlockCheckpointKey(e.nativeEvent)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="flex h-[min(90dvh,860px)] w-full max-w-4xl min-h-0 flex-col">
            {card}
          </div>
        </motion.div>
      </AnimatePresence>
    ) : null;

  return (
    <>
      <AnimatePresence>
        {open && panelMode && (
          <motion.div
            key="checkpoint-panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className="h-full min-h-0 overflow-hidden"
          >
            {card}
          </motion.div>
        )}
      </AnimatePresence>
      {typeof document !== "undefined" && modalLayer
        ? createPortal(modalLayer, document.body)
        : null}
    </>
  );
}
