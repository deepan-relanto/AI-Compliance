import type { ModuleStatus } from "@/lib/types";

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

export async function fetchUserProgress(
  userEmail: string,
): Promise<ServerProgressEntry[]> {
  const res = await fetch(
    `/api/progress?userEmail=${encodeURIComponent(userEmail)}`,
  );
  const data = await res.json();
  if (!res.ok || !data.ok) return [];
  return data.progress as ServerProgressEntry[];
}

export async function syncProgressStart(params: {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  totalSlides: number;
  assignedMcqCount?: number;
  freshStart?: boolean;
}): Promise<void> {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
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
): Promise<boolean> {
  const res = await fetch("/api/progress/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userEmail, moduleId }),
  });
  const data = await res.json();
  return Boolean(data.ok);
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
