import { cn } from "@/lib/utils";
import type { ModuleStatus } from "@/lib/types";

const statusStyles: Record<ModuleStatus, string> = {
  not_started: "bg-zinc-100 text-zinc-600 border-zinc-200",
  in_progress: "bg-orange-50 text-[#c2410c] border-orange-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  permanently_failed: "bg-zinc-950 text-zinc-50 border-zinc-950 font-bold",
};

const statusLabels: Record<ModuleStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  permanently_failed: "Permanently Failed",
};

export function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
