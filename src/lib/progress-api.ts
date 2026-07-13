import type { ModuleStatus, TrainingModule } from "@/lib/types";

export interface ServerProgressEntry {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  currentSlide: number;
  totalSlides: number;
  status: ModuleStatus;
  warningCount: number;
  retakeCount: number;
  mcqCorrect: number;
  mcqTotal: number;
  scorePercent: number | null;
  failedReason: string | null;
  completedAt: string | null;
}

export type FetchUserProgressResult =
  | { ok: true; progress: ServerProgressEntry[] }
  | { ok: false; progress: ServerProgressEntry[] };

export async function fetchUserProgress(
  userEmail: string,
): Promise<FetchUserProgressResult> {
  try {
    const res = await fetch(
      `/api/progress?userEmail=${encodeURIComponent(userEmail)}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, progress: [] };
    }
    return {
      ok: true,
      progress: Array.isArray(data.progress)
        ? (data.progress as ServerProgressEntry[])
        : [],
    };
  } catch {
    return { ok: false, progress: [] };
  }
}

export type LearnerDashboardProfile = {
  email: string;
  batchId: string;
  displayName: string;
  role: "admin" | "user";
};

export type FetchLearnerDashboardResult =
  | {
      ok: true;
      modules: TrainingModule[];
      progress: ServerProgressEntry[];
      profile: LearnerDashboardProfile;
    }
  | { ok: false; error: string };

/** Load dashboard data — batch and profile are resolved on the server from the session. */
export async function fetchLearnerDashboard(): Promise<FetchLearnerDashboardResult> {
  try {
    const res = await fetch("/api/learner/dashboard", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error:
          (typeof data.error === "string" && data.error) ||
          (typeof data.message === "string" && data.message) ||
          "Could not load your assessments.",
      };
    }
    const email = String(data.email ?? "").trim().toLowerCase();
    return {
      ok: true,
      modules: Array.isArray(data.modules) ? data.modules : [],
      progress: Array.isArray(data.progress) ? data.progress : [],
      profile: {
        email,
        batchId: String(data.batchId ?? ""),
        displayName: String(data.displayName ?? email.split("@")[0] ?? "Learner"),
        role: data.role === "admin" ? "admin" : "user",
      },
    };
  } catch {
    return { ok: false, error: "Network error while loading assessments." };
  }
}

export async function syncProgressStart(params: {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  totalSlides: number;
  assignedMcqCount?: number;
  freshStart?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      message: (data.message as string) ?? "Could not start training session.",
    };
  }
  return { ok: true };
}

export async function syncSlideProgress(
  userEmail: string,
  moduleId: string,
  currentSlide: number,
  meta: { moduleTitle: string; batchId: string; totalSlides: number },
): Promise<void> {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userEmail,
      moduleId,
      currentSlide,
      ...meta,
    }),
  });
}

export async function finalizeAssessmentScore(
  userEmail: string,
  moduleId: string,
): Promise<{
  scorePercent: number;
  passed: boolean;
  canRetake: boolean;
  mcqCorrect: number;
  mcqTotal: number;
} | null> {
  const res = await fetch("/api/progress/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, moduleId }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) return null;
  return {
    scorePercent: data.scorePercent,
    passed: data.passed,
    canRetake: data.canRetake,
    mcqCorrect: data.mcqCorrect,
    mcqTotal: data.mcqTotal,
  };
}

export async function resetAttemptProgress(
  userEmail: string,
  moduleId: string,
): Promise<boolean> {
  const res = await fetch("/api/progress/reset-attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, moduleId }),
  });
  const data = await res.json();
  return Boolean(data.ok);
}

export async function syncProgressComplete(
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; emailSent?: boolean; message?: string }> {
  try {
    const res = await fetch("/api/progress/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail, moduleId }),
      keepalive: true,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      emailSent?: boolean;
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        emailSent: data.emailSent,
        message: data.message ?? `Completion sync failed (${res.status})`,
      };
    }
    return {
      ok: true,
      emailSent: data.emailSent,
      message: data.message,
    };
  } catch {
    return { ok: false, message: "Could not reach the server to finalize completion." };
  }
}

export async function syncAbandonmentFailure(params: {
  userEmail: string;
  moduleId: string;
  reason?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/progress/abandon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      keepalive: true,
    });
    const data = await res.json();
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export function syncAbandonmentFailureBeacon(params: {
  userEmail: string;
  moduleId: string;
  reason?: string;
}): void {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const blob = new Blob([JSON.stringify(params)], { type: "application/json" });
  navigator.sendBeacon("/api/progress/abandon", blob);
}

export async function syncProctorWarning(params: {
  userEmail: string;
  moduleId: string;
  warningCount: number;
  warningHistory: { reason: string; timestamp: number }[];
  status: string;
  failedReason?: string | null;
}): Promise<void> {
  await fetch("/api/progress/warning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function syncAcknowledgement(params: {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  feedbackRequired: boolean;
  signatureName?: string;
  digitalSignature?: string;
}): Promise<boolean> {
  const res = await fetch("/api/progress/acknowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return Boolean(data.ok);
}

export async function requestScoreRetake(
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/progress/retake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, moduleId }),
  });
  const data = await res.json();
  return { ok: Boolean(data.ok), message: data.message };
}
