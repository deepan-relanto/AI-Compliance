/** Minimum score (inclusive) required to pass an assessment */
export const PASS_THRESHOLD_PERCENT = 70;

/** Point value for each learner checkpoint question. */
export const POINTS_PER_MCQ = 10;

export function isPassingScore(scorePercent: number | null | undefined): boolean {
  return scorePercent != null && scorePercent >= PASS_THRESHOLD_PERCENT;
}
