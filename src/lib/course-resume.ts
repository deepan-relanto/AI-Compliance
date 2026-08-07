/** Durable resume state for course Save & Exit (course_progress.resume_checkpoint). */

export type CourseResumePhase = "content" | "quiz";

export interface CourseResumeCheckpoint {
  contentStepIndex: number;
  phase: CourseResumePhase;
  pdfPage: number;
  htmlSlideIndex: number;
  quizIndex: number;
  savedAt: string;
}

export function parseCourseResumeCheckpoint(
  raw: unknown,
): CourseResumeCheckpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const contentStepIndex = Number(v.contentStepIndex);
  const pdfPage = Number(v.pdfPage);
  const htmlSlideIndex = Number(v.htmlSlideIndex);
  const quizIndex = Number(v.quizIndex);
  const phase = v.phase === "quiz" ? "quiz" : v.phase === "content" ? "content" : null;
  if (
    phase == null ||
    !Number.isFinite(contentStepIndex) ||
    contentStepIndex < 0 ||
    !Number.isFinite(pdfPage) ||
    pdfPage < 1 ||
    !Number.isFinite(htmlSlideIndex) ||
    htmlSlideIndex < 0 ||
    !Number.isFinite(quizIndex) ||
    quizIndex < 0
  ) {
    return null;
  }
  const savedAt =
    typeof v.savedAt === "string" && v.savedAt.length > 0
      ? v.savedAt
      : new Date().toISOString();
  return {
    contentStepIndex: Math.floor(contentStepIndex),
    phase,
    pdfPage: Math.floor(pdfPage),
    htmlSlideIndex: Math.floor(htmlSlideIndex),
    quizIndex: Math.floor(quizIndex),
    savedAt,
  };
}

export function buildCourseResumeCheckpoint(params: {
  contentStepIndex: number;
  phase: CourseResumePhase;
  pdfPage: number;
  htmlSlideIndex: number;
  quizIndex: number;
}): CourseResumeCheckpoint {
  return {
    contentStepIndex: Math.max(0, Math.floor(params.contentStepIndex)),
    phase: params.phase,
    pdfPage: Math.max(1, Math.floor(params.pdfPage)),
    htmlSlideIndex: Math.max(0, Math.floor(params.htmlSlideIndex)),
    quizIndex: Math.max(0, Math.floor(params.quizIndex)),
    savedAt: new Date().toISOString(),
  };
}
