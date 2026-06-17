"use client";

import { Button } from "@/components/ui/button";
import type { McqQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface McqModalProps {
  moduleId: string;
  question: McqQuestion;
  open: boolean;
  userEmail?: string;
  moduleTitle?: string;
  batchId?: string;
  totalSlides?: number;
  onContinue: (wasCorrect: boolean) => void;
}

export function McqModal({
  moduleId,
  question,
  open,
  userEmail,
  moduleTitle,
  batchId,
  totalSlides,
  onContinue,
}: McqModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSubmitted(false);
      setWasCorrect(false);
      setCorrectOptionId(null);
      setValidating(false);
      setError(null);
    }
  }, [open, question.id]);

  const handleSubmit = async () => {
    if (!selected || validating) return;

    if (question.id === "gate-fallback") {
      setWasCorrect(true);
      setCorrectOptionId(selected);
      setSubmitted(true);
      return;
    }

    setValidating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/modules/${encodeURIComponent(moduleId)}/mcq/${encodeURIComponent(question.id)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optionId: selected,
            userEmail,
            moduleTitle,
            batchId,
            totalSlides,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not validate your answer.");
        return;
      }
      setWasCorrect(Boolean(data.correct));
      setCorrectOptionId(data.correctOptionId ?? null);
      setSubmitted(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setValidating(false);
    }
  };

  const handleContinue = () => {
    onContinue(wasCorrect);
    setSelected(null);
    setSubmitted(false);
    setWasCorrect(false);
    setCorrectOptionId(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
              <div className="flex items-center gap-2 border-b border-zinc-100 px-6 py-4">
                <Lock className="h-4 w-4 text-[#f15a24]" strokeWidth={1.75} />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#f15a24]">
                  Checkpoint
                </span>
              </div>
              <div className="p-6">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                  {question.prompt}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Answer the scenario question, then continue to the next slide.
                </p>
                <ul className="mt-5 space-y-2">
                  {question.options.map((opt) => {
                    const isSelected = selected === opt.id;
                    const showCorrect =
                      submitted && correctOptionId !== null && opt.id === correctOptionId;
                    const showWrong =
                      submitted &&
                      isSelected &&
                      correctOptionId !== null &&
                      opt.id !== correctOptionId;

                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          disabled={submitted || validating}
                          onClick={() => setSelected(opt.id)}
                          className={cn(
                            "flex w-full cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                            isSelected && !submitted
                              ? "border-[#2e3192]/40 bg-[#2e3192]/5 text-zinc-900"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                            showCorrect && "border-emerald-300 bg-emerald-50",
                            showWrong && "border-red-200 bg-red-50",
                            submitted && "cursor-default",
                          )}
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-[10px] font-mono uppercase text-zinc-500">
                            {opt.id}
                          </span>
                          <span className="flex-1">{opt.label}</span>
                          {showCorrect && (
                            <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />
                          )}
                          {showWrong && (
                            <XCircle className="ml-auto h-4 w-4 text-red-500" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {error && (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {submitted && (
                  <p
                    className={cn(
                      "mt-3 flex items-center gap-2 text-sm font-medium",
                      wasCorrect ? "text-emerald-700" : "text-red-700",
                    )}
                  >
                    {wasCorrect ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Correct — you may continue.
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        Incorrect
                      </>
                    )}
                  </p>
                )}

                {!submitted ? (
                  <Button
                    variant="primary"
                    className="mt-5 w-full"
                    onClick={handleSubmit}
                    disabled={!selected || validating}
                  >
                    {validating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking answer…
                      </>
                    ) : (
                      "Submit answer"
                    )}
                  </Button>
                ) : (
                  <Button variant="primary" className="mt-5 w-full" onClick={handleContinue}>
                    Continue to next slide
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
