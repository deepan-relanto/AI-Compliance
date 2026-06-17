/**
 * progress-store.ts
 *
 * Lightweight localStorage-backed progress tracking.
 * Follows the same pattern as the uploaded-assessment store in mock-data.ts.
 * Key: "compliance-progress"
 * Shape: Record<"username|moduleId", AssessmentProgress>
 */

import type { ModuleStatus, WarningHistoryEntry, AssessmentAcknowledgement } from "./types";
import { logAudit } from "./audit-store";
import { isPassingScore } from "./constants";

export interface AssessmentProgress {
  username: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  currentSlide: number;   // 0-based index of last viewed slide
  totalSlides: number;
  status: ModuleStatus;
  lastAccessedAt: number; // Unix ms
  completedAt?: number;   // Unix ms, only set when status === "completed"
  warningCount: number;
  warningHistory: WarningHistoryEntry[];
  failedAt?: number;
  failedReason?: string;
  retakeCount: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
  archivedWarnings: { attempt: number; warnings: WarningHistoryEntry[] }[];
  acknowledgement?: AssessmentAcknowledgement;
  mcqCorrect?: number;
  mcqTotal?: number;
  scorePercent?: number | null;
}

const STORE_KEY = "compliance-progress";
const WARNING_COOLDOWN_MS = 5000;


// ── Low-level helpers ─────────────────────────────────────────────────────────

export function readAll(): Record<string, AssessmentProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AssessmentProgress>) : {};
  } catch {
    return {};
  }
}

export function writeAll(data: Record<string, AssessmentProgress>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function key(username: string, moduleId: string): string {
  return `${username}|${moduleId}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Proctor/warning lock — not the same as a below-passing quiz score. */
export function isProctorLocked(entry: {
  status: ModuleStatus;
  scorePercent?: number | null;
}): boolean {
  return (
    entry.status === "permanently_failed" ||
    (entry.status === "failed" && entry.scorePercent == null)
  );
}

/** Map legacy score failures stored as `failed` to learner-facing in progress. */
export function normalizeLearnerStatus(
  status: ModuleStatus,
  scorePercent?: number | null,
  completedAt?: number | null,
): ModuleStatus {
  if (status === "permanently_failed" || status === "completed") return status;
  if (completedAt) return "completed";
  if (status === "failed" && scorePercent != null) return "in_progress";
  if (scorePercent != null && status === "not_started") return "in_progress";
  return status;
}

/**
 * Called when the assessment viewer mounts (user opens the assessment).
 * Creates an "in_progress" record if none exists; leaves completed / proctor-locked alone.
 */
export function markInProgress(
  username: string,
  moduleId: string,
  moduleTitle: string,
  batchId: string,
  totalSlides: number,
): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];

  if (existing && (existing.status === "completed" || isProctorLocked(existing))) {
    return;
  }

  const isNew = !existing;
  const isRetake = existing?.status === "not_started" && (existing?.retakeCount ?? 0) > 0;

  all[k] = {
    username,
    moduleId,
    moduleTitle,
    batchId,
    currentSlide: existing?.currentSlide ?? 0,
    totalSlides,
    status: "in_progress",
    lastAccessedAt: Date.now(),
    completedAt: existing?.completedAt,
    warningCount: existing?.warningCount ?? 0,
    warningHistory: existing?.warningHistory ?? [],
    failedAt: existing?.failedAt,
    failedReason: existing?.failedReason,
    retakeCount: existing?.retakeCount ?? 0,
    lastFailureAt: existing?.lastFailureAt,
    lastFailureReason: existing?.lastFailureReason,
    archivedWarnings: existing?.archivedWarnings ?? [],
  };
  writeAll(all);

  if (isNew) {
    logAudit("Assessment Started", username, `Started initial attempt of ${moduleTitle}`);
  } else if (isRetake) {
    logAudit("Retake Started", username, `Started Retake #${existing?.retakeCount} of ${moduleTitle}`);
  }
}

