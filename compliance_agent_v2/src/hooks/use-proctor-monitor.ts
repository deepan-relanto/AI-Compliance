"use client";

import {
  addWarning,
  failAssessmentForAbandonment,
  getProgress,
  isProctorLocked,
  markInProgress,
} from "@/lib/progress-store";
import { syncAbandonmentFailure, syncAbandonmentFailureBeacon, syncProctorWarning } from "@/lib/progress-api";
import {
  syncCourseAbandonmentFailure,
  syncCourseAbandonmentFailureBeacon,
  syncCourseProctorWarning,
} from "@/lib/course-progress-api";
import {
  isProctorViolationReason,
  type ProctorViolationReason,
} from "@/lib/proctor/violations";
import type { ModuleStatus, WarningHistoryEntry } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const BLUR_FOCUS_LOSS_MS = 1500;
const FULLSCREEN_EXIT_DEDUPE_MS = 400;

const FULLSCREEN_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
] as const;

interface UseProctorMonitorOptions {
  /** Broad gate for tab/focus/blur monitoring */
  enabled: boolean;
  /** Narrower gate for ESC + fullscreen exit — stays true during slides & checkpoints */
  sessionActive: boolean;
  username: string | undefined;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  totalSlides: number;
  reviewOnlyMode: boolean;
  blockEscape?: boolean;
  courseMode?: boolean;
  onLockout: () => void;
  onStatusChange?: (status: ModuleStatus) => void;
}

