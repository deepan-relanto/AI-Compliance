"use client";

import { FinalQaForm } from "@/components/employee/final-qa-form";
import { BadgeUnlock, type GamificationBadge } from "@/components/employee/badge-unlock";
import { FinalResultScreen } from "@/components/employee/final-result-screen";
import { MCQCheckpoint } from "@/components/employee/mcq-checkpoint";
import { ProgressBar } from "@/components/employee/progress-bar";
import { ScoreDisplay } from "@/components/employee/score-display";
import { StreakCounter } from "@/components/employee/streak-counter";
import { TypedSignatureField } from "@/components/employee/typed-signature-field";
import { CompletionNotice } from "@/components/employee/completion-notice";
import { EncouragementRetakeNotice } from "@/components/employee/encouragement-retake-notice";
import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { isValidSignatureName, normalizeSignatureName } from "@/lib/signature-canvas";
import { RelantoLogo } from "@/components/brand/relanto-logo";
import { Button } from "@/components/ui/button";
import type { McqQuestion, TrainingModule, WarningHistoryEntry, ReviewRequest, ModuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ProctorRulesModal } from "@/components/employee/proctor-rules-modal";
import { ChevronLeft, ChevronRight, Clock, FileText, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  markInProgress,
  isProctorLocked,
  markCompleted,
  getProgress,
  addWarning,
  saveAcknowledgement,
  applyScoreResult,
  resetForScoreRetake,
} from "@/lib/progress-store";
import {
  syncAcknowledgement,
  syncProgressStart,
  syncProgressComplete,
  finalizeAssessmentScore,
  requestScoreRetake,
} from "@/lib/progress-api";
import { PASS_THRESHOLD_PERCENT, POINTS_PER_MCQ } from "@/lib/constants";
import { getAllReviewRequests } from "@/lib/review-store";
import {
  fetchLatestReviewRequest,
  submitReviewRequestApi,
} from "@/lib/review-api";

// Isolated client-only PDF renderer — dynamically imported so pdfjs-dist is
// never bundled into the SSR pass (fixes "Object.defineProperty called on
// non-object" which happens when Webpack eval wraps pdfjs ESM modules).
const PdfPageViewer = dynamic(
  () => import("@/components/employee/pdf-page-viewer").then((m) => m.PdfPageViewer),
  { ssr: false },
);

const SLIDES_BETWEEN_GATES = 3;

const FALLBACK_MCQ: McqQuestion = {
  id: "gate-fallback",
  slideIndex: -1,
  prompt: "No checkpoint question is available for this slide. Select any option to continue.",
  options: [
    { id: "a", label: "Continue training" },
    { id: "b", label: "Continue training (alternate)" },
    { id: "c", label: "Continue training (alternate 2)" },
    { id: "d", label: "Continue training (alternate 3)" },
  ],
};

