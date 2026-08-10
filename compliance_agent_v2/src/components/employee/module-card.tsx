"use client";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { getProgress, getModuleStatus, isProctorLocked } from "@/lib/progress-store";
import type { ModuleStatus, TrainingModule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isPassingScore } from "@/lib/constants";
import { MODULE_KIND_LABELS } from "@/lib/module-kind";
import { Clock, FileText, Layers, Play, RotateCcw, ShieldAlert, Trophy } from "lucide-react";
import { requestScoreRetake } from "@/lib/progress-api";
import { resetForScoreRetake, resetLocalAttempt } from "@/lib/progress-store";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function prefetchTraining(moduleId: string, userEmail?: string, moduleKind?: string) {
  const query = userEmail
    ? `?userEmail=${encodeURIComponent(userEmail)}`
    : "";
  void fetch(`/api/modules/${encodeURIComponent(moduleId)}${query}`);
  if (moduleKind === "course") {
    void import("@/components/employee/course-player");
  } else {
    void import("@/components/employee/slide-viewer");
  }
}

interface ModuleCardProps {
  module: TrainingModule;
  /** Bump to re-read local progress after the dashboard merges server state. */
  refreshKey?: number;
}

const statusAccent: Record<ModuleStatus, string> = {
  not_started: "bg-[#2e3192]",
  in_progress: "bg-[#f15a24]",
  completed: "bg-emerald-500",
  failed: "bg-[#f15a24]",
  permanently_failed: "bg-zinc-800",
};

function displayStatus(
  status: ModuleStatus,
  scorePercent: number | null,
): ModuleStatus {
  if (status === "permanently_failed") return status;
  if (status === "completed") return status;
  if (
    status === "failed" ||
    status === "in_progress" ||
    (scorePercent != null && !isPassingScore(scorePercent))
  ) {
    return "in_progress";
  }
  return status;
}

