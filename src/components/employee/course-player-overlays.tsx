"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import { TypedSignatureField } from "@/components/employee/typed-signature-field";
import {
  COURSE_LOCKOUT_LABELS,
  IntegrityLockoutPanel,
} from "@/components/employee/integrity-lockout-panel";
import type { ModuleStatus, ReviewRequest, WarningHistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GraduationCap } from "lucide-react";
import { m as motion, LazyMotion, domAnimation } from "@/lib/motion";

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
    <LazyMotion features={domAnimation}>
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
            <p className="rounded-md border border-[#f15a24]/20 bg-[#fff7f3] px-3 py-2 text-[10px] font-medium text-[#f15a24]">
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
    </LazyMotion>
  );
}

export function CourseExitModal({
  onCancel,
  onConfirm,
  mode = "abandon",
  saving = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  /** abandon = legacy fail-on-exit; save = Save & Exit (progress kept). */
  mode?: "abandon" | "save";
  saving?: boolean;
}) {
  const isSave = mode === "save";
  return (
    <div className="fixed inset-0 z-[75] flex cursor-default items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-xs">
      <div className="training-form-zone w-full max-w-md overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)] animate-in fade-in zoom-in-95 duration-200">
        <BrandPanelHeader
          eyebrow={isSave ? "Save progress" : "Leave session"}
          title={isSave ? "Save and exit?" : "Exit course?"}
          description={
            isSave
              ? "Your progress will be saved. You can return anytime to continue from where you left off."
              : "You are about to leave this course session."
          }
          icon={GraduationCap}
          compact
        />
        <div className="space-y-4 p-6">
          {isSave ? (
            <ul className="list-disc space-y-1.5 rounded-lg border border-zinc-100 bg-zinc-50/90 p-4 pl-8 text-xs leading-relaxed text-zinc-600">
              <li>Your place in the course will be locked in securely.</li>
              <li>When you return, you will resume from this point.</li>
              <li>Please complete the course when you next have a focused stretch of time.</li>
            </ul>
          ) : (
            <div className="space-y-2 text-left text-xs leading-relaxed text-zinc-500">
              <p className="font-semibold text-zinc-600">If you exit now:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  This attempt will be marked as{" "}
                  <span className="font-semibold text-red-600">Failed</span>.
                </li>
                <li>
                  You will need to request administrator review before you can retake (if
                  eligible).
                </li>
              </ul>
              <p className="mt-2 font-medium text-zinc-600">Do you want to proceed?</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer border-zinc-200 text-xs text-zinc-700"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant={isSave ? "primary" : "destructive"}
              size="sm"
              className={cn(
                "cursor-pointer text-xs",
                isSave && "bg-[#2e3192] hover:bg-[#25277a]",
              )}
              onClick={onConfirm}
              disabled={saving}
            >
              {saving ? "Saving…" : isSave ? "Save & exit" : "Exit course"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CourseWelcomeBackPanel({
  learnerName,
  moduleTitle,
  onContinue,
}: {
  learnerName?: string;
  moduleTitle: string;
  onContinue: () => void;
}) {
  const greeting = learnerName?.trim()
    ? `Welcome back, ${learnerName.trim().split(/\s+/)[0]}`
    : "Welcome back";
  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-xs">
      <div className="training-form-zone w-full max-w-md overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)] animate-in fade-in zoom-in-95 duration-200">
        <BrandPanelHeader
          eyebrow="Resume course"
          title={`${greeting} — happy to see you again`}
          description={`You left off mid-way through “${moduleTitle}”. Pick up where you saved and try to complete it in one focused session.`}
          icon={GraduationCap}
          compact
        />
        <div className="space-y-4 p-6">
          <p className="text-xs leading-relaxed text-zinc-500">
            Your previous progress is ready. Continue when you can give the course your full
            attention.
          </p>
          <Button
            size="md"
            className="w-full bg-[#2e3192] text-sm hover:bg-[#25277a]"
            onClick={onContinue}
          >
            Continue course
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

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitReview(explanation.trim());
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[92] flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm">
      <IntegrityLockoutPanel
        liveWarningCount={liveWarningCount}
        liveWarningHistory={liveWarningHistory}
        retakeCount={retakeCount}
        reviewRequest={reviewRequest}
        showReviewForm={showReviewForm}
        explanation={explanation}
        reviewError={reviewError}
        reviewSubmitting={reviewSubmitting}
        isPermanentlyFailed={isPermanentlyFailed}
        isPendingReview={isPendingReview}
        isRejectedReview={isRejectedReview}
        isApprovedReview={isApprovedReview}
        restartLoading={restartLoading}
        sessionStarted
        labels={COURSE_LOCKOUT_LABELS}
        onShowReviewForm={onShowReviewForm}
        onExplanationChange={onExplanation}
        onCancelReview={onCancelReview}
        onSubmitReview={handleSubmitReview}
        onRestart={onRestartCourse}
        restartLabel="Restart course from beginning"
        onExitToDashboard={onExitToDashboard}
        className="training-form-zone pointer-events-auto w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]"
      />
    </div>
  );
}
