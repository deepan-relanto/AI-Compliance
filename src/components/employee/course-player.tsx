"use client";

import { FinalQaForm } from "@/components/employee/final-qa-form";
import { BadgeUnlock, type GamificationBadge } from "@/components/employee/badge-unlock";
import { FinalResultScreen } from "@/components/employee/final-result-screen";
import { MCQCheckpoint } from "@/components/employee/mcq-checkpoint";
import { ProgressBar } from "@/components/employee/progress-bar";
import { ScoreDisplay } from "@/components/employee/score-display";
import { StreakCounter } from "@/components/employee/streak-counter";
import { CompletionNotice } from "@/components/employee/completion-notice";
import { EncouragementRetakeNotice } from "@/components/employee/encouragement-retake-notice";
import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { CourseStepContent } from "@/components/employee/course-step-content";
import {
  CourseAcknowledgementPanel,
  CourseWarningOverlay,
  CourseExitModal,
  CourseProctorFailOverlay,
} from "@/components/employee/course-player-overlays";
import { isValidSignatureName, normalizeSignatureName } from "@/lib/signature-canvas";
import { RelantoLogo } from "@/components/brand/relanto-logo";
import { Button } from "@/components/ui/button";
import { isHtmlCourseAsset, type CourseStepRow } from "@/lib/course-step-types";
import {
  COURSE_EMBED_COMMAND,
  COURSE_EMBED_EVENT,
  isCourseEmbedState,
  type CourseEmbedState,
} from "@/lib/course-embed";
import type { McqQuestion, TrainingModule, WarningHistoryEntry, ReviewRequest, ModuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ProctorRulesModal } from "@/components/employee/proctor-rules-modal";
import { ChevronRight, Clock, GraduationCap, Maximize2, Minimize2 } from "lucide-react";
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
  resetForProctorRetake,
  mergeServerProgress,
} from "@/lib/progress-store";
import {
  syncAcknowledgement,
  syncProgressStart,
  syncProgressComplete,
  finalizeAssessmentScore,
  requestScoreRetake,
  fetchUserProgress,
} from "@/lib/progress-api";
import { PASS_THRESHOLD_PERCENT, POINTS_PER_MCQ } from "@/lib/constants";
import { getAllReviewRequests } from "@/lib/review-store";
import { fetchLatestReviewRequest, submitReviewRequestApi } from "@/lib/review-api";

const FALLBACK_MCQ: McqQuestion = {
  id: "gate-fallback",
  slideIndex: -1,
  prompt: "No checkpoint question is available. Select any option to continue.",
  options: [
    { id: "a", label: "Continue" },
    { id: "b", label: "Continue (alternate)" },
    { id: "c", label: "Continue (alternate 2)" },
    { id: "d", label: "Continue (alternate 3)" },
  ],
};

