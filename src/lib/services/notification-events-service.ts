import type { AnalyticsTrack } from "@/lib/services/batch-performance-service";
import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

export interface OutreachSummary {
  reminderEmailsSent: number;
  uniqueLearnersReminded: number;
  avgRemindersPerLearner: number | null;
  failedGuidanceEmailsSent: number;
  uniqueLearnersGuided: number;
  inviteEmailsLogged: number;
  completionEmailsLogged: number;
}

export interface OutreachLearnerRow {
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string | null;
  batchLabel: string;
  reminderCount: number;
  lastRemindedAt: string | null;
  failedGuidanceCount: number;
  lastFailedGuidanceAt: string | null;
  inviteCount: number;
  lastInvitedAt: string | null;
}

const EMPTY_SUMMARY: OutreachSummary = {
  reminderEmailsSent: 0,
  uniqueLearnersReminded: 0,
  avgRemindersPerLearner: null,
  failedGuidanceEmailsSent: 0,
  uniqueLearnersGuided: 0,
  inviteEmailsLogged: 0,
  completionEmailsLogged: 0,
};

export async function getOutreachAnalytics(
  sql: Sql,
  track: AnalyticsTrack,
): Promise<{ summary: OutreachSummary; learners: OutreachLearnerRow[] }> {
  const isCourse = track === "course";

  try {
    const [summaryRows, learnerRows] = await Promise.all([
      isCourse
        ? sql`
            SELECT
              COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_emails_sent,
              COUNT(DISTINCT LOWER(user_email)) FILTER (WHERE notification_type = 'reminder')::int AS unique_learners_reminded,
              COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_emails_sent,
              COUNT(DISTINCT LOWER(user_email)) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS unique_learners_guided,
              COUNT(*) FILTER (WHERE notification_type = 'invited')::int AS invite_emails_logged,
              COUNT(*) FILTER (WHERE notification_type = 'completed')::int AS completion_emails_logged
            FROM course_notification_events
          `
        : sql`
            SELECT
              COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_emails_sent,
              COUNT(DISTINCT LOWER(user_email)) FILTER (WHERE notification_type = 'reminder')::int AS unique_learners_reminded,
              COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_emails_sent,
              COUNT(DISTINCT LOWER(user_email)) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS unique_learners_guided,
              COUNT(*) FILTER (WHERE notification_type = 'invited')::int AS invite_emails_logged,
              COUNT(*) FILTER (WHERE notification_type = 'completed')::int AS completion_emails_logged
            FROM training_notification_events
          `,
      isCourse
        ? sql`
            SELECT
              LOWER(e.user_email) AS user_email,
              e.module_id,
              COALESCE(m.title, e.module_id) AS module_title,
              e.batch_id,
              COALESCE(b.label, e.batch_id, '—') AS batch_label,
              COUNT(*) FILTER (WHERE e.notification_type = 'reminder')::int AS reminder_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder') AS last_reminded_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance') AS last_failed_guidance_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'invited')::int AS invite_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited') AS last_invited_at
            FROM course_notification_events e
            LEFT JOIN course_modules m ON m.id = e.module_id
            LEFT JOIN batches b ON b.id = e.batch_id
            WHERE e.notification_type IN ('reminder', 'failed_review_guidance', 'invited')
            GROUP BY LOWER(e.user_email), e.module_id, m.title, e.batch_id, b.label
            ORDER BY
              GREATEST(
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder'), '1970-01-01'::timestamptz),
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance'), '1970-01-01'::timestamptz),
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited'), '1970-01-01'::timestamptz)
              ) DESC
            LIMIT 500
          `
        : sql`
            SELECT
              LOWER(e.user_email) AS user_email,
              e.module_id,
              COALESCE(m.title, e.module_id) AS module_title,
              e.batch_id,
              COALESCE(b.label, e.batch_id, '—') AS batch_label,
              COUNT(*) FILTER (WHERE e.notification_type = 'reminder')::int AS reminder_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder') AS last_reminded_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance') AS last_failed_guidance_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'invited')::int AS invite_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited') AS last_invited_at
            FROM training_notification_events e
            LEFT JOIN training_modules m ON m.id = e.module_id
            LEFT JOIN batches b ON b.id = e.batch_id
            WHERE e.notification_type IN ('reminder', 'failed_review_guidance', 'invited')
            GROUP BY LOWER(e.user_email), e.module_id, m.title, e.batch_id, b.label
            ORDER BY
              GREATEST(
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder'), '1970-01-01'::timestamptz),
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance'), '1970-01-01'::timestamptz),
                COALESCE(MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited'), '1970-01-01'::timestamptz)
              ) DESC
            LIMIT 500
          `,
    ]);

    const s = summaryRows[0] ?? {};
    const reminderEmailsSent = Number(s.reminder_emails_sent ?? 0);
    const uniqueLearnersReminded = Number(s.unique_learners_reminded ?? 0);
    const summary: OutreachSummary = {
      reminderEmailsSent,
      uniqueLearnersReminded,
      avgRemindersPerLearner:
        uniqueLearnersReminded > 0
          ? Math.round((reminderEmailsSent / uniqueLearnersReminded) * 10) / 10
          : null,
      failedGuidanceEmailsSent: Number(s.failed_guidance_emails_sent ?? 0),
      uniqueLearnersGuided: Number(s.unique_learners_guided ?? 0),
      inviteEmailsLogged: Number(s.invite_emails_logged ?? 0),
      completionEmailsLogged: Number(s.completion_emails_logged ?? 0),
    };

    const learners: OutreachLearnerRow[] = learnerRows.map((r) => ({
      userEmail: r.user_email as string,
      moduleId: r.module_id as string,
      moduleTitle: (r.module_title as string) ?? (r.module_id as string),
      batchId: (r.batch_id as string) ?? null,
      batchLabel: (r.batch_label as string) ?? "—",
      reminderCount: Number(r.reminder_count ?? 0),
      lastRemindedAt: (r.last_reminded_at as string) ?? null,
      failedGuidanceCount: Number(r.failed_guidance_count ?? 0),
      lastFailedGuidanceAt: (r.last_failed_guidance_at as string) ?? null,
      inviteCount: Number(r.invite_count ?? 0),
      lastInvitedAt: (r.last_invited_at as string) ?? null,
    }));

    return { summary, learners };
  } catch (err) {
    // Tables may not exist yet before migrate runs — keep analytics usable.
    console.warn("[outreach-analytics]", err);
    return { summary: EMPTY_SUMMARY, learners: [] };
  }
}

