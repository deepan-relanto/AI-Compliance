import { cn } from "@/lib/utils";
import Image from "next/image";

interface RelantoLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  showWordmark?: boolean;
}

const config = {
  sm: { img: 28, text: "text-[15px]", gap: "gap-2.5" },
  md: { img: 36, text: "text-lg", gap: "gap-3" },
  lg: { img: 48, text: "text-xl", gap: "gap-3.5" },
};

export function RelantoLogo({
  className,
  size = "md",
  showTagline = false,
  showWordmark = true,
}: RelantoLogoProps) {
  const s = config[size];

  return (
    <div className={cn("inline-flex items-center", s.gap, className)}>
      <Image
        src="/relanto-logo.png"
        alt="Relanto"
        width={s.img}
        height={s.img}
        className="shrink-0 object-contain object-left"
        priority
      />
      {(showWordmark || showTagline) && (
        <div className="flex min-w-0 flex-col leading-tight">
          {showWordmark && (
            <span
              className={cn(
                "font-semibold tracking-tight text-[#2e3192]",
                s.text,
              )}
            >
              Relanto
            </span>
          )}
          {showTagline && (
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Compliance Agent
            </span>
          )}
        </div>
      )}
    </div>
  );
}
