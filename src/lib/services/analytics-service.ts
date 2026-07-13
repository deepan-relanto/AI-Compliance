import type { getSql } from "@/lib/db";
import type {
  AnalyticsPayload,
  AnalyticsSummary,
  BatchAnalytics,
  HistoricalRecord,
  ModuleAnalytics,
  StatusBreakdown,
  TimeSeriesPoint,
} from "@/lib/analytics-types";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { countMcqAnswers, resolveDisplayScorePercent } from "@/lib/progress-score";
import { normalizeProgressStatus } from "@/lib/services/progress-db-service";

// NOTE: reconcileInvalidProgressScores / reconcilePassedProgressStatus are
// intentionally NOT called here. Running heavy UPDATE+SELECT repair on every
// dashboard load added 1-4 s of latency. Run `npm run db:reconcile-progress`
// as a maintenance job when needed, or call the functions from a dedicated
// admin action endpoint.

type Sql = ReturnType<typeof getSql>;

const TIME_SERIES_DAYS = 30;

function parseAcknowledgement(raw: unknown): {
  accepted: boolean;
  timestamp: string | null;
} {
  if (!raw) return { accepted: false, timestamp: null };
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") {
      return { accepted: false, timestamp: null };
    }
    const accepted = Boolean((value as { accepted?: boolean }).accepted);
    const ts = (value as { timestamp?: number }).timestamp;
    return {
      accepted,
      timestamp:
        accepted && typeof ts === "number"
          ? new Date(ts).toISOString()
          : null,
    };
  } catch {
    return { accepted: false, timestamp: null };
  }
}

function fillTimeSeries(
  rows: { date: string; completions: number; failures: number }[],
): TimeSeriesPoint[] {
  const map = new Map(rows.map((r) => [r.date, r]));
  const points: TimeSeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = TIME_SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    points.push({
      date: key,
      completions: row?.completions ?? 0,
      failures: row?.failures ?? 0,
    });
  }
  return points;
}

