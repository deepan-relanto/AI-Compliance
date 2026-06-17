"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";

type SignalState = "active" | "success" | "warning";

interface CheckpointSignalProps {
  state?: SignalState;
  progress?: number;
  className?: string;
}

const stateStyles: Record<SignalState, { stroke: string; bg: string; icon: string }> = {
  active: {
    stroke: "text-[#2e3192]",
    bg: "bg-[#2e3192]/5",
    icon: "text-[#2e3192]",
  },
  success: {
    stroke: "text-emerald-600",
    bg: "bg-emerald-50",
    icon: "text-emerald-700",
  },
  warning: {
    stroke: "text-red-600",
    bg: "bg-red-50",
    icon: "text-red-700",
  },
};

export function CheckpointSignal({
  state = "active",
  progress = 0,
  className,
}: CheckpointSignalProps) {
  const safeProgress = Math.min(100, Math.max(0, progress));
  const styles = stateStyles[state];
  const Icon = state === "success" ? CheckCircle2 : state === "warning" ? Lock : ShieldCheck;

  return (
    <div
      className={cn(
        "relative shrink-0 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white",
        className ?? "h-28 w-full",
      )}
    >
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(39,39,42,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(39,39,42,0.08) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <svg
        viewBox="0 0 260 112"
        className={cn("absolute inset-0 h-full w-full", styles.stroke)}
        aria-hidden="true"
      >
        <motion.path
          d="M18 74 C 55 28, 86 96, 123 54 S 195 28, 242 72"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.15 }}
          animate={{ pathLength: 1, opacity: 0.55 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        {[30, 86, 132, 188, 232].map((x, index) => (
          <motion.circle
            key={x}
            cx={x}
            cy={index % 2 === 0 ? 74 : 48}
            r="4"
            fill="currentColor"
            initial={{ scale: 0.7, opacity: 0.35 }}
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.35, 0.9, 0.35] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              delay: index * 0.16,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className={cn(
            "relative flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm",
            styles.bg,
          )}
        >
          <Icon className={cn("h-7 w-7", styles.icon)} strokeWidth={1.7} />
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
            <motion.circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className={styles.stroke}
              pathLength="1"
              strokeDasharray="1"
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 1 - safeProgress / 100 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </svg>
        </motion.div>
      </div>

      <div className="absolute bottom-3 left-4 right-4">
        <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${safeProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              state === "success" ? "bg-emerald-600" : state === "warning" ? "bg-red-600" : "bg-[#2e3192]",
            )}
          />
        </div>
      </div>
    </div>
  );
}
