import type { getSql } from "@/lib/db";
import type {
  BatchAssessmentResult,
  BatchLearnerPerformance,
  BatchPerformancePayload,
} from "@/lib/batch-performance-types";
import { PASS_THRESHOLD_PERCENT } from "@/lib/constants";
import {
  countMcqAnswers,
  resolveDisplayScorePercent,
} from "@/lib/progress-score";
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

  const [moduleRows, memberRows, gridRows, summaryRows] = await Promise.all([
    isCourse
      ? sql`
          SELECT m.id, m.title
          FROM course_modules m
          INNER JOIN course_module_batches mb ON mb.module_id = m.id
          WHERE mb.batch_id = ${batchId}
          ORDER BY m.title
        `
      : sql`
          SELECT m.id, m.title
          FROM training_modules m
          INNER JOIN module_batches mb ON mb.module_id = m.id
          WHERE mb.batch_id = ${batchId}
            AND m.mcq_generation_status = 'completed'
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
            ap.current_slide,
            ap.warning_count,
            ap.mcq_answers
          FROM users u
          CROSS JOIN (
            SELECT m.id, m.title
            FROM course_modules m
            INNER JOIN course_module_batches mb ON mb.module_id = m.id
            WHERE mb.batch_id = ${batchId}
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
            ap.current_slide,
            ap.warning_count,
            ap.mcq_answers
          FROM users u
          CROSS JOIN (
            SELECT m.id, m.title
            FROM training_modules m
            INNER JOIN module_batches mb ON mb.module_id = m.id
            WHERE mb.batch_id = ${batchId}
              AND m.mcq_generation_status = 'completed'
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
          INNER JOIN course_module_batches mb ON mb.batch_id = ${batchId}
          INNER JOIN course_modules m ON m.id = mb.module_id
          LEFT JOIN course_progress ap
            ON ap.user_email = u.email AND ap.module_id = m.id
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
          INNER JOIN module_batches mb ON mb.batch_id = ${batchId}
          INNER JOIN training_modules m
            ON m.id = mb.module_id AND m.mcq_generation_status = 'completed'
          LEFT JOIN assessment_progress ap
            ON ap.user_email = u.email AND ap.module_id = m.id
          WHERE u.batch_id = ${batchId}
        `,
  ]);

  const modules = moduleRows.map((m) => ({
    id: m.id as string,
    title: m.title as string,
  }));

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
    };
    learner.assessments.push(assessment);
  }

  const s = summaryRows[0] ?? {};
  const memberCount = Number(b.member_count ?? memberRows.length);

  return {
    batch: {
      id: b.id as string,
      label: b.label as string,
      description: (b.description as string) ?? "",
      memberCount,
    },
    summary: {
      modulesAssigned: modules.length,
      learnersStarted: Number(s.learners_started ?? 0),
      completed: Number(s.completed ?? 0),
      inProgress: Number(s.in_progress ?? 0),
      avgScore: s.avg_score != null ? Number(s.avg_score) : null,
      passRate: s.pass_rate != null ? Number(s.pass_rate) : null,
      compliance: Number(s.compliance ?? 0),
    },
    modules,
    learners: Array.from(learnerMap.values()),
    generatedAt: new Date().toISOString(),
  };
}
