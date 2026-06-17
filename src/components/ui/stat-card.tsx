import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent?: "brand" | "accent" | "success" | "muted";
  className?: string;
}

const accentStyles = {
  brand: {
    tile: "icon-tile-brand",
    icon: "text-[#2e3192]",
  },
  accent: {
    tile: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50",
    icon: "text-[#f15a24]",
  },
  success: {
    tile: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50",
    icon: "text-emerald-600",
  },
  muted: {
    tile: "icon-tile",
    icon: "text-zinc-500",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "brand",
  className,
}: StatCardProps) {
  const styles = accentStyles[accent];

  return (
    <div
      className={cn(
        "surface-card flex flex-col justify-between p-5 min-h-[108px] transition-shadow hover:shadow-[var(--shadow-elevated)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-zinc-500">{label}</p>
        <div className={styles.tile}>
          <Icon className={cn("h-4 w-4", styles.icon)} strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
          {value}
        </p>
        {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
      </div>
    </div>
  );
}
