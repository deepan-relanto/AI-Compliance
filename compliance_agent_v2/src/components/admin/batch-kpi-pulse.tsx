import { seatMixPercents } from "@/lib/batch-seat-metrics";
import { cn } from "@/lib/utils";

export function SeatMixBar({
  seats,
  completed,
  inProgress,
  locked,
  className,
  size = "md",
}: {
  seats: number;
  completed: number;
  inProgress: number;
  locked: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const mix = seatMixPercents({ seats, completed, inProgress, locked });
  return (
    <div
      className={cn(
        "flex w-full overflow-hidden rounded-full bg-zinc-100 ring-1 ring-inset ring-zinc-200/80",
        size === "sm" ? "h-1.5" : "h-2.5",
        className,
      )}
      role="img"
      aria-label={`${completed} complete, ${inProgress} in progress, ${locked} locked, of ${seats} seats`}
    >
      {mix.completed > 0 && (
        <div
          className="h-full bg-gradient-to-r from-[#2e3192] to-[#4b50c4] transition-[width] duration-700 ease-out"
          style={{ width: `${mix.completed}%` }}
        />
      )}
      {mix.inProgress > 0 && (
        <div
          className="h-full bg-gradient-to-r from-[#f15a24] to-[#ff7a4d] transition-[width] duration-700 ease-out"
          style={{ width: `${mix.inProgress}%` }}
        />
      )}
      {mix.locked > 0 && (
        <div
          className="h-full bg-red-500 transition-[width] duration-700 ease-out"
          style={{ width: `${mix.locked}%` }}
        />
      )}
    </div>
  );
}

export function SeatMixLegend({
  completed,
  inProgress,
  locked,
  remaining,
}: {
  completed: number;
  inProgress: number;
  locked: number;
  remaining: number;
}) {
  const items = [
    { label: "Complete", value: completed, swatch: "bg-[#2e3192]" },
    { label: "In progress", value: inProgress, swatch: "bg-[#f15a24]" },
    { label: "Locked", value: locked, swatch: "bg-red-500" },
    { label: "Not started", value: remaining, swatch: "bg-zinc-200" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", item.swatch)} />
          {item.label}{" "}
          <span className="tabular-nums font-medium text-zinc-700">
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}

export function PulseStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-zinc-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