/**
 * Called on every page navigation inside the viewer.
 */
export function saveSlideProgress(
  username: string,
  moduleId: string,
  currentSlide: number,
): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing || existing.status === "completed" || existing.status === "failed" || existing.status === "permanently_failed") return;

  all[k] = {
    ...existing,
    currentSlide,
    lastAccessedAt: Date.now(),
  };
  writeAll(all);
}

/**
 * Called when the user reaches the final QA/feedback screen.
 */
export function markCompleted(username: string, moduleId: string): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing || existing.status === "failed" || existing.status === "permanently_failed") return;

  all[k] = {
    ...existing,
    status: "completed",
    currentSlide: existing.totalSlides - 1,
    lastAccessedAt: Date.now(),
    completedAt: Date.now(),
  };
  writeAll(all);

  logAudit("Assessment Completed", username, `Successfully completed ${existing.moduleTitle}.`);
}

/**
 * Saves training acknowledgement record for a user and module.
 * If feedback is NOT required, marks the assessment as completed.
 */
export function saveAcknowledgement(
  username: string,
  moduleId: string,
  feedbackRequired: boolean = false,
  attestation?: { signatureName: string; digitalSignature: string },
): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing || existing.status === "failed" || existing.status === "permanently_failed") return;

  const timestamp = Date.now();
  const ack: AssessmentAcknowledgement = {
    userId: username,
    userName: attestation?.signatureName ?? username,
    signerEmail: username,
    assessmentId: moduleId,
    assessmentName: existing.moduleTitle,
    accepted: true,
    timestamp,
    digitalSignature: attestation?.digitalSignature,
  };

  all[k] = {
    ...existing,
    acknowledgement: ack,
    lastAccessedAt: timestamp,
  };

  if (!feedbackRequired) {
    all[k].status = "completed";
    all[k].completedAt = timestamp;
  }

  writeAll(all);

  logAudit("Acknowledgement Accepted", username, `Accepted training acknowledgement for ${existing.moduleTitle}.`);
  if (!feedbackRequired) {
    logAudit("Assessment Completed", username, `Successfully completed ${existing.moduleTitle}.`);
  }
}

/**
 * Returns the progress record for a specific user + module, or undefined.
 */
export function getProgress(
  username: string,
  moduleId: string,
): AssessmentProgress | undefined {
  return readAll()[key(username, moduleId)];
}

/**
 * Returns the ModuleStatus for a user+module pair.
 * Falls back to "not_started" if no record exists.
 */
export function getModuleStatus(
  username: string,
  moduleId: string,
): ModuleStatus {
  return getProgress(username, moduleId)?.status ?? "not_started";
}

/**
 * Returns all progress records for a given batch (for admin view).
 */
export function getProgressForBatchLive(batchId: string): AssessmentProgress[] {
  return Object.values(readAll()).filter((p) => p.batchId === batchId);
}

/**
 * Returns all progress records for a given user.
 */
export function getProgressForUser(username: string): AssessmentProgress[] {
  return Object.values(readAll()).filter((p) => p.username === username);
}

/**
 * Returns all progress records in the system.
 */
export function getAllProgressRecords(): AssessmentProgress[] {
  return Object.values(readAll());
}

/**
 * Increments warning count, logs history, and handles automatic failure at >= 3 warnings.
 * Uses a warning cooldown to prevent multiple logs for a single user action.
 */