const GAMIFICATION_BADGES: Record<string, GamificationBadge> = {
  starter: {
    id: "starter",
    name: "Course Starter",
    description: "First course checkpoint completed.",
  },
  quickLearner: {
    id: "quickLearner",
    name: "50% Course Milestone",
    description: "You're halfway through this course.",
  },
  streakMaster: {
    id: "streakMaster",
    name: "Course Streak Master",
    description: "Three checkpoint answers correct in a row.",
  },
  champion: {
    id: "champion",
    name: "Course Champion",
    description: "Scored 80% or above on the course assessment.",
  },
  perfect: {
    id: "perfect",
    name: "Course Perfect Score",
    description: "Scored 100% on the course assessment.",
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

function formatWarningReason(reason: string): string {
  switch (reason) {
    case "Exited Fullscreen":
      return "You exited fullscreen mode.";
    case "Switched Browser Tab":
      return "You switched browser tabs.";
    case "Window Lost Focus":
      return "The course lost window focus.";
    case "Attempted Navigation":
      return "You attempted to navigate away.";
    default:
      return reason;
  }
}

type CoursePhase = "content" | "quiz";

interface CoursePlayerProps {
  module: TrainingModule;
  steps: CourseStepRow[];
  mcqs?: McqQuestion[];
  freshStart?: boolean;
}

export function CoursePlayer({
  module,
  steps,
  mcqs = [],
  freshStart = false,
}: CoursePlayerProps) {
  const user = useAuthStore((s) => s.user);
  const moduleMcqs = mcqs;

  const contentSteps = useMemo(
    () =>
      [...steps]
        .filter((s) => s.stepType !== "quiz")
        .sort((a, b) => a.stepOrder - b.stepOrder),
    [steps],
  );

  const quizOnlyModeFromModule = module.viewerMode === "quiz_only_retake";
  const ackPendingMode = module.viewerMode === "acknowledgement_pending";
  const autoStartSession = quizOnlyModeFromModule || ackPendingMode;

  const [phase, setPhase] = useState<CoursePhase>(quizOnlyModeFromModule ? "quiz" : "content");
  const [contentStepIndex, setContentStepIndex] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(1);
  const [pdfReady, setPdfReady] = useState(true);

  const [mcqOpen, setMcqOpen] = useState(false);
  const [gateMcq, setGateMcq] = useState<McqQuestion>(FALLBACK_MCQ);
  const [quizIndex, setQuizIndex] = useState(0);
  const [forceQuizOnlyRetake, setForceQuizOnlyRetake] = useState(false);
  const quizOnlyMode = quizOnlyModeFromModule || forceQuizOnlyRetake;

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
  const [retakeCount, setRetakeCount] = useState<number>(0);
  const [dbStatus, setDbStatus] = useState<ModuleStatus>("in_progress");
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [proctorRestartLoading, setProctorRestartLoading] = useState(false);
  const [awaitingRetakeRestart, setAwaitingRetakeRestart] = useState(false);
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
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<GamificationBadge[]>([]);
  const [badgePopup, setBadgePopup] = useState<GamificationBadge | null>(null);

  const [htmlEmbedState, setHtmlEmbedState] = useState<CourseEmbedState | null>(null);
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);

  const currentContentStep = contentSteps[contentStepIndex];
  const isHtmlLessonStep =
    currentContentStep?.stepType === "pdf" &&
    isHtmlCourseAsset(
      currentContentStep.config.mimeType,
      currentContentStep.config.assetUrl,
      currentContentStep.config.originalName,
    );
  const isPdfStep =
    currentContentStep?.stepType === "pdf" &&
    !isHtmlCourseAsset(
      currentContentStep.config.mimeType,
      currentContentStep.config.assetUrl,
      currentContentStep.config.originalName,
    );
  const isLastPdfPage = !isPdfStep || pdfPage >= pdfPages;
  const isLastHtmlSlide =
    !isHtmlLessonStep || (htmlEmbedState?.atEnd ?? false);
  const isLastContentStep = contentStepIndex >= contentSteps.length - 1;
  const isLastContentUnit = isLastContentStep && isLastPdfPage && isLastHtmlSlide;

  const totalQuestions = moduleMcqs.length;
  const totalPossibleScore = totalQuestions * POINTS_PER_MCQ;
  const liveScore = correctAnswers * POINTS_PER_MCQ;
  const totalSlides = Math.max(contentSteps.length, 1);

  const loadIntegrityState = useCallback(async () => {
    if (!user?.username) return;

    const progBefore = getProgress(user.username, module.id);
    const wasLocked = progBefore ? isProctorLocked(progBefore) : false;

    try {
      const serverEntries = await fetchUserProgress(user.username);
      const mine = serverEntries.find((e) => e.moduleId === module.id);
      const serverGrantedRetake =
        Boolean(mine) &&
        mine!.status === "not_started" &&
        mine!.warningCount === 0 &&
        wasLocked;

      if (mine && !serverGrantedRetake) {
        mergeServerProgress(user.username, [
          {
            moduleId: mine.moduleId,
            moduleTitle: mine.moduleTitle,
            batchId: mine.batchId,
            currentSlide: mine.currentSlide,
            totalSlides: mine.totalSlides,
            status: mine.status,
            retakeCount: mine.retakeCount,
            mcqCorrect: mine.mcqCorrect,
            mcqTotal: mine.mcqTotal,
            scorePercent: mine.scorePercent,
            warningCount: mine.warningCount,
            failedReason: mine.failedReason,
            completedAt: mine.completedAt,
          },
        ]);
      } else if (mine && serverGrantedRetake) {
        setRetakeCount(mine.retakeCount);
      }
    } catch {
      /* keep local state */
    }

    const prog = getProgress(user.username, module.id);
    const locallyLocked = prog ? isProctorLocked(prog) : false;

    try {
      const latest = await fetchLatestReviewRequest(user.username, module.id);
      setReviewRequest(latest);
      if (
        latest?.status === "Approved" &&
        (locallyLocked || wasLocked) &&
        !proctorRetakeStartedRef.current
      ) {
        setAwaitingRetakeRestart(true);
      }
    } catch {
      const requests = getAllReviewRequests();
      const userReqs = requests.filter(
        (r) => r.username === user.username && r.moduleId === module.id,
      );
      const latest = userReqs.length > 0 ? userReqs[0] : null;
      setReviewRequest(latest);
      if (
        latest?.status === "Approved" &&
        (locallyLocked || wasLocked) &&
        !proctorRetakeStartedRef.current
      ) {
        setAwaitingRetakeRestart(true);
      }
    }

    if (prog) {
      setRetakeCount(prog.retakeCount ?? 0);
      setDbStatus(prog.status);
      setLiveWarningCount(prog.warningCount ?? 0);
      setLiveWarningHistory(prog.warningHistory ?? []);
      setIsFailed(locallyLocked);
    }
  }, [user?.username, module.id]);

  useEffect(() => {
    loadIntegrityState();
  }, [loadIntegrityState]);

  useEffect(() => {
    if (!user?.username || !(isFailed || awaitingRetakeRestart) || reviewRequest?.status !== "Pending") return;
    const id = window.setInterval(() => {
      void loadIntegrityState();
    }, 12000);
    return () => window.clearInterval(id);
  }, [user?.username, isFailed, awaitingRetakeRestart, reviewRequest?.status, loadIntegrityState]);

  const isExitingRef = useRef(false);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const proctorGraceUntilRef = useRef(0);
  const earnedBadgeIdsRef = useRef<Set<string>>(new Set());
  const badgeQueueRef = useRef<GamificationBadge[]>([]);
  const badgeShowingRef = useRef(false);
  const answeredQuestionIdsRef = useRef(new Set<string>());
  const proctorRetakeStartedRef = useRef(false);

  const proctorMonitorsActive = useMemo(
    () =>
      sessionStarted &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult &&
      !showExitModal &&
      !isFailed,
    [sessionStarted, showAcknowledgement, showFinalQa, showScoreResult, showExitModal, isFailed],
  );

  const rawProgressPercent = useMemo(() => {
    if (showScoreResult || showAcknowledgement || showFinalQa) return 100;
    const totalUnits = contentSteps.length + totalQuestions;
    if (totalUnits === 0) return 0;
    if (phase === "quiz" || quizOnlyMode) {
      const completed = contentSteps.length + answeredCount;
      return (completed / totalUnits) * 100;
    }
    const stepFraction =
      contentSteps.length > 0
        ? (contentStepIndex +
            (isPdfStep
              ? (pdfPage - 1) / Math.max(pdfPages, 1)
              : isHtmlLessonStep && htmlEmbedState
                ? (htmlEmbedState.slideIndex + 1) / Math.max(htmlEmbedState.slideCount, 1)
                : 1)) /
          contentSteps.length
        : 0;
    return (stepFraction * contentSteps.length) / totalUnits * 100;
  }, [
    answeredCount,
    contentStepIndex,
    contentSteps.length,
    htmlEmbedState,
    isHtmlLessonStep,
    isPdfStep,
    pdfPage,
    pdfPages,
    phase,
    quizOnlyMode,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
    totalQuestions,
  ]);

  const progressPercent = Math.min(100, Math.max(0, Math.round(rawProgressPercent)));

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

  const scheduleBadgeFlush = useCallback(
    (delayMs = 400) => {
      window.setTimeout(() => {
        if (badgeShowingRef.current) return;
        showNextBadge();
      }, delayMs);
    },
    [showNextBadge],
  );

  const unlockBadge = useCallback((badgeId: keyof typeof GAMIFICATION_BADGES) => {
    if (earnedBadgeIdsRef.current.has(badgeId)) return;
    const badge = GAMIFICATION_BADGES[badgeId];
    earnedBadgeIdsRef.current.add(badgeId);
    setEarnedBadges((current) => [...current, badge]);
    badgeQueueRef.current.push(badge);
  }, []);

  useEffect(() => {
    if (mcqOpen || showAcknowledgement || showFinalQa) return;
    if (badgeShowingRef.current || badgeQueueRef.current.length === 0) return;
    scheduleBadgeFlush(300);
  }, [mcqOpen, showAcknowledgement, showFinalQa, earnedBadges.length, scheduleBadgeFlush]);

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
    if (progressPercent >= 50) {
      unlockBadge("quickLearner");
    }
  }, [progressPercent, unlockBadge]);

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
    if (!sessionStarted || quizOnlyModeFromModule) return;
    enterFullscreen();
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [sessionStarted, quizOnlyModeFromModule, enterFullscreen]);

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
    if (contentSteps.length === 0 && !quizOnlyMode) {
      startQuizPhase();
    }
  };

  useEffect(() => {
    if (!autoStartSession) return;
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
      sessionStarted && !showAcknowledgement && !showFinalQa && !showScoreResult;

    if (!shouldRestoreFullscreen) return;

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch {
      setIsFullscreen(false);
    }
  }, [sessionStarted, showAcknowledgement, showFinalQa, showScoreResult]);

  const triggerWarning = useCallback(
    (reason: string) => {
      if (!proctorMonitorsActive || isExitingRef.current || !user?.username) {
        return;
      }

      const currentProgress = getProgress(user.username, module.id);
      if (
        currentProgress &&
        (currentProgress.status === "completed" || isProctorLocked(currentProgress))
      ) {
        return;
      }

      const updated = addWarning(user.username, module.id, reason);
      setLiveWarningCount(updated.warningCount);
      setLiveWarningHistory(updated.warningHistory);

      if (isProctorLocked(updated)) {
        setIsFailed(true);
        setActiveWarningReason(null);
        void loadIntegrityState();
      } else if (updated.warningCount !== liveWarningCount) {
        setActiveWarningReason(reason);
      }
    },
    [proctorMonitorsActive, user?.username, module.id, liveWarningCount, loadIntegrityState],
  );

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

  useEffect(() => {
    const handleBlur = () => {
      if (!proctorMonitorsActive || isExitingRef.current || isFailed) return;
      if (Date.now() < proctorGraceUntilRef.current) return;
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        triggerWarning("Window Lost Focus");
      }, 3000);
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

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExitingRef.current || !user?.username) return;
      const currentProgress = getProgress(user.username, module.id);
      if (
        currentProgress &&
        (currentProgress.status === "completed" || isProctorLocked(currentProgress))
      ) {
        return;
      }

      addWarning(user.username, module.id, "Attempted Navigation");
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user?.username, module.id]);

  useEffect(() => {
    if (user?.username) {
      markInProgress(user.username, module.id, module.title, user.batchId, totalSlides);
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

  const handleFinishAttempt = useCallback(async () => {
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
    user?.username,
    module.id,
    unlockBadge,
    resetAcknowledgementForm,
    scheduleBadgeFlush,
  ]);

  const startQuizPhase = useCallback(() => {
    setPhase("quiz");
    setQuizIndex(0);
    answeredQuestionIdsRef.current = new Set();
    if (!moduleMcqs.length) {
      void handleFinishAttempt();
      return;
    }
    setGateMcq(moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
  }, [moduleMcqs, handleFinishAttempt]);

  const tryAdvanceContent = useCallback(() => {
    if (phase !== "content" || quizOnlyMode) return;
    if (isHtmlLessonStep) {
      if (!htmlEmbedState?.atEnd) {
        htmlIframeRef.current?.contentWindow?.postMessage(
          { type: COURSE_EMBED_COMMAND, command: "next" },
          "*",
        );
        return;
      }
    }
    if (isPdfStep && !pdfReady) return;
    if (isPdfStep && pdfPage < pdfPages) {
      setPdfPage((p) => p + 1);
      return;
    }
    if (!isLastContentUnit) {
      if (!isLastContentStep) {
        setContentStepIndex((i) => i + 1);
        setPdfPage(1);
        setPdfPages(currentContentStep?.config.pageCount ?? 1);
        setHtmlEmbedState(null);
      }
      return;
    }
    startQuizPhase();
  }, [
    phase,
    quizOnlyMode,
    isHtmlLessonStep,
    htmlEmbedState?.atEnd,
    isPdfStep,
    pdfReady,
    pdfPage,
    pdfPages,
    isLastContentUnit,
    isLastContentStep,
    startQuizPhase,
    currentContentStep?.config.pageCount,
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
      title: "Course submitted successfully",
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
    setQuizIndex(0);
    setShowFinalQa(false);
    setCompletionNotice(null);
    resetAcknowledgementForm();
    setShowAcknowledgement(false);
    setForceQuizOnlyRetake(true);
    setPhase("quiz");
    resetGamificationState();
    answeredQuestionIdsRef.current = new Set();
    if (moduleMcqs.length) {
      setGateMcq(moduleMcqs[0]);
      setMcqOpen(true);
    }
  };

  const handleCheckpointAnswered = useCallback(
    (wasCorrect: boolean) => {
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
    },
    [gateMcq.id, unlockBadge],
  );

  const handleMcqContinue = () => {
    setMcqOpen(false);
    scheduleBadgeFlush(420);
    const next = quizIndex + 1;
    if (next < moduleMcqs.length) {
      setQuizIndex(next);
      setGateMcq(moduleMcqs[next] ?? FALLBACK_MCQ);
      setMcqOpen(true);
      return;
    }
    void handleFinishAttempt();
  };

  const checkpointOpen = mcqOpen && !showAcknowledgement && !showFinalQa && !showScoreResult;
  const navLocked = checkpointOpen || !!activeWarningReason || showScoreResult;
  const passedPendingAcknowledgement = showAcknowledgement && Boolean(scoreResult?.passed);

  useEffect(() => {
    if (checkpointOpen) {
      proctorGraceUntilRef.current = 0;
    }
  }, [checkpointOpen]);

  useEffect(() => {
    if (!sessionStarted || !ackPendingMode) return;
    setMcqOpen(false);
    setShowScoreResult(false);
    resetAcknowledgementForm();
    setShowAcknowledgement(true);
  }, [sessionStarted, ackPendingMode, resetAcknowledgementForm]);

  useEffect(() => {
    if (!sessionStarted || !quizOnlyMode || showAcknowledgement || showFinalQa || showScoreResult) {
      return;
    }
    if (!moduleMcqs.length) return;
    setPhase("quiz");
    setGateMcq(moduleMcqs[quizIndex] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
  }, [
    sessionStarted,
    quizOnlyMode,
    quizIndex,
    moduleMcqs,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
  ]);

  useEffect(() => {
    setPdfPage(1);
    setHtmlEmbedState(null);
    const configuredPages = currentContentStep?.config.pageCount;
    if (isPdfStep) {
      if (configuredPages && configuredPages > 0) {
        setPdfPages(configuredPages);
        setPdfReady(true);
      } else {
        setPdfPages(1);
        setPdfReady(false);
      }
    } else {
      setPdfPages(1);
      setPdfReady(true);
    }
  }, [contentStepIndex, currentContentStep?.config.pageCount, isPdfStep]);

  useEffect(() => {
    const onEmbedMessage = (event: MessageEvent) => {
      if (!isCourseEmbedState(event.data) || event.data.type !== COURSE_EMBED_EVENT) return;
      if (event.data.kind !== "lesson") return;
      setHtmlEmbedState({
        kind: event.data.kind,
        slideIndex: event.data.slideIndex,
        slideCount: event.data.slideCount,
        atEnd: event.data.atEnd,
        atStart: event.data.atStart,
      });
    };
    window.addEventListener("message", onEmbedMessage);
    return () => window.removeEventListener("message", onEmbedMessage);
  }, []);

  const handlePdfPagesLoaded = useCallback((pageCount: number) => {
    if (pageCount > 0) {
      setPdfPages(pageCount);
      setPdfReady(true);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!sessionStarted) return;
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
      if (navLocked || showAcknowledgement || showFinalQa || showExitModal) return;
      if (phase !== "content" || quizOnlyMode) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        tryAdvanceContent();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    sessionStarted,
    checkpointOpen,
    navLocked,
    showAcknowledgement,
    showFinalQa,
    showExitModal,
    phase,
    quizOnlyMode,
    tryAdvanceContent,
  ]);

  const handleProctorRetakeRestart = useCallback(async () => {
    if (!user?.username) return;
    setProctorRestartLoading(true);
    try {
      await loadIntegrityState();
      resetForProctorRetake(user.username, module.id);
      proctorGraceUntilRef.current = Date.now() + 2500;
      answeredQuestionIdsRef.current = new Set();
      resetGamificationState();
      setContentStepIndex(0);
      setPdfPage(1);
      setPdfPages(1);
      setPdfReady(true);
      setPhase("content");
      setQuizIndex(0);
      setMcqOpen(false);
      setGateMcq(moduleMcqs[0] ?? FALLBACK_MCQ);
      setShowReviewForm(false);
      setExplanation("");
      setReviewError("");
      setShowScoreResult(false);
      setScoreResult(null);
      setShowAcknowledgement(false);
      setShowFinalQa(false);
      setCompletionNotice(null);
      setForceQuizOnlyRetake(false);
      setActiveWarningReason(null);
      setShowExitModal(false);
      setLiveWarningCount(0);
      setLiveWarningHistory([]);
      setIsFailed(false);
      setAwaitingRetakeRestart(false);
      proctorRetakeStartedRef.current = true;
      setDbStatus("not_started");
      setShowProctorRules(true);
      setSessionStarted(false);
      setSessionStartMs(null);
      resetAcknowledgementForm();
      void syncProgressStart({
        userEmail: user.username,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        assignedMcqCount: moduleMcqs.length,
        freshStart: true,
      });
    } finally {
      setProctorRestartLoading(false);
    }
  }, [
    user?.username,
    user?.batchId,
    module.id,
    module.title,
    moduleMcqs,
    totalSlides,
    loadIntegrityState,
    resetGamificationState,
    resetAcknowledgementForm,
  ]);

  const handleSubmitReview = async (text: string) => {
    if (!text.trim()) {
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
        userExplanation: text.trim(),
      });
      setReviewRequest(request);
      setShowReviewForm(false);
      setExplanation("");
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setReviewSubmitting(false);
    }
  };

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
    checkpointNumber: quizIndex + 1,
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
          eyebrow="Proctored course training"
          onAccept={handleBeginSession}
        />
      </div>
    );
  }

  return (
    <div className="training-interactive fixed inset-0 z-30 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-900">
      <header className="relative z-[70] flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 text-white">
        <div className="flex items-center gap-3">
          <RelantoLogo size="sm" showTagline={false} />
          <span className="inline-flex items-center rounded-md border border-violet-800 bg-violet-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
            Course
          </span>
        </div>
        <span className="hidden max-w-[240px] truncate text-sm font-semibold tracking-tight text-white sm:inline">
          {module.title}
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-300">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedMs)}
          </span>
          {liveWarningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-800 bg-amber-950 px-2 py-1 text-xs font-semibold text-amber-400">
              Warnings: {liveWarningCount} / 3
            </span>
          )}
          {phase === "content" && !quizOnlyMode && contentSteps.length > 0 && (
            <span className="font-mono text-xs text-zinc-400">
              {isHtmlLessonStep && htmlEmbedState
                ? `Slide ${htmlEmbedState.slideIndex + 1} / ${htmlEmbedState.slideCount}`
                : `Step ${contentStepIndex + 1} / ${contentSteps.length}`}
            </span>
          )}
          {phase === "quiz" && (
            <span className="font-mono text-xs text-zinc-400">
              Quiz {Math.min(quizIndex + 1, Math.max(totalQuestions, 1))} /{" "}
              {Math.max(totalQuestions, 1)}
            </span>
          )}
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
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowExitModal(true)}
            className="h-8 cursor-pointer px-3 text-xs"
          >
            Exit
          </Button>
        </div>
      </header>

      {!showAcknowledgement && !showFinalQa && !showScoreResult && (
        <div className="grid shrink-0 gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:grid-cols-[minmax(160px,1fr)_auto_auto] sm:items-center">
          <ProgressBar value={progressPercent} />
          <ScoreDisplay correctAnswers={correctAnswers} totalQuestions={totalQuestions} />
          <StreakCounter currentStreak={currentStreak} bestStreak={bestStreak} compact tone="dark" />
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {showAcknowledgement ? (
            <CourseAcknowledgementPanel
              signatureName={signatureName}
              signatureReady={signatureReady}
              ackSubmitting={ackSubmitting}
              ackSyncWarning={ackSyncWarning}
              passedPending={passedPendingAcknowledgement}
              onSignatureName={setSignatureName}
              onSignatureReady={setSignatureDataUrl}
              onBack={() => setShowAcknowledgement(false)}
              onSubmit={() => void handleAcknowledgementSubmit()}
            />
          ) : !showFinalQa ? (
            <motion.div
              key={quizOnlyMode ? "quiz-only" : `${contentStepIndex}-${pdfPage}`}
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
                    className="w-full rounded-lg border border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-zinc-900 to-[#2e3192]/20 px-5 py-4 text-center shadow-[var(--shadow-card)]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f15a24]">
                      Quiz-only retake · Round {(retakeCount || 0) + 1}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      Course assessment retake
                    </h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Content steps are skipped. Pass {PASS_THRESHOLD_PERCENT}%+ to continue to
                      signature and feedback.
                    </p>
                  </motion.div>
                  {!mcqOpen && (
                    <div className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">
                        Question {Math.min(quizIndex + 1, Math.max(moduleMcqs.length, 1))} of{" "}
                        {Math.max(moduleMcqs.length, 1)}
                      </p>
                    </div>
                  )}
                </div>
              ) : phase === "content" && currentContentStep ? (
                <CourseStepContent
                  step={currentContentStep}
                  pdfPage={pdfPage}
                  pdfPages={pdfPages}
                  moduleTitle={module.title}
                  onPdfPages={handlePdfPagesLoaded}
                  htmlIframeRef={htmlIframeRef}
                />
              ) : phase === "quiz" && !mcqOpen ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <div className="w-full rounded-lg border border-[#2e3192]/30 bg-gradient-to-r from-[#2e3192]/15 via-zinc-900 to-[#f15a24]/10 px-5 py-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-400">
                      Course assessment
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Ready for the quiz</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Answer all questions to complete the course assessment.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-600 bg-zinc-900/50 p-10 text-center">
                  <GraduationCap className="h-10 w-10 text-violet-400" />
                  <p className="text-sm text-zinc-400">No course content is available.</p>
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
                    title="Complete your course"
                    description={`A star rating and written feedback are both required to finalize ${module.title}.`}
                    icon={GraduationCap}
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

      {phase === "content" &&
        !quizOnlyMode &&
        !showFinalQa &&
        !showAcknowledgement &&
        !showScoreResult && (
          <footer className="relative z-[70] flex h-12 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4">
            <span className="text-xs text-zinc-500">
              {isHtmlLessonStep && htmlEmbedState
                ? `Slide ${htmlEmbedState.slideIndex + 1} of ${htmlEmbedState.slideCount}`
                : "Forward only"}
            </span>
            <div className="flex gap-1">
              {contentSteps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 w-5 rounded-md transition-colors",
                    i <= contentStepIndex
                      ? "bg-gradient-to-r from-[#2e3192] via-violet-600 to-[#f15a24]"
                      : "bg-zinc-700",
                  )}
                />
              ))}
            </div>
            <Button
              size="sm"
              disabled={navLocked || (isPdfStep && !pdfReady)}
              onClick={tryAdvanceContent}
              className="cursor-pointer bg-[#f15a24] text-white hover:bg-[#d94e1f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLastContentUnit
                ? "Start quiz"
                : isHtmlLessonStep && htmlEmbedState && !htmlEmbedState.atEnd
                  ? "Next slide"
                  : "Next"}
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
          completionNotice?.variant === "info" ? () => setCompletionNotice(null) : undefined
        }
      />

      {activeWarningReason && (
        <CourseWarningOverlay
          reason={formatWarningReason(activeWarningReason)}
          count={liveWarningCount}
          onContinue={() => void handleWarningContinue()}
        />
      )}

      {showExitModal && (
        <CourseExitModal
          onCancel={() => setShowExitModal(false)}
          onConfirm={() => {
            isExitingRef.current = true;
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => undefined);
            }
            window.location.href = "/dashboard";
          }}
        />
      )}

      {(isFailed || awaitingRetakeRestart) && (
        <CourseProctorFailOverlay
          liveWarningCount={liveWarningCount}
          liveWarningHistory={liveWarningHistory}
          retakeCount={retakeCount}
          dbStatus={dbStatus}
          reviewRequest={reviewRequest}
          showReviewForm={showReviewForm}
          explanation={explanation}
          reviewError={reviewError}
          reviewSubmitting={reviewSubmitting}
          restartLoading={proctorRestartLoading}
          onShowReviewForm={() => {
            setReviewError("");
            setShowReviewForm(true);
          }}
          onExplanation={setExplanation}
          onCancelReview={() => {
            setShowReviewForm(false);
            setExplanation("");
            setReviewError("");
          }}
          onSubmitReview={handleSubmitReview}
          onRestartCourse={() => void handleProctorRetakeRestart()}
          onExitToDashboard={() => {
            isExitingRef.current = true;
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => undefined);
            }
            window.location.href = "/dashboard";
          }}
        />
      )}
    </div>
  );
}
