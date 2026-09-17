/**
 * Dual-batch learners can have two progress rows for the same course.
 * Marks, KPIs, and CSV must keep one row per person per course.
 */

type AssessmentPick = {
  moduleId: string;
  status: string;
  scorePercent: number | null;
  completedAt: string | null;
  lastAccessedAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
};

function statusRank(status: string): number {
  if (status === "completed") return 0;
  if (status === "failed" || status === "permanently_failed") return 1;
  if (status === "in_progress") return 2;
  return 3;
}

function activityTs(row: AssessmentPick): number {
  return (
    Date.parse(
      row.completedAt ??
        row.lastAccessedAt ??
        row.updatedAt ??
        row.startedAt ??
        "",
    ) || 0
  );
}

/** True when `incoming` should replace `current` for the same module. */
export function isPreferredAssessment(
  incoming: AssessmentPick,
  current: AssessmentPick,
): boolean {
  const statusDelta = statusRank(incoming.status) - statusRank(current.status);
  if (statusDelta !== 0) return statusDelta < 0;
  const incomingScore = incoming.scorePercent ?? -1;
  const currentScore = current.scorePercent ?? -1;
  if (incomingScore !== currentScore) return incomingScore > currentScore;
  return activityTs(incoming) > activityTs(current);
}

export function uniqueAssessmentsByModule<T extends AssessmentPick>(
  rows: T[],
): T[] {
  const byModule = new Map<string, T>();
  for (const row of rows) {
    const existing = byModule.get(row.moduleId);
    if (!existing || isPreferredAssessment(row, existing)) {
      byModule.set(row.moduleId, row);
    }
  }
  return [...byModule.values()];
}
