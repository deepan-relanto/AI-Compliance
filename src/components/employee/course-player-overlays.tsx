"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import { TypedSignatureField } from "@/components/employee/typed-signature-field";
import type { ModuleStatus, ReviewRequest, WarningHistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GraduationCap,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { motion } from "framer-motion";

export function CourseAcknowledgementPanel({
  signatureName,
  signatureReady,
  ackSubmitting,
  ackSyncWarning,
  passedPending,
  onSignatureName,
  onSignatureReady,
  onBack,
  onSubmit,
}: {
  signatureName: string;
  signatureReady: boolean;
  ackSubmitting: boolean;
  ackSyncWarning: string | null;
  passedPending: boolean;
  onSignatureName: (v: string) => void;
  onSignatureReady: (v: string | null) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <motion.div
      key="ack"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-[80] flex flex-1 items-center justify-center p-6"
    >
      <div className="training-form-zone w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
        <BrandPanelHeader
          eyebrow="Step 1 of 2 · Course attestation"
          title="Training acknowledgement"
          description="Review the declaration, sign with your legal name, then continue to feedback."
          icon={GraduationCap}
          compact
        />
        <div className="space-y-6 p-6 sm:p-8">
          <ul className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/90 p-4 text-xs text-zinc-600">
            {[
              "I have completed this course material including all content steps and the assessment.",
              "I have reviewed and understood the concepts presented.",
              "I completed this course honestly and without unauthorized assistance.",
              "I understand that compliance with these guidelines is my responsibility.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-[#f15a24]">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <TypedSignatureField
            value={signatureName}
            onChange={onSignatureName}
            onSignatureReady={onSignatureReady}
            autoFocus
          />
          {ackSyncWarning && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-medium text-amber-700">
              {ackSyncWarning}
            </p>
          )}
          <div className={cn("flex flex-col gap-2", !passedPending && "sm:flex-row")}>
            {!passedPending && (
              <Button variant="outline" className="flex-1 text-xs" onClick={onBack}>
                Back
              </Button>
            )}
            <Button
              className={cn(
                "bg-[#2e3192] text-xs text-white hover:bg-[#3d42a8]",
                passedPending ? "w-full" : "flex-1",
              )}
              disabled={!signatureReady || ackSubmitting}
              onClick={onSubmit}
            >
              {ackSubmitting ? "Submitting…" : "Sign and continue to feedback"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function CourseWarningOverlay({
  reason,
  count,
  onContinue,
}: {
  reason: string;
  count: number;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-amber-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900">Warning {Math.min(count, 3)} of 3</h3>
        <p className="text-sm text-zinc-600">{reason}</p>
        <p className="text-xs font-semibold text-amber-700">
          Warnings remaining: {Math.max(0, 3 - count)}
        </p>
        <Button className="w-full bg-[#2e3192] text-white" onClick={onContinue}>
          Continue course
        </Button>
      </div>
    </div>
  );
}

export function CourseExitModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-zinc-900/60 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-zinc-900">Exit course?</h3>
        <p className="text-xs text-zinc-500">
          Leaving now ends your session. You will need to start again from the beginning.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Exit
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CourseProctorFailOverlay({
  liveWarningCount,
  liveWarningHistory,
  retakeCount,
  dbStatus,
  reviewRequest,
  showReviewForm,
  explanation,
  reviewError,
  reviewSubmitting,
  restartLoading,
  onShowReviewForm,
  onExplanation,
  onCancelReview,
  onSubmitReview,
  onRestartCourse,
  onExitToDashboard,
}: {
  liveWarningCount: number;
  liveWarningHistory: WarningHistoryEntry[];
  retakeCount: number;
  dbStatus: ModuleStatus;
  reviewRequest: ReviewRequest | null;
  showReviewForm: boolean;
  explanation: string;
  reviewError: string;
  reviewSubmitting: boolean;
  restartLoading?: boolean;
  onShowReviewForm: () => void;
  onExplanation: (v: string) => void;
  onCancelReview: () => void;
  onSubmitReview: (text: string) => void;
  onRestartCourse: () => void;
  onExitToDashboard: () => void;
}) {
  const retakesRemaining = Math.max(0, 2 - retakeCount);
  const isPendingReview = reviewRequest?.status === "Pending";
  const isApprovedReview = reviewRequest?.status === "Approved";
  const isRejectedReview = reviewRequest?.status === "Rejected";
  const isPermanentlyFailed =
    dbStatus === "permanently_failed" ||
    (liveWarningCount >= 3 && retakesRemaining <= 0 && !isApprovedReview);
  const displayWarnings = Math.min(liveWarningCount, 3);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[92] flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm">
      <div className="training-form-zone w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-2xl">
        <div className="border-b border-red-100 bg-gradient-to-r from-red-50 via-white to-amber-50 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 ring-4 ring-red-50">
              <ShieldAlert className="h-6 w-6 text-red-600" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-600">
                Proctoring lock
              </p>
              <h2 className="text-xl font-bold tracking-tight text-zinc-950">
                {isPermanentlyFailed
                  ? "Course permanently failed"
                  : isApprovedReview
                    ? "Retake approved"
                    : "Course session ended"}
              </h2>
              <p className="text-sm text-zinc-600">
                {isPermanentlyFailed
                  ? "Maximum retake limit reached. Contact your administrator."
                  : isApprovedReview
                    ? "Your administrator approved a full restart. Begin the course from the beginning."
                    : "You reached the maximum warning limit for this attempt."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">
                Warnings
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-red-700">
                {displayWarnings} / 3
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Retakes left
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-zinc-800">
                {isPermanentlyFailed ? 0 : retakesRemaining}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80">
            <p className="border-b border-zinc-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Violation log
            </p>
            <div className="max-h-28 overflow-y-auto px-3 py-2">
              {liveWarningHistory.length === 0 ? (
                <p className="py-2 text-xs text-zinc-400">No violations recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {liveWarningHistory.map((item, idx) => (
                    <li
                      key={`${item.timestamp}-${idx}`}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-medium text-zinc-700">{item.reason}</span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {isApprovedReview && !isPermanentlyFailed && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-900">Administrator approved your request</p>
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
                onClick={onRestartCourse}
              >
                {restartLoading ? (
                  "Preparing fresh attempt…"
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Restart course from beginning
                  </>
                )}
              </Button>
            </div>
          )}

          {isPendingReview && !isApprovedReview && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">Review pending</p>
                <p className="text-xs leading-relaxed text-amber-800">
                  Your explanation was submitted. An administrator will approve or reject your
                  retake request. This page updates automatically.
                </p>
              </div>
            </div>
          )}

          {isRejectedReview && !isPendingReview && !isPermanentlyFailed && !isApprovedReview && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-left">
              <p className="text-sm font-semibold text-red-900">Review request rejected</p>
              <p className="mt-1 text-xs leading-relaxed text-red-800">
                {reviewRequest?.adminComment
                  ? `Admin comment: “${reviewRequest.adminComment}”`
                  : "No comment was provided."}
              </p>
              {retakesRemaining > 0 && (
                <p className="mt-2 text-[11px] text-red-600">
                  You may submit another explanation if you believe this was a mistake.
                </p>
              )}
            </div>
          )}

          {isPermanentlyFailed && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-left text-zinc-100">
              <p className="text-sm font-semibold">No further attempts available</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                This course has reached the maximum number of proctoring retakes. Please contact
                your compliance administrator.
              </p>
            </div>
          )}

          {!isPermanentlyFailed && !isPendingReview && !isApprovedReview && (
            <div className="space-y-3">
              {!showReviewForm ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  onClick={onShowReviewForm}
                >
                  Request administrator review
                </Button>
              ) : (
                <div className="space-y-3 text-left">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Explain what happened
                  </label>
                  <textarea
                    rows={4}
                    className="training-form-input w-full resize-none rounded-lg border border-zinc-200 p-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/30"
                    placeholder="Describe why the proctoring warnings occurred and any context your administrator should know…"
                    value={explanation}
                    onChange={(e) => onExplanation(e.target.value)}
                    disabled={reviewSubmitting}
                  />
                  {reviewError && (
                    <p className="text-xs font-medium text-red-600">{reviewError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={onCancelReview}
                      disabled={reviewSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="flex-1"
                      disabled={reviewSubmitting || !explanation.trim()}
                      onClick={() => onSubmitReview(explanation.trim())}
                    >
                      {reviewSubmitting ? "Submitting…" : "Submit request"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full text-zinc-600"
            onClick={onExitToDashboard}
          >
            Return to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