export async function getAnalytics(sql: Sql): Promise<AnalyticsPayload> {
  // Reconcile functions intentionally removed from read path — see comment above.

  const [summaryRows, batchRows, seriesRows, moduleRows, statusRows, historyRows] =
    await Promise.all([
      sql`
        SELECT
          (SELECT COALESCE(SUM(member_count), 0)::int FROM batches) AS total_learners,
          (SELECT COUNT(*)::int FROM batches) AS total_batches,
          (SELECT COUNT(*)::int FROM training_modules WHERE mcq_generation_status = 'completed') AS published_modules,
          (SELECT COUNT(*)::int FROM assessment_progress) AS total_attempts,
          (SELECT COUNT(*)::int FROM assessment_progress WHERE status = 'completed') AS completed_count,
          (SELECT COUNT(*)::int FROM assessment_progress WHERE status IN ('failed', 'permanently_failed')) AS failed_count,
          (SELECT COUNT(*)::int FROM assessment_progress WHERE status = 'in_progress') AS in_progress_count,
          (SELECT ROUND(AVG(LEAST(score_percent, 100)))::int FROM assessment_progress WHERE score_percent IS NOT NULL) AS avg_score,
          (SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE LEAST(score_percent, 100) > ${PASS_THRESHOLD_PERCENT})
            / NULLIF(COUNT(*) FILTER (WHERE score_percent IS NOT NULL), 0)
          )::int FROM assessment_progress) AS pass_rate,
          (SELECT COALESCE(SUM(warning_count), 0)::int FROM assessment_progress) AS total_warnings,
          (SELECT COALESCE(SUM(retake_count), 0)::int FROM assessment_progress) AS total_retakes
      `,
      sql`
        SELECT
          b.id,
          b.label,
          b.member_count,
          COUNT(ap.id)::int AS total_attempts,
          COUNT(DISTINCT ap.user_email) FILTER (WHERE ap.id IS NOT NULL)::int AS learners_started,
          COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE ap.status IN ('failed', 'permanently_failed'))::int AS failed,
          COUNT(*) FILTER (WHERE ap.status = 'in_progress')::int AS in_progress,
          ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE LEAST(ap.score_percent, 100) > ${PASS_THRESHOLD_PERCENT})
            / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
          )::int AS pass_rate,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ap.status = 'completed')
            / NULLIF(COUNT(ap.id), 0)
          )::int AS compliance
        FROM batches b
        LEFT JOIN assessment_progress ap ON ap.batch_id = b.id
        GROUP BY b.id, b.label, b.member_count
        ORDER BY b.label
      `,
      sql`
        SELECT
          TO_CHAR(day::date, 'YYYY-MM-DD') AS date,
          completions::int,
          failures::int
        FROM (
          SELECT
            DATE(COALESCE(completed_at, updated_at)) AS day,
            COUNT(*) FILTER (WHERE status = 'completed') AS completions,
            COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed')) AS failures
          FROM assessment_progress
          WHERE COALESCE(completed_at, updated_at) >= NOW() - INTERVAL '30 days'
            AND status IN ('completed', 'failed', 'permanently_failed')
          GROUP BY DATE(COALESCE(completed_at, updated_at))
        ) sub
        ORDER BY day
      `,
      sql`
        SELECT
          ap.module_id,
          ap.module_title,
          COUNT(*)::int AS attempt_count,
          COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed_count,
          ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE LEAST(ap.score_percent, 100) > ${PASS_THRESHOLD_PERCENT})
            / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
          )::int AS pass_rate
        FROM assessment_progress ap
        GROUP BY ap.module_id, ap.module_title
        ORDER BY attempt_count DESC, ap.module_title
      `,
      sql`
        SELECT status, COUNT(*)::int AS count
        FROM assessment_progress
        GROUP BY status
        ORDER BY count DESC
      `,
      sql`
        SELECT
          ap.user_email,
          ap.module_id,
          ap.module_title,
          ap.batch_id,
          COALESCE(b.label, ub.label) AS batch_label,
          ap.status,
          LEAST(ap.score_percent, 100) AS score_percent,
          ap.mcq_correct,
          ap.mcq_total,
          ap.retake_count,
          ap.acknowledgement,
          ap.completed_at,
          ap.updated_at,
          ap.last_accessed_at,
          ap.current_slide,
          ap.warning_count,
          ap.mcq_answers
        FROM assessment_progress ap
        LEFT JOIN batches b ON b.id = ap.batch_id
        LEFT JOIN users u ON LOWER(u.email) = LOWER(ap.user_email)
        LEFT JOIN batches ub ON ub.id = u.batch_id
        ORDER BY COALESCE(ap.last_accessed_at, ap.completed_at, ap.updated_at) DESC
        LIMIT 500
      `,
    ]);

  const s = summaryRows[0];
  const summary: AnalyticsSummary = {
    totalLearners: Number(s.total_learners ?? 0),
    totalBatches: Number(s.total_batches ?? 0),
    publishedModules: Number(s.published_modules ?? 0),
    totalAttempts: Number(s.total_attempts ?? 0),
    completedCount: Number(s.completed_count ?? 0),
    failedCount: Number(s.failed_count ?? 0),
    inProgressCount: Number(s.in_progress_count ?? 0),
    avgScore: s.avg_score != null ? Number(s.avg_score) : null,
    passRate: s.pass_rate != null ? Number(s.pass_rate) : null,
    totalWarnings: Number(s.total_warnings ?? 0),
    totalRetakes: Number(s.total_retakes ?? 0),
  };

  const batches: BatchAnalytics[] = batchRows.map((r) => {
    const passRate = r.pass_rate != null ? Number(r.pass_rate) : null;
    return {
      id: r.id as string,
      label: r.label as string,
      memberCount: Number(r.member_count ?? 0),
      totalAttempts: Number(r.total_attempts ?? 0),
      learnersStarted: Number(r.learners_started ?? 0),
      completed: Number(r.completed ?? 0),
      failed: Number(r.failed ?? 0),
      inProgress: Number(r.in_progress ?? 0),
      avgScore: r.avg_score != null ? Number(r.avg_score) : null,
      passRate,
      failRate: passRate != null ? 100 - passRate : null,
      compliance: Number(r.compliance ?? 0),
    };
  });

  const timeSeries = fillTimeSeries(
    seriesRows.map((r) => ({
      date: r.date as string,
      completions: Number(r.completions ?? 0),
      failures: Number(r.failures ?? 0),
    })),
  );

  const modules: ModuleAnalytics[] = moduleRows.map((r) => ({
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    attemptCount: Number(r.attempt_count ?? 0),
    completedCount: Number(r.completed_count ?? 0),
    avgScore: r.avg_score != null ? Number(r.avg_score) : null,
    passRate: r.pass_rate != null ? Number(r.pass_rate) : null,
  }));

  const statusBreakdown: StatusBreakdown[] = statusRows.map((r) => ({
    status: r.status as string,
    count: Number(r.count ?? 0),
  }));

  const history: HistoricalRecord[] = historyRows.map((r) => {
    const mcqCorrect = Number(r.mcq_correct ?? 0);
    const mcqTotal = Number(r.mcq_total ?? 0);
    const storedScorePercent =
      r.score_percent != null ? Number(r.score_percent) : null;
    const rawStatus = (r.status as string) ?? "not_started";
    const ack = parseAcknowledgement(r.acknowledgement);
    const status = normalizeProgressStatus(
      rawStatus,
      storedScorePercent,
      (r.completed_at as string) ?? null,
      {
        lastAccessedAt: (r.last_accessed_at as string) ?? null,
        currentSlide: Number(r.current_slide ?? 0),
        answerCount: countMcqAnswers(
          r.mcq_answers as Record<string, boolean> | null,
        ),
        warningCount: Number(r.warning_count ?? 0),
      },
    );
    return {
      userEmail: r.user_email as string,
      moduleId: r.module_id as string,
      moduleTitle: r.module_title as string,
      batchId: r.batch_id as string,
      batchLabel: (r.batch_label as string) ?? r.batch_id,
      status,
      scorePercent: resolveDisplayScorePercent({
        status,
        storedScorePercent,
        mcqCorrect,
        mcqTotal,
      }),
      mcqCorrect,
      mcqTotal,
      retakeCount: Number(r.retake_count ?? 0),
      acknowledged: ack.accepted,
      acknowledgedAt: ack.timestamp,
      completedAt: (r.completed_at as string) ?? null,
      updatedAt: r.updated_at as string,
    };
  });

  return {
    summary,
    batches,
    timeSeries,
    modules,
    statusBreakdown,
    history,
    generatedAt: new Date().toISOString(),
  };
}