export function ModuleCard({ module, refreshKey = 0 }: ModuleCardProps) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const warmTraining = useCallback(() => {
    prefetchTraining(module.id, user?.username, module.moduleKind);
  }, [module.id, module.moduleKind, user?.username]);
  const [status, setStatus] = useState<ModuleStatus>(module.status);
  const [scorePercent, setScorePercent] = useState<number | null>(null);
  const [retakeCount, setRetakeCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!user?.username) return;
    const p = getProgress(user.username, module.id);
    if (p) {
      setStatus(p.status);
      setScorePercent(p.scorePercent ?? null);
      setRetakeCount(p.retakeCount ?? 0);
    } else {
      const s = getModuleStatus(user.username, module.id);
      setStatus(s);
      setScorePercent(null);
      setRetakeCount(0);
    }
  }, [user?.username, module.id, module.status, refreshKey]);

  // A score of exactly the threshold is a pass: offering a retake there would ask
  // the server to wipe a passing attempt.
  const canScoreRetake =
    status !== "completed" &&
    status !== "permanently_failed" &&
    scorePercent != null &&
    !isPassingScore(scorePercent);

  const isFullAssessmentRetake =
    retakeCount > 0 && !canScoreRetake && status === "not_started";

  const proctorLocked =
    status === "permanently_failed" ||
    isProctorLocked({ status, scorePercent });

  const badgeStatus = displayStatus(status, scorePercent);

  const canRequestRetake =
    proctorLocked && status !== "permanently_failed";

  // Only save/exit modules keep their position. Everything else restarts the
  // attempt, so the button has to say so.
  const resumeInPlace =
    Boolean(module.allowSaveExit) &&
    status === "in_progress" &&
    !proctorLocked &&
    !canScoreRetake &&
    !isFullAssessmentRetake;

  const ctaLabel = canScoreRetake
    ? "Retake quiz"
    : isFullAssessmentRetake
      ? "Retake assessment"
      : status === "permanently_failed"
        ? "View status"
        : canRequestRetake
          ? "Request retake"
          : status === "completed"
            ? "Review"
            : resumeInPlace
              ? "Continue"
              : badgeStatus === "in_progress"
                ? "Restart"
                : "Start";

  const ctaVariant = canRequestRetake
    ? "accent"
    : status === "completed"
      ? "secondary"
      : "primary";

  return (
    <article
      className="surface-card-interactive group overflow-hidden"
      onMouseEnter={warmTraining}
      onFocus={warmTraining}
    >
      <div className="flex flex-col sm:flex-row">
        <div
          className={cn("h-1 w-full shrink-0 sm:h-auto sm:w-1", statusAccent[badgeStatus])}
          aria-hidden
        />
        <div className="flex flex-1 flex-col sm:flex-row sm:items-stretch">
          <div className="flex flex-1 gap-4 p-5 sm:p-6">
            <div className="icon-tile-brand hidden h-11 w-11 sm:flex">
              <FileText className="h-5 w-5 text-[#2e3192]" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={badgeStatus} />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    module.moduleKind === "course"
                      ? "bg-[#f15a24]/8 text-[#f15a24] ring-1 ring-[#f15a24]/20"
                      : "bg-[#2e3192]/8 text-[#2e3192] ring-1 ring-[#2e3192]/15",
                  )}
                >
                  {MODULE_KIND_LABELS[module.moduleKind ?? "compliance"]}
                </span>
                <span className="section-label normal-case tracking-wide">
                  Mandatory
                </span>
                {module.contentType === "pdf" && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    PDF
                  </span>
                )}
                {scorePercent != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      isPassingScore(scorePercent)
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60"
                        : "bg-red-50 text-red-700 ring-1 ring-red-200/60",
                    )}
                  >
                    <Trophy className="h-3 w-3" />
                    {scorePercent}%
                  </span>
                )}
              </div>
              <h3 className="mt-2.5 text-base font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-[#2e3192]">
                {module.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 line-clamp-2">
                {module.description}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-4 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {module.slideCount} slides
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ~{module.durationMinutes} min
                </span>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "flex flex-col justify-center border-t border-zinc-100 px-5 py-4 sm:w-[216px] sm:shrink-0 sm:border-l sm:border-t-0 sm:px-4",
              canScoreRetake && "bg-gradient-to-b from-[#2e3192]/[0.04] to-zinc-50/80",
              canRequestRetake && "bg-gradient-to-b from-[#f15a24]/[0.05] to-zinc-50/80",
            )}
          >
            {canScoreRetake && (
              <p className="mb-2 text-center text-[10px] font-medium leading-snug text-zinc-500 sm:text-left">
                Low score — quiz questions only (slides skipped)
              </p>
            )}
            {isFullAssessmentRetake && (
              <p className="mb-2 text-center text-[10px] font-medium leading-snug text-zinc-500 sm:text-left">
                Full retake — slides, signature, and feedback
              </p>
            )}
            {canRequestRetake && (
              <p className="mb-2 text-center text-[10px] font-semibold leading-snug text-[#c2410c] sm:text-left">
                Attempt locked — request admin approval to retake
              </p>
            )}
            {actionError && (
              <p className="mb-2 text-center text-[10px] font-semibold leading-snug text-[#b91c1c] sm:text-left">
                {actionError}
              </p>
            )}
            <Button
              variant={ctaVariant}
              size="md"
              disabled={actionPending}
              className={cn(
                "w-full gap-1.5 whitespace-nowrap px-3 text-[13px]",
                (canScoreRetake || isFullAssessmentRetake || canRequestRetake) &&
                  "shadow-sm",
              )}
              onClick={async () => {
                if (actionPending) return;
                setActionError(null);
                if (!user?.username) {
                  router.push(`/training/${module.id}`);
                  return;
                }
                if (canScoreRetake) {
                  setActionPending(true);
                  const res = await requestScoreRetake(user.username, module.id);
                  if (res.ok) {
                    resetForScoreRetake(user.username, module.id);
                    router.push(`/training/${module.id}`);
                    return;
                  }
                  setActionPending(false);
                  setActionError(
                    res.message ??
                      "This attempt cannot be retaken right now. Please contact your administrator.",
                  );
                  return;
                }
                // Gated courses: Continue resumes without wiping / fresh=1.
                // Never fresh-start a scored attempt (pass awaiting ack, or fail
                // awaiting Retake quiz) — that would discard the recorded score.
                const needsFreshStart =
                  !resumeInPlace &&
                  scorePercent == null &&
                  (isFullAssessmentRetake ||
                    status === "not_started" ||
                    (status === "in_progress" && !proctorLocked));
                if (proctorLocked || canRequestRetake) {
                  router.push(`/training/${module.id}`);
                  return;
                }
                if (needsFreshStart) {
                  resetLocalAttempt(user.username, module.id);
                }
                const fresh = needsFreshStart ? "?fresh=1" : "";
                router.push(`/training/${module.id}${fresh}`);
              }}
            >
              {canScoreRetake || isFullAssessmentRetake ? (
                <RotateCcw className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              ) : canRequestRetake ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              )}
              <span>{ctaLabel}</span>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