const GAMIFICATION_BADGES: Record<string, GamificationBadge> = {
  starter: {
    id: "starter",
    name: "Compliance Starter",
    description: "First checkpoint completed.",
  },
  quickLearner: {
    id: "quickLearner",
    name: "50% Milestone",
    description: "You're halfway through this training module.",
  },
  streakMaster: {
    id: "streakMaster",
    name: "3-Streak Master",
    description: "Three checkpoint answers correct in a row.",
  },
  champion: {
    id: "champion",
    name: "Compliance Champion",
    description: "Scored 80% or above.",
  },
  perfect: {
    id: "perfect",
    name: "Perfect Performer",
    description: "Scored 100%.",
  },
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface SlideViewerProps {
  module: TrainingModule;
  mcqs?: McqQuestion[];
  freshStart?: boolean;
}

export function SlideViewer({ module, mcqs = [], freshStart = false }: SlideViewerProps) {
  const user = useAuthStore((s) => s.user);

  // PDF modules: slides array drives the progress bar + navigation counts.
  // Real page count is detected by react-pdf and updates this via setNumPages.
  const [numPages, setNumPages] = useState<number>(module.slideCount);
  const slides =
    module.contentType === "pdf"
      ? Array.from({ length: numPages }, (_, i) => `Page ${i + 1}`)
      : [`${module.title} — content`];
  const totalSlides = slides.length;
  const moduleMcqs = mcqs;
  const quizOnlyModeFromModule = module.viewerMode === "quiz_only_retake";
  const reviewOnlyMode = module.viewerMode === "review_only";
  const ackPendingMode = module.viewerMode === "acknowledgement_pending";
  const autoStartSession = reviewOnlyMode || quizOnlyModeFromModule || ackPendingMode;

  // ── Fix: initialize from saved progress ──────────────────────────────────
  // useState lazy initializer runs once at mount. Reading localStorage here
  // is safe because SlideViewer is a client-only component (ssr:false import).
  const [slideIndex, setSlideIndex] = useState(0);

  const [nextClickCount, setNextClickCount] = useState(0);
  const [mcqOpen, setMcqOpen] = useState(false);
  const [gateMcq, setGateMcq] = useState<McqQuestion>(FALLBACK_MCQ);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFinalQa, setShowFinalQa] = useState(false);
  const [showAcknowledgement, setShowAcknowledgement] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [ackSubmitting, setAckSubmitting] = useState(false);
  const [ackSyncWarning, setAckSyncWarning] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState<{
    title: string;
    message: string;
    acknowledgeLabel?: string;
    variant?: "success" | "info";
    autoCloseAfterMs?: number;
    showAcknowledgeButton?: boolean;
    onAcknowledge: () => void;
  } | null>(null);

  const resetAcknowledgementForm = useCallback(() => {
    setSignatureName("");
    setSignatureDataUrl(null);
    setAckSubmitting(false);
    setAckSyncWarning(null);
  }, []);

  const signatureReady =
    isValidSignatureName(normalizeSignatureName(signatureName)) && !!signatureDataUrl;

  // ── Integrity Monitoring State ──────────────────────────────────────────
  const [liveWarningCount, setLiveWarningCount] = useState<number>(() => {
    if (!user?.username) return 0;
    const progress = getProgress(user.username, module.id);
    return progress?.warningCount ?? 0;
  });

  const [liveWarningHistory, setLiveWarningHistory] = useState<WarningHistoryEntry[]>(() => {
    if (!user?.username) return [];
    const progress = getProgress(user.username, module.id);
    return progress?.warningHistory ?? [];
  });

  const [isFailed, setIsFailed] = useState<boolean>(() => {
    if (!user?.username) return false;
    const progress = getProgress(user.username, module.id);
    return progress ? isProctorLocked(progress) : false;
  });

  const [activeWarningReason, setActiveWarningReason] = useState<string | null>(null);

  // ── Integrity Enhancement States ─────────────────────────────────────────
  const [retakeCount, setRetakeCount] = useState<number>(0);
  const [dbStatus, setDbStatus] = useState<ModuleStatus>("in_progress");
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showProctorRules, setShowProctorRules] = useState(!autoStartSession);
  const [sessionStarted, setSessionStarted] = useState(autoStartSession);
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showScoreResult, setShowScoreResult] = useState(false);
  const [scoreResult, setScoreResult] = useState<{
    scorePercent: number;
    passed: boolean;
    canRetake: boolean;
    mcqCorrect: number;
    mcqTotal: number;
  } | null>(null);
  const [retakeLoading, setRetakeLoading] = useState(false);
  const [quizOnlyIndex, setQuizOnlyIndex] = useState(0);
  const [forceQuizOnlyRetake, setForceQuizOnlyRetake] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<GamificationBadge[]>([]);
  const [badgePopup, setBadgePopup] = useState<GamificationBadge | null>(null);

  const loadIntegrityState = useCallback(async () => {
    if (!user?.username) return;

    const prog = getProgress(user.username, module.id);
    if (prog) {
      setRetakeCount(prog.retakeCount ?? 0);
      setDbStatus(prog.status);
      setIsFailed(isProctorLocked(prog));
    }

    try {
      const latest = await fetchLatestReviewRequest(user.username, module.id);
      setReviewRequest(latest);
    } catch {
      const requests = getAllReviewRequests();
      const userReqs = requests.filter(
        (r) => r.username === user.username && r.moduleId === module.id,
      );
      setReviewRequest(userReqs.length > 0 ? userReqs[0] : null);
    }
  }, [user?.username, module.id]);

  useEffect(() => {
    loadIntegrityState();
  }, [loadIntegrityState]);

  const isExitingRef = useRef(false);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const proctorGraceUntilRef = useRef(0);
  const earnedBadgeIdsRef = useRef<Set<string>>(new Set());
  const badgeQueueRef = useRef<GamificationBadge[]>([]);
  const badgeShowingRef = useRef(false);
  const answeredQuestionIdsRef = useRef(new Set<string>());

  const isLastSlide = slideIndex === totalSlides - 1;
  const gateIndex = useMemo(
    () => Math.floor(nextClickCount / SLIDES_BETWEEN_GATES),
    [nextClickCount],
  );
  const quizOnlyMode = quizOnlyModeFromModule || forceQuizOnlyRetake;

  /** Proctor tab/focus/fullscreen checks only during active slide/quiz training. */
  const proctorMonitorsActive = useMemo(
    () =>
      sessionStarted &&
      !reviewOnlyMode &&
      !quizOnlyMode &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult &&
      !showExitModal &&
      !isFailed,
    [
      sessionStarted,
      reviewOnlyMode,
      quizOnlyMode,
      showAcknowledgement,
      showFinalQa,
      showScoreResult,
      showExitModal,
      isFailed,
    ],
  );

  const activeQuiz = quizOnlyMode ? moduleMcqs[quizOnlyIndex] : null;
  const totalQuestions = moduleMcqs.length;
  const totalPossibleScore = totalQuestions * POINTS_PER_MCQ;
  const liveScore = correctAnswers * POINTS_PER_MCQ;
  const rawProgressPercent = useMemo(() => {
    if (reviewOnlyMode) return 100;
    if (quizOnlyMode) {
      return totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    }
    const totalSteps = totalSlides + totalQuestions;
    const completedSteps = Math.min(totalSlides, slideIndex + 1) + answeredCount;
    return totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  }, [
    answeredCount,
    quizOnlyMode,
    reviewOnlyMode,
    slideIndex,
    totalQuestions,
    totalSlides,
  ]);
  const progressPercent =
    showScoreResult || showAcknowledgement || showFinalQa
      ? 100
      : Math.min(100, Math.max(0, Math.round(rawProgressPercent)));

  const showNextBadge = useCallback(() => {
    if (badgeShowingRef.current) return;
    const next = badgeQueueRef.current.shift();
    if (!next) return;
    badgeShowingRef.current = true;
    setBadgePopup(next);
  }, []);

  const handleBadgeDismiss = useCallback(() => {
    badgeShowingRef.current = false;
    setBadgePopup(null);
    window.setTimeout(showNextBadge, 280);
  }, [showNextBadge]);

  /** Show queued badges after checkpoint closes (not while MCQ modal is open). */
  const scheduleBadgeFlush = useCallback(
    (delayMs = 400) => {
      window.setTimeout(() => {
        if (badgeShowingRef.current) return;
        showNextBadge();
      }, delayMs);
    },
    [showNextBadge],
  );

  const unlockBadge = useCallback(
    (badgeId: keyof typeof GAMIFICATION_BADGES) => {
      if (earnedBadgeIdsRef.current.has(badgeId)) return;
      const badge = GAMIFICATION_BADGES[badgeId];
      earnedBadgeIdsRef.current.add(badgeId);
      setEarnedBadges((current) => [...current, badge]);
      badgeQueueRef.current.push(badge);
    },
    [],
  );

  useEffect(() => {
    if (mcqOpen || showAcknowledgement || showFinalQa) return;
    if (badgeShowingRef.current || badgeQueueRef.current.length === 0) return;
    scheduleBadgeFlush(300);
  }, [
    mcqOpen,
    showAcknowledgement,
    showFinalQa,
    earnedBadges.length,
    scheduleBadgeFlush,
  ]);

  const resetGamificationState = useCallback(() => {
    setAnsweredCount(0);
    setCorrectAnswers(0);
    setCurrentStreak(0);
    setBestStreak(0);
    setEarnedBadges([]);
    setBadgePopup(null);
    earnedBadgeIdsRef.current = new Set();
    badgeQueueRef.current = [];
    badgeShowingRef.current = false;
  }, []);

  useEffect(() => {
    if (!reviewOnlyMode && progressPercent >= 50) {
      unlockBadge("quickLearner");
    }
  }, [progressPercent, reviewOnlyMode, unlockBadge]);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      setIsFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (!sessionStarted || reviewOnlyMode || quizOnlyModeFromModule) return;
    enterFullscreen();
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [sessionStarted, reviewOnlyMode, quizOnlyModeFromModule, enterFullscreen]);

  useEffect(() => {
    if (!sessionStarted || sessionStartMs === null) return;
    const tick = () => setElapsedMs(Date.now() - sessionStartMs);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionStarted, sessionStartMs]);

  const handleBeginSession = () => {
    setShowProctorRules(false);
    setSessionStarted(true);
    setSessionStartMs(Date.now());
    enterFullscreen();
  };

  useEffect(() => {
    if (!autoStartSession) return;
    // Review / quiz-only retake: skip proctor rules and slide deck; go straight to content.
    setShowProctorRules(false);
    setSessionStarted(true);
    if (sessionStartMs === null) {
      setSessionStartMs(Date.now());
    }
  }, [autoStartSession, sessionStartMs]);

  const handleWarningContinue = useCallback(async () => {
    proctorGraceUntilRef.current = Date.now() + 2500;
    setActiveWarningReason(null);
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }

    const shouldRestoreFullscreen =
      sessionStarted &&
      !reviewOnlyMode &&
      !quizOnlyMode &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult;

    if (!shouldRestoreFullscreen) return;

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch {
      setIsFullscreen(false);
    }
  }, [
    sessionStarted,
    reviewOnlyMode,
    quizOnlyMode,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
  ]);

  const triggerWarning = useCallback((reason: string) => {
    if (
      !proctorMonitorsActive ||
      isExitingRef.current ||
      !user?.username
    ) {
      return;
    }

    // Check progress status before logging warning
    const currentProgress = getProgress(user.username, module.id);
    if (
      currentProgress &&
      (currentProgress.status === "completed" || isProctorLocked(currentProgress))
    ) {
      return;
    }

    // Call addWarning in store (includes the 5s cooldown check inside)
    const updated = addWarning(user.username, module.id, reason);

    setLiveWarningCount(updated.warningCount);
    setLiveWarningHistory(updated.warningHistory);

    if (isProctorLocked(updated)) {
      setIsFailed(true);
      setActiveWarningReason(null);
      void loadIntegrityState();
    } else if (updated.warningCount !== liveWarningCount) {
      // Show warning modal only if warning count was actually incremented (i.e. not on cooldown)
      setActiveWarningReason(reason);
    }
  }, [
    proctorMonitorsActive,
    user?.username,
    module.id,
    liveWarningCount,
    loadIntegrityState,
  ]);

  useEffect(() => {
    const onFsChange = () => {
      if (!proctorMonitorsActive || isExitingRef.current || isFailed) return;
      if (Date.now() < proctorGraceUntilRef.current) return;
      if (document.fullscreenElement === null) {
        setIsFullscreen(false);
        triggerWarning("Exited Fullscreen");
      } else {
        setIsFullscreen(true);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [triggerWarning, isFailed, proctorMonitorsActive]);

  // ── Tab Switch / Visibility Monitoring ───────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!proctorMonitorsActive || isExitingRef.current || isFailed) return;
      if (Date.now() < proctorGraceUntilRef.current) return;
      if (document.visibilityState === "hidden") {
        triggerWarning("Switched Browser Tab");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [triggerWarning, isFailed, proctorMonitorsActive]);

  // ── Window Focus Defocus Grace Period Monitoring ────────────────────────
  useEffect(() => {
    const handleBlur = () => {
      if (!proctorMonitorsActive || isExitingRef.current || isFailed) return;
      if (Date.now() < proctorGraceUntilRef.current) return;
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        triggerWarning("Window Lost Focus");
      }, 3000); // 3-second grace period
    };

    const handleFocus = () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    };
  }, [triggerWarning, isFailed, proctorMonitorsActive]);

  // ── Navigation (Refresh / Leave page) Monitoring ─────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (reviewOnlyMode || isExitingRef.current || !user?.username) return;
      const currentProgress = getProgress(user.username, module.id);
      if (
        currentProgress &&
        (currentProgress.status === "completed" || isProctorLocked(currentProgress))
      ) {
        return;
      }

      // Record warning synchronously in localStorage before exit
      addWarning(user.username, module.id, "Attempted Navigation");

      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [reviewOnlyMode, user?.username, module.id]);

  // ── Progress tracking ────────────────────────────────────────────────────
  // Mark in_progress when the viewer mounts (user opened the assessment).
  useEffect(() => {
    if (user?.username) {
      markInProgress(
        user.username,
        module.id,
        module.title,
        user.batchId,
        totalSlides,
      );
      void syncProgressStart({
        userEmail: user.username,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        assignedMcqCount: moduleMcqs.length,
        freshStart,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, module.id, moduleMcqs.length, freshStart]);

  // Assessments are one-time: do not persist slide position for resume.

  const openGate = useCallback(() => {
    const gateSlot = Math.min(
      Math.max(gateIndex, 0),
      Math.max(moduleMcqs.length - 1, 0),
    );
    const mcq =
      moduleMcqs[gateSlot] ??
      moduleMcqs.find((q) => q.slideIndex === slideIndex + 1) ??
      FALLBACK_MCQ;
    setGateMcq(mcq);
    setMcqOpen(true);
  }, [moduleMcqs, slideIndex, gateIndex]);

  const handleFinishAttempt = useCallback(async () => {
    if (reviewOnlyMode) {
      isExitingRef.current = true;
      window.location.href = "/dashboard";
      return;
    }
    if (!user?.username) {
      setShowAcknowledgement(true);
      return;
    }

    const result = await finalizeAssessmentScore(user.username, module.id);
    if (result) {
      if (result.scorePercent >= 80) unlockBadge("champion");
      if (result.scorePercent === 100) unlockBadge("perfect");
      setScoreResult(result);
      applyScoreResult(user.username, module.id, {
        scorePercent: result.scorePercent,
        passed: result.passed,
        mcqCorrect: result.mcqCorrect,
        mcqTotal: result.mcqTotal,
        failedReason: result.passed
          ? undefined
          : `Score ${result.scorePercent}% is below the passing threshold (${PASS_THRESHOLD_PERCENT}%).`,
      });
      const prog = getProgress(user.username, module.id);
      if (prog) setRetakeCount(prog.retakeCount ?? 0);
      setMcqOpen(false);
      setShowAcknowledgement(false);
      setShowFinalQa(false);
      setCompletionNotice(null);
      setShowScoreResult(true);
      scheduleBadgeFlush(450);
      return;
    }
    setMcqOpen(false);
    resetAcknowledgementForm();
    setShowAcknowledgement(true);
  }, [
    reviewOnlyMode,
    user?.username,
    module.id,
    unlockBadge,
    resetAcknowledgementForm,
    scheduleBadgeFlush,
  ]);

  const tryAdvance = useCallback(() => {
    if (quizOnlyMode) {
      if (!moduleMcqs.length) {
        void handleFinishAttempt();
        return;
      }
      const quiz = activeQuiz ?? moduleMcqs[0] ?? FALLBACK_MCQ;
      if (answeredQuestionIdsRef.current.has(quiz.id)) {
        const next = quizOnlyIndex + 1;
        if (next < moduleMcqs.length) {
          setQuizOnlyIndex(next);
        } else {
          void handleFinishAttempt();
        }
        return;
      }
      setGateMcq(quiz);
      setMcqOpen(true);
      return;
    }
    if (isLastSlide) {
      void handleFinishAttempt();
      return;
    }
    const upcoming = nextClickCount + 1;
    if (!reviewOnlyMode && module.moduleKind !== "course" && upcoming % SLIDES_BETWEEN_GATES === 0) {
      setNextClickCount(upcoming);
      const gateSlot = Math.min(
        Math.max(Math.floor(upcoming / SLIDES_BETWEEN_GATES) - 1, 0),
        Math.max(moduleMcqs.length - 1, 0),
      );
      const gateQuestion =
        moduleMcqs[gateSlot] ??
        moduleMcqs.find((q) => q.slideIndex === slideIndex + 1) ??
        FALLBACK_MCQ;
      if (answeredQuestionIdsRef.current.has(gateQuestion.id)) {
        setSlideIndex((i) => Math.min(i + 1, totalSlides - 1));
        return;
      }
      openGate();
      return;
    }
    setNextClickCount(upcoming);
    setSlideIndex((i) => Math.min(i + 1, totalSlides - 1));
  }, [
    quizOnlyMode,
    moduleMcqs,
    activeQuiz,
    isLastSlide,
    reviewOnlyMode,
    nextClickCount,
    openGate,
    handleFinishAttempt,
    totalSlides,
    slideIndex,
    quizOnlyIndex,
    module.moduleKind,
  ]);

  const closeAfterCompletion = useCallback(() => {
    isExitingRef.current = true;
    setCompletionNotice(null);
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
    window.close();
    window.setTimeout(() => {
      window.location.replace("/submitted?done=1");
    }, 300);
  }, []);

  const finishTrainingCompletion = useCallback(() => {
    setShowFinalQa(false);
    setShowAcknowledgement(false);
    setShowScoreResult(false);
    setMcqOpen(false);
    if (user?.username) {
      markCompleted(user.username, module.id);
      void syncProgressComplete(user.username, module.id);
    }
    setCompletionNotice({
      title: "Assessment submitted successfully",
      message: `Thank you. Your training for “${module.title}” is complete — attestation and feedback are on record.`,
      variant: "success",
      autoCloseAfterMs: 5000,
      showAcknowledgeButton: false,
      onAcknowledge: closeAfterCompletion,
    });
  }, [user?.username, module.id, module.title, closeAfterCompletion]);

  const goToFeedbackStep = useCallback(() => {
    setShowAcknowledgement(false);
    setScoreResult(null);
    setShowFinalQa(true);
    setCompletionNotice({
      title: "Signature recorded",
      message: `Your attestation for “${module.title}” is saved. Please complete the feedback form below to finish.`,
      acknowledgeLabel: "Continue to feedback",
      variant: "info",
      onAcknowledge: () => setCompletionNotice(null),
    });
  }, [module.title]);

  const handleAcknowledgementSubmit = async () => {
    if (!user?.username || !signatureReady || !signatureDataUrl) return;
    const normalizedName = normalizeSignatureName(signatureName);
    setAckSubmitting(true);
    saveAcknowledgement(user.username, module.id, true, {
      signatureName: normalizedName,
      digitalSignature: signatureDataUrl,
    });
    const ok = await syncAcknowledgement({
      userEmail: user.username,
      moduleId: module.id,
      moduleTitle: module.title,
      feedbackRequired: true,
      signatureName: normalizedName,
      digitalSignature: signatureDataUrl,
    });
    setAckSubmitting(false);
    if (!ok) {
      setAckSyncWarning(
        "Your signature was saved locally, but the server could not be reached. You can still continue.",
      );
    }
    resetAcknowledgementForm();
    goToFeedbackStep();
  };

  const handleScoreRetake = async () => {
    if (!user?.username) return;
    setRetakeLoading(true);
    const res = await requestScoreRetake(user.username, module.id);
    setRetakeLoading(false);
    if (!res.ok) return;

    proctorGraceUntilRef.current = Date.now() + 2500;
    resetForScoreRetake(user.username, module.id);
    loadIntegrityState();
    setShowScoreResult(false);
    setScoreResult(null);
    setSlideIndex(0);
    setQuizOnlyIndex(0);
    setNextClickCount(0);
    setShowFinalQa(false);
    setCompletionNotice(null);
    resetAcknowledgementForm();
    setShowAcknowledgement(false);
    setForceQuizOnlyRetake(true);
    resetGamificationState();
    if (moduleMcqs.length) {
      setGateMcq(moduleMcqs[0]);
      setMcqOpen(true);
    }
  };

  const handleCheckpointAnswered = useCallback((wasCorrect: boolean) => {
    const questionId = gateMcq.id;
    if (answeredQuestionIdsRef.current.has(questionId)) return;
    answeredQuestionIdsRef.current.add(questionId);

    setAnsweredCount((count) => count + 1);
    unlockBadge("starter");

    if (wasCorrect) {
      setCorrectAnswers((count) => count + 1);
      setCurrentStreak((streak) => {
        const nextStreak = streak + 1;
        setBestStreak((best) => Math.max(best, nextStreak));
        if (nextStreak >= 3) {
          unlockBadge("streakMaster");
        }
        return nextStreak;
      });
    } else {
      setCurrentStreak(0);
    }
  }, [gateMcq.id, unlockBadge]);

  const handleMcqContinue = () => {
    setMcqOpen(false);
    scheduleBadgeFlush(420);
    if (quizOnlyMode) {
      const next = quizOnlyIndex + 1;
      if (next < moduleMcqs.length) {
        setQuizOnlyIndex(next);
      } else {
        void handleFinishAttempt();
      }
      return;
    }
    if (!isLastSlide) {
      setSlideIndex((i) => Math.min(i + 1, totalSlides - 1));
    }
  };

  const checkpointOpen = mcqOpen && !showAcknowledgement && !showFinalQa && !showScoreResult;
  /** Block slide navigation during checkpoint, warning, or result modal */
  const slideNavLocked =
    checkpointOpen || !!activeWarningReason || showScoreResult;

  useEffect(() => {
    if (checkpointOpen) {
      proctorGraceUntilRef.current = 0;
    }
  }, [checkpointOpen]);
  const passedPendingAcknowledgement =
    showAcknowledgement && Boolean(scoreResult?.passed);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!sessionStarted) return;
      if (quizOnlyMode) return;
      if (checkpointOpen) {
        if (
          e.key === "Escape" ||
          e.key === "Tab" ||
          e.key.startsWith("Arrow") ||
          e.altKey ||
          e.key === "F5" ||
          e.key === "F11"
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (
        slideNavLocked ||
        showAcknowledgement ||
        showFinalQa ||
        showExitModal
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        tryAdvance();
      } else if (e.key === "ArrowLeft" && reviewOnlyMode && slideIndex > 0) {
        e.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    sessionStarted,
    checkpointOpen,
    mcqOpen,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
    slideNavLocked,
    activeWarningReason,
    showExitModal,
    slideIndex,
    tryAdvance,
    quizOnlyMode,
    reviewOnlyMode,
  ]);

  useEffect(() => {
    if (!sessionStarted || !ackPendingMode) return;
    setMcqOpen(false);
    setShowScoreResult(false);
    resetAcknowledgementForm();
    setShowAcknowledgement(true);
  }, [sessionStarted, ackPendingMode, resetAcknowledgementForm]);

  useEffect(() => {
    if (!showAcknowledgement) return;
    setAckSubmitting(false);
  }, [showAcknowledgement]);

  useEffect(() => {
    if (!sessionStarted || !quizOnlyMode || showAcknowledgement || showFinalQa || showScoreResult) {
      return;
    }
    if (!moduleMcqs.length) return;
    setGateMcq(moduleMcqs[quizOnlyIndex] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
  }, [
    sessionStarted,
    quizOnlyMode,
    quizOnlyIndex,
    moduleMcqs,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
  ]);

  const checkpointProps = {
    moduleId: module.id,
    question: gateMcq,
    open: checkpointOpen,
    userEmail: user?.username,
    moduleTitle: module.title,
    batchId: user?.batchId,
    totalSlides,
    currentStreak,
    bestStreak,
    score: liveScore,
    totalScore: totalPossibleScore,
    checkpointNumber: quizOnlyMode ? quizOnlyIndex + 1 : answeredCount + 1,
    totalCheckpoints: totalQuestions,
    assignedMcqCount: moduleMcqs.length,
    onAnswered: handleCheckpointAnswered,
    onContinue: handleMcqContinue,
  };

  if (!sessionStarted) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-100">
        <ProctorRulesModal
          open={showProctorRules}
          moduleTitle={module.title}
          onAccept={handleBeginSession}
        />
      </div>
    );
  }

  return (
    <div className="training-interactive fixed inset-0 z-30 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-900">
      <header className="relative z-[70] flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 text-white">
        <RelantoLogo size="sm" showTagline={false} />
        <span className="hidden max-w-[280px] truncate text-sm font-semibold tracking-tight text-white sm:inline">
          {module.title}
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-300">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedMs)}
          </span>
          {liveWarningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-950 px-2 py-1 text-xs font-semibold text-amber-400 border border-amber-800">
              Warnings: {liveWarningCount} / 3
            </span>
          )}
          <span className="font-mono text-xs text-zinc-400">
            {slideIndex + 1} / {totalSlides}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-zinc-300 hover:bg-zinc-800 hover:text-white"
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          {!reviewOnlyMode && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setShowExitModal(true);
              }}
              className="h-8 cursor-pointer px-3 text-xs"
            >
              Exit
            </Button>
          )}
        </div>
      </header>

      {!reviewOnlyMode && !showAcknowledgement && !showFinalQa && !showScoreResult && (
        <div className="grid shrink-0 gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:grid-cols-[minmax(160px,1fr)_auto_auto] sm:items-center">
          <ProgressBar value={progressPercent} />
          <ScoreDisplay correctAnswers={correctAnswers} totalQuestions={totalQuestions} />
          <StreakCounter
            currentStreak={currentStreak}
            bestStreak={bestStreak}
            compact
            tone="dark"
          />
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {showAcknowledgement ? (
            <motion.div
              key="acknowledgement"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="relative z-[80] flex flex-1 items-center justify-center p-6 sm:p-10 pointer-events-auto"
            >
              <div className="training-form-zone w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
                <BrandPanelHeader
                  eyebrow="Step 1 of 2 · Compliance attestation"
                  title="Training acknowledgement"
                  description="Review the declaration, sign with your legal name, then continue to feedback."
                  icon={ShieldCheck}
                  compact
                />
                <div className="space-y-6 p-6 sm:p-8">
                <div className="rounded-lg border border-zinc-100 bg-zinc-50/90 p-4 space-y-3">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.14em]">
                    I acknowledge that:
                  </p>
                  <ul className="space-y-2.5 text-xs text-zinc-600 leading-relaxed pl-1">
                    <li className="flex items-start gap-2">
                      <span className="text-[#f15a24] font-bold mt-0.5">•</span>
                      <span>I have completed this training material.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#f15a24] font-bold mt-0.5">•</span>
                      <span>I have reviewed and understood the concepts presented in this assessment.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#f15a24] font-bold mt-0.5">•</span>
                      <span>I have completed this assessment honestly and without unauthorized assistance.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#f15a24] font-bold mt-0.5">•</span>
                      <span>I understand that compliance with these guidelines is my responsibility.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#f15a24] font-bold mt-0.5">•</span>
                      <span>The information provided during this assessment is accurate to the best of my knowledge.</span>
                    </li>
                  </ul>
                </div>

                <TypedSignatureField
                  value={signatureName}
                  onChange={setSignatureName}
                  onSignatureReady={setSignatureDataUrl}
                  autoFocus
                />

                {ackSyncWarning && (
                  <p className="text-[10px] font-medium text-amber-700 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                    {ackSyncWarning}
                  </p>
                )}

                <div
                  className={cn(
                    "flex flex-col gap-2 pt-2",
                    passedPendingAcknowledgement ? "" : "sm:flex-row",
                  )}
                >
                  {!passedPendingAcknowledgement && (
                    <Button
                      variant="outline"
                      className="flex-1 cursor-pointer text-xs border-zinc-200 text-zinc-700 h-10 hover:bg-zinc-50"
                      onClick={() => {
                        setShowAcknowledgement(false);
                      }}
                    >
                      Back to Assessment
                    </Button>
                  )}
                  <Button
                    className={cn(
                      "text-xs bg-[#2e3192] hover:bg-[#3d42a8] text-white font-semibold h-10 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
                      passedPendingAcknowledgement ? "w-full" : "flex-1",
                    )}
                    disabled={!signatureReady || ackSubmitting}
                    onClick={() => void handleAcknowledgementSubmit()}
                  >
                    {ackSubmitting ? "Submitting…" : "Sign and continue to feedback"}
                  </Button>
                </div>
                </div>
              </div>
            </motion.div>
          ) : !showFinalQa ? (
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 flex-col p-1 sm:p-2"
            >
              {quizOnlyMode ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full rounded-lg border border-[#2e3192]/15 bg-gradient-to-r from-[#2e3192]/8 via-white to-[#3d42a8]/8 px-5 py-4 text-center shadow-[var(--shadow-card)]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f15a24]">
                      Quiz-only retake · Round {(retakeCount || 0) + 1}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                      You&apos;ve got this — checkpoints only
                    </h2>
                    <p className="mt-1 text-xs text-zinc-600">
                      Slides are skipped. Pass {PASS_THRESHOLD_PERCENT}%+ to continue to signature
                      and feedback.
                    </p>
                  </motion.div>
                  {!mcqOpen && (
                    <div className="w-full rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-[var(--shadow-card)]">
                      <p className="text-sm font-medium text-zinc-700">
                        Question {Math.min(quizOnlyIndex + 1, Math.max(moduleMcqs.length, 1))} of{" "}
                        {Math.max(moduleMcqs.length, 1)}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        Tap Next or answer the checkpoint when it opens.
                      </p>
                    </div>
                  )}
                </div>
              ) : module.contentType === "pdf" && module.pdfUrl ? (
                <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(100%,96vw)] flex-col overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-2xl">
                  <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
                      Page {slideIndex + 1} of {numPages}
                    </p>
                    <div className="flex items-center gap-2 text-zinc-200">
                      <FileText className="h-3.5 w-3.5 text-[#f15a24]" strokeWidth={1.75} />
                      <span className="max-w-[min(40vw,320px)] truncate text-xs font-semibold text-white">
                        {module.title}
                      </span>
                    </div>
                  </div>
                  <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
                    <PdfPageViewer
                      pdfUrl={module.pdfUrl!}
                      pageNumber={slideIndex + 1}
                      onLoadSuccess={(n) => setNumPages(n)}
                    />
                  </div>
                </div>
              ) : (
                // Text-based demo slide (existing behavior — unchanged)
                <div className="w-full max-w-3xl rounded-md border border-zinc-200 bg-white p-8 shadow-[var(--shadow-card)] sm:p-12">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
                    Slide {slideIndex + 1}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl text-balance">
                    {slides[slideIndex]}
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                    {reviewOnlyMode
                      ? "Review mode: question checkpoints are disabled because this module is already completed."
                      : "Checkpoint every three slides. Answer each question to continue."}
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="final"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative z-[80] flex flex-1 items-center justify-center p-6 pointer-events-auto"
            >
              <div className="training-form-zone w-full max-w-2xl space-y-5 px-2 sm:px-0">
                <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-card)]">
                  <BrandPanelHeader
                    eyebrow="Step 2 of 2 · Final feedback"
                    title="Complete your assessment"
                    description={`A star rating and written feedback are both required to finalize ${module.title}.`}
                    icon={ShieldCheck}
                    compact
                  />
                </div>
                <FinalQaForm
                  size="large"
                  moduleTitle={module.title}
                  moduleId={module.id}
                  userId={user?.username ?? ""}
                  deferSuccessToParent
                  messageRequired
                  ratingRequired
                  onSuccess={() => {
                    finishTrainingCompletion();
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!showFinalQa && !showAcknowledgement && !quizOnlyMode && !showScoreResult && (
        <footer className="relative z-[70] flex h-12 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4">
          {reviewOnlyMode ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={slideIndex === 0 || slideNavLocked}
              onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
              className="cursor-pointer text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
          ) : (
            <span className="inline-flex min-w-[5.5rem] items-center text-xs text-zinc-500">
              Forward only
            </span>
          )}
          <div className="flex gap-1">
            {slides.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 w-5 rounded-md transition-colors",
                  i <= slideIndex
                    ? "bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
                    : "bg-zinc-700",
                )}
              />
            ))}
          </div>
          <Button
            size="sm"
            disabled={slideNavLocked}
            onClick={tryAdvance}
            className="cursor-pointer bg-[#f15a24] hover:bg-[#d94e1f] text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reviewOnlyMode && isLastSlide ? "Done" : isLastSlide ? "Finish" : "Next"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </footer>
      )}

      <MCQCheckpoint {...checkpointProps} variant="modal" />

      {showScoreResult && scoreResult?.passed && !showAcknowledgement && !showFinalQa && (
        <FinalResultScreen
          moduleTitle={module.title}
          scorePercent={scoreResult.scorePercent}
          passed={scoreResult.passed}
          mcqCorrect={scoreResult.mcqCorrect}
          mcqTotal={scoreResult.mcqTotal}
          bestStreak={bestStreak}
          badges={earnedBadges}
          canRetake={scoreResult.canRetake}
          retakeLoading={retakeLoading}
          onContinuePassed={() => {
            setShowScoreResult(false);
            resetAcknowledgementForm();
            setShowAcknowledgement(true);
          }}
          onRetake={handleScoreRetake}
        />
      )}

      {showScoreResult && scoreResult && !scoreResult.passed && !showAcknowledgement && !showFinalQa && (
        <EncouragementRetakeNotice
          open
          moduleTitle={module.title}
          scorePercent={scoreResult.scorePercent}
          mcqCorrect={scoreResult.mcqCorrect}
          mcqTotal={scoreResult.mcqTotal}
          attemptNumber={(retakeCount ?? 0) + 1}
          canRetake={scoreResult.canRetake}
          retakeLoading={retakeLoading}
          onTryAgain={() => void handleScoreRetake()}
        />
      )}

      <BadgeUnlock badge={badgePopup} onClose={handleBadgeDismiss} />

      <CompletionNotice
        open={completionNotice !== null}
        title={completionNotice?.title ?? ""}
        message={completionNotice?.message ?? ""}
        acknowledgeLabel={completionNotice?.acknowledgeLabel}
        variant={completionNotice?.variant ?? "success"}
        autoCloseAfterMs={completionNotice?.autoCloseAfterMs}
        showAcknowledgeButton={completionNotice?.showAcknowledgeButton ?? true}
        onAcknowledge={
          completionNotice?.onAcknowledge ??
          (() => {
            /* noop */
          })
        }
        onDismiss={
          completionNotice?.variant === "info"
            ? () => setCompletionNotice(null)
            : undefined
        }
      />

      {/* ── Warning Notification Modal overlay ────────────────────────────── */}
      {activeWarningReason && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-zinc-900/60 backdrop-blur-xs p-4 pointer-events-auto"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              void handleWarningContinue();
            }
          }}
        >
          <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-amber-200 bg-white p-6 shadow-xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-250">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <span className="text-lg font-bold text-amber-600">!</span>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-900">Warning {liveWarningCount} of 3</h3>
              <p className="text-sm text-zinc-500 leading-relaxed text-balance">
                {activeWarningReason === "Exited Fullscreen" && "You exited fullscreen mode."}
                {activeWarningReason === "Switched Browser Tab" && "You switched browser tabs."}
                {activeWarningReason === "Window Lost Focus" && "The assessment lost window focus."}
                {activeWarningReason === "Attempted Navigation" && "You attempted to navigate away."}
              </p>
              <p className="text-xs text-amber-600 font-semibold">
                Warnings Remaining: {3 - liveWarningCount}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                If you accumulate 3 warnings, the assessment will automatically fail.
              </p>
            </div>
            <Button
              type="button"
              autoFocus
              className="w-full cursor-pointer bg-[#2e3192] text-white hover:bg-[#3d42a8]"
              onClick={() => void handleWarningContinue()}
            >
              Continue assessment
            </Button>
          </div>
        </div>
      )}

      {/* ── Exit Confirmation Modal overlay ─────────────────────────────── */}
      {showExitModal && (
        <div className="fixed inset-0 z-[75] flex cursor-default items-center justify-center bg-zinc-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-zinc-900 text-left">Exit Assessment?</h3>
            <div className="text-xs text-zinc-500 space-y-2 leading-relaxed text-left">
              <p>You are about to leave this assessment.</p>
              <p className="font-semibold text-zinc-600">If you exit now:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>The assessment session will end.</li>
                <li>If you leave before finishing, you must start again from the beginning.</li>
              </ul>
              <p className="mt-2 font-medium">Do you want to proceed?</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer text-xs border-zinc-200 text-zinc-700"
                onClick={() => setShowExitModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="cursor-pointer text-xs"
                onClick={() => {
                  isExitingRef.current = true;
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => undefined);
                  }
                  window.location.href = "/dashboard";
                }}
              >
                Exit Assessment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Failed Lock Screen Overlay ─────────────────────────────────────── */}
      {isFailed && (() => {
        const retakesRemaining = Math.max(0, 2 - retakeCount);
        const isPendingReview = reviewRequest?.status === "Pending";
        const isRejectedReview = reviewRequest?.status === "Rejected";
        const isPermanentlyFailed =
          dbStatus === "permanently_failed" ||
          (liveWarningCount >= 3 && retakesRemaining <= 0);

        const handleSubmitReview = async (e: React.FormEvent) => {
          e.preventDefault();
          if (!explanation.trim()) {
            setReviewError("Please provide an explanation.");
            return;
          }
          if (!user?.username) return;

          setReviewSubmitting(true);
          setReviewError("");
          try {
            const request = await submitReviewRequestApi({
              username: user.username,
              moduleId: module.id,
              moduleTitle: module.title,
              warningCount: liveWarningCount,
              failureTimestamp: Date.now(),
              userExplanation: explanation.trim(),
            });
            setReviewRequest(request);
            setShowReviewForm(false);
            setExplanation("");
          } catch (err: unknown) {
            setReviewError(
              err instanceof Error ? err.message : "Failed to submit request.",
            );
          } finally {
            setReviewSubmitting(false);
          }
        };

        return (
          <div className="pointer-events-auto fixed inset-0 z-[92] flex items-center justify-center bg-zinc-900/80 backdrop-blur-xs p-4">
            <div className="training-form-zone pointer-events-auto w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <span className="text-xl font-bold text-red-600">!</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-zinc-950">
                  {isPermanentlyFailed ? "Assessment Permanently Failed" : "Assessment Failed"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {isPermanentlyFailed
                    ? "Maximum retake limit reached. This assessment can no longer be retaken."
                    : "Maximum warning limit reached."}
                </p>
                <p className="text-sm font-semibold text-red-600">
                  Warnings: {liveWarningCount} / 3
                </p>
                {!isPermanentlyFailed && !isPendingReview && (
                  <p className="text-xs text-zinc-400">
                    Retakes Remaining: {retakesRemaining}
                  </p>
                )}
              </div>

              <div className="border-t border-b border-zinc-100 py-3 text-left">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Warning History</p>
                <div className="max-h-24 overflow-y-auto space-y-1.5 font-mono text-[10px] text-zinc-500 pr-1">
                  {liveWarningHistory.map((item, idx) => (
                    <div key={idx} className="flex justify-between border-b border-zinc-50 pb-0.5">
                      <span className="font-sans text-zinc-700">{item.reason}</span>
                      <span>
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

              {/* Case A: Permanently Failed details */}
              {isPermanentlyFailed && (
                <div className="rounded-md bg-zinc-950 text-zinc-100 p-3 text-left space-y-1 text-xs">
                  <p className="font-bold text-zinc-200">Maximum Retake Limit Reached</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    This assessment can no longer be retaken as it has reached the absolute retake limit (2 retakes). Please contact compliance.
                  </p>
                </div>
              )}

              {/* Case B: Pending Review details */}
              {isPendingReview && (
                <div className="rounded-md bg-amber-50 border border-amber-100 p-3 text-left space-y-1 text-xs text-amber-900">
                  <p className="font-bold text-amber-800">A review request is already under review</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    You have already submitted a review request. The compliance administrator will review it.
                  </p>
                </div>
              )}

              {/* Case C: Rejected Review details */}
              {isRejectedReview && !isPendingReview && !isPermanentlyFailed && (
                <div className="rounded-md bg-red-50 border border-red-100 p-3 text-left space-y-1 text-xs text-red-900">
                  <p className="font-bold text-red-800">Review Request Rejected</p>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    Admin Comment: &ldquo;{reviewRequest?.adminComment || "No comments provided."}&rdquo;
                  </p>
                  <p className="text-[10px] text-red-500 mt-1">
                    You may submit another explanation if you have remaining retakes.
                  </p>
                </div>
              )}

              {/* Form or Request Button */}
              {!isPermanentlyFailed && !isPendingReview && (
                <div className="space-y-4 pt-1">
                  {!showReviewForm ? (
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full cursor-pointer text-xs font-semibold"
                      onClick={() => {
                        setReviewError("");
                        setShowReviewForm(true);
                      }}
                    >
                      Request Review
                    </Button>
                  ) : (
                    <form onSubmit={handleSubmitReview} className="space-y-3 text-left">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-700">Reason for Failure</label>
                        <textarea
                          rows={3}
                          className="training-form-input w-full cursor-text select-text rounded-md border border-zinc-200 p-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-[#2e3192]"
                          placeholder="Please explain why the assessment integrity rules were violated. Provide any relevant context or explanation."
                          value={explanation}
                          onChange={(e) => setExplanation(e.target.value)}
                          disabled={reviewSubmitting}
                        />
                      </div>
                      {reviewError && (
                        <p className="text-xs text-red-600 font-medium">{reviewError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            setShowReviewForm(false);
                            setExplanation("");
                            setReviewError("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
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

            </div>
          </div>
        );
      })()}
    </div>
  );
}
