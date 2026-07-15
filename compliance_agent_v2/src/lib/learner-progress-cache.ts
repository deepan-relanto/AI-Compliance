/**
 * Process-level snapshot of learner MCQ progress for the answer hot path.
 * After warm/first read, validate can skip the progress SELECT.
 */

export type LearnerProgressSnapshot = {
  status: string;
  mcqAnswers: Record<string, boolean>;
  mcqCorrect: number;
  mcqTotal: number;
  scorePercent: number | null;
};

const cache = new Map<string, LearnerProgressSnapshot>();

function key(email: string, moduleId: string): string {
  return `${email.trim().toLowerCase()}::${moduleId}`;
}

export function getLearnerProgressSnapshot(
  email: string,
  moduleId: string,
): LearnerProgressSnapshot | null {
  return cache.get(key(email, moduleId)) ?? null;
}

export function setLearnerProgressSnapshot(
  email: string,
  moduleId: string,
  snapshot: LearnerProgressSnapshot,
): void {
  cache.set(key(email, moduleId), {
    status: snapshot.status,
    mcqAnswers: { ...snapshot.mcqAnswers },
    mcqCorrect: snapshot.mcqCorrect,
    mcqTotal: snapshot.mcqTotal,
    scorePercent: snapshot.scorePercent,
  });
}

export function invalidateLearnerProgressSnapshot(
  email: string,
  moduleId: string,
): void {
  cache.delete(key(email, moduleId));
}
