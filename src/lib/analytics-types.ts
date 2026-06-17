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
  /** @deprecated Use learnersStarted in UI — raw progress row count */
  totalAttempts: number;
  learnersStarted: number;
  completed: number;
  failed: number;
  inProgress: number;
  avgScore: number | null;
  passRate: number | null;
  failRate: number | null;
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
  moduleTitle: string;
  batchId: string;
  batchLabel: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
  completedAt: string | null;
  updatedAt: string;
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