export function addWarning(
  username: string,
  moduleId: string,
  reason: string,
): AssessmentProgress {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];

  if (!existing) {
    // If warning triggered before markInProgress for some reason, skeleton
    return {} as AssessmentProgress;
  }

  // If already failed, completed, or permanently failed, do not record further warnings
  if (
    existing.status === "failed" ||
    existing.status === "completed" ||
    existing.status === "permanently_failed"
  ) {
    return existing;
  }

  // Cooldown check: ignore if warning logged within last 5 seconds
  if (existing.warningHistory && existing.warningHistory.length > 0) {
    const lastWarning = existing.warningHistory[existing.warningHistory.length - 1];
    const diff = Date.now() - lastWarning.timestamp;
    if (diff < WARNING_COOLDOWN_MS) {
      return existing;
    }
  }

  const newCount = (existing.warningCount ?? 0) + 1;
  const newHistory = [
    ...(existing.warningHistory ?? []),
    { reason, timestamp: Date.now() },
  ];

  const willFail = newCount >= 3;
  const isPermanent = willFail && (existing.retakeCount ?? 0) >= 2;
  const finalStatus = isPermanent
    ? "permanently_failed"
    : willFail
      ? "failed"
      : existing.status;

  all[k] = {
    ...existing,
    warningCount: newCount,
    warningHistory: newHistory,
    lastAccessedAt: Date.now(),
    status: finalStatus,
    failedAt: willFail ? Date.now() : existing.failedAt,
    failedReason: isPermanent
      ? "Maximum retake limit reached"
      : willFail
        ? "Maximum warning limit reached"
        : existing.failedReason,
    lastFailureAt: willFail ? Date.now() : existing.lastFailureAt,
    lastFailureReason: isPermanent
      ? "Maximum retake limit reached"
      : willFail
        ? "Maximum warning limit reached"
        : existing.lastFailureReason,
  };

  writeAll(all);

  // Log audits
  logAudit("Warning Issued", username, `Violation warning issued for ${existing.moduleTitle}. Reason: ${reason}`);

  if (isPermanent) {
    logAudit("Assessment Failed", username, `Failed attempt #${(existing.retakeCount ?? 0) + 1} of ${existing.moduleTitle}`);
    logAudit("Retake Limit Reached", username, `Maximum retakes exhausted for ${existing.moduleTitle}`);
    logAudit("Assessment Permanently Failed", username, `Assessment ${existing.moduleTitle} is permanently failed.`);
  } else if (willFail) {
    logAudit("Assessment Failed", username, `Failed attempt #${(existing.retakeCount ?? 0) + 1} of ${existing.moduleTitle}. Reached maximum warning count.`);
  }

  return all[k];
}

export function markAssessmentFailed(
  username: string,
  moduleId: string,
  reason: string,
): AssessmentProgress {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing) return {} as AssessmentProgress;

  const isPermanent = (existing.retakeCount ?? 0) >= 2;
  const status = isPermanent ? "permanently_failed" : "failed";

  all[k] = {
    ...existing,
    status,
    failedAt: Date.now(),
    failedReason: reason,
    lastFailureAt: Date.now(),
    lastFailureReason: reason,
    lastAccessedAt: Date.now(),
  };

  writeAll(all);
  return all[k];
}

/**
 * Returns the current warning count and full warning logs.
 */
export function getWarningStatus(
  username: string,
  moduleId: string,
): { warningCount: number; warningHistory: WarningHistoryEntry[] } {
  const p = getProgress(username, moduleId);
  return {
    warningCount: p?.warningCount ?? 0,
    warningHistory: p?.warningHistory ?? [],
  };
}

