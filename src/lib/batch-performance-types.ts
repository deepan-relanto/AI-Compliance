export interface BatchAssessmentResult {
  moduleId: string;
  moduleTitle: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
  completedAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
  /** First invite email sent (or progress created_at fallback). */
  assignedAt: string | null;
  /** Proctor integrity warnings on the attempt. */
  warningCount: number;
  reminderCount: number;
  lastRemindedAt: string | null;
  failedGuidanceCount: number;
  lastFailedGuidanceAt: string | null;
  /** Invite emails recorded for this learner × module. */
  inviteCount: number;
  /** All outreach emails (invite + reminder + guidance + retake). */
  emailsSent: number;
  /**
   * False when this module has no invite/reminder event history in DB
   * (typical for assignments before email logging). CSV shows "Not available".
   */
  emailHistoryAvailable: boolean;
}

export interface BatchLearnerPerformance {
  email: string;
  displayName: string;
  assessments: BatchAssessmentResult[];
}

export interface BatchModuleRef {
  id: string;
  title: string;
  /** True when still linked via module_batches / course_module_batches. */
  currentlyAssigned: boolean;
}

export interface BatchModuleSummary {
  id: string;
  title: string;
  currentlyAssigned: boolean;
  started: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  avgScore: number | null;
  passRate: number | null;
  compliance: number;
}

export interface BatchPerformancePayload {
  batch: {
    id: string;
    label: string;
    description: string;
    memberCount: number;
  };
  summary: {
    modulesAssigned: number;
    learnersStarted: number;
    completed: number;
    inProgress: number;
    avgScore: number | null;
    passRate: number | null;
    compliance: number;
  };
  modules: BatchModuleRef[];
  /** Per-module KPIs for the batch overview / module filter. */
  moduleSummaries: BatchModuleSummary[];
  learners: BatchLearnerPerformance[];
  generatedAt: string;
}