export type OutreachCountKey = `${string}::${string}`;

export function outreachCountKey(
  userEmail: string,
  moduleId: string,
): OutreachCountKey {
  return `${userEmail.trim().toLowerCase()}::${moduleId}`;
}

/** Reminder / failed-guidance counts for learners in one batch. */
export async function getBatchOutreachCounts(
  sql: Sql,
  batchId: string,
  moduleIds: string[],
  track: AnalyticsTrack,
): Promise<
  Map<
    OutreachCountKey,
    {
      reminderCount: number;
      lastRemindedAt: string | null;
      failedGuidanceCount: number;
      lastFailedGuidanceAt: string | null;
    }
  >
> {
  const map = new Map<
    OutreachCountKey,
    {
      reminderCount: number;
      lastRemindedAt: string | null;
      failedGuidanceCount: number;
      lastFailedGuidanceAt: string | null;
    }
  >();

  try {
    const isCourse = track === "course";
    // Prefer batch-scoped query (parallel-friendly). Fall back to module filter
    // when callers pass an explicit module list without relying on batch alone.
    const rows =
      moduleIds.length === 0
        ? isCourse
          ? await sql`
              SELECT
                LOWER(user_email) AS user_email,
                module_id,
                COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'reminder') AS last_reminded_at,
                COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'failed_review_guidance') AS last_failed_guidance_at
              FROM course_notification_events
              WHERE batch_id = ${batchId}
                AND notification_type IN ('reminder', 'failed_review_guidance')
              GROUP BY LOWER(user_email), module_id
            `
          : await sql`
              SELECT
                LOWER(user_email) AS user_email,
                module_id,
                COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'reminder') AS last_reminded_at,
                COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'failed_review_guidance') AS last_failed_guidance_at
              FROM training_notification_events
              WHERE batch_id = ${batchId}
                AND notification_type IN ('reminder', 'failed_review_guidance')
              GROUP BY LOWER(user_email), module_id
            `
        : isCourse
          ? await sql`
              SELECT
                LOWER(user_email) AS user_email,
                module_id,
                COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'reminder') AS last_reminded_at,
                COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'failed_review_guidance') AS last_failed_guidance_at
              FROM course_notification_events
              WHERE module_id = ANY(${moduleIds})
                AND (
                  batch_id = ${batchId}
                  OR batch_id IS NULL
                )
                AND notification_type IN ('reminder', 'failed_review_guidance')
              GROUP BY LOWER(user_email), module_id
            `
          : await sql`
              SELECT
                LOWER(user_email) AS user_email,
                module_id,
                COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'reminder') AS last_reminded_at,
                COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
                MAX(sent_at) FILTER (WHERE notification_type = 'failed_review_guidance') AS last_failed_guidance_at
              FROM training_notification_events
              WHERE module_id = ANY(${moduleIds})
                AND (
                  batch_id = ${batchId}
                  OR batch_id IS NULL
                )
                AND notification_type IN ('reminder', 'failed_review_guidance')
              GROUP BY LOWER(user_email), module_id
            `;

    for (const r of rows) {
      map.set(outreachCountKey(r.user_email as string, r.module_id as string), {
        reminderCount: Number(r.reminder_count ?? 0),
        lastRemindedAt: (r.last_reminded_at as string) ?? null,
        failedGuidanceCount: Number(r.failed_guidance_count ?? 0),
        lastFailedGuidanceAt: (r.last_failed_guidance_at as string) ?? null,
      });
    }
  } catch (err) {
    console.warn("[batch-outreach-counts]", err);
  }

  return map;
}