/** Apply server-side progress into local store (dashboard + post-approval sync). */
export function mergeServerProgress(
  username: string,
  entries: {
    moduleId: string;
    moduleTitle: string;
    batchId: string;
    currentSlide: number;
    totalSlides: number;
    status: ModuleStatus;
    retakeCount: number;
    mcqCorrect: number;
    mcqTotal: number;
    scorePercent: number | null;
    warningCount?: number;
    failedReason?: string | null;
    completedAt?: string | null;
  }[],
): void {
  const all = readAll();
  for (const e of entries) {
    const k = key(username, e.moduleId);
    const existing = all[k];
    const serverWarnings = e.warningCount ?? existing?.warningCount ?? 0;
    const serverReset =
      e.status === "not_started" &&
      serverWarnings === 0 &&
      (e.retakeCount > (existing?.retakeCount ?? 0) || existing?.status === "failed");

    all[k] = {
      username,
      moduleId: e.moduleId,
      moduleTitle: e.moduleTitle,
      batchId: e.batchId,
      currentSlide: e.currentSlide,
      totalSlides: e.totalSlides,
      status: normalizeLearnerStatus(
        e.status,
        e.scorePercent,
        e.completedAt ? new Date(e.completedAt).getTime() : undefined,
      ),
      lastAccessedAt: existing?.lastAccessedAt ?? Date.now(),
      completedAt: e.completedAt
        ? new Date(e.completedAt).getTime()
        : serverReset
          ? undefined
          : existing?.completedAt,
      warningCount: serverWarnings,
      warningHistory: serverReset ? [] : existing?.warningHistory ?? [],
      retakeCount: e.retakeCount,
      failedReason: serverReset ? undefined : e.failedReason ?? existing?.failedReason,
      failedAt: serverReset ? undefined : existing?.failedAt,
      archivedWarnings: existing?.archivedWarnings ?? [],
      mcqCorrect: e.mcqCorrect,
      mcqTotal: e.mcqTotal,
      scorePercent: serverReset ? null : e.scorePercent,
      acknowledgement: serverReset ? undefined : existing?.acknowledgement,
    };
  }
  writeAll(all);
}

export function applyScoreResult(
  username: string,
  moduleId: string,
  result: {
    scorePercent: number;
    passed: boolean;
    mcqCorrect: number;
    mcqTotal: number;
    failedReason?: string;
  },
): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing) return;

  const now = Date.now();
  all[k] = {
    ...existing,
    mcqCorrect: result.mcqCorrect,
    mcqTotal: result.mcqTotal,
    scorePercent: result.scorePercent,
    status: "in_progress",
    failedReason: result.passed ? undefined : result.failedReason,
    lastFailureAt: result.passed ? existing.lastFailureAt : now,
    lastFailureReason: result.passed ? existing.lastFailureReason : result.failedReason,
    completedAt: undefined,
    acknowledgement: result.passed ? undefined : existing.acknowledgement,
    lastAccessedAt: now,
  };
  writeAll(all);

  if (!result.passed) {
    logAudit(
      "Score Below Threshold",
      username,
      `Scored ${result.scorePercent}% on ${existing.moduleTitle} (attempt ${(existing.retakeCount ?? 0) + 1}).`,
    );
  }
}

/** Reset local progress after an admin-approved proctor retake. */
export function resetForProctorRetake(username: string, moduleId: string): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing) return;

  all[k] = {
    ...existing,
    status: "not_started",
    currentSlide: 0,
    warningCount: 0,
    warningHistory: [],
    failedAt: undefined,
    failedReason: undefined,
    mcqCorrect: 0,
    scorePercent: null,
    completedAt: undefined,
    acknowledgement: undefined,
    lastAccessedAt: Date.now(),
  };
  writeAll(all);
}

/** Reset local progress when starting a fresh attempt (no resume). */
export function resetLocalAttempt(username: string, moduleId: string): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing) return;

  all[k] = {
    ...existing,
    status: "in_progress",
    currentSlide: 0,
    mcqCorrect: 0,
    scorePercent: null,
    failedReason: undefined,
    completedAt: undefined,
    lastAccessedAt: Date.now(),
  };
  writeAll(all);
}

/** Reset local progress for a score-based retake. */
export function resetForScoreRetake(username: string, moduleId: string): void {
  const all = readAll();
  const k = key(username, moduleId);
  const existing = all[k];
  if (!existing) return;

  all[k] = {
    ...existing,
    status: "in_progress",
    currentSlide: 0,
    mcqCorrect: 0,
    mcqTotal: existing.mcqTotal ?? 0,
    scorePercent: null,
    failedReason: undefined,
    completedAt: undefined,
    acknowledgement: undefined,
    retakeCount: (existing.retakeCount ?? 0) + 1,
    lastAccessedAt: Date.now(),
  };
  writeAll(all);
}

