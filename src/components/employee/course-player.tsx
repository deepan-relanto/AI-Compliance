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
import { CourseContentOverview } from "@/components/employee/course-content-overview";
import {
  CourseAcknowledgementPanel,
  CourseExitModal,
  CourseProctorFailOverlay,
  CourseWelcomeBackPanel,
} from "@/components/employee/course-player-overlays";
import { ProctorWarningModal } from "@/components/employee/proctor-warning-modal";
import { toProctorViolationReason, useProctorMonitor } from "@/hooks/use-proctor-monitor";
import { isValidSignatureName, normalizeSignatureName } from "@/lib/signature-canvas";
import { RelantoLogo } from "@/components/brand/relanto-logo";
import { Button } from "@/components/ui/button";
import { isHtmlCourseAsset, type CourseStepRow } from "@/lib/course-step-types";
import {
  COURSE_EMBED_COMMAND,
  COURSE_EMBED_EVENT,
  NEXT_SLIDE_COOLDOWN_MS,
  isCourseEmbedState,
  normalizeCourseEmbedState,
  type CourseEmbedState,
} from "@/lib/course-embed";
import {
  buildCourseResumeCheckpoint,
  type CourseResumeCheckpoint,
} from "@/lib/course-resume";
import type { McqQuestion, TrainingModule, ReviewRequest, ModuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatePresence, m as motion, LazyMotion, domAnimation } from "@/lib/motion";
import { ProctorRulesModal } from "@/components/employee/proctor-rules-modal";
import { ChevronRight, Clock, GraduationCap, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  markInProgress,
  isProctorLocked,
  markCompleted,
  getProgress,
  saveAcknowledgement,
  applyScoreResult,
  resetForScoreRetake,
  resetForProctorRetake,
  mergeServerProgress,
  clearLocalModuleProgressIfServerAbsent,
  clearStaleLocalProgress,
  clearAllLocalProgressForUser,
  failAssessmentForAbandonment,
} from "@/lib/progress-store";
import {
  syncCourseAcknowledgement,
  syncCourseProgressStart,
  syncCourseProgressComplete,
  finalizeCourseAssessmentScore,
  requestCourseScoreRetake,
  fetchCourseUserProgress,
  syncCourseAbandonmentFailure,
  syncCourseResumeCheckpoint,
} from "@/lib/course-progress-api";
import type { ServerProgressEntry } from "@/lib/progress-api";
import { PASS_THRESHOLD_PERCENT, POINTS_PER_MCQ, isPassingScore } from "@/lib/constants";
import { getAllReviewRequests } from "@/lib/review-store";
import { fetchLatestCourseReviewRequest, submitCourseReviewRequestApi } from "@/lib/review-api";

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

type CoursePhase = "content" | "quiz";

interface CoursePlayerProps {
  module: TrainingModule;
  steps: CourseStepRow[];
  mcqs?: McqQuestion[];
  freshStart?: boolean;
  resumeCheckpoint?: CourseResumeCheckpoint | null;
}

