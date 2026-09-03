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

/** Reminder / failed-guidance / invite counts for learners in one batch. */
export async function getBatchOutreachCounts(
  sql: Sql,
  batchId: string,
  moduleIds: string[], // reserved for callers that scope to specific modules
  track: AnalyticsTrack,
): Promise<
  Map<
    OutreachCountKey,
    {
      reminderCount: number;
      lastRemindedAt: string | null;
      failedGuidanceCount: number;
      lastFailedGuidanceAt: string | null;
      inviteCount: number;
      lastInvitedAt: string | null;
      assignedAt: string | null;
      retakeEmailCount: number;
      lastRetakeEmailAt: string | null;
      emailsSent: number;
      /** True when any email log exists for this learner×module. */
      hasEmailLog: boolean;
    }
  >
> {
  type Row = {
    reminderCount: number;
    lastRemindedAt: string | null;
    failedGuidanceCount: number;
    lastFailedGuidanceAt: string | null;
    inviteCount: number;
    lastInvitedAt: string | null;
    assignedAt: string | null;
    retakeEmailCount: number;
    lastRetakeEmailAt: string | null;
    emailsSent: number;
    hasEmailLog: boolean;
  };

  const map = new Map<OutreachCountKey, Row>();

  const ensure = (key: OutreachCountKey): Row => {
    let row = map.get(key);
    if (!row) {
      row = {
        reminderCount: 0,
        lastRemindedAt: null,
        failedGuidanceCount: 0,
        lastFailedGuidanceAt: null,
        inviteCount: 0,
        lastInvitedAt: null,
        assignedAt: null,
        retakeEmailCount: 0,
        lastRetakeEmailAt: null,
        emailsSent: 0,
        hasEmailLog: false,
      };
      map.set(key, row);
    }
    return row;
  };

  try {
    const isCourse = track === "course";
    const emailTypes = [
      "invited",
      "reminder",
      "failed_review_guidance",
      "retake_approved",
    ] as const;

    /**
     * Count logged sends attributed to this batch via module assignment —
     * never by primary users.batch_id or bare multi-batch membership.
     */
    const eventRows =
      isCourse
        ? await sql`
            SELECT
              LOWER(e.user_email) AS user_email,
              e.module_id,
              COUNT(*) FILTER (WHERE e.notification_type = 'reminder')::int AS reminder_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder') AS last_reminded_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance') AS last_failed_guidance_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'invited')::int AS invite_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited') AS last_invited_at,
              MIN(e.sent_at) FILTER (
                WHERE e.notification_type = 'invited'
                  AND COALESCE(
                    CASE
                      WHEN e.batch_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM course_module_batches cmb
                        WHERE cmb.module_id = e.module_id AND cmb.batch_id = e.batch_id
                      ) THEN e.batch_id
                    END,
                    (
                      SELECT ub.batch_id
                      FROM user_batches ub
                      INNER JOIN course_module_batches cmb
                        ON cmb.batch_id = ub.batch_id AND cmb.module_id = e.module_id
                      WHERE LOWER(ub.user_email) = LOWER(e.user_email)
                      ORDER BY ub.created_at ASC
                      LIMIT 1
                    ),
                    e.batch_id
                  ) = ${batchId}
              ) AS assigned_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'retake_approved')::int AS retake_email_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'retake_approved') AS last_retake_email_at,
              COUNT(*) FILTER (
                WHERE e.notification_type IN ('invited', 'reminder', 'failed_review_guidance', 'retake_approved')
              )::int AS emails_sent
            FROM course_notification_events e
            WHERE e.notification_type = ANY(${[...emailTypes]})
              AND COALESCE(
                CASE
                  WHEN e.batch_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM course_module_batches cmb
                    WHERE cmb.module_id = e.module_id AND cmb.batch_id = e.batch_id
                  ) THEN e.batch_id
                END,
                (
                  SELECT ub.batch_id
                  FROM user_batches ub
                  INNER JOIN course_module_batches cmb
                    ON cmb.batch_id = ub.batch_id AND cmb.module_id = e.module_id
                  WHERE LOWER(ub.user_email) = LOWER(e.user_email)
                  ORDER BY ub.created_at ASC
                  LIMIT 1
                ),
                e.batch_id
              ) = ${batchId}
            GROUP BY LOWER(e.user_email), e.module_id
          `
        : await sql`
            SELECT
              LOWER(e.user_email) AS user_email,
              e.module_id,
              COUNT(*) FILTER (WHERE e.notification_type = 'reminder')::int AS reminder_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'reminder') AS last_reminded_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'failed_review_guidance') AS last_failed_guidance_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'invited')::int AS invite_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'invited') AS last_invited_at,
              MIN(e.sent_at) FILTER (
                WHERE e.notification_type = 'invited'
                  AND COALESCE(
                    CASE
                      WHEN e.batch_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM module_batches mb
                        WHERE mb.module_id = e.module_id AND mb.batch_id = e.batch_id
                      ) THEN e.batch_id
                    END,
                    (
                      SELECT ub.batch_id
                      FROM user_batches ub
                      INNER JOIN module_batches mb
                        ON mb.batch_id = ub.batch_id AND mb.module_id = e.module_id
                      WHERE LOWER(ub.user_email) = LOWER(e.user_email)
                      ORDER BY ub.created_at ASC
                      LIMIT 1
                    ),
                    e.batch_id
                  ) = ${batchId}
              ) AS assigned_at,
              COUNT(*) FILTER (WHERE e.notification_type = 'retake_approved')::int AS retake_email_count,
              MAX(e.sent_at) FILTER (WHERE e.notification_type = 'retake_approved') AS last_retake_email_at,
              COUNT(*) FILTER (
                WHERE e.notification_type IN ('invited', 'reminder', 'failed_review_guidance', 'retake_approved')
              )::int AS emails_sent
            FROM training_notification_events e
            WHERE e.notification_type = ANY(${[...emailTypes]})
              AND COALESCE(
                CASE
                  WHEN e.batch_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM module_batches mb
                    WHERE mb.module_id = e.module_id AND mb.batch_id = e.batch_id
                  ) THEN e.batch_id
                END,
                (
                  SELECT ub.batch_id
                  FROM user_batches ub
                  INNER JOIN module_batches mb
                    ON mb.batch_id = ub.batch_id AND mb.module_id = e.module_id
                  WHERE LOWER(ub.user_email) = LOWER(e.user_email)
                  ORDER BY ub.created_at ASC
                  LIMIT 1
                ),
                e.batch_id
              ) = ${batchId}
            GROUP BY LOWER(e.user_email), e.module_id
          `;

    for (const r of eventRows) {
      if (
        moduleIds.length > 0 &&
        !moduleIds.includes(r.module_id as string)
      ) {
        continue;
      }
      const key = outreachCountKey(r.user_email as string, r.module_id as string);
      const row = ensure(key);
      row.reminderCount = Number(r.reminder_count ?? 0);
      row.lastRemindedAt = (r.last_reminded_at as string) ?? null;
      row.failedGuidanceCount = Number(r.failed_guidance_count ?? 0);
      row.lastFailedGuidanceAt = (r.last_failed_guidance_at as string) ?? null;
      row.inviteCount = Number(r.invite_count ?? 0);
      row.lastInvitedAt = (r.last_invited_at as string) ?? null;
      row.assignedAt = (r.assigned_at as string) ?? null;
      row.retakeEmailCount = Number(r.retake_email_count ?? 0);
      row.lastRetakeEmailAt = (r.last_retake_email_at as string) ?? null;
      row.emailsSent = Number(r.emails_sent ?? 0);
      row.hasEmailLog = row.emailsSent > 0;
    }

    /** Legacy one-shot invite table (pre-events) — date assigned + invite presence. */
    const legacyInviteRows =
      isCourse
        ? await sql`
            SELECT
              LOWER(n.user_email) AS user_email,
              n.module_id,
              n.sent_at AS assigned_at
            FROM course_notifications n
            WHERE n.notification_type = 'invited'
              AND EXISTS (
                SELECT 1
                FROM user_batches ub
                WHERE ub.batch_id = ${batchId}
                  AND LOWER(ub.user_email) = LOWER(n.user_email)
              )
          `
        : await sql`
            SELECT
              LOWER(n.user_email) AS user_email,
              n.module_id,
              n.sent_at AS assigned_at
            FROM training_notifications n
            WHERE n.notification_type = 'invited'
              AND EXISTS (
                SELECT 1
                FROM user_batches ub
                WHERE ub.batch_id = ${batchId}
                  AND LOWER(ub.user_email) = LOWER(n.user_email)
              )
          `;

    for (const r of legacyInviteRows) {
      if (
        moduleIds.length > 0 &&
        !moduleIds.includes(r.module_id as string)
      ) {
        continue;
      }
      const key = outreachCountKey(r.user_email as string, r.module_id as string);
      const row = ensure(key);
      row.hasEmailLog = true;
      if (row.inviteCount === 0) {
        row.inviteCount = 1;
        row.emailsSent = Math.max(row.emailsSent, 1);
      }
    }
  } catch (err) {
    console.warn("[batch-outreach-counts]", err);
  }

  return map;
}
