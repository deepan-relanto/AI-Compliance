import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";

export type RosterAssessmentStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "permanently_failed"
  | string;

export type RosterAssessmentLike = {
  status: RosterAssessmentStatus;
  scorePercent?: number | null;
  mcqTotal?: number | null;
};

/**
 * Seat / card KPIs for one module on a batch.
 * Only current roster members are counted. Alumni with leftover marks must not
 * change started/completed/notStarted against the live memberCount denominator.
 */
export function summarizeRosterModule(input: {
  memberCount: number;
  assessments: Array<RosterAssessmentLike | null | undefined>;
}): {
  started: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  avgScore: number | null;
  passRate: number | null;
  compliance: number;
} {
  const memberCount = Math.max(0, input.memberCount);
  let started = 0;
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let failed = 0;
  const scored: number[] = [];
  let passed = 0;

  for (const a of input.assessments) {
    const status = a?.status ?? "not_started";
    if (status === "not_started") notStarted++;
    else started++;
    if (status === "completed") completed++;
    else if (status === "in_progress") inProgress++;
    else if (status === "failed" || status === "permanently_failed") failed++;
    if (a?.scorePercent != null && Number(a.mcqTotal ?? 0) > 0) {
      scored.push(Number(a.scorePercent));
      if (Number(a.scorePercent) >= PASS_THRESHOLD_PERCENT) passed++;
    }
  }

  // Members with no assessment row still count as not started.
  if (input.assessments.length < memberCount) {
    notStarted += memberCount - input.assessments.length;
  }

  return {
    started,
    completed,
    inProgress,
    notStarted,
    failed,
    avgScore:
      scored.length > 0
        ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
        : null,
    passRate:
      scored.length > 0 ? Math.round((100 * passed) / scored.length) : null,
    compliance:
      memberCount > 0 ? Math.round((100 * completed) / memberCount) : 0,
  };
}
