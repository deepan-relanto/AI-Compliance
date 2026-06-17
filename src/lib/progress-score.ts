/** Shared MCQ score math and display rules for progress rows. */

export function clampScorePercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function computeScoreFromAnswers(
  answers: Record<string, boolean>,
  assignedTotal: number,
): { mcqCorrect: number; mcqTotal: number; scorePercent: number } {
  const answeredCount = Object.keys(answers).length;
  let mcqCorrect = Object.values(answers).filter(Boolean).length;

  let mcqTotal =
    assignedTotal > 0
      ? Math.max(assignedTotal, answeredCount)
      : answeredCount;

  if (answeredCount > 0 && mcqTotal > answeredCount) {
    mcqTotal = answeredCount;
  }

  if (mcqCorrect > mcqTotal) mcqCorrect = mcqTotal;

  if (answeredCount === 0) {
    return {
      mcqCorrect: 0,
      mcqTotal: assignedTotal > 0 ? assignedTotal : 0,
      scorePercent: 0,
    };
  }

  const rawPercent = Math.round((mcqCorrect / mcqTotal) * 100);
  return {
    mcqCorrect,
    mcqTotal,
    scorePercent: clampScorePercent(rawPercent),
  };
}

/**
 * Score shown in admin/learner UI.
 * While in progress, hide stored scores until the learner has answered at least one checkpoint.
 */
export function resolveDisplayScorePercent(params: {
  status: string;
  storedScorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  answerCount?: number;
}): number | null {
  const { status, storedScorePercent, mcqCorrect, mcqTotal } = params;
  const answerCount =
    params.answerCount ??
    (mcqCorrect > 0 ? mcqCorrect : 0);

  if (status === "not_started") return null;

  if (status === "completed") {
    if (storedScorePercent != null) return clampScorePercent(storedScorePercent);
    if (mcqTotal > 0) return clampScorePercent(Math.round((mcqCorrect / mcqTotal) * 100));
    return null;
  }

  if (storedScorePercent == null) return null;

  const hasAnswered = answerCount > 0;

  // Still taking the assessment — no final score yet.
  if (!hasAnswered && mcqCorrect === 0) return null;

  // Corrupt row: e.g. 100% with 0/7 while in progress.
  if (mcqTotal > 0 && mcqCorrect === 0 && storedScorePercent > 0) {
    return null;
  }

  if (mcqTotal > 0) {
    const computed = clampScorePercent(Math.round((mcqCorrect / mcqTotal) * 100));
    if (Math.abs(computed - storedScorePercent) > 1) {
      return hasAnswered || storedScorePercent === 0 ? computed : null;
    }
  }

  return clampScorePercent(storedScorePercent);
}

export function countMcqAnswers(answers: Record<string, boolean> | null | undefined): number {
  if (!answers || typeof answers !== "object") return 0;
  return Object.keys(answers).length;
}
