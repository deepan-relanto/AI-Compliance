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
import {
  assignedSeatCount,
  batchSeatCompletion,
} from "@/lib/batch-seat-metrics";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import { resolveDisplayScorePercent } from "@/lib/progress-score";
import { normalizeProgressStatus } from "@/lib/services/progress-db-service";

// NOTE: reconcileInvalidProgressScores / reconcilePassedProgressStatus are
// intentionally NOT called here. Run `npm run db:reconcile-progress` as a
// maintenance job when needed.

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

export async function getAnalytics(
  sql: Sql,
  track: "compliance" | "course" = "compliance",
  options?: { view?: "full" | "home" },
): Promise<AnalyticsPayload> {
  const view = options?.view === "home" ? "home" : "full";
  if (track === "course") {
    return view === "home" ? getCourseHomeAnalytics(sql) : getCourseAnalytics(sql);
  }
  return view === "home" ? getComplianceHomeAnalytics(sql) : getComplianceAnalytics(sql);
}

/** Admin home KPIs — summary + batches + short recent history (skips series/modules/status). */
async function getComplianceHomeAnalytics(sql: Sql): Promise<AnalyticsPayload> {
  const rows = await sql`
    WITH
    summary AS (
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'user') AS total_learners,
        (SELECT COUNT(*)::int FROM batches) AS total_batches,
        (SELECT COUNT(*)::int FROM training_modules WHERE mcq_generation_status = 'completed') AS published_modules,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed'))::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        ROUND(AVG(LEAST(score_percent, 100)) FILTER (WHERE score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE score_percent IS NOT NULL
              AND LEAST(score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings,
        COALESCE(SUM(retake_count), 0)::int AS total_retakes
      FROM assessment_progress
    ),
    batch_stats AS (
      SELECT
        b.id,
        b.label,
        b.member_count,
        (SELECT COUNT(DISTINCT module_id)::int FROM (
          SELECT module_id FROM module_batches WHERE batch_id = b.id
          UNION
          SELECT DISTINCT module_id FROM assessment_progress WHERE batch_id = b.id
        ) mods) AS modules_assigned,
        COUNT(ap.id)::int AS total_attempts,
        COUNT(DISTINCT ap.user_email) FILTER (WHERE ap.id IS NOT NULL)::int AS learners_started,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE ap.status IN ('failed', 'permanently_failed'))::int AS failed,
        COUNT(*) FILTER (WHERE ap.status = 'in_progress')::int AS in_progress,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ap.status = 'completed')
          / NULLIF(COUNT(ap.id), 0)
        )::int AS compliance
      FROM batches b
      LEFT JOIN assessment_progress ap ON ap.batch_id = b.id
      GROUP BY b.id, b.label, b.member_count
    ),
    history AS (
      SELECT
        ap.user_email,
        ap.module_id,
        ap.module_title,
        ap.batch_id,
        COALESCE(b.label, ap.batch_id) AS batch_label,
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
        ap.warning_count
      FROM assessment_progress ap
      LEFT JOIN batches b ON b.id = ap.batch_id
      ORDER BY COALESCE(ap.last_accessed_at, ap.completed_at, ap.updated_at) DESC NULLS LAST
      LIMIT 8
    )
    SELECT
      (SELECT row_to_json(summary.*) FROM summary) AS summary,
      (SELECT COALESCE(json_agg(batch_stats.* ORDER BY label), '[]'::json) FROM batch_stats) AS batches,
      (SELECT COALESCE(json_agg(history.*), '[]'::json) FROM history) AS history
  `;

  const row = rows[0] ?? {};
  return mapAnalyticsRows(
    [row.summary as Record<string, unknown>].filter(Boolean),
    (row.batches as Record<string, unknown>[]) ?? [],
    [],
    [],
    [],
    (row.history as Record<string, unknown>[]) ?? [],
  );
}

