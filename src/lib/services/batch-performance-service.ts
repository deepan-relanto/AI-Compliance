import type { getSql } from "@/lib/db";
import type {
  BatchAssessmentResult,
  BatchLearnerPerformance,
  BatchModuleSummary,
  BatchPerformancePayload,
} from "@/lib/batch-performance-types";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import {
  countMcqAnswers,
  resolveDisplayScorePercent,
} from "@/lib/progress-score";
import {
  getBatchOutreachCounts,
  outreachCountKey,
} from "@/lib/services/notification-events-service";
import { normalizeProgressStatus } from "@/lib/services/progress-db-service";

type Sql = ReturnType<typeof getSql>;

/** Prefer real display_name; otherwise derive a readable label from email. */
export function formatLearnerDisplayName(displayName: string | null, email: string): string {
  const dn = (displayName ?? "").trim();
  if (dn && dn.toLowerCase() !== email.toLowerCase() && !dn.includes("@")) {
    return dn;
  }
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export type AnalyticsTrack = "compliance" | "course";

export async function getBatchPerformance(
  sql: Sql,
  batchId: string,
  track: AnalyticsTrack = "compliance",
): Promise<BatchPerformancePayload | null> {
  // NOTE: reconcile functions removed from read path — run as maintenance job
  const batchRows = await sql`
    SELECT id, label, description, member_count
    FROM batches
    WHERE id = ${batchId}
    LIMIT 1
  `;
  if (batchRows.length === 0) return null;

  const b = batchRows[0];
  const isCourse = track === "course";

  /**
   * Modules ever tied to this batch: current assignments UNION modules that
   * already have progress rows for this batch_id (historical / unassigned).
   * Read-only — never deletes junction or progress rows.
   */
  const [moduleRows, memberRows, gridRows, summaryRows, outreachCounts] =
    await Promise.all([
    isCourse
      ? sql`
          SELECT
            m.id,
            m.title,
            m.created_at,
            EXISTS (
              SELECT 1 FROM course_module_batches cmb
              WHERE cmb.module_id = m.id AND cmb.batch_id = ${batchId}
            ) AS currently_assigned
          FROM course_modules m
          WHERE m.id IN (
            SELECT module_id FROM course_module_batches WHERE batch_id = ${batchId}
            UNION
            SELECT DISTINCT module_id FROM course_progress WHERE batch_id = ${batchId}
          )
          ORDER BY m.title
        `
      : sql`
          SELECT
            m.id,
            m.title,
            m.created_at,
            EXISTS (
              SELECT 1 FROM module_batches mb
              WHERE mb.module_id = m.id AND mb.batch_id = ${batchId}
            ) AS currently_assigned
          FROM training_modules m
          WHERE m.mcq_generation_status = 'completed'
            AND m.id IN (
              SELECT module_id FROM module_batches WHERE batch_id = ${batchId}
              UNION
              SELECT DISTINCT module_id FROM assessment_progress WHERE batch_id = ${batchId}
            )
          ORDER BY m.title
        `,
    sql`
      SELECT email, display_name
      FROM users
      WHERE batch_id = ${batchId}
      ORDER BY email
    `,
    isCourse
      ? sql`
          SELECT
            u.email,
            COALESCE(u.display_name, u.email) AS display_name,
            bm.id AS module_id,
            bm.title AS module_title,
            ap.status,
            LEAST(ap.score_percent, 100) AS score_percent,
            COALESCE(ap.mcq_correct, 0)::int AS mcq_correct,
            COALESCE(ap.mcq_total, 0)::int AS mcq_total,
            COALESCE(ap.retake_count, 0)::int AS retake_count,
            ap.completed_at,
            ap.updated_at,
            ap.last_accessed_at,
            ap.created_at,
            ap.current_slide,
            ap.warning_count,
            ap.mcq_answers
          FROM users u
          CROSS JOIN (
            SELECT m.id, m.title
            FROM course_modules m
            WHERE m.id IN (
              SELECT module_id FROM course_module_batches WHERE batch_id = ${batchId}
              UNION
              SELECT DISTINCT module_id FROM course_progress WHERE batch_id = ${batchId}
            )
          ) bm
          LEFT JOIN course_progress ap
            ON ap.user_email = u.email
            AND ap.module_id = bm.id
          WHERE u.batch_id = ${batchId}
          ORDER BY u.email, bm.title
        `
      : sql`
          SELECT
            u.email,
            COALESCE(u.display_name, u.email) AS display_name,
            bm.id AS module_id,
            bm.title AS module_title,
            ap.status,
            LEAST(ap.score_percent, 100) AS score_percent,
            COALESCE(ap.mcq_correct, 0)::int AS mcq_correct,
            COALESCE(ap.mcq_total, 0)::int AS mcq_total,
            COALESCE(ap.retake_count, 0)::int AS retake_count,
            ap.completed_at,
            ap.updated_at,
            ap.last_accessed_at,
            ap.created_at,
            ap.current_slide,
            ap.warning_count,
            ap.mcq_answers
          FROM users u
          CROSS JOIN (
            SELECT m.id, m.title
            FROM training_modules m
            WHERE m.mcq_generation_status = 'completed'
              AND m.id IN (
                SELECT module_id FROM module_batches WHERE batch_id = ${batchId}
                UNION
                SELECT DISTINCT module_id FROM assessment_progress WHERE batch_id = ${batchId}
              )
          ) bm
          LEFT JOIN assessment_progress ap
            ON ap.user_email = u.email
            AND ap.module_id = bm.id
          WHERE u.batch_id = ${batchId}
          ORDER BY u.email, bm.title
        `,
    isCourse
      ? sql`
          SELECT
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.user_email IS NOT NULL
                AND (
                  ap.status IN ('in_progress', 'completed', 'failed', 'permanently_failed')
                  OR ap.last_accessed_at IS NOT NULL
                  OR (ap.mcq_answers IS NOT NULL AND ap.mcq_answers::text <> '{}')
                )
            )::int AS learners_started,
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.status = 'completed'
            )::int AS completed,
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.user_email IS NOT NULL
                AND ap.status IN ('in_progress', 'failed')
            )::int AS in_progress,
            ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (
              WHERE ap.score_percent IS NOT NULL AND COALESCE(ap.mcq_total, 0) > 0
            ))::int AS avg_score,
            ROUND(
              100.0 * COUNT(DISTINCT u.email) FILTER (
                WHERE ap.score_percent IS NOT NULL
                  AND COALESCE(ap.mcq_total, 0) > 0
                  AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
              )
              / NULLIF(
                COUNT(DISTINCT u.email) FILTER (
                  WHERE ap.score_percent IS NOT NULL AND COALESCE(ap.mcq_total, 0) > 0
                ),
                0
              )
            )::int AS pass_rate,
            ROUND(
              100.0 * COUNT(DISTINCT u.email) FILTER (WHERE ap.status = 'completed')
              / NULLIF(COUNT(DISTINCT u.email), 0)
            )::int AS compliance
          FROM users u
          CROSS JOIN (
            SELECT module_id AS id FROM course_module_batches WHERE batch_id = ${batchId}
            UNION
            SELECT DISTINCT module_id AS id FROM course_progress WHERE batch_id = ${batchId}
          ) bm
          LEFT JOIN course_progress ap
            ON ap.user_email = u.email AND ap.module_id = bm.id
          WHERE u.batch_id = ${batchId}
        `
      : sql`
          SELECT
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.user_email IS NOT NULL
                AND (
                  ap.status IN ('in_progress', 'completed', 'failed', 'permanently_failed')
                  OR ap.last_accessed_at IS NOT NULL
                  OR (ap.mcq_answers IS NOT NULL AND ap.mcq_answers::text <> '{}')
                )
            )::int AS learners_started,
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.status = 'completed'
            )::int AS completed,
            COUNT(DISTINCT u.email) FILTER (
              WHERE ap.user_email IS NOT NULL
                AND ap.status IN ('in_progress', 'failed')
            )::int AS in_progress,
            ROUND(AVG(LEAST(ap.score_percent, 100)) FILTER (
              WHERE ap.score_percent IS NOT NULL AND COALESCE(ap.mcq_total, 0) > 0
            ))::int AS avg_score,
            ROUND(
              100.0 * COUNT(DISTINCT u.email) FILTER (
                WHERE ap.score_percent IS NOT NULL
                  AND COALESCE(ap.mcq_total, 0) > 0
                  AND LEAST(ap.score_percent, 100) >= ${PASS_THRESHOLD_PERCENT}
              )
              / NULLIF(
                COUNT(DISTINCT u.email) FILTER (
                  WHERE ap.score_percent IS NOT NULL AND COALESCE(ap.mcq_total, 0) > 0
                ),
                0
              )
            )::int AS pass_rate,
            ROUND(
              100.0 * COUNT(DISTINCT u.email) FILTER (WHERE ap.status = 'completed')
              / NULLIF(COUNT(DISTINCT u.email), 0)
            )::int AS compliance
          FROM users u
          CROSS JOIN (
            SELECT mb.module_id AS id
            FROM module_batches mb
            INNER JOIN training_modules tm
              ON tm.id = mb.module_id AND tm.mcq_generation_status = 'completed'
            WHERE mb.batch_id = ${batchId}
            UNION
            SELECT DISTINCT ap.module_id AS id
            FROM assessment_progress ap
            INNER JOIN training_modules tm
              ON tm.id = ap.module_id AND tm.mcq_generation_status = 'completed'
            WHERE ap.batch_id = ${batchId}
          ) bm
          LEFT JOIN assessment_progress ap
            ON ap.user_email = u.email AND ap.module_id = bm.id
          WHERE u.batch_id = ${batchId}
        `,
    // Parallel with grid — batch-scoped outreach (no module-id dependency).
    getBatchOutreachCounts(sql, batchId, [], track),
  ]);

  const modules = moduleRows.map((m) => ({
    id: m.id as string,
    title: m.title as string,
    currentlyAssigned: Boolean(m.currently_assigned),
    createdAt: (m.created_at as string) ?? null,
  }));
  const moduleCreatedAt = new Map(
    modules.map((m) => [m.id, m.createdAt] as const),
  );

  const learnerMap = new Map<string, BatchLearnerPerformance>();
  for (const m of memberRows) {
    const email = m.email as string;
    learnerMap.set(email, {
      email,
      displayName: formatLearnerDisplayName(
        (m.display_name as string) ?? null,
        email,
      ),
      assessments: [],
    });
  }

  for (const row of gridRows) {
    const email = row.email as string;
    let learner = learnerMap.get(email);
    if (!learner) {
      learner = {
        email,
        displayName: formatLearnerDisplayName(row.display_name as string, email),
        assessments: [],
      };
      learnerMap.set(email, learner);
    }

    const storedScorePercent =
      row.score_percent != null ? Number(row.score_percent) : null;
    const rawStatus = (row.status as string | null) ?? null;
    const completedAt = (row.completed_at as string) ?? null;
    const mcqCorrect = Number(row.mcq_correct ?? 0);
    const mcqTotal = Number(row.mcq_total ?? 0);
    const answerCount = countMcqAnswers(
      row.mcq_answers as Record<string, boolean> | null,
    );
    const displayStatus = normalizeProgressStatus(
      rawStatus,
      storedScorePercent,
      completedAt,
      {
        lastAccessedAt: (row.last_accessed_at as string) ?? null,
        currentSlide: Number(row.current_slide ?? 0),
        answerCount,
        warningCount: Number(row.warning_count ?? 0),
      },
    );
    const scorePercent = resolveDisplayScorePercent({
      status: displayStatus,
      storedScorePercent,
      mcqCorrect,
      mcqTotal,
      answerCount,
    });

    const assessment: BatchAssessmentResult = {
      moduleId: row.module_id as string,
      moduleTitle: row.module_title as string,
      status: displayStatus,
      scorePercent,
      mcqCorrect,
      mcqTotal,
      retakeCount: Number(row.retake_count ?? 0),
      completedAt: (row.completed_at as string) ?? null,
      updatedAt: (row.updated_at as string) ?? null,
      lastAccessedAt: (row.last_accessed_at as string) ?? null,
      assignedAt:
        (row.created_at as string) ??
        moduleCreatedAt.get(row.module_id as string) ??
        null,
      warningCount: Number(row.warning_count ?? 0),
      reminderCount: 0,
      lastRemindedAt: null,
      failedGuidanceCount: 0,
      lastFailedGuidanceAt: null,
      inviteCount: 0,
      emailsSent: 0,
      emailHistoryAvailable: false,
    };
    learner.assessments.push(assessment);
  }

  const modulesWithEmailHistory = new Set<string>();
  for (const [key, counts] of outreachCounts) {
    if (counts.hasEmailLog) {
      const moduleId = key.split("::")[1];
      if (moduleId) modulesWithEmailHistory.add(moduleId);
    }
  }

  for (const learner of learnerMap.values()) {
    for (const a of learner.assessments) {
      a.emailHistoryAvailable = modulesWithEmailHistory.has(a.moduleId);
      const counts = outreachCounts.get(outreachCountKey(learner.email, a.moduleId));
      if (!counts) continue;
      a.reminderCount = counts.reminderCount;
      a.lastRemindedAt = counts.lastRemindedAt;
      a.failedGuidanceCount = counts.failedGuidanceCount;
      a.lastFailedGuidanceAt = counts.lastFailedGuidanceAt;
      a.inviteCount = counts.inviteCount;
      a.emailsSent = counts.emailsSent;
      // Prefer invite / legacy notification timestamp as date assigned.
      if (counts.assignedAt) a.assignedAt = counts.assignedAt;
    }
  }

  // Drop helper-only createdAt before returning modules (API shape).
  const modulesOut = modules.map(({ id, title, currentlyAssigned }) => ({
    id,
    title,
    currentlyAssigned,
  }));

  const s = summaryRows[0] ?? {};
  const memberCount = Number(b.member_count ?? memberRows.length);

  const moduleSummaries: BatchModuleSummary[] = modules.map((mod) => {
    let started = 0;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let failed = 0;
    const scored: number[] = [];
    let passed = 0;

    for (const learner of learnerMap.values()) {
      const a = learner.assessments.find((x) => x.moduleId === mod.id);
      const status = a?.status ?? "not_started";
      if (status === "not_started") notStarted++;
      else started++;
      if (status === "completed") completed++;
      else if (status === "in_progress") inProgress++;
      else if (status === "failed" || status === "permanently_failed") failed++;
      if (a?.scorePercent != null && a.mcqTotal > 0) {
        scored.push(a.scorePercent);
        if (a.scorePercent >= PASS_THRESHOLD_PERCENT) passed++;
      }
    }

    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
        : null;
    const passRate =
      scored.length > 0 ? Math.round((100 * passed) / scored.length) : null;
    const compliance =
      memberCount > 0 ? Math.round((100 * completed) / memberCount) : 0;

    return {
      id: mod.id,
      title: mod.title,
      currentlyAssigned: mod.currentlyAssigned,
      started,
      completed,
      inProgress,
      notStarted,
      failed,
      avgScore,
      passRate,
      compliance,
    };
  });

  return {
    batch: {
      id: b.id as string,
      label: b.label as string,
      description: (b.description as string) ?? "",
      memberCount,
    },
    summary: {
      modulesAssigned: modulesOut.filter((m) => m.currentlyAssigned).length || modulesOut.length,
      learnersStarted: Number(s.learners_started ?? 0),
      completed: Number(s.completed ?? 0),
      inProgress: Number(s.in_progress ?? 0),
      avgScore: s.avg_score != null ? Number(s.avg_score) : null,
      passRate: s.pass_rate != null ? Number(s.pass_rate) : null,
      compliance: Number(s.compliance ?? 0),
    },
    modules: modulesOut,
    moduleSummaries,
    learners: Array.from(learnerMap.values()),
    generatedAt: new Date().toISOString(),
  };
}