export function useProctorMonitor({
  enabled,
  sessionActive,
  username,
  moduleId,
  moduleTitle,
  batchId,
  totalSlides,
  reviewOnlyMode,
  blockEscape = false,
  courseMode = false,
  onLockout,
  onStatusChange,
}: UseProctorMonitorOptions) {
  const [activeReason, setActiveReason] = useState<ProctorViolationReason | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [warningHistory, setWarningHistory] = useState<WarningHistoryEntry[]>([]);

  const ignoreNextFullscreenEntryRef = useRef(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExitingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const sessionActiveRef = useRef(sessionActive);
  const usernameRef = useRef(username);
  const activeReasonRef = useRef<ProctorViolationReason | null>(null);
  const lastFullscreenExitWarnAtRef = useRef(0);

  enabledRef.current = enabled;
  sessionActiveRef.current = sessionActive;
  usernameRef.current = username;
  activeReasonRef.current = activeReason;

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const recordAbandonmentFailure = useCallback(
    (reason = "Assessment abandoned", options?: { beacon?: boolean }) => {
      const user = usernameRef.current;
      if (!user || isExitingRef.current) return null;

      const progress = getProgress(user, moduleId);
      if (
        !progress ||
        progress.status === "completed" ||
        progress.status === "failed" ||
        progress.status === "permanently_failed"
      ) {
        return null;
      }

      const updated = failAssessmentForAbandonment(user, moduleId, reason);
      if (!updated) return null;

      onStatusChange?.(updated.status);

      const payload = { userEmail: user, moduleId, reason };
      if (options?.beacon) {
        if (courseMode) syncCourseAbandonmentFailureBeacon(payload);
        else syncAbandonmentFailureBeacon(payload);
      } else {
        void (courseMode ? syncCourseAbandonmentFailure(payload) : syncAbandonmentFailure(payload));
      }

      if (isProctorLocked(updated)) {
        onLockout();
      }

      return updated;
    },
    [courseMode, moduleId, onLockout, onStatusChange],
  );

  const syncWarningState = useCallback(
    (updated: ReturnType<typeof addWarning>) => {
      if (typeof updated.warningCount !== "number") return null;

      setWarningCount(updated.warningCount);
      setWarningHistory(updated.warningHistory ?? []);
      onStatusChange?.(updated.status);

      if (usernameRef.current) {
        const syncWarning = courseMode ? syncCourseProctorWarning : syncProctorWarning;
        void syncWarning({
          userEmail: usernameRef.current,
          moduleId,
          warningCount: updated.warningCount,
          warningHistory: updated.warningHistory ?? [],
          status: updated.status,
          failedReason: updated.failedReason ?? null,
        });
      }

      if (isProctorLocked(updated)) {
        setActiveReason(null);
        onLockout();
      }

      return updated;
    },
    [moduleId, onLockout, onStatusChange],
  );

  const ensureProgress = useCallback(() => {
    const user = usernameRef.current;
    if (!user) return null;

    let progress = getProgress(user, moduleId);
    if (!progress) {
      markInProgress(user, moduleId, moduleTitle, batchId, totalSlides);
      progress = getProgress(user, moduleId);
    }
    return progress;
  }, [batchId, moduleId, moduleTitle, totalSlides]);

  const recordViolation = useCallback(
    (
      reason: ProctorViolationReason,
      options?: { allowBurst?: boolean },
    ): boolean => {
      if (!enabledRef.current || isExitingRef.current || !usernameRef.current) {
        return false;
      }

      const user = usernameRef.current;
      const progress = ensureProgress();
      if (!progress) return false;

      if (progress.status === "completed") return false;

      if (
        progress.status === "permanently_failed" ||
        (isProctorLocked(progress) && (progress.warningCount ?? 0) >= 3)
      ) {
        onLockout();
        return false;
      }

      const previousCount = progress.warningCount ?? 0;
      const updated = addWarning(user, moduleId, reason, options);
      if (typeof updated.warningCount !== "number") return false;

      syncWarningState(updated);

      if (updated.warningCount > previousCount && !isProctorLocked(updated)) {
        setActiveReason(reason);
        return true;
      }

      return false;
    },
    [ensureProgress, moduleId, onLockout, syncWarningState],
  );

  const warnFullscreenExit = useCallback((): boolean => {
    if (!sessionActiveRef.current || isExitingRef.current || !usernameRef.current) {
      return false;
    }
    if (blockEscape) return false;
    if (activeReasonRef.current) return false;

    const now = Date.now();
    if (now - lastFullscreenExitWarnAtRef.current < FULLSCREEN_EXIT_DEDUPE_MS) {
      return false;
    }

    clearBlurTimeout();

    const user = usernameRef.current;
    const progress = ensureProgress();
    if (!progress) return false;
    if (progress.status === "completed") return false;
    if (
      progress.status === "permanently_failed" ||
      (isProctorLocked(progress) && (progress.warningCount ?? 0) >= 3)
    ) {
      onLockout();
      return false;
    }

    const previousCount = progress.warningCount ?? 0;
    const updated = addWarning(user, moduleId, "Exited Fullscreen", { allowBurst: true });
    if (typeof updated.warningCount !== "number") return false;

    syncWarningState(updated);

    if (updated.warningCount > previousCount && !isProctorLocked(updated)) {
      lastFullscreenExitWarnAtRef.current = now;
      setActiveReason("Exited Fullscreen");
      return true;
    }

    return false;
  }, [blockEscape, clearBlurTimeout, ensureProgress, moduleId, onLockout, syncWarningState]);

  const handleEscapeViolation = useCallback((): boolean => {
    const recorded = warnFullscreenExit();

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }

    return recorded;
  }, [warnFullscreenExit]);

  const handleWarningContinue = useCallback(async () => {
    ignoreNextFullscreenEntryRef.current = true;
    clearBlurTimeout();
    setActiveReason(null);

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* browser may block until user gesture — continue anyway */
    }
  }, [clearBlurTimeout]);

  const hydrateFromProgress = useCallback(
    (progress: {
      warningCount: number;
      warningHistory: WarningHistoryEntry[];
      status: ModuleStatus;
    } | null) => {
      if (!progress) {
        setWarningCount(0);
        setWarningHistory([]);
        setActiveReason(null);
        return;
      }
      setWarningCount(progress.warningCount ?? 0);
      setWarningHistory(progress.warningHistory ?? []);
      if (isProctorLocked(progress)) {
        onLockout();
        setActiveReason(null);
      }
    },
    [onLockout],
  );

  const isFullscreenNow = useCallback(() => {
    return Boolean(
      document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement,
    );
  }, []);

  useEffect(() => {
    if (reviewOnlyMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!sessionActiveRef.current) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      handleEscapeViolation();
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleEscapeViolation, reviewOnlyMode]);

  useEffect(() => {
    if (reviewOnlyMode) return;

    const onFullscreenChange = () => {
      if (!sessionActiveRef.current || isExitingRef.current) return;

      if (isFullscreenNow()) {
        if (ignoreNextFullscreenEntryRef.current) {
          ignoreNextFullscreenEntryRef.current = false;
        }
        return;
      }

      warnFullscreenExit();
    };

    for (const eventName of FULLSCREEN_EVENTS) {
      document.addEventListener(eventName, onFullscreenChange);
      window.addEventListener(eventName, onFullscreenChange);
    }

    return () => {
      for (const eventName of FULLSCREEN_EVENTS) {
        document.removeEventListener(eventName, onFullscreenChange);
        window.removeEventListener(eventName, onFullscreenChange);
      }
    };
  }, [isFullscreenNow, reviewOnlyMode, warnFullscreenExit]);

  useEffect(() => {
    if (reviewOnlyMode) return;

    const onVisibilityChange = () => {
      if (!enabledRef.current || isExitingRef.current) return;
      if (document.visibilityState !== "hidden") return;

      clearBlurTimeout();
      recordViolation("Switched Browser Tab");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [clearBlurTimeout, recordViolation, reviewOnlyMode]);

  useEffect(() => {
    if (reviewOnlyMode) return;

    const onBlur = () => {
      if (!enabledRef.current || isExitingRef.current) return;
      if (document.visibilityState === "hidden") return;

      clearBlurTimeout();
      blurTimeoutRef.current = setTimeout(() => {
        if (!enabledRef.current || document.visibilityState === "hidden") return;
        recordViolation("Window Lost Focus");
      }, BLUR_FOCUS_LOSS_MS);
    };

    const onFocus = () => clearBlurTimeout();

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearBlurTimeout();
    };
  }, [clearBlurTimeout, recordViolation, reviewOnlyMode]);

  useEffect(() => {
    if (reviewOnlyMode || !username) return;

    const onBeforeUnload = () => {
      if (isExitingRef.current || !sessionActiveRef.current) return;
      recordAbandonmentFailure("Assessment abandoned", { beacon: true });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [moduleId, recordAbandonmentFailure, reviewOnlyMode, username]);

  return {
    activeReason,
    warningCount,
    warningHistory,
    handleWarningContinue,
    handleEscapeViolation,
    recordViolation,
    recordAbandonmentFailure,
    hydrateFromProgress,
    isExitingRef,
    ignoreNextFullscreenEntryRef,
  };
}

export function toProctorViolationReason(reason: string | null): ProctorViolationReason | null {
  if (!reason || !isProctorViolationReason(reason)) return null;
  return reason;
}
