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
    meta?: { mcqCorrect?: number; mcqTotal?: number; questionId?: string },
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
    <ul className="space-y-1">
      {lines.map((line) => (
        <li
          key={line}
          className="relative pl-3.5 text-sm font-medium leading-snug text-inherit before:absolute before:left-0 before:top-[0.5rem] before:h-1 before:w-1 before:rounded-full before:bg-current before:opacity-55"
        >
          {line}
        </li>
      ))}
    </ul>
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
  const signalState = submitted
    ? validating
      ? "active"
      : wasCorrect
        ? "success"
        : "warning"
    : "active";

  const allowMultiple = Boolean(question.allowMultiple);
  const correctOptionIds = useMemo(
    () => new Set(parseCorrectOptionIds(correctOptionId ?? "")),
    [correctOptionId],
  );

  const handleSubmit = (overrideOptionIds?: string[]) => {
    const optionsToSubmit = overrideOptionIds ?? selected;
    if (optionsToSubmit.length === 0 || validating || submitted) return;

    if (question.id === "gate-fallback") {
      setWasCorrect(true);
      setCorrectOptionId(optionsToSubmit[0] ?? "");
      setAnswerExplanation(
        "This checkpoint confirms you can continue when no generated question is available.",
      );
      setSubmitted(true);
      onAnswered(true, { questionId: question.id });
      return;
    }

    setValidating(true);
    setError(null);

    const provisionalLabel =
      question.options.find((opt) => opt.id === optionsToSubmit[0])?.label ?? "";
    const provisionalExplanation = normalizeMcqExplanation(
      question.explanation,
      provisionalLabel,
    );
    // Instant feedback: explanation + submit chrome appear before the network returns.
    setAnswerExplanation(provisionalExplanation);
    setSubmitted(true);

    const payload =
      allowMultiple || optionsToSubmit.length > 1
        ? { optionIds: optionsToSubmit }
        : { optionId: optionsToSubmit[0] };
    const submittedQuestionId = question.id;

    void (async () => {
      try {
        const res = await fetch(
          `/api/modules/${encodeURIComponent(moduleId)}/mcq/${encodeURIComponent(submittedQuestionId)}/answer`,
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
            keepalive: true,
          },
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          onAnswered(false, { questionId: submittedQuestionId });
          if (submittedQuestionId === question.id) {
            setSubmitted(false);
            setWasCorrect(false);
            setCorrectOptionId(null);
            setAnswerExplanation(null);
            setError(data.error ?? "Could not validate your answer.");
          }
          return;
        }
        const correct = Boolean(data.correct);
        const resolvedCorrectId = data.correctOptionId ?? null;
        const correctLabel =
          question.options.find((opt) => opt.id === resolvedCorrectId)?.label ??
          provisionalLabel;
        if (submittedQuestionId === question.id) {
          setWasCorrect(correct);
          setCorrectOptionId(resolvedCorrectId);
          setAnswerExplanation(
            normalizeMcqExplanation(question.explanation, correctLabel),
          );
        }
        onAnswered(correct, {
          questionId: submittedQuestionId,
          mcqCorrect:
            typeof data.mcqCorrect === "number" ? data.mcqCorrect : undefined,
          mcqTotal:
            typeof data.mcqTotal === "number" ? data.mcqTotal : undefined,
        });
      } catch {
        onAnswered(false, { questionId: submittedQuestionId });
        if (submittedQuestionId === question.id) {
          setSubmitted(false);
          setWasCorrect(false);
          setCorrectOptionId(null);
          setAnswerExplanation(null);
          setError("Could not reach the server. Try again.");
        }
      } finally {
        if (submittedQuestionId === question.id) {
          setValidating(false);
        }
      }
    })();
  };

  const handleContinue = () => {
    // Do not reset submitted UI here — on the last question the parent keeps
    // this modal open while finalize runs; resetting would flash the unanswered
    // form. State clears when `open`/`question.id` change (see effect above).
    onContinue(wasCorrect);
  };

  const panelMode = variant === "panel";
  const modalMode = !panelMode;
  const submittedLayout = modalMode && submitted;

  // Main-branch shrink pattern: banner + signal compress after submit so
  // question/options/explanation fit the fixed checkpoint shell.
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
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 sm:px-3.5",
            bannerHeight,
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2e3192]/10 text-[#2e3192]">
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-[11px]">
              Secure checkpoint
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug text-zinc-600 sm:text-[13px]">
              {submittedLayout
                ? "Review the explanation, then continue when ready."
                : "Choose the best policy-aligned response."}
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
    <div
      className={cn(
        "shrink-0",
        modalMode && "min-h-0 max-h-[5.5rem] overflow-y-auto overscroll-contain",
      )}
    >
      <h2
        className={cn(
          "font-semibold tracking-tight text-zinc-900",
          modalMode
            ? submittedLayout
              ? "text-lg leading-snug"
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
            ? "Select all that apply, then submit."
            : "Pick the best option, then submit."}
        </p>
      )}
    </div>
  );

  const optionsList = (
    <ul
      className={cn(
        "shrink-0",
        modalMode ? "mt-2 space-y-1.5" : "mt-4 space-y-2.5",
        submittedLayout && "mt-2 space-y-1",
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
        const isSelectedPending =
          submitted && isSelected && correctOptionIds.size === 0;

        return (
          <li key={opt.id}>
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
                "relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border text-left transition-colors duration-100",
                modalMode
                  ? submittedLayout
                    ? "px-3 py-2 text-base leading-snug"
                    : "px-3.5 py-2.5 text-sm leading-snug"
                  : submittedLayout
                    ? "px-3.5 py-2.5 text-sm"
                    : "px-4 py-3.5 text-base",
                "hover:border-zinc-300 hover:bg-zinc-50",
                isSelected && !submitted
                  ? "border-[#2e3192]/50 bg-[#2e3192]/5 text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700",
                isSelectedPending && "border-[#2e3192]/40 bg-[#2e3192]/5 text-zinc-900",
                showCorrect && "border-emerald-300 bg-emerald-50 text-emerald-950",
                showWrong && "border-red-300 bg-red-50 text-red-950",
                submitted && "cursor-default",
              )}
            >
              {isSelected && !submitted && (
                <span className="absolute inset-y-0 left-0 w-1 bg-[#2e3192]" />
              )}
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-md border font-mono font-semibold uppercase",
                  modalMode
                    ? submittedLayout
                      ? "h-5 w-5 text-[10px]"
                      : "h-6 w-6 text-[10px]"
                    : submittedLayout
                      ? "h-5 w-5 text-[10px]"
                      : "h-7 w-7 text-xs",
                  isSelected && !submitted
                    ? "border-[#2e3192]/40 bg-white text-[#2e3192]"
                    : "border-zinc-200 bg-white text-zinc-500",
                  showCorrect && "border-emerald-300 bg-white text-emerald-700",
                  showWrong && "border-red-300 bg-white text-red-700",
                )}
              >
                {opt.id}
              </span>
              <span className="flex-1 leading-snug">{opt.label}</span>
              {showCorrect && (
                <CheckCircle2 className="ml-1 h-4 w-4 shrink-0 text-emerald-600" />
              )}
              {showWrong && (
                <XCircle className="ml-1 h-4 w-4 shrink-0 text-red-500" />
              )}
              {isSelectedPending && (
                <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin text-[#2e3192]" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const feedbackSettled = submitted && !validating;
  const feedbackBlock =
    submitted ? (
      <div
        className={cn(
          "mt-2.5 flex min-h-[5.5rem] shrink-0 flex-col overflow-hidden rounded-lg border",
          !feedbackSettled
            ? "border-zinc-200 bg-zinc-50 text-zinc-800"
            : wasCorrect
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-red-200 bg-red-50 text-red-950",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 border-b px-3 py-2",
            !feedbackSettled
              ? "border-zinc-200/80"
              : wasCorrect
                ? "border-emerald-200/80"
                : "border-red-200/80",
          )}
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white",
              !feedbackSettled
                ? "border-zinc-200 text-zinc-500"
                : wasCorrect
                  ? "border-emerald-200 text-emerald-700"
                  : "border-red-200 text-red-700",
            )}
          >
            {!feedbackSettled ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : wasCorrect ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">
              {!feedbackSettled
                ? "Answer recorded"
                : wasCorrect
                  ? `Correct — +${POINTS_PER_MCQ} points`
                  : "Incorrect — +0 points"}
            </p>
            <p
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.1em]",
                !feedbackSettled
                  ? "text-zinc-500"
                  : wasCorrect
                    ? "text-emerald-700/85"
                    : "text-red-700/85",
              )}
            >
              {!feedbackSettled
                ? "Confirming result…"
                : wasCorrect
                  ? "Why this is correct"
                  : "Why this is wrong"}
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
          {answerExplanation ? (
            <ExplanationLines explanation={answerExplanation} />
          ) : (
            <p className="text-sm font-medium leading-snug">
              Your response has been recorded for this checkpoint.
            </p>
          )}
        </div>
      </div>
    ) : null;

  const card = (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
      <div className="h-1 shrink-0 bg-zinc-100">
        <motion.div
          initial={false}
          animate={{ width: `${checkpointProgress}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
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
                  Choose the response that best follows policy.
                </p>
              )}
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
          modalMode
            ? submittedLayout
              ? "px-5 py-3 sm:px-6"
              : "px-5 py-2.5 sm:px-6"
            : "p-4 sm:px-6 sm:pb-5",
        )}
      >
        {!submitted ? (
          <Button
            variant="primary"
            className="w-full text-sm font-semibold"
            disabled={selected.length === 0}
            onClick={() => {
              if (selected.length > 0 && !submitted) {
                handleSubmit(selected);
              }
            }}
          >
            Submit answer
          </Button>
        ) : (
          <Button
            variant="primary"
            className="w-full text-sm font-semibold"
            disabled={validating}
            onClick={handleContinue}
          >
            {validating
              ? "Confirming…"
              : checkpointNumber >= totalCheckpoints && totalCheckpoints > 0
                ? "Continue"
                : "Continue to next question"}
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
          transition={{ duration: 0.15 }}
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
          {/* Main-branch shell: standard Relanto checkpoint size */}
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
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
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
