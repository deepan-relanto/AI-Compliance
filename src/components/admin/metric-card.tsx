import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: LucideIcon;
  trend?: string;
  className?: string;
  accent?: "brand" | "accent" | "success" | "danger" | "muted";
}

const accentMap = {
  brand: { tile: "icon-tile-brand", icon: "text-[#2e3192]" },
  accent: {
    tile: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50",
    icon: "text-[#f15a24]",
  },
  success: {
    tile: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50",
    icon: "text-emerald-600",
  },
  danger: {
    tile: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-red-50",
    icon: "text-red-600",
  },
  muted: { tile: "icon-tile", icon: "text-zinc-500" },
};

export function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  trend,
  className,
  accent = "muted",
}: MetricCardProps) {
  const styles = accentMap[accent];

  return (
    <div
      className={cn(
        "surface-card flex flex-col justify-between p-5 min-h-[120px] transition-shadow duration-200 hover:shadow-[var(--shadow-elevated)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-zinc-500">{label}</span>
        <div className={styles.tile}>
          <Icon className={cn("h-4 w-4", styles.icon)} strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
          {value}
          {suffix && (
            <span className="ml-0.5 text-base font-medium text-zinc-400">{suffix}</span>
          )}
        </p>
        {trend && <p className="mt-1.5 text-xs text-zinc-500">{trend}</p>}
      </div>
    </div>
  );
}
