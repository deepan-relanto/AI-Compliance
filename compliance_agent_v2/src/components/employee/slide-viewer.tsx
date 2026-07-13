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
import type { McqQuestion, TrainingModule, ReviewRequest, ModuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ProctorRulesModal } from "@/components/employee/proctor-rules-modal";
import { ChevronLeft, ChevronRight, Clock, Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/lib/auth-store";
import {
  markInProgress,
  isProctorLocked,
  markCompleted,
  getProgress,
  saveAcknowledgement,
  applyScoreResult,
  resetForScoreRetake,
  resetLocalAttempt,
  mergeServerProgress,
  clearLocalModuleProgressIfServerAbsent,
  clearStaleLocalProgress,
  clearAllLocalProgressForUser,
  failAssessmentForAbandonment,
} from "@/lib/progress-store";
import {
  syncAcknowledgement,
  syncProgressStart,
  syncProgressComplete,
  syncAbandonmentFailure,
  finalizeAssessmentScore,
  requestScoreRetake,
  fetchUserProgress,
  type ServerProgressEntry,
} from "@/lib/progress-api";
import { PASS_THRESHOLD_PERCENT, POINTS_PER_MCQ, isPassingScore } from "@/lib/constants";
import { getAllReviewRequests } from "@/lib/review-store";
import {
  fetchLatestReviewRequest,
  submitReviewRequestApi,
} from "@/lib/review-api";
import { useProctorMonitor, toProctorViolationReason } from "@/hooks/use-proctor-monitor";
import { ProctorWarningModal } from "@/components/employee/proctor-warning-modal";
import {
  ASSESSMENT_LOCKOUT_LABELS,
  IntegrityLockoutPanel,
} from "@/components/employee/integrity-lockout-panel";

// Isolated client-only PDF renderer — dynamically imported so pdfjs-dist is
// never bundled into the SSR pass (fixes "Object.defineProperty called on
// non-object" which happens when Webpack eval wraps pdfjs ESM modules).
const PdfPageViewer = dynamic(
  () => import("@/components/employee/pdf-page-viewer").then((m) => m.PdfPageViewer),
  { ssr: false },
);

const SLIDES_BETWEEN_GATES = 3;
const SLIDE_READ_SECONDS = 3.5;

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
  const [slideReadCountdown, setSlideReadCountdown] = useState(SLIDE_READ_SECONDS);

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
  const [isFailed, setIsFailed] = useState(false);

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
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);
  const [quizOnlyIndex, setQuizOnlyIndex] = useState(0);
  const [forceQuizOnlyRetake, setForceQuizOnlyRetake] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<GamificationBadge[]>([]);
  const [badgePopup, setBadgePopup] = useState<GamificationBadge | null>(null);

  const handleProctorLockout = useCallback(() => {
    setIsFailed(true);
    setMcqOpen(false);
  }, []);

  const proctorHook = useProctorMonitor({
    enabled:
      sessionStarted &&
      !reviewOnlyMode &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult &&
      !showExitModal &&
      !isFailed,
    sessionActive: sessionStarted && !reviewOnlyMode && !isFailed,
    username: user?.username,
    moduleId: module.id,
    moduleTitle: module.title,
    batchId: user?.batchId ?? "",
    totalSlides,
    reviewOnlyMode,
    onLockout: handleProctorLockout,
    onStatusChange: (status) => setDbStatus(status),
  });
  const liveWarningCount = proctorHook.warningCount;
  const liveWarningHistory = proctorHook.warningHistory;
  const activeWarningReason = toProctorViolationReason(proctorHook.activeReason);

  const loadIntegrityState = useCallback(async () => {
    if (!user?.username) return;

    let serverEntry: ServerProgressEntry | undefined;
    let progressFetchOk = false;

    try {
      const result = await fetchUserProgress(user.username);
      progressFetchOk = result.ok;
      const entries = result.progress;
      serverEntry = entries.find((e) => e.moduleId === module.id);

      if (progressFetchOk) {
        if (serverEntry) {
          mergeServerProgress(user.username, [
            {
              moduleId: serverEntry.moduleId,
              moduleTitle: serverEntry.moduleTitle,
              batchId: serverEntry.batchId,
              currentSlide: serverEntry.currentSlide,
              totalSlides: serverEntry.totalSlides,
              status: serverEntry.status,
              retakeCount: serverEntry.retakeCount,
              mcqCorrect: serverEntry.mcqCorrect,
              mcqTotal: serverEntry.mcqTotal,
              scorePercent: serverEntry.scorePercent,
              failedReason: serverEntry.failedReason,
              completedAt: serverEntry.completedAt,
              warningCount: serverEntry.warningCount,
            },
          ]);
          if (serverEntry.mcqCorrect > 0) {
            setCorrectAnswers(serverEntry.mcqCorrect);
          }
        } else {
          clearLocalModuleProgressIfServerAbsent(user.username, module.id, false);
          setIsFailed(false);
          proctorHook.hydrateFromProgress(null);
          setRetakeCount(0);
          setDbStatus("not_started");
        }

        if (entries.length === 0) {
          clearAllLocalProgressForUser(user.username);
        } else {
          clearStaleLocalProgress(user.username, {
            serverModuleIds: entries.map((e) => e.moduleId),
            assignedModuleIds: [module.id],
          });
        }
      }
    } catch {
      /* fall back to local snapshot below */
    }

    const serverFresh =
      !progressFetchOk ||
      !serverEntry ||
      (serverEntry.status === "not_started" &&
        (serverEntry.warningCount ?? 0) === 0);

    const prog = getProgress(user.username, module.id);
    if (prog && !serverFresh) {
      setRetakeCount(prog.retakeCount ?? 0);
      setDbStatus(prog.status);
      setIsFailed(isProctorLocked(prog));
      proctorHook.hydrateFromProgress(prog);
      if (typeof prog.mcqCorrect === "number" && prog.mcqCorrect > 0) {
        setCorrectAnswers(prog.mcqCorrect);
      }

      const storedScore = prog.scorePercent;
      const storedMcqCorrect = prog.mcqCorrect ?? 0;
      const storedMcqTotal = prog.mcqTotal ?? moduleMcqs.length;
      const pendingScoreFailure =
        storedScore != null &&
        !isPassingScore(storedScore) &&
        !isProctorLocked(prog) &&
        !quizOnlyModeFromModule &&
        !ackPendingMode &&
        !reviewOnlyMode;

      if (pendingScoreFailure) {
        const retakes = prog.retakeCount ?? 0;
        setShowProctorRules(false);
        setSessionStarted(true);
        setSessionStartMs((current) => current ?? Date.now());
        setScoreResult({
          scorePercent: storedScore,
          passed: false,
          canRetake: retakes < 2,
          mcqCorrect: storedMcqCorrect,
          mcqTotal: storedMcqTotal,
        });
        setShowScoreResult(true);
      }
    } else {
      setRetakeCount(serverEntry?.retakeCount ?? 0);
      setDbStatus(serverEntry?.status ?? "not_started");
      setIsFailed(false);
      proctorHook.hydrateFromProgress(null);
    }

    try {
      const latest = await fetchLatestReviewRequest(user.username, module.id);
      if (serverFresh && latest?.status === "Pending") {
        setReviewRequest(null);
      } else {
        setReviewRequest(latest);
        const serverNotStarted = serverEntry?.status === "not_started";
        if (latest?.status === "Approved" && serverNotStarted) {
          setIsFailed(false);
          proctorHook.hydrateFromProgress(null);
          setDbStatus("not_started");
          setRetakeCount(serverEntry?.retakeCount ?? prog?.retakeCount ?? 0);
        }
      }
    } catch {
      const requests = getAllReviewRequests();
      const userReqs = requests.filter(
        (r) => r.username === user.username && r.moduleId === module.id,
      );
      setReviewRequest(userReqs.length > 0 ? userReqs[0] : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, module.id, moduleMcqs.length, ackPendingMode, quizOnlyModeFromModule, reviewOnlyMode]);

  useEffect(() => {
    loadIntegrityState();
  }, [loadIntegrityState]);

  const isExitingRef = proctorHook.isExitingRef;
  const earnedBadgeIdsRef = useRef<Set<string>>(new Set());
  const badgeQueueRef = useRef<GamificationBadge[]>([]);
  const badgeShowingRef = useRef(false);
  const answeredQuestionIdsRef = useRef(new Set<string>());
  const ackFlowCompletedRef = useRef(false);

  const isLastSlide = slideIndex === totalSlides - 1;
  const gateIndex = useMemo(
    () => Math.floor(nextClickCount / SLIDES_BETWEEN_GATES),
    [nextClickCount],
  );
  const quizOnlyMode = quizOnlyModeFromModule || forceQuizOnlyRetake;

  useEffect(() => {
    if (!sessionStarted || quizOnlyMode) {
      setSlideReadCountdown(SLIDE_READ_SECONDS);
      return;
    }

    setSlideReadCountdown(SLIDE_READ_SECONDS);
    const id = window.setInterval(() => {
      setSlideReadCountdown((remaining) => Math.max(0, remaining - 0.5));
    }, 500);

    return () => window.clearInterval(id);
  }, [slideIndex, sessionStarted, quizOnlyMode]);

  /** Proctor monitors active is now managed by the useProctorMonitor hook. */

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
    answeredQuestionIdsRef.current = new Set();
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
    if (!sessionStarted || reviewOnlyMode) return;
    enterFullscreen();
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [sessionStarted, reviewOnlyMode, enterFullscreen]);

  useEffect(() => {
    if (!sessionStarted || sessionStartMs === null) return;
    const tick = () => setElapsedMs(Date.now() - sessionStartMs);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionStarted, sessionStartMs]);

  const handleBeginSession = async () => {
    setSessionStartError(null);
    const isFullRetake =
      (getProgress(user?.username ?? "", module.id)?.retakeCount ?? retakeCount) > 0 &&
      !quizOnlyModeFromModule &&
      !forceQuizOnlyRetake;

    if (user?.username) {
      const sync = await syncProgressStart({
        userEmail: user.username,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        assignedMcqCount: moduleMcqs.length,
        freshStart: isFullRetake || freshStart,
      });
      if (!sync.ok) {
        setSessionStartError(
          sync.message ?? "Could not start session. Request a retake if you have failed.",
        );
        return;
      }

      if (isFullRetake) {
        resetLocalAttempt(user.username, module.id);
        setForceQuizOnlyRetake(false);
        answeredQuestionIdsRef.current.clear();
        resetGamificationState();
        setSlideIndex(0);
        setQuizOnlyIndex(0);
        setNextClickCount(0);
        if (reviewRequest?.status === "Approved") {
          setReviewRequest({ ...reviewRequest, status: "Consumed" });
        }
      }
      markInProgress(
        user.username,
        module.id,
        module.title,
        user.batchId,
        totalSlides,
      );
    }
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
    if (!reviewOnlyMode && user?.username) {
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
  }, [
    autoStartSession,
    sessionStartMs,
    reviewOnlyMode,
    user?.username,
    module.id,
    module.title,
    user?.batchId,
    totalSlides,
    moduleMcqs.length,
    freshStart,
  ]);

  const handleWarningContinue = proctorHook.handleWarningContinue;

  // All proctor monitoring (ESC, fullscreen, visibility, blur, beforeunload) is handled
  // by useProctorMonitor hook. Only fullscreen tracking for the UI toggle:
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const openGate = useCallback(() => {
    if (isFailed) return;
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
  }, [isFailed, moduleMcqs, slideIndex, gateIndex]);

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
    if (isFailed) return;
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
    if (slideReadCountdown > 0) {
      return;
    }
    if (isLastSlide) {
      void handleFinishAttempt();
      return;
    }
    const upcoming = nextClickCount + 1;
    if (!reviewOnlyMode && upcoming % SLIDES_BETWEEN_GATES === 0) {
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
    isFailed,
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
    slideReadCountdown,
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

  const finishTrainingCompletion = useCallback(async () => {
    setShowFinalQa(false);
    setShowAcknowledgement(false);
    setShowScoreResult(false);
    setMcqOpen(false);

    let completionMessage = `Thank you. Your training for “${module.title}” is complete — attestation and feedback are on record.`;
    if (user?.username) {
      markCompleted(user.username, module.id);
      const result = await syncProgressComplete(user.username, module.id);
      if (!result.ok) {
        completionMessage =
          "Your training is recorded locally, but we could not finalize it on the server. Please refresh your dashboard or contact Relanto Academy if your status looks wrong.";
      } else if (result.emailSent) {
        completionMessage += " A confirmation email with your results is on its way.";
      } else {
        completionMessage +=
          " We could not send your confirmation email — please check spam or contact Relanto Academy.";
      }
    }

    setCompletionNotice({
      title: "Assessment submitted successfully",
      message: completionMessage,
      variant: "success",
      autoCloseAfterMs: 6000,
      showAcknowledgeButton: false,
      onAcknowledge: closeAfterCompletion,
    });
  }, [user?.username, module.id, module.title, closeAfterCompletion]);

  const goToFeedbackStep = useCallback(() => {
    ackFlowCompletedRef.current = true;
    setMcqOpen(false);
    setForceQuizOnlyRetake(false);
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

    proctorHook.ignoreNextFullscreenEntryRef.current = true;
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
    void enterFullscreen();
    if (moduleMcqs.length) {
      setGateMcq(moduleMcqs[0]);
      setMcqOpen(true);
    }
  };

  const handleCheckpointAnswered = useCallback((
    wasCorrect: boolean,
    meta?: { mcqCorrect?: number; mcqTotal?: number },
  ) => {
    const questionId = gateMcq.id;

    if (typeof meta?.mcqCorrect === "number") {
      setCorrectAnswers(meta.mcqCorrect);
    }

    if (answeredQuestionIdsRef.current.has(questionId)) return;
    answeredQuestionIdsRef.current.add(questionId);

    setAnsweredCount((count) => count + 1);
    unlockBadge("starter");

    if (wasCorrect) {
      if (typeof meta?.mcqCorrect !== "number") {
        setCorrectAnswers((count) => count + 1);
      }
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
    if (isFailed) return;
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

  const checkpointOpen =
    mcqOpen &&
    !isFailed &&
    !activeWarningReason &&
    !showAcknowledgement &&
    !showFinalQa &&
    !showScoreResult &&
    !ackFlowCompletedRef.current;
  /** Block slide navigation during checkpoint, warning, or result modal */
  const slideNavLocked =
    checkpointOpen || !!activeWarningReason || showScoreResult;
  const slideReadLocked = !quizOnlyMode && slideReadCountdown > 0;
  const nextActionLabel =
    reviewOnlyMode && isLastSlide ? "Done" : isLastSlide ? "Finish" : "Next";
  const nextButtonLabel = slideReadLocked
    ? `${nextActionLabel} in ${slideReadCountdown}s`
    : nextActionLabel;

  const passedPendingAcknowledgement =
    showAcknowledgement && Boolean(scoreResult?.passed);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!sessionStarted) return;
      if (quizOnlyMode) return;
      if (checkpointOpen) {
        if (
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
    if (!sessionStarted || !ackPendingMode || ackFlowCompletedRef.current) return;
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
    if (
      !sessionStarted ||
      !quizOnlyMode ||
      isFailed ||
      showAcknowledgement ||
      showFinalQa ||
      showScoreResult
    ) {
      return;
    }
    if (ackFlowCompletedRef.current) return;
    if (!moduleMcqs.length) return;
    setGateMcq(moduleMcqs[quizOnlyIndex] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
  }, [
    sessionStarted,
    quizOnlyMode,
    isFailed,
    quizOnlyIndex,
    moduleMcqs,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
  ]);

  useEffect(() => {
    if (!isFailed) return;
    setMcqOpen(false);
  }, [isFailed]);

  const handleSubmitIntegrityReview = useCallback(
    async (e: React.FormEvent) => {
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
    },
    [
      explanation,
      liveWarningCount,
      module.id,
      module.title,
      user?.username,
    ],
  );

  const isPendingIntegrityReview = reviewRequest?.status === "Pending";
  const isRejectedIntegrityReview = reviewRequest?.status === "Rejected";
  const isPermanentlyIntegrityFailed =
    dbStatus === "permanently_failed" || retakeCount >= 2;

  const integrityLockoutPanel = (
    <IntegrityLockoutPanel
      liveWarningCount={liveWarningCount}
      liveWarningHistory={liveWarningHistory}
      retakeCount={retakeCount}
      reviewRequest={reviewRequest}
      showReviewForm={showReviewForm}
      explanation={explanation}
      reviewError={reviewError}
      reviewSubmitting={reviewSubmitting}
      isPermanentlyFailed={isPermanentlyIntegrityFailed}
      isPendingReview={isPendingIntegrityReview}
      isRejectedReview={isRejectedIntegrityReview}
      sessionStarted={sessionStarted}
      labels={ASSESSMENT_LOCKOUT_LABELS}
      onShowReviewForm={() => {
        setReviewError("");
        setShowReviewForm(true);
      }}
      onExplanationChange={setExplanation}
      onCancelReview={() => {
        setShowReviewForm(false);
        setExplanation("");
        setReviewError("");
      }}
      onSubmitReview={handleSubmitIntegrityReview}
    />
  );

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

  const hasPendingApprovedRetake =
    reviewRequest?.status === "Approved" && dbStatus === "not_started";

  if (!sessionStarted) {
    if (isFailed && dbStatus !== "not_started") {
      return (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-100 p-4">
          {integrityLockoutPanel}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-zinc-100 p-4">
        {hasPendingApprovedRetake && (
          <div className="w-full max-w-lg rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left shadow-sm">
            <p className="text-sm font-semibold text-emerald-800">Retake approved</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Your administrator approved a new attempt. Accept the rules below to begin the
              full training flow.
            </p>
          </div>
        )}
        {sessionStartError && (
          <p className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {sessionStartError}
          </p>
        )}
        <ProctorRulesModal
          open={showProctorRules}
          moduleTitle={module.title}
          onAccept={() => void handleBeginSession()}
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
              className="relative z-[80] flex flex-col flex-1 items-center justify-start md:justify-center overflow-y-auto p-4 sm:p-6 pointer-events-auto w-full h-full"
            >
              <div className="training-form-zone my-auto w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
                <BrandPanelHeader
                  eyebrow="Step 1 of 2 · Compliance attestation"
                  title="Training acknowledgement"
                  description="Review the declaration, sign with your legal name, then continue to feedback."
                  icon={ShieldCheck}
                  compact
                />
                <div className="space-y-4 p-5 sm:p-6">
                <div className="rounded-lg border border-zinc-100 bg-zinc-50/90 p-3.5 space-y-2">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.14em]">
                    I acknowledge that:
                  </p>
                  <ul className="space-y-1.5 text-xs text-zinc-600 leading-normal pl-1">
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
              className="flex min-h-0 flex-1 flex-col"
            >
              {quizOnlyMode ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full rounded-lg border border-[#2e3192]/15 bg-gradient-to-r from-[#2e3192]/8 via-white to-[#3d42a8]/8 px-5 py-4 text-center shadow-[var(--shadow-card)]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f15a24]">
                      Score retake · Round {(retakeCount || 0) + 1}
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
                <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                  <div className="relative min-h-0 flex-1 overflow-hidden">
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
              className="relative z-[80] flex flex-col flex-1 items-center justify-start md:justify-center overflow-y-auto p-4 sm:p-6 pointer-events-auto w-full h-full"
            >
              <div className="training-form-zone my-auto w-full max-w-2xl space-y-4 px-2 sm:px-0">
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
                    void finishTrainingCompletion();
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
            disabled={slideNavLocked || slideReadLocked}
            onClick={tryAdvance}
            className="min-w-[7.75rem] cursor-pointer justify-center bg-[#f15a24] hover:bg-[#d94e1f] text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {slideReadLocked ? <Clock className="h-4 w-4" /> : null}
            {nextButtonLabel}
            {!slideReadLocked ? <ChevronRight className="h-4 w-4" /> : null}
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
            setMcqOpen(false);
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
      {activeWarningReason && !isFailed && (
        <ProctorWarningModal
          open={true}
          reason={activeWarningReason}
          warningCount={liveWarningCount}
          onContinue={() => void handleWarningContinue()}
        />
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
                <li>This attempt will be marked as <span className="font-semibold text-red-600">Failed</span>.</li>
                <li>You will need to start again from the beginning (or request a retake if eligible).</li>
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
                  void (async () => {
                    isExitingRef.current = true;
                    if (user?.username && sessionStarted && !reviewOnlyMode) {
                      const updated = failAssessmentForAbandonment(
                        user.username,
                        module.id,
                        activeWarningReason
                          ? "Assessment abandoned after exiting fullscreen"
                          : "Assessment abandoned",
                      );
                      if (updated) {
                        setDbStatus(updated.status);
                        await syncAbandonmentFailure({
                          userEmail: user.username,
                          moduleId: module.id,
                          reason: updated.failedReason ?? "Assessment abandoned",
                        });
                      }
                    }
                    if (document.fullscreenElement) {
                      await document.exitFullscreen().catch(() => undefined);
                    }
                    window.location.href = "/dashboard";
                  })();
                }}
              >
                Exit Assessment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Failed Lock Screen Overlay (portaled above MCQ checkpoints) ───── */}
      {sessionStarted &&
        isFailed &&
        dbStatus !== "not_started" &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-auto fixed inset-0 z-[310] flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm p-4">
            {integrityLockoutPanel}
          </div>,
          document.body,
        )}
    </div>
  );
}