async function getCourseHomeAnalytics(sql: Sql): Promise<AnalyticsPayload> {
  const rows = await sql`
    WITH
    summary AS (
      SELECT
        (SELECT COUNT(DISTINCT LOWER(ub.user_email))::int
         FROM user_batches ub
         INNER JOIN users u ON LOWER(u.email) = LOWER(ub.user_email) AND u.role = 'user'
         WHERE (
             EXISTS (
               SELECT 1 FROM course_module_batches cmb WHERE cmb.batch_id = ub.batch_id
             )
             OR EXISTS (
               SELECT 1 FROM course_progress cp WHERE cp.batch_id = ub.batch_id
             )
           )) AS total_learners,
        (SELECT COUNT(DISTINCT batch_id)::int FROM (
           SELECT batch_id FROM course_module_batches
           UNION
           SELECT batch_id FROM course_progress WHERE batch_id IS NOT NULL
         ) t) AS total_batches,
        (SELECT COUNT(*)::int FROM course_modules) AS published_modules,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed'))::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        ROUND(AVG(LEAST(score_percent, 100)) FILTER (WHERE score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE score_percent IS NOT NULL
              AND LEAST(score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings,
        COALESCE(SUM(retake_count), 0)::int AS total_retakes
      FROM course_progress
    ),
    batch_stats AS (
      SELECT
        b.id,
        b.label,
        b.member_count,
        (SELECT COUNT(DISTINCT module_id)::int FROM (
          SELECT module_id FROM course_module_batches WHERE batch_id = b.id
          UNION
          SELECT DISTINCT module_id FROM course_progress WHERE batch_id = b.id
        ) mods) AS modules_assigned,
        COUNT(ap.id)::int AS total_attempts,
        COUNT(DISTINCT ap.user_email) FILTER (WHERE ap.id IS NOT NULL)::int AS learners_started,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE ap.status IN ('failed', 'permanently_failed'))::int AS failed,
        COUNT(*) FILTER (WHERE ap.status = 'in_progress')::int AS in_progress,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ap.status = 'completed')
          / NULLIF(COUNT(ap.id), 0)
        )::int AS compliance
      FROM batches b
      LEFT JOIN course_progress ap ON ap.batch_id = b.id
      WHERE EXISTS (SELECT 1 FROM course_module_batches cmb WHERE cmb.batch_id = b.id)
         OR EXISTS (SELECT 1 FROM course_progress cp WHERE cp.batch_id = b.id)
      GROUP BY b.id, b.label, b.member_count
    )
    SELECT
      (SELECT row_to_json(summary.*) FROM summary) AS summary,
      (SELECT COALESCE(json_agg(batch_stats.* ORDER BY label), '[]'::json) FROM batch_stats) AS batches
  `;

  const row = rows[0] ?? {};
  return mapAnalyticsRows(
    [row.summary as Record<string, unknown>].filter(Boolean),
    (row.batches as Record<string, unknown>[]) ?? [],
    [],
    [],
    [],
    [],
  );
}

