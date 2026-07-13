"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import type { ReviewRequest, WarningHistoryEntry } from "@/lib/types";
import { CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react";

export interface IntegrityLockoutLabels {
  failedTitle: string;
  permanentlyFailedTitle: string;
  failedDescriptionMaxWarnings: string;
  failedDescriptionIncomplete: string;
  permanentlyFailedDescription: string;
  permanentlyFailedDetail: string;
  pendingReviewTitle: string;
  pendingReviewDetail: string;
  rejectedReviewTitle: string;
  requestReviewLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  backToDashboardLabel: string;
  exitToDashboardLabel?: string;
}

export const ASSESSMENT_LOCKOUT_LABELS: IntegrityLockoutLabels = {
  failedTitle: "Assessment Failed",
  permanentlyFailedTitle: "Assessment Permanently Failed",
  failedDescriptionMaxWarnings: "Maximum warning limit reached.",
  failedDescriptionIncomplete: "This attempt was ended before completion.",
  permanentlyFailedDescription:
    "Maximum retake limit reached. This assessment can no longer be retaken.",
  permanentlyFailedDetail:
    "You have used all allowed retakes. Please contact your compliance administrator.",
  pendingReviewTitle: "A review request is already under review",
  pendingReviewDetail:
    "You have already submitted a review request. The compliance administrator will review it.",
  rejectedReviewTitle: "Review request rejected",
  requestReviewLabel: "Request Review",
  reasonLabel: "Reason for failure",
  reasonPlaceholder:
    "Please explain why the assessment integrity rules were violated. Provide any relevant context or explanation.",
  backToDashboardLabel: "Back to dashboard",
};

export const COURSE_LOCKOUT_LABELS: IntegrityLockoutLabels = {
  failedTitle: "Course session ended",
  permanentlyFailedTitle: "Course permanently failed",
  failedDescriptionMaxWarnings:
    "You reached the maximum warning limit for this attempt.",
  failedDescriptionIncomplete: "This course attempt was ended before completion.",
  permanentlyFailedDescription:
    "Maximum retake limit reached. This course can no longer be retaken.",
  permanentlyFailedDetail:
    "This course has reached the maximum number of proctoring retakes. Please contact your compliance administrator.",
  pendingReviewTitle: "Review pending",
  pendingReviewDetail:
    "Your explanation was submitted. An administrator will approve or reject your retake request. This page updates automatically.",
  rejectedReviewTitle: "Review request rejected",
  requestReviewLabel: "Request administrator review",
  reasonLabel: "Explain what happened",
  reasonPlaceholder:
    "Describe why the proctoring warnings occurred and any context your administrator should know…",
  backToDashboardLabel: "Return to dashboard",
  exitToDashboardLabel: "Return to dashboard",
};

export interface IntegrityLockoutPanelProps {
  liveWarningCount: number;
  liveWarningHistory: WarningHistoryEntry[];
  retakeCount: number;
  reviewRequest: ReviewRequest | null;
  showReviewForm: boolean;
  explanation: string;
  reviewError: string;
  reviewSubmitting: boolean;
  isPermanentlyFailed: boolean;
  isPendingReview: boolean;
  isRejectedReview: boolean;
  isApprovedReview?: boolean;
  restartLoading?: boolean;
  sessionStarted?: boolean;
  labels: IntegrityLockoutLabels;
  headerTitle?: string;
  headerDescription?: string;
  onShowReviewForm: () => void;
  onExplanationChange: (value: string) => void;
  onCancelReview: () => void;
  onSubmitReview: (e: React.FormEvent) => void;
  onRestart?: () => void;
  restartLabel?: string;
  onExitToDashboard?: () => void;
  className?: string;
}

export function IntegrityLockoutPanel({
  liveWarningCount,
  liveWarningHistory,
  retakeCount,
  reviewRequest,
  showReviewForm,
  explanation,
  reviewError,
  reviewSubmitting,
  isPermanentlyFailed,
  isPendingReview,
  isRejectedReview,
  isApprovedReview = false,
  restartLoading = false,
  sessionStarted = true,
  labels,
  headerTitle,
  headerDescription,
  onShowReviewForm,
  onExplanationChange,
  onCancelReview,
  onSubmitReview,
  onRestart,
  restartLabel = "Restart from beginning",
  onExitToDashboard,
  className,
}: IntegrityLockoutPanelProps) {
  const retakesRemaining = Math.max(0, 2 - retakeCount);

  const title =
    headerTitle ??
    (isPermanentlyFailed
      ? labels.permanentlyFailedTitle
      : isApprovedReview
        ? "Retake approved"
        : labels.failedTitle);

  const description =
    headerDescription ??
    (isPermanentlyFailed
      ? labels.permanentlyFailedDescription
      : isApprovedReview
        ? "Your administrator approved a full restart. Begin from the beginning."
        : liveWarningCount >= 3
          ? labels.failedDescriptionMaxWarnings
          : labels.failedDescriptionIncomplete);

  return (
    <div
      className={
        className ??
        "training-form-zone pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)] animate-in fade-in zoom-in-95 duration-300"
      }
    >
      <BrandPanelHeader
        eyebrow="Integrity lockout"
        title={title}
        description={description}
        icon={ShieldAlert}
        compact
      />

      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-center gap-2 text-center">
          {liveWarningCount > 0 && (
            <span className="inline-flex items-center rounded-md border border-[#f15a24]/25 bg-[#fff7f3] px-2.5 py-1 text-xs font-semibold text-[#f15a24]">
              Warnings: {Math.min(liveWarningCount, 3)} / 3
            </span>
          )}
          {!isPermanentlyFailed && !isPendingReview && (
            <span className="inline-flex items-center rounded-md border border-[#2e3192]/15 bg-[#2e3192]/5 px-2.5 py-1 text-xs font-medium text-[#2e3192]">
              Retakes remaining: {retakesRemaining}
            </span>
          )}
        </div>

        {liveWarningHistory.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Warning history
            </p>
            <div className="mt-2 max-h-24 space-y-1.5 overflow-y-auto pr-1">
              {liveWarningHistory.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between gap-3 border-b border-zinc-100 pb-1 text-[10px] last:border-0"
                >
                  <span className="font-sans text-xs text-zinc-700">{item.reason}</span>
                  <span className="shrink-0 font-mono tabular-nums text-zinc-500">
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isPermanentlyFailed && (
          <div className="rounded-lg border border-[#2e3192]/20 bg-gradient-to-br from-[#2e3192]/8 via-[#2e3192]/5 to-[#f15a24]/8 p-3 text-left">
            <p className="text-xs font-semibold text-[#2e3192]">Maximum retake limit reached</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
              {labels.permanentlyFailedDetail}
            </p>
          </div>
        )}

        {isApprovedReview && !isPermanentlyFailed && onRestart && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-900">
                  Administrator approved your request
                </p>
                <p className="text-xs leading-relaxed text-emerald-800">
                  {reviewRequest?.approvedBy
                    ? `Approved by ${reviewRequest.approvedBy}. `
                    : ""}
                  You must complete the entire course again — all content steps and the full
                  assessment.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 w-full bg-[#2e3192] text-white hover:bg-[#3d42a8]"
              disabled={restartLoading}
              onClick={onRestart}
            >
              {restartLoading ? (
                "Preparing fresh attempt…"
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  {restartLabel}
                </>
              )}
            </Button>
          </div>
        )}

        {isPendingReview && !isPermanentlyFailed && !isApprovedReview && (
          <div className="rounded-lg border border-[#2e3192]/20 bg-[#2e3192]/5 p-3 text-left">
            <p className="text-xs font-semibold text-[#2e3192]">{labels.pendingReviewTitle}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
              {labels.pendingReviewDetail}
            </p>
          </div>
        )}

        {isRejectedReview && !isPendingReview && !isPermanentlyFailed && !isApprovedReview && (
          <div className="rounded-lg border border-[#f15a24]/25 bg-[#fff7f3] p-3 text-left">
            <p className="text-xs font-semibold text-[#f15a24]">{labels.rejectedReviewTitle}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-700">
              Admin comment: &ldquo;{reviewRequest?.adminComment || "No comments provided."}&rdquo;
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              You may submit another explanation if you have remaining retakes.
            </p>
          </div>
        )}

        {!isPermanentlyFailed && !isPendingReview && !isApprovedReview && (
          <div className="space-y-3 pt-0.5">
            {!showReviewForm ? (
              <Button
                type="button"
                variant="accent"
                className="w-full cursor-pointer text-xs font-semibold"
                onClick={onShowReviewForm}
              >
                {labels.requestReviewLabel}
              </Button>
            ) : (
              <form onSubmit={onSubmitReview} className="space-y-3 text-left">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">{labels.reasonLabel}</label>
                  <textarea
                    rows={3}
                    className="training-form-input w-full cursor-text select-text rounded-md border border-zinc-200 p-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-[#2e3192]"
                    placeholder={labels.reasonPlaceholder}
                    value={explanation}
                    onChange={(e) => onExplanationChange(e.target.value)}
                    disabled={reviewSubmitting}
                  />
                </div>
                {reviewError && (
                  <p className="text-xs font-medium text-[#f15a24]">{reviewError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={onCancelReview}
                    disabled={reviewSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="accent"
                    size="sm"
                    className="flex-1 cursor-pointer text-xs"
                    disabled={reviewSubmitting}
                  >
                    {reviewSubmitting ? "Submitting…" : "Submit Request"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {!sessionStarted && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            {labels.backToDashboardLabel}
          </Button>
        )}

        {onExitToDashboard && sessionStarted && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs text-zinc-600"
            onClick={onExitToDashboard}
          >
            {labels.exitToDashboardLabel ?? labels.backToDashboardLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
