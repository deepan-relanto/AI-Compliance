"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import {
  PROCTOR_MAX_WARNINGS,
  PROCTOR_VIOLATION_MESSAGES,
  type ProctorViolationReason,
} from "@/lib/proctor/violations";
import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { createPortal } from "react-dom";

interface ProctorWarningModalProps {
  open: boolean;
  reason: ProctorViolationReason;
  warningCount: number;
  onContinue: () => void;
  continueLabel?: string;
  failMessage?: string;
}

export function ProctorWarningModal({
  open,
  reason,
  warningCount,
  onContinue,
  continueLabel = "Continue assessment",
  failMessage = "One more violation will automatically fail this assessment attempt.",
}: ProctorWarningModalProps) {
  if (!open) return null;

  const remaining = Math.max(0, PROCTOR_MAX_WARNINGS - warningCount);

  const modal = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onContinue();
        }
      }}
    >
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)] animate-in fade-in zoom-in-95 duration-200">
        <BrandPanelHeader
          eyebrow="Integrity warning"
          title={`Warning ${warningCount} of ${PROCTOR_MAX_WARNINGS}`}
          description="Your session is proctored. Repeated violations will fail this attempt."
          icon={ShieldAlert}
          compact
        />

        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-lg border border-[#f15a24]/20 bg-[#fff7f3] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#f15a24]" strokeWidth={2.25} />
            <p className="text-sm leading-relaxed text-zinc-700">
              {PROCTOR_VIOLATION_MESSAGES[reason]}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <span>Warning progress</span>
              <span>{remaining} remaining</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: PROCTOR_MAX_WARNINGS }, (_, index) => {
                const filled = index < warningCount;
                return (
                  <div
                    key={index}
                    className={cn(
                      "h-2 rounded-full transition-colors",
                      filled ? "bg-[#f15a24]" : "bg-zinc-200",
                    )}
                  />
                );
              })}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            {remaining <= 1
              ? failMessage
              : "Return to fullscreen and keep this tab focused to avoid further warnings."}
          </p>

          <Button
            type="button"
            autoFocus
            variant="primary"
            className="h-11 w-full cursor-pointer bg-[#2e3192] text-white hover:bg-[#3d42a8]"
            onClick={onContinue}
          >
            {continueLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}
