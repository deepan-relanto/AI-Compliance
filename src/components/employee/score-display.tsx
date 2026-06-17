"use client";

import { POINTS_PER_MCQ } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Target } from "lucide-react";

interface ScoreDisplayProps {
  correctAnswers: number;
  totalQuestions: number;
  className?: string;
}

export function ScoreDisplay({
  correctAnswers,
  totalQuestions,
  className,
}: ScoreDisplayProps) {
  const score = correctAnswers * POINTS_PER_MCQ;
  const totalScore = totalQuestions * POINTS_PER_MCQ;

  return (
    <div
      className={cn(
        "flex min-w-[132px] items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-white",
        className,
      )}
    >
      <Target className="h-4 w-4 text-[#f15a24]" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Score
        </p>
        <motion.p
          key={score}
          initial={{ scale: 0.92, opacity: 0.75 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-mono text-sm font-semibold tabular-nums"
        >
          {score}/{totalScore}
        </motion.p>
      </div>
    </div>
  );
}
