"use client";

import { cn } from "@/lib/utils";
import { m as motion } from "@/lib/motion";

interface ProgressBarProps {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Progress
        </span>
        <span className="font-mono text-xs font-semibold text-zinc-200 tabular-nums">
          {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700/70">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