export function CoursePlayer({
  module,
  steps,
  mcqs = [],
  freshStart = false,
  resumeCheckpoint = null,
}: CoursePlayerProps) {
  const user = useAuthStore((s) => s.user);
  const moduleMcqs = mcqs;
  const allowSaveExit = Boolean(module.allowSaveExit);

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

  /** Ignore accidental ?fresh=1 when resuming a gated Save & Exit course. */
  const shouldResumeFromCheckpoint =
    allowSaveExit &&
    Boolean(resumeCheckpoint) &&
    !quizOnlyModeFromModule &&
    !ackPendingMode;
  const effectiveFreshStart = shouldResumeFromCheckpoint ? false : freshStart;

  const initialCheckpoint = shouldResumeFromCheckpoint ? resumeCheckpoint : null;
  const clampedInitialStep = Math.min(
    Math.max(0, initialCheckpoint?.contentStepIndex ?? 0),
    Math.max(0, contentSteps.length - 1),
  );
  const clampedInitialQuiz = Math.min(
    Math.max(0, initialCheckpoint?.quizIndex ?? 0),
    Math.max(0, moduleMcqs.length - 1),
  );

  const [phase, setPhase] = useState<CoursePhase>(
    quizOnlyModeFromModule
      ? "quiz"
      : initialCheckpoint?.phase === "quiz"
        ? "quiz"
        : "content",
  );
  const [contentStepIndex, setContentStepIndex] = useState(clampedInitialStep);
  const [pdfPage, setPdfPage] = useState(initialCheckpoint?.pdfPage ?? 1);
  const [pdfPages, setPdfPages] = useState(1);
  const [pdfReady, setPdfReady] = useState(true);

  const [mcqOpen, setMcqOpen] = useState(false);
  const [gateMcq, setGateMcq] = useState<McqQuestion>(FALLBACK_MCQ);
  const [quizIndex, setQuizIndex] = useState(
    initialCheckpoint?.phase === "quiz" ? clampedInitialQuiz : 0,
  );
  const [forceQuizOnlyRetake, setForceQuizOnlyRetake] = useState(false);
  const [quizFinalizing, setQuizFinalizing] = useState(false);
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

  // Do not hydrate lockout from localStorage on first paint — stale failed
  // progress flashes the admin-review overlay until the server wipe resolves.
  const [isFailed, setIsFailed] = useState(false);
  const [integrityHydrated, setIntegrityHydrated] = useState(false);

  const proctorRetakeStartedRef = useRef(false);
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
  const [saveExitSaving, setSaveExitSaving] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  /** Suppress fail overlay while navigating away after Exit confirm. */
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);
  const [showProctorRules, setShowProctorRules] = useState(
    () => !autoStartSession && !shouldResumeFromCheckpoint,
  );
  // Auto-start / resume only begin once the server integrity check has landed,
  // otherwise a locked attempt paints live course UI before the review overlay.
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showContentOverview, setShowContentOverview] = useState(false);
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);
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
  /**
   * AnimatePresence mode="sync" keeps the outgoing step mounted briefly. Its
   * iframe cleanup calls ref(null) after the incoming iframe already attached —
   * ignoring null keeps postMessage aimed at the live deck.
   */
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const setHtmlIframeRef = useCallback((node: HTMLIFrameElement | null) => {
    if (node) htmlIframeRef.current = node;
  }, []);
  const [nextSlideCooldownMs, setNextSlideCooldownMs] = useState(0);
  const [nextSlideCooldownToken, setNextSlideCooldownToken] = useState(0);
  const prevSlideCompleteKeyRef = useRef<string | null>(null);
  const skipStepResetRef = useRef(Boolean(initialCheckpoint));
  const pendingHtmlGotoRef = useRef<number | null>(
    initialCheckpoint && initialCheckpoint.htmlSlideIndex > 0
      ? initialCheckpoint.htmlSlideIndex
      : null,
  );
  /** Hide HTML iframe until resume goto is applied (avoids flash of slide 0). */
  const [htmlResumeReady, setHtmlResumeReady] = useState(
    () =>
      !(
        initialCheckpoint &&
        initialCheckpoint.htmlSlideIndex > 0
      ),
  );
  const autosaveInFlightRef = useRef(false);
  const resumeHydratedAnswersRef = useRef(false);
  const answeredQuestionIdsRef = useRef(new Set<string>());
  /** Latest embed state for timers that must not close over stale renders. */
  const htmlEmbedStateRef = useRef<CourseEmbedState | null>(null);
  const htmlAdvanceRetryRef = useRef<number | null>(null);

  const clearHtmlAdvanceRetry = useCallback(() => {
    if (htmlAdvanceRetryRef.current != null) {
      window.clearTimeout(htmlAdvanceRetryRef.current);
      htmlAdvanceRetryRef.current = null;
    }
  }, []);

  const postToHtmlEmbed = useCallback(
    (message: { type: typeof COURSE_EMBED_COMMAND; command: string; index?: number }) => {
      let iframe = htmlIframeRef.current;
      // During step transitions AnimatePresence can leave a detached iframe in
      // the ref; prefer the live deck (last sandbox iframe in the player).
      if (!iframe?.isConnected) {
        const all = document.querySelectorAll(
          ".training-interactive iframe[sandbox]",
        );
        iframe = (all.item(all.length - 1) as HTMLIFrameElement | null) ?? null;
        if (iframe) htmlIframeRef.current = iframe;
      }
      iframe?.contentWindow?.postMessage(message, "*");
    },
    [],
  );

  const currentContentStep = contentSteps[contentStepIndex];
  const isHtmlLessonStep =
    (currentContentStep?.stepType === "pdf" ||
      currentContentStep?.stepType === "scenarios") &&
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

  const buildCurrentCheckpoint = useCallback((): CourseResumeCheckpoint => {
    return buildCourseResumeCheckpoint({
      contentStepIndex,
      phase,
      pdfPage,
      htmlSlideIndex:
        htmlEmbedState?.slideIndex ?? pendingHtmlGotoRef.current ?? 0,
      quizIndex,
    });
  }, [contentStepIndex, phase, pdfPage, htmlEmbedState?.slideIndex, quizIndex]);

  const handleProctorLockout = useCallback(() => {
    setIsFailed(true);
    setMcqOpen(false);
  }, []);

  const proctorHook = useProctorMonitor({
    enabled:
      integrityHydrated &&
      sessionStarted &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult &&
      !showExitModal &&
      !showWelcomeBack &&
      !showContentOverview &&
      !isFailed,
    sessionActive:
      integrityHydrated &&
      sessionStarted &&
      !isFailed &&
      !showWelcomeBack &&
      !showAcknowledgement &&
      !showFinalQa &&
      !showScoreResult &&
      !showExitModal &&
      !showContentOverview,
    username: user?.username,
    moduleId: module.id,
    moduleTitle: module.title,
    batchId: user?.batchId ?? "",
    totalSlides,
    reviewOnlyMode: false,
    courseMode: true,
    allowSaveExit,
    getResumeCheckpoint: allowSaveExit ? buildCurrentCheckpoint : undefined,
    onLockout: handleProctorLockout,
    onStatusChange: (status) => setDbStatus(status),
  });
  const liveWarningCount = proctorHook.warningCount;
  const liveWarningHistory = proctorHook.warningHistory;
  const activeWarningReason = toProctorViolationReason(proctorHook.activeReason);
  const handleWarningContinue = proctorHook.handleWarningContinue;
  const isExitingRef = proctorHook.isExitingRef;

  const loadIntegrityState = useCallback(async () => {
    if (!user?.username) {
      setIntegrityHydrated(true);
      return;
    }

    try {
      const progBefore = getProgress(user.username, module.id);
      const wasLocked = progBefore ? isProctorLocked(progBefore) : false;

      let serverEntry: ServerProgressEntry | undefined;
      let progressFetchOk = false;
      let reviewLatest: Awaited<ReturnType<typeof fetchLatestCourseReviewRequest>> = null;
      let reviewFetchFailed = false;

      const [progressSettled, reviewSettled] = await Promise.allSettled([
        fetchCourseUserProgress(user.username),
        fetchLatestCourseReviewRequest(user.username, module.id),
      ]);

      if (progressSettled.status === "fulfilled") {
        try {
          const result = progressSettled.value;
          progressFetchOk = result.ok;
          const entries = result.progress;
          serverEntry = entries.find((e) => e.moduleId === module.id);

          if (progressFetchOk) {
            const serverGrantedRetake =
              Boolean(serverEntry) &&
              serverEntry!.status === "not_started" &&
              serverEntry!.warningCount === 0 &&
              wasLocked;

            if (serverEntry && !serverGrantedRetake) {
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
              if (
                !resumeHydratedAnswersRef.current &&
                serverEntry.mcqAnswers &&
                Object.keys(serverEntry.mcqAnswers).length > 0
              ) {
                resumeHydratedAnswersRef.current = true;
                answeredQuestionIdsRef.current = new Set(
                  Object.keys(serverEntry.mcqAnswers),
                );
                setAnsweredCount(Object.keys(serverEntry.mcqAnswers).length);
              }
            } else if (serverEntry && serverGrantedRetake) {
              setRetakeCount(serverEntry.retakeCount);
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
      }

      if (reviewSettled.status === "fulfilled") {
        reviewLatest = reviewSettled.value;
      } else {
        reviewFetchFailed = true;
      }

      const serverFresh =
        progressFetchOk &&
        (!serverEntry ||
          (serverEntry.status === "not_started" &&
            (serverEntry.warningCount ?? 0) === 0));

      const prog = getProgress(user.username, module.id);
      const locallyLocked = prog ? isProctorLocked(prog) : false;

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
          !ackPendingMode;

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

      if (!reviewFetchFailed) {
        const latest = reviewLatest;
        if (serverFresh) {
          // Fresh / wiped assignment — never keep stale pending review UI.
          setReviewRequest(latest?.status === "Approved" ? latest : null);
          if (latest?.status !== "Approved") {
            setAwaitingRetakeRestart(false);
          }
        } else {
          setReviewRequest(latest);
        }
        const serverNotStarted = serverEntry?.status === "not_started";
        if (
          latest?.status === "Approved" &&
          (locallyLocked || wasLocked || serverNotStarted) &&
          !proctorRetakeStartedRef.current
        ) {
          if (serverNotStarted) {
            setIsFailed(false);
            proctorHook.hydrateFromProgress(null);
            setDbStatus("not_started");
            setRetakeCount(serverEntry?.retakeCount ?? prog?.retakeCount ?? 0);
          }
          if (serverNotStarted && effectiveFreshStart) {
            // Learner already chose "Retake assessment" on the dashboard —
            // don't make them confirm a restart again, go straight to the rules.
            proctorRetakeStartedRef.current = true;
            setAwaitingRetakeRestart(false);
          } else {
            setAwaitingRetakeRestart(true);
          }
        }
      } else {
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
    } finally {
      setIntegrityHydrated(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.username,
    module.id,
    moduleMcqs.length,
    ackPendingMode,
    quizOnlyModeFromModule,
    effectiveFreshStart,
  ]);

  useEffect(() => {
    loadIntegrityState();
  }, [loadIntegrityState]);

  // While a retake request is pending, pick up the admin decision quickly and
  // also the moment the learner comes back to the tab.
  useEffect(() => {
    if (!user?.username || !(isFailed || awaitingRetakeRestart) || reviewRequest?.status !== "Pending") return;
    const refresh = () => {
      void loadIntegrityState();
    };
    const id = window.setInterval(refresh, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.username, isFailed, awaitingRetakeRestart, reviewRequest?.status, loadIntegrityState]);

  const earnedBadgeIdsRef = useRef<Set<string>>(new Set());
  const badgeQueueRef = useRef<GamificationBadge[]>([]);
  const badgeShowingRef = useRef(false);

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
    if (!integrityHydrated || !sessionStarted || quizOnlyModeFromModule) return;
    enterFullscreen();
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [integrityHydrated, sessionStarted, quizOnlyModeFromModule, enterFullscreen]);

  useEffect(() => {
    if (!sessionStarted || sessionStartMs === null) return;
    const tick = () => setElapsedMs(Date.now() - sessionStartMs);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sessionStarted, sessionStartMs]);

  const handleBeginSession = async () => {
    setSessionStartError(null);
    if (user?.username) {
      const prog = getProgress(user.username, module.id);
      const locked = prog ? isProctorLocked(prog) : false;
      if (locked && reviewRequest?.status !== "Approved") {
        setSessionStartError(
          "This attempt is locked. Request administrator review to retake.",
        );
        setIsFailed(true);
        return;
      }

      const isFullRetake =
        (getProgress(user.username, module.id)?.retakeCount ?? retakeCount) > 0 &&
        !quizOnlyModeFromModule;

      const sync = await syncCourseProgressStart({
        userEmail: user.username,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        assignedMcqCount: moduleMcqs.length,
        // Full retake always wipes; gated resume ignores accidental ?fresh=1.
        freshStart: isFullRetake || (shouldResumeFromCheckpoint ? false : effectiveFreshStart),
      });
      if (!sync.ok) {
        setSessionStartError(
          sync.message ?? "Could not start session. Request a retake if you have failed.",
        );
        return;
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
    if (shouldResumeFromCheckpoint) {
      setShowContentOverview(false);
      setShowWelcomeBack(true);
      if (initialCheckpoint?.phase === "quiz" && moduleMcqs.length > 0) {
        setPhase("quiz");
        setQuizIndex(clampedInitialQuiz);
        setGateMcq(moduleMcqs[clampedInitialQuiz] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
        setMcqOpen(false);
      }
    } else if (contentSteps.length === 0 && !quizOnlyMode) {
      startQuizPhase();
      setShowContentOverview(false);
    } else if (!quizOnlyMode && !ackPendingMode) {
      setShowContentOverview(true);
    } else {
      setShowContentOverview(false);
    }
  };

  useEffect(() => {
    // Wait for the server integrity check: a locked attempt must show the
    // review overlay, never a half-second of live quiz UI.
    if (!autoStartSession || !integrityHydrated || isFailed || awaitingRetakeRestart) {
      return;
    }
    setShowProctorRules(false);
    setSessionStarted(true);
    setShowContentOverview(false);
    if (sessionStartMs === null) {
      setSessionStartMs(Date.now());
    }
  }, [
    autoStartSession,
    integrityHydrated,
    isFailed,
    awaitingRetakeRestart,
    sessionStartMs,
  ]);

  // Save & Exit resume: skip "I understand" — land on Welcome Back immediately.
  const resumeBootstrapRef = useRef(false);
  useEffect(() => {
    if (!shouldResumeFromCheckpoint || resumeBootstrapRef.current) return;
    if (!user?.username || !integrityHydrated) return;
    if (awaitingRetakeRestart || isFailed) return;
    resumeBootstrapRef.current = true;
    setShowProctorRules(false);
    setShowContentOverview(false);
    setShowWelcomeBack(true);
    setSessionStarted(true);
    if (sessionStartMs === null) setSessionStartMs(Date.now());
    markInProgress(
      user.username,
      module.id,
      module.title,
      user.batchId,
      totalSlides,
      { forceResume: true },
    );
    void syncCourseProgressStart({
      userEmail: user.username,
      moduleId: module.id,
      moduleTitle: module.title,
      batchId: user.batchId,
      totalSlides,
      assignedMcqCount: moduleMcqs.length,
      freshStart: false,
    });
    void enterFullscreen();
  }, [
    shouldResumeFromCheckpoint,
    integrityHydrated,
    user?.username,
    user?.batchId,
    module.id,
    module.title,
    totalSlides,
    moduleMcqs.length,
    awaitingRetakeRestart,
    isFailed,
    sessionStartMs,
    enterFullscreen,
  ]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Progress start is deferred until handleBeginSession (or auto-start special modes).
  useEffect(() => {
    if (!autoStartSession || !user?.username) return;
    markInProgress(user.username, module.id, module.title, user.batchId, totalSlides);
    void syncCourseProgressStart({
      userEmail: user.username,
      moduleId: module.id,
      moduleTitle: module.title,
      batchId: user.batchId,
      totalSlides,
      assignedMcqCount: moduleMcqs.length,
      freshStart: effectiveFreshStart,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartSession, user?.username, module.id]);

  const handleFinishAttempt = useCallback(async () => {
    // Require every question to be recorded client-side before finalize.
    const answered = answeredQuestionIdsRef.current.size;
    const total = moduleMcqs.length;
    if (total > 0 && answered < total) {
      setQuizFinalizing(false);
      if (moduleMcqs.length) {
        const idx = Math.min(
          Math.max(answered, 0),
          moduleMcqs.length - 1,
        );
        setQuizIndex(idx);
        setGateMcq(moduleMcqs[idx] ?? FALLBACK_MCQ);
        setMcqOpen(true);
      }
      setCompletionNotice({
        title: "Almost done",
        message: `Please answer all questions before finishing (${answered} of ${total} recorded).`,
        variant: "info",
        acknowledgeLabel: "OK",
        showAcknowledgeButton: true,
        onAcknowledge: () => setCompletionNotice(null),
      });
      return;
    }

    if (!user?.username) {
      setMcqOpen(false);
      setQuizFinalizing(false);
      setCompletionNotice({
        title: "Sign-in required",
        message: "Your session expired before scoring. Please sign in again and retry.",
        variant: "info",
        acknowledgeLabel: "OK",
        showAcknowledgeButton: true,
        onAcknowledge: () => setCompletionNotice(null),
      });
      return;
    }

    const result = await finalizeCourseAssessmentScore(user.username, module.id);
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
      setQuizFinalizing(false);
      setShowScoreResult(true);
      scheduleBadgeFlush(450);
      return;
    }
    // Finalize failed — never open signature without a scored attempt.
    setQuizFinalizing(false);
    setShowAcknowledgement(false);
    if (moduleMcqs.length) {
      setGateMcq(moduleMcqs[Math.min(quizIndex, moduleMcqs.length - 1)] ?? FALLBACK_MCQ);
      setMcqOpen(true);
    }
    setCompletionNotice({
      title: "Could not score attempt",
      message: "Your answers could not be finalized. Please retry the last question or contact your administrator.",
      variant: "info",
      acknowledgeLabel: "OK",
      showAcknowledgeButton: true,
      onAcknowledge: () => setCompletionNotice(null),
    });
  }, [
    user?.username,
    module.id,
    moduleMcqs,
    quizIndex,
    unlockBadge,
    resetAcknowledgementForm,
    scheduleBadgeFlush,
  ]);

  const startQuizPhase = useCallback(() => {
    setPhase("quiz");
    setQuizIndex(0);
    setQuizFinalizing(false);
    answeredQuestionIdsRef.current = new Set();
    if (!moduleMcqs.length) {
      void handleFinishAttempt();
      return;
    }
    setGateMcq(moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
    // Start quiz is always a click — re-assert fullscreen in case resume
    // bootstrap (no user gesture) could not enter it earlier.
    void enterFullscreen();
  }, [moduleMcqs, handleFinishAttempt, enterFullscreen]);

  const nextSlideLocked = isHtmlLessonStep && nextSlideCooldownMs > 0;
  const htmlReadyForNextSlide =
    Boolean(isHtmlLessonStep && htmlEmbedState?.slideComplete && !htmlEmbedState.atEnd);
  /**
   * Scenario decks refuse to advance until a department path is chosen, and the
   * choice lives inside the iframe. Lesson decks are different: an incomplete
   * slide just means Next still has fragments to reveal, so it stays enabled.
   */
  const htmlChoiceRequired = Boolean(
    isHtmlLessonStep &&
      htmlEmbedState?.kind === "scenarios" &&
      !htmlEmbedState.slideComplete,
  );
  const nextFooterLabel = (() => {
    if (htmlChoiceRequired) return "Choose above";
    if (isLastContentUnit) {
      return nextSlideLocked
        ? `Start quiz ${(nextSlideCooldownMs / 1000).toFixed(1)}s`
        : "Start quiz";
    }
    if (htmlReadyForNextSlide) {
      return nextSlideLocked
        ? `Next slide ${(nextSlideCooldownMs / 1000).toFixed(1)}s`
        : "Next slide";
    }
    return "Next";
  })();

  const tryAdvanceContent = useCallback(() => {
    if (phase !== "content" || quizOnlyMode) return;
    if (nextSlideLocked) return;
    if (isHtmlLessonStep) {
      if (!htmlEmbedState?.atEnd) {
        const fromIndex = htmlEmbedState?.slideIndex ?? 0;
        // Fully revealed slides: goto bypasses the iframe's own cooldown so a
        // dropped/locked "next" cannot leave the learner stuck on intro decks.
        const shouldHaveMoved = htmlEmbedState?.slideComplete === true;
        if (shouldHaveMoved) {
          postToHtmlEmbed({
            type: COURSE_EMBED_COMMAND,
            command: "goto",
            index: fromIndex + 1,
          });
        } else {
          postToHtmlEmbed({ type: COURSE_EMBED_COMMAND, command: "next" });
        }
        // If the deck still didn't move (ref race / late mount), nudge again.
        clearHtmlAdvanceRetry();
        if (shouldHaveMoved) {
          htmlAdvanceRetryRef.current = window.setTimeout(() => {
            htmlAdvanceRetryRef.current = null;
            const latest = htmlEmbedStateRef.current;
            if (!latest || latest.slideIndex !== fromIndex) return;
            if (!latest.slideComplete || latest.atEnd) return;
            postToHtmlEmbed({
              type: COURSE_EMBED_COMMAND,
              command: "goto",
              index: fromIndex + 1,
            });
          }, 900);
        }
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
        clearHtmlAdvanceRetry();
        setContentStepIndex((i) => i + 1);
        setPdfPage(1);
        setPdfPages(currentContentStep?.config.pageCount ?? 1);
        htmlEmbedStateRef.current = null;
        setHtmlEmbedState(null);
        setNextSlideCooldownMs(0);
        prevSlideCompleteKeyRef.current = null;
      }
      return;
    }
    clearHtmlAdvanceRetry();
    startQuizPhase();
  }, [
    phase,
    quizOnlyMode,
    nextSlideLocked,
    isHtmlLessonStep,
    htmlEmbedState?.atEnd,
    htmlEmbedState?.slideIndex,
    htmlEmbedState?.slideComplete,
    isPdfStep,
    pdfReady,
    pdfPage,
    pdfPages,
    isLastContentUnit,
    isLastContentStep,
    startQuizPhase,
    clearHtmlAdvanceRetry,
    postToHtmlEmbed,
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

  const finishTrainingCompletion = useCallback(async () => {
    // Keep final-QA / score chrome suppressed and park on a blank dark stage
    // so "Ready for the quiz" never flashes behind the completion notice.
    setShowAcknowledgement(false);
    setShowScoreResult(false);
    setMcqOpen(false);
    setPhase("quiz");
    setShowFinalQa(true);

    let completionMessage = `Thank you. Your training for “${module.title}” is complete — attestation and feedback are on record.`;
    if (user?.username) {
      markCompleted(user.username, module.id);
      const result = await syncCourseProgressComplete(user.username, module.id);
      if (!result.ok) {
        completionMessage =
          "Your training is recorded locally, but we could not finalize it on the server. Please refresh your dashboard or contact Relanto Academy if your status looks wrong.";
      } else if (result.emailSent) {
        completionMessage += " A confirmation email with your results is on its way.";
      }
    }

    setCompletionNotice({
      title: "Course submitted successfully",
      message: completionMessage,
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
    const ok = await syncCourseAcknowledgement({
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
    const res = await requestCourseScoreRetake(user.username, module.id);
    setRetakeLoading(false);
    if (!res.ok) {
      setCompletionNotice({
        title: "Retake not available",
        message:
          res.message ??
          "This attempt cannot be retaken right now. Please contact your administrator.",
        variant: "info",
        acknowledgeLabel: "OK",
        showAcknowledgeButton: true,
        onAcknowledge: () => setCompletionNotice(null),
      });
      return;
    }

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
    setQuizFinalizing(false);
    setPhase("quiz");
    resetGamificationState();
    answeredQuestionIdsRef.current = new Set();
    if (moduleMcqs.length) {
      setGateMcq(moduleMcqs[0]);
      setMcqOpen(true);
    }
  };

  const handleCheckpointAnswered = useCallback(
    (
      wasCorrect: boolean,
      meta?: { mcqCorrect?: number; mcqTotal?: number; questionId?: string },
    ) => {
      // Prefer the questionId the child submitted; falls back to the current
      // gateMcq only for legacy callers. This lets scoring settle correctly even
      // if the learner already advanced past this question.
      const questionId = meta?.questionId ?? gateMcq.id;
      if (answeredQuestionIdsRef.current.has(questionId)) return;
      answeredQuestionIdsRef.current.add(questionId);

      setAnsweredCount((count) => count + 1);
      unlockBadge("starter");

      if (typeof meta?.mcqCorrect === "number") {
        setCorrectAnswers(meta.mcqCorrect);
      } else if (wasCorrect) {
        setCorrectAnswers((count) => count + 1);
      }

      if (wasCorrect) {
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
    scheduleBadgeFlush(420);
    const next = quizIndex + 1;
    if (next < moduleMcqs.length) {
      setQuizIndex(next);
      setGateMcq(moduleMcqs[next] ?? FALLBACK_MCQ);
      return;
    }
    // Last question: keep finalizing until score report opens — never drop into
    // the "Ready for the quiz" shell if the answer ref is momentarily behind.
    setQuizFinalizing(true);
    setMcqOpen(false);

    const finishWhenReady = (attempt: number) => {
      if (answeredQuestionIdsRef.current.has(gateMcq.id)) {
        void handleFinishAttempt();
        return;
      }
      if (attempt >= 8) {
        // Give up waiting — reopen last question with an error, stay out of Ready shell.
        setQuizFinalizing(false);
        setGateMcq(moduleMcqs[Math.min(quizIndex, moduleMcqs.length - 1)] ?? FALLBACK_MCQ);
        setMcqOpen(true);
        setCompletionNotice({
          title: "Answer not saved yet",
          message:
            "Please wait for the last answer to confirm, then tap Continue again.",
          variant: "info",
          acknowledgeLabel: "OK",
          showAcknowledgeButton: true,
          onAcknowledge: () => setCompletionNotice(null),
        });
        return;
      }
      window.setTimeout(() => finishWhenReady(attempt + 1), 200);
    };

    finishWhenReady(0);
  };

  const checkpointOpen =
    mcqOpen &&
    !isFailed &&
    !quizFinalizing &&
    !showAcknowledgement &&
    !showFinalQa &&
    !showScoreResult;
  const navLocked = checkpointOpen || !!activeWarningReason || showScoreResult;
  const passedPendingAcknowledgement = showAcknowledgement && Boolean(scoreResult?.passed);

  useEffect(() => {
    if (!sessionStarted || !ackPendingMode) return;
    setMcqOpen(false);
    setShowScoreResult(false);
    resetAcknowledgementForm();
    setShowAcknowledgement(true);
  }, [sessionStarted, ackPendingMode, resetAcknowledgementForm]);

  useEffect(() => {
    if (
      !sessionStarted ||
      !quizOnlyMode ||
      isFailed ||
      quizFinalizing ||
      showAcknowledgement ||
      showFinalQa ||
      showScoreResult
    ) {
      return;
    }
    if (!moduleMcqs.length) return;
    setPhase("quiz");
    setGateMcq(moduleMcqs[quizIndex] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
    setMcqOpen(true);
  }, [
    sessionStarted,
    quizOnlyMode,
    isFailed,
    quizIndex,
    moduleMcqs,
    quizFinalizing,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
  ]);

  useEffect(() => {
    if (!isFailed) return;
    setMcqOpen(false);
    setQuizFinalizing(false);
    answeredQuestionIdsRef.current = new Set();
  }, [isFailed]);

  useEffect(() => {
    if (skipStepResetRef.current) {
      skipStepResetRef.current = false;
      setNextSlideCooldownMs(0);
      prevSlideCompleteKeyRef.current = null;
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
      return;
    }
    setPdfPage(1);
    htmlEmbedStateRef.current = null;
    setHtmlEmbedState(null);
    setNextSlideCooldownMs(0);
    clearHtmlAdvanceRetry();
    prevSlideCompleteKeyRef.current = null;
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
  }, [
    contentStepIndex,
    currentContentStep?.config.pageCount,
    isPdfStep,
    clearHtmlAdvanceRetry,
  ]);

  useEffect(() => {
    const onEmbedMessage = (event: MessageEvent) => {
      if (!isCourseEmbedState(event.data) || event.data.type !== COURSE_EMBED_EVENT) return;
      if (event.data.kind !== "lesson" && event.data.kind !== "scenarios") return;
      const nextState = normalizeCourseEmbedState(event.data);
      const prev = htmlEmbedStateRef.current;
      htmlEmbedStateRef.current = nextState;
      // Avoid full player re-renders on fragment chatter that doesn't change nav.
      if (
        !prev ||
        prev.kind !== nextState.kind ||
        prev.slideIndex !== nextState.slideIndex ||
        prev.slideCount !== nextState.slideCount ||
        prev.atEnd !== nextState.atEnd ||
        prev.atStart !== nextState.atStart ||
        prev.slideComplete !== nextState.slideComplete
      ) {
        setHtmlEmbedState(nextState);
      }

      const pendingGoto = pendingHtmlGotoRef.current;
      if (pendingGoto != null && pendingGoto > 0) {
        pendingHtmlGotoRef.current = null;
        const target = event.source as Window | null;
        if (target && typeof target.postMessage === "function") {
          target.postMessage(
            { type: COURSE_EMBED_COMMAND, command: "goto", index: pendingGoto },
            "*",
          );
        } else {
          postToHtmlEmbed({
            type: COURSE_EMBED_COMMAND,
            command: "goto",
            index: pendingGoto,
          });
        }
        // Reveal after the embed has processed goto (next tick).
        window.setTimeout(() => setHtmlResumeReady(true), 50);
        return;
      }
      setHtmlResumeReady(true);

      if (!nextState.slideComplete) {
        prevSlideCompleteKeyRef.current = null;
        return;
      }
      const key = `${nextState.kind}:${nextState.slideIndex}:${nextState.slideCount}`;
      if (prevSlideCompleteKeyRef.current === key) return;
      prevSlideCompleteKeyRef.current = key;
      setNextSlideCooldownMs(NEXT_SLIDE_COOLDOWN_MS);
      setNextSlideCooldownToken((t) => t + 1);
    };
    window.addEventListener("message", onEmbedMessage);
    return () => window.removeEventListener("message", onEmbedMessage);
  }, [postToHtmlEmbed]);

  const lastAutosaveKeyRef = useRef<string | null>(null);

  /** Debounced autosave for gated Save & Exit courses. */
  useEffect(() => {
    if (!allowSaveExit || !sessionStarted || !user?.username) return;
    if (
      showWelcomeBack ||
      showContentOverview ||
      showProctorRules ||
      isFailed ||
      showAcknowledgement ||
      showFinalQa ||
      showScoreResult ||
      isNavigatingAway
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (autosaveInFlightRef.current) return;
      const checkpoint = buildCurrentCheckpoint();
      const key = `${checkpoint.contentStepIndex}:${checkpoint.phase}:${checkpoint.pdfPage}:${checkpoint.htmlSlideIndex}:${checkpoint.quizIndex}`;
      if (lastAutosaveKeyRef.current === key) return;
      autosaveInFlightRef.current = true;
      void syncCourseResumeCheckpoint({
        userEmail: user.username!,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        checkpoint,
      })
        .then((result) => {
          if (result.ok) lastAutosaveKeyRef.current = key;
        })
        .finally(() => {
          autosaveInFlightRef.current = false;
        });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [
    allowSaveExit,
    sessionStarted,
    user?.username,
    user?.batchId,
    module.id,
    module.title,
    totalSlides,
    buildCurrentCheckpoint,
    showWelcomeBack,
    showContentOverview,
    showProctorRules,
    isFailed,
    showAcknowledgement,
    showFinalQa,
    showScoreResult,
    isNavigatingAway,
    contentStepIndex,
    phase,
    pdfPage,
    htmlEmbedState?.slideIndex,
    quizIndex,
  ]);

  useEffect(() => {
    if (nextSlideCooldownToken === 0) return;
    const endsAt = Date.now() + NEXT_SLIDE_COOLDOWN_MS;
    setNextSlideCooldownMs(NEXT_SLIDE_COOLDOWN_MS);
    // 200ms is enough for the footer countdown; 50ms was ~16 React commits/slide.
    const id = window.setInterval(() => {
      const left = Math.max(0, endsAt - Date.now());
      setNextSlideCooldownMs(left);
      if (left <= 0) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [nextSlideCooldownToken]);

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
      if (
        navLocked ||
        showAcknowledgement ||
        showFinalQa ||
        showExitModal ||
        showWelcomeBack
      ) {
        return;
      }
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
    showWelcomeBack,
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
      answeredQuestionIdsRef.current = new Set();
      resumeHydratedAnswersRef.current = false;
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
      setShowExitModal(false);
      setShowWelcomeBack(false);
      // A retake is a fresh attempt: drop every Save & Exit resume artifact so
      // no old slide, Welcome Back panel or pending goto leaks into it.
      resumeBootstrapRef.current = true;
      skipStepResetRef.current = false;
      pendingHtmlGotoRef.current = null;
      setHtmlEmbedState(null);
      setHtmlResumeReady(true);
      setNextSlideCooldownMs(0);
      prevSlideCompleteKeyRef.current = null;
      proctorHook.hydrateFromProgress(null);
      setIsFailed(false);
      setAwaitingRetakeRestart(false);
      proctorRetakeStartedRef.current = true;
      setDbStatus("not_started");
      // One-shot into content — do not bounce back through ProctorRulesModal.
      setShowProctorRules(false);
      setSessionStarted(true);
      setSessionStartMs(Date.now());
      setShowContentOverview(contentSteps.length > 0);
      resetAcknowledgementForm();
      await syncCourseProgressStart({
        userEmail: user.username,
        moduleId: module.id,
        moduleTitle: module.title,
        batchId: user.batchId,
        totalSlides,
        assignedMcqCount: moduleMcqs.length,
        freshStart: true,
      });
      markInProgress(
        user.username,
        module.id,
        module.title,
        user.batchId,
        totalSlides,
        { forceResume: true },
      );
      void enterFullscreen();
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
    contentSteps.length,
    loadIntegrityState,
    resetGamificationState,
    resetAcknowledgementForm,
    enterFullscreen,
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
      const request = await submitCourseReviewRequestApi({
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

  // Hold a calm dark stage until the server tells us whether this attempt is
  // locked, resumable or fresh — and until auto-start/resume has committed.
  const bootstrapPending =
    !integrityHydrated ||
    (!isFailed &&
      !awaitingRetakeRestart &&
      !sessionStarted &&
      (shouldResumeFromCheckpoint || autoStartSession));

  if (bootstrapPending) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-zinc-950 text-white">
        <RelantoLogo size="sm" showTagline={false} />
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#f15a24]" />
          Preparing your course…
        </div>
      </div>
    );
  }

  if (!sessionStarted) {
    // Failed lockout OR approved-retake restart — never show ProctorRules first.
    if (
      !isNavigatingAway &&
      (awaitingRetakeRestart || (isFailed && dbStatus !== "not_started"))
    ) {
      return (
        <LazyMotion features={domAnimation}>
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-100 p-4">
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
              window.location.href = "/dashboard";
            }}
          />
        </div>
        </LazyMotion>
      );
    }

    return (
      <LazyMotion features={domAnimation}>
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-100 p-4">
        {sessionStartError && (
          <p className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-700">
            {sessionStartError}
          </p>
        )}
        <ProctorRulesModal
          open={!isNavigatingAway}
          moduleTitle={module.title}
          eyebrow="Proctored course training"
          onAccept={() => void handleBeginSession()}
        />
      </div>
      </LazyMotion>
    );
  }

  const showingOverview =
    showContentOverview && phase === "content" && !quizOnlyMode;

  return (
    <LazyMotion features={domAnimation}>
    <div className="training-interactive fixed inset-0 z-30 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-900">
      <header className="relative z-[70] flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 text-white">
        <div className="flex items-center gap-3">
          <RelantoLogo size="sm" showTagline={false} />
          <span className="inline-flex items-center rounded-md border border-[#2e3192]/30 bg-[#2e3192]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f15a24]">
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
          {phase === "content" &&
            !quizOnlyMode &&
            !showingOverview &&
            contentSteps.length > 0 && (
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
            variant={allowSaveExit ? "primary" : "destructive"}
            size="sm"
            onClick={() => setShowExitModal(true)}
            className={cn(
              "h-8 cursor-pointer px-3 text-xs",
              allowSaveExit && "bg-[#2e3192] hover:bg-[#25277a]",
            )}
          >
            {allowSaveExit ? "Save & exit" : "Exit"}
          </Button>
        </div>
      </header>

      {showWelcomeBack && (
        <CourseWelcomeBackPanel
          learnerName={user?.username?.split("@")[0]}
          moduleTitle={module.title}
          onContinue={() => {
            // Resume bootstrap requests fullscreen in an effect (often blocked).
            // Continue is a real gesture — enter fullscreen before the quiz opens.
            void enterFullscreen();
            setShowWelcomeBack(false);
            if (phase === "quiz" && moduleMcqs.length > 0) {
              setGateMcq(moduleMcqs[quizIndex] ?? moduleMcqs[0] ?? FALLBACK_MCQ);
              setMcqOpen(true);
            }
          }}
        />
      )}

      {showingOverview ? (
        <CourseContentOverview
          moduleTitle={module.title}
          moduleDescription={module.description}
          durationMinutes={module.durationMinutes}
          steps={contentSteps}
          questionCount={moduleMcqs.length}
          onBegin={() => {
            setShowContentOverview(false);
          }}
        />
      ) : (
        <>
      {!showAcknowledgement && !showFinalQa && !showScoreResult && !showWelcomeBack && (
        <div className="grid shrink-0 gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:grid-cols-[minmax(160px,1fr)_auto_auto] sm:items-center">
          <ProgressBar value={progressPercent} />
          <ScoreDisplay correctAnswers={correctAnswers} totalQuestions={totalQuestions} />
          <StreakCounter currentStreak={currentStreak} bestStreak={bestStreak} compact tone="dark" />
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {showWelcomeBack || showingOverview ? (
          <div className="flex min-h-0 flex-1 bg-zinc-950" aria-hidden />
        ) : (
        <AnimatePresence mode="sync">
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
          ) : completionNotice?.variant === "success" ? (
            <motion.div
              key="submitted-blank"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex min-h-0 flex-1 bg-zinc-950"
              aria-hidden
            />
          ) : !showFinalQa ? (
            <motion.div
              key={quizOnlyMode ? "quiz-only" : `step-${contentStepIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1 flex-col p-0"
            >
              {quizOnlyMode ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full rounded-lg border border-[#2e3192]/30 bg-gradient-to-r from-[#2e3192]/20 via-zinc-900 to-[#f15a24]/15 px-5 py-4 text-center shadow-[var(--shadow-card)]"
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
                  {!mcqOpen && !quizFinalizing && (
                    <div className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">
                        Question {Math.min(quizIndex + 1, Math.max(moduleMcqs.length, 1))} of{" "}
                        {Math.max(moduleMcqs.length, 1)}
                      </p>
                    </div>
                  )}
                  {quizFinalizing && (
                    <div className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">Scoring your attempt…</p>
                    </div>
                  )}
                </div>
              ) : phase === "content" && currentContentStep ? (
                <div
                  className={cn(
                    "relative flex min-h-0 flex-1 flex-col",
                    isHtmlLessonStep && !htmlResumeReady && "opacity-0",
                  )}
                >
                  <CourseStepContent
                    step={currentContentStep}
                    pdfPage={pdfPage}
                    pdfPages={pdfPages}
                    moduleTitle={module.title}
                    onPdfPages={handlePdfPagesLoaded}
                    htmlIframeRef={setHtmlIframeRef}
                  />
                </div>
              ) : phase === "quiz" &&
                !mcqOpen &&
                !quizFinalizing &&
                !showScoreResult &&
                !completionNotice &&
                quizIndex === 0 &&
                answeredCount === 0 ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <div className="w-full rounded-lg border border-[#2e3192]/30 bg-gradient-to-r from-[#2e3192]/15 via-zinc-900 to-[#f15a24]/10 px-5 py-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f15a24]">
                      Course assessment
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Ready for the quiz</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Answer all questions to complete the course assessment.
                    </p>
                  </div>
                </div>
              ) : quizFinalizing ? (
                <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center gap-4 p-4">
                  <div className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-8 text-center">
                    <p className="text-sm font-medium text-zinc-300">Scoring your attempt…</p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-600 bg-zinc-900/50 p-10 text-center">
                  <GraduationCap className="h-10 w-10 text-[#2e3192]" />
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
                  track="course"
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
        )}
      </div>

      {phase === "content" &&
        !quizOnlyMode &&
        !showFinalQa &&
        !showAcknowledgement &&
        !showScoreResult &&
        !showWelcomeBack && (
          <footer className="relative z-[70] flex h-14 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4">
            <span className="text-xs text-zinc-500">
              {htmlChoiceRequired ? (
                <span className="text-amber-400">
                  Select an option in the slide to continue
                </span>
              ) : isHtmlLessonStep && htmlEmbedState ? (
                `Slide ${htmlEmbedState.slideIndex + 1} of ${htmlEmbedState.slideCount}`
              ) : (
                "Forward only"
              )}
            </span>
            <div className="flex gap-1">
              {contentSteps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 w-5 rounded-md transition-colors",
                    i <= contentStepIndex
                      ? "bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]"
                      : "bg-zinc-700",
                  )}
                />
              ))}
            </div>
            <Button
              size="sm"
              disabled={
                navLocked ||
                nextSlideLocked ||
                htmlChoiceRequired ||
                (isPdfStep && !pdfReady)
              }
              onClick={tryAdvanceContent}
              className="min-w-[7.5rem] cursor-pointer bg-[#f15a24] text-white hover:bg-[#d94e1f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {nextFooterLabel}
              {!nextSlideLocked && <ChevronRight className="h-4 w-4" />}
            </Button>
          </footer>
        )}
        </>
      )}

      <MCQCheckpoint key={gateMcq.id} {...checkpointProps} variant="modal" />

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

      {activeWarningReason && !isFailed && (
        <ProctorWarningModal
          open
          reason={activeWarningReason}
          warningCount={liveWarningCount}
          continueLabel="Continue course"
          failMessage="One more violation will automatically fail this course attempt."
          onContinue={() => void handleWarningContinue()}
        />
      )}

      {showExitModal && (
        <CourseExitModal
          mode={allowSaveExit ? "save" : "abandon"}
          saving={saveExitSaving}
          onCancel={() => {
            if (saveExitSaving) return;
            setShowExitModal(false);
          }}
          onConfirm={() => {
            void (async () => {
              if (allowSaveExit) {
                setSaveExitSaving(true);
                if (user?.username && sessionStarted) {
                  const result = await syncCourseResumeCheckpoint({
                    userEmail: user.username,
                    moduleId: module.id,
                    moduleTitle: module.title,
                    batchId: user.batchId,
                    totalSlides,
                    checkpoint: buildCurrentCheckpoint(),
                  });
                  if (!result.ok) {
                    setSaveExitSaving(false);
                    setCompletionNotice({
                      title: "Could not save progress",
                      message:
                        result.message ??
                        "Please check your connection and try Save & exit again.",
                      variant: "info",
                      acknowledgeLabel: "OK",
                      onAcknowledge: () => setCompletionNotice(null),
                    });
                    return;
                  }
                  markInProgress(
                    user.username,
                    module.id,
                    module.title,
                    user.batchId,
                    totalSlides,
                    { forceResume: true },
                  );
                  const { invalidateLearnerDashboardClientCache } = await import(
                    "@/lib/progress-api"
                  );
                  invalidateLearnerDashboardClientCache();
                }
                isExitingRef.current = true;
                setIsNavigatingAway(true);
                setShowExitModal(false);
                if (document.fullscreenElement) {
                  await document.exitFullscreen().catch(() => undefined);
                }
                window.location.href = "/dashboard";
                return;
              }

              // Mark exiting FIRST so the admin-review overlay never flashes.
              isExitingRef.current = true;
              setIsNavigatingAway(true);
              setShowExitModal(false);
              if (user?.username && sessionStarted) {
                const reason = activeWarningReason
                  ? "Assessment abandoned after exiting fullscreen"
                  : "Assessment abandoned";
                const updated = failAssessmentForAbandonment(
                  user.username,
                  module.id,
                  reason,
                );
                if (updated) {
                  // Persist failure for the next open — do NOT setIsFailed here
                  // or the review overlay flashes before dashboard navigation.
                  void syncCourseAbandonmentFailure({
                    userEmail: user.username,
                    moduleId: module.id,
                    reason: updated.failedReason ?? reason,
                  });
                }
              }
              if (document.fullscreenElement) {
                await document.exitFullscreen().catch(() => undefined);
              }
              window.location.href = "/dashboard";
            })();
          }}
        />
      )}

      {integrityHydrated &&
        !isNavigatingAway &&
        (isFailed || awaitingRetakeRestart) && (
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
    </LazyMotion>
  );
}
