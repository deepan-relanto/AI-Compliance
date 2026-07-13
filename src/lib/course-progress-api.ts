import type { ServerProgressEntry } from "@/lib/progress-api";

const COURSE_PROGRESS_BASE = "/api/course-progress";

export type FetchCourseUserProgressResult =
  | { ok: true; progress: ServerProgressEntry[] }
  | { ok: false; progress: ServerProgressEntry[] };

export async function fetchCourseUserProgress(
  userEmail: string,
): Promise<FetchCourseUserProgressResult> {
  try {
    const res = await fetch(
      `${COURSE_PROGRESS_BASE}?userEmail=${encodeURIComponent(userEmail)}`,
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

export async function syncCourseProgressStart(params: {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  totalSlides: number;
  assignedMcqCount?: number;
  freshStart?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(COURSE_PROGRESS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      message: (data.message as string) ?? "Could not start course session.",
    };
  }
  return { ok: true };
}

export async function finalizeCourseAssessmentScore(
  userEmail: string,
  moduleId: string,
): Promise<{
  scorePercent: number;
  passed: boolean;
  canRetake: boolean;
  mcqCorrect: number;
  mcqTotal: number;
} | null> {
  const res = await fetch(`${COURSE_PROGRESS_BASE}/finalize`, {
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

export async function syncCourseProgressComplete(
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; emailSent?: boolean; message?: string }> {
  try {
    const res = await fetch(`${COURSE_PROGRESS_BASE}/complete`, {
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

export async function syncCourseAbandonmentFailure(params: {
  userEmail: string;
  moduleId: string;
  reason?: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${COURSE_PROGRESS_BASE}/abandon`, {
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

export function syncCourseAbandonmentFailureBeacon(params: {
  userEmail: string;
  moduleId: string;
  reason?: string;
}): void {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const blob = new Blob([JSON.stringify(params)], { type: "application/json" });
  navigator.sendBeacon(`${COURSE_PROGRESS_BASE}/abandon`, blob);
}

export async function syncCourseProctorWarning(params: {
  userEmail: string;
  moduleId: string;
  warningCount: number;
  warningHistory: { reason: string; timestamp: number }[];
  status: string;
  failedReason?: string | null;
}): Promise<void> {
  await fetch(`${COURSE_PROGRESS_BASE}/warning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function syncCourseAcknowledgement(params: {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  feedbackRequired: boolean;
  signatureName?: string;
  digitalSignature?: string;
}): Promise<boolean> {
  const res = await fetch(`${COURSE_PROGRESS_BASE}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return Boolean(data.ok);
}

export async function requestCourseScoreRetake(
  userEmail: string,
  moduleId: string,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${COURSE_PROGRESS_BASE}/retake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, moduleId }),
  });
  const data = await res.json();
  return { ok: Boolean(data.ok), message: data.message };
}
