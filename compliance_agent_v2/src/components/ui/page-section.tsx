import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200/60 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