async function getComplianceAnalytics(sql: Sql): Promise<AnalyticsPayload> {
  // One Neon HTTP round-trip — Promise.all of 6 queries was ~9s due to
  // serverless HTTP serialization / connection overhead.
  const rows = await sql`
    WITH
    summary AS (
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'user') AS total_learners,
        (SELECT COUNT(*)::int FROM batches) AS total_batches,
        (SELECT COUNT(*)::int FROM training_modules WHERE mcq_generation_status = 'completed') AS published_modules,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed'))::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        ROUND(AVG(LEAST(score_percent, 100)) FILTER (WHERE score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE score_percent IS NOT NULL
              AND LEAST(score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings,
        COALESCE(SUM(retake_count), 0)::int AS total_retakes
      FROM assessment_progress
    ),
    batch_stats AS (
      SELECT
        b.id,
        b.label,
        b.member_count,
        (SELECT COUNT(DISTINCT module_id)::int FROM (
          SELECT module_id FROM module_batches WHERE batch_id = b.id
          UNION
          SELECT DISTINCT module_id FROM assessment_progress WHERE batch_id = b.id
        ) mods) AS modules_assigned,
        COUNT(ap.id)::int AS total_attempts,
        COUNT(DISTINCT ap.user_email) FILTER (WHERE ap.id IS NOT NULL)::int AS learners_started,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE ap.status IN ('failed', 'permanently_failed'))::int AS failed,
        COUNT(*) FILTER (WHERE ap.status = 'in_progress')::int AS in_progress,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ap.status = 'completed')
          / NULLIF(COUNT(ap.id), 0)
        )::int AS compliance
      FROM batches b
      LEFT JOIN assessment_progress ap ON ap.batch_id = b.id
      WHERE EXISTS (SELECT 1 FROM module_batches mb WHERE mb.batch_id = b.id)
         OR EXISTS (SELECT 1 FROM assessment_progress ap2 WHERE ap2.batch_id = b.id)
      GROUP BY b.id, b.label, b.member_count
    ),
    series AS (
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
    ),
    module_stats AS (
      SELECT
        ap.module_id,
        ap.module_title,
        COUNT(*)::int AS attempt_count,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed_count,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate
      FROM assessment_progress ap
      GROUP BY ap.module_id, ap.module_title
    ),
    status_stats AS (
      SELECT status, COUNT(*)::int AS count
      FROM assessment_progress
      GROUP BY status
    ),
    history AS (
      SELECT
        ap.user_email,
        ap.module_id,
        ap.module_title,
        ap.batch_id,
        COALESCE(b.label, ap.batch_id) AS batch_label,
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
        ap.warning_count
      FROM assessment_progress ap
      LEFT JOIN batches b ON b.id = ap.batch_id
      ORDER BY COALESCE(ap.last_accessed_at, ap.completed_at, ap.updated_at) DESC NULLS LAST
      LIMIT 100
    )
    SELECT
      (SELECT row_to_json(summary.*) FROM summary) AS summary,
      (SELECT COALESCE(json_agg(batch_stats.* ORDER BY label), '[]'::json) FROM batch_stats) AS batches,
      (SELECT COALESCE(json_agg(series.* ORDER BY date), '[]'::json) FROM series) AS series,
      (SELECT COALESCE(json_agg(module_stats.* ORDER BY attempt_count DESC, module_title), '[]'::json) FROM module_stats) AS modules,
      (SELECT COALESCE(json_agg(status_stats.* ORDER BY count DESC), '[]'::json) FROM status_stats) AS status,
      (SELECT COALESCE(json_agg(history.*), '[]'::json) FROM history) AS history
  `;

  const row = rows[0] ?? {};
  return mapAnalyticsRows(
    [row.summary as Record<string, unknown>].filter(Boolean),
    (row.batches as Record<string, unknown>[]) ?? [],
    (row.series as Record<string, unknown>[]) ?? [],
    (row.modules as Record<string, unknown>[]) ?? [],
    (row.status as Record<string, unknown>[]) ?? [],
    (row.history as Record<string, unknown>[]) ?? [],
  );
}

