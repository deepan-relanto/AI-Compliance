export interface AnalyticsSummary {
  totalLearners: number;
  totalBatches: number;
  publishedModules: number;
  totalAttempts: number;
  completedCount: number;
  failedCount: number;
  inProgressCount: number;
  avgScore: number | null;
  passRate: number | null;
  totalWarnings: number;
  totalRetakes: number;
}

export interface BatchAnalytics {
  id: string;
  label: string;
  memberCount: number;
  /** Currently assigned courses/assessments for this batch. */
  modulesAssigned: number;
  /** memberCount × modulesAssigned — one person on one assigned course. */
  seatCount: number;
  /** completed seats / seatCount, capped at 100. */
  seatCompletion: number;
  /** @deprecated Use learnersStarted in UI — raw progress row count */
  totalAttempts: number;
  /** Distinct people who opened any course in this batch. */
  learnersStarted: number;
  /** Completed progress rows (seats), not unique people. */
  completed: number;
  failed: number;
  inProgress: number;
  avgScore: number | null;
  passRate: number | null;
  failRate: number | null;
  /** Attempt-based rate among existing progress rows (not roster-wide). */
  compliance: number;
}

export interface TimeSeriesPoint {
  date: string;
  completions: number;
  failures: number;
}

export interface ModuleAnalytics {
  moduleId: string;
  moduleTitle: string;
  attemptCount: number;
  completedCount: number;
  avgScore: number | null;
  passRate: number | null;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface HistoricalRecord {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string;
  batchLabel: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface AnalyticsExportOptions {
  historyRows: HistoricalRecord[];
  filterSummary?: string;
}

export interface AnalyticsPayload {
  summary: AnalyticsSummary;
  batches: BatchAnalytics[];
  timeSeries: TimeSeriesPoint[];
  modules: ModuleAnalytics[];
  statusBreakdown: StatusBreakdown[];
  history: HistoricalRecord[];
  generatedAt: string;
}
