"use client";

import { cn } from "@/lib/utils";
import { GraduationCap, ShieldCheck } from "lucide-react";

export type AnalyticsTrack = "compliance" | "course";

export function TrackSegmentedControl({
  value,
  onChange,
  className,
}: {
  value: AnalyticsTrack;
  onChange: (track: AnalyticsTrack) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Analytics track"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-zinc-100/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "compliance"}
        onClick={() => onChange("compliance")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
          value === "compliance"
            ? "bg-white text-[#2e3192] shadow-sm ring-1 ring-zinc-200/80"
            : "text-zinc-500 hover:text-zinc-700",
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Compliance
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "course"}
        onClick={() => onChange("course")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
          value === "course"
            ? "bg-white text-[#2e3192] shadow-sm ring-1 ring-zinc-200/80"
            : "text-zinc-500 hover:text-zinc-700",
        )}
      >
        <GraduationCap className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Courses
      </button>
    </div>
  );
}