async function getCourseAnalytics(sql: Sql): Promise<AnalyticsPayload> {
  const rows = await sql`
    WITH
    summary AS (
      SELECT
        (SELECT COUNT(DISTINCT LOWER(ub.user_email))::int
         FROM user_batches ub
         INNER JOIN users u ON LOWER(u.email) = LOWER(ub.user_email) AND u.role = 'user'
         WHERE (
             EXISTS (
               SELECT 1 FROM course_module_batches cmb WHERE cmb.batch_id = ub.batch_id
             )
             OR EXISTS (
               SELECT 1 FROM course_progress cp WHERE cp.batch_id = ub.batch_id
             )
           )) AS total_learners,
        (SELECT COUNT(DISTINCT batch_id)::int FROM (
           SELECT batch_id FROM course_module_batches
           UNION
           SELECT batch_id FROM course_progress WHERE batch_id IS NOT NULL
         ) t) AS total_batches,
        (SELECT COUNT(*)::int FROM course_modules) AS published_modules,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed'))::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        ROUND(AVG(LEAST(score_percent, 100)) FILTER (WHERE score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE score_percent IS NOT NULL
              AND LEAST(score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings,
        COALESCE(SUM(retake_count), 0)::int AS total_retakes
      FROM course_progress
    ),
    batch_stats AS (
      SELECT
        b.id,
        b.label,
        b.member_count,
        (SELECT COUNT(DISTINCT module_id)::int FROM (
          SELECT module_id FROM course_module_batches WHERE batch_id = b.id
          UNION
          SELECT DISTINCT module_id FROM course_progress WHERE batch_id = b.id
        ) mods) AS modules_assigned,
        COUNT(ap.id)::int AS total_attempts,
        COUNT(DISTINCT ap.user_email) FILTER (WHERE ap.id IS NOT NULL)::int AS learners_started,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE ap.status IN ('failed', 'permanently_failed'))::int AS failed,
        COUNT(*) FILTER (WHERE ap.status = 'in_progress')::int AS in_progress,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ap.status = 'completed')
          / NULLIF(COUNT(ap.id), 0)
        )::int AS compliance
      FROM batches b
      LEFT JOIN course_progress ap ON ap.batch_id = b.id
      WHERE EXISTS (SELECT 1 FROM course_module_batches cmb WHERE cmb.batch_id = b.id)
         OR EXISTS (SELECT 1 FROM course_progress cp WHERE cp.batch_id = b.id)
      GROUP BY b.id, b.label, b.member_count
    ),
    series AS (
      SELECT
        TO_CHAR(day::date, 'YYYY-MM-DD') AS date,
        completions::int,
        failures::int
      FROM (
        SELECT
          DATE(COALESCE(completed_at, updated_at)) AS day,
          COUNT(*) FILTER (WHERE status = 'completed') AS completions,
          COUNT(*) FILTER (WHERE status IN ('failed', 'permanently_failed')) AS failures
        FROM course_progress
        WHERE COALESCE(completed_at, updated_at) >= NOW() - INTERVAL '30 days'
          AND status IN ('completed', 'failed', 'permanently_failed')
        GROUP BY DATE(COALESCE(completed_at, updated_at))
      ) sub
    ),
    module_stats AS (
      SELECT
        ap.module_id,
        ap.module_title,
        COUNT(*)::int AS attempt_count,
        COUNT(*) FILTER (WHERE ap.status = 'completed')::int AS completed_count,
        ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (WHERE ap.score_percent IS NOT NULL))::int AS avg_score,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE ap.score_percent IS NOT NULL
              AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
          )
          / NULLIF(COUNT(*) FILTER (WHERE ap.score_percent IS NOT NULL), 0)
        )::int AS pass_rate
      FROM course_progress ap
      GROUP BY ap.module_id, ap.module_title
    ),
    status_stats AS (
      SELECT status, COUNT(*)::int AS count
      FROM course_progress
      GROUP BY status
    ),
    history AS (
      SELECT
        ap.user_email,
        ap.module_id,
        ap.module_title,
        ap.batch_id,
        COALESCE(b.label, ap.batch_id) AS batch_label,
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
        ap.warning_count
      FROM course_progress ap
      LEFT JOIN batches b ON b.id = ap.batch_id
      ORDER BY COALESCE(ap.last_accessed_at, ap.completed_at, ap.updated_at) DESC NULLS LAST
      LIMIT 100
    )
    SELECT
      (SELECT row_to_json(summary.*) FROM summary) AS summary,
      (SELECT COALESCE(json_agg(batch_stats.* ORDER BY label), '[]'::json) FROM batch_stats) AS batches,
      (SELECT COALESCE(json_agg(series.* ORDER BY date), '[]'::json) FROM series) AS series,
      (SELECT COALESCE(json_agg(module_stats.* ORDER BY attempt_count DESC, module_title), '[]'::json) FROM module_stats) AS modules,
      (SELECT COALESCE(json_agg(status_stats.* ORDER BY count DESC), '[]'::json) FROM status_stats) AS status,
      (SELECT COALESCE(json_agg(history.*), '[]'::json) FROM history) AS history
  `;

  const row = rows[0] ?? {};
  return mapAnalyticsRows(
    [row.summary as Record<string, unknown>].filter(Boolean),
    (row.batches as Record<string, unknown>[]) ?? [],
    (row.series as Record<string, unknown>[]) ?? [],
    (row.modules as Record<string, unknown>[]) ?? [],
    (row.status as Record<string, unknown>[]) ?? [],
    (row.history as Record<string, unknown>[]) ?? [],
  );
}

function mapAnalyticsRows(
  summaryRows: Record<string, unknown>[],
  batchRows: Record<string, unknown>[],
  seriesRows: Record<string, unknown>[],
  moduleRows: Record<string, unknown>[],
  statusRows: Record<string, unknown>[],
  historyRows: Record<string, unknown>[],
): AnalyticsPayload {
  const s = summaryRows[0] ?? {};
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
    const memberCount = Number(r.member_count ?? 0);
    const modulesAssigned = Number(r.modules_assigned ?? 0);
    const completed = Number(r.completed ?? 0);
    const seatCount = assignedSeatCount(memberCount, modulesAssigned);
    return {
      id: r.id as string,
      label: r.label as string,
      memberCount,
      modulesAssigned,
      seatCount,
      seatCompletion: batchSeatCompletion({
        memberCount,
        modulesAssigned,
        completed,
      }),
      totalAttempts: Number(r.total_attempts ?? 0),
      learnersStarted: Number(r.learners_started ?? 0),
      completed,
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
        answerCount: mcqCorrect,
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
