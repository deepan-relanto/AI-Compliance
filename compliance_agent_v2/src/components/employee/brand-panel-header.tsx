"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface BrandPanelHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  className?: string;
  compact?: boolean;
}

/** Shared navy → orange gradient header used across training flow screens. */
export function BrandPanelHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  className,
  compact = false,
}: BrandPanelHeaderProps) {
  return (
    <div
      className={cn(
        "brand-panel-header relative overflow-hidden bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#f15a24] text-white",
        compact ? "px-5 py-4" : "px-6 py-5",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-10 left-6 h-20 w-20 rounded-full bg-[#f15a24]/25" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/30 shadow-sm">
          <Icon className="h-5 w-5 text-white" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/90">
            {eyebrow}
          </p>
          <h2
            className={cn(
              "font-bold leading-snug tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
              compact ? "mt-0.5 text-base" : "mt-1 text-lg sm:text-xl",
            )}
          >
            {title}
          </h2>
          {description && (
            <p
              className={cn(
                "mt-1.5 leading-relaxed text-white/95",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
