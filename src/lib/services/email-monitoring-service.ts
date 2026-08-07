import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

export type EmailMonitoringTrack = "all" | "compliance" | "course";

export type EmailEventType =
  | "invited"
  | "completed"
  | "reminder"
  | "failed_review_guidance"
  | "retake_approved";

export interface EmailMonitoringFilters {
  track?: EmailMonitoringTrack;
  batchId?: string | null;
  moduleId?: string | null;
  type?: EmailEventType | "all";
  search?: string | null;
  limit?: number;
}

export interface EmailEventRow {
  id: string;
  track: "compliance" | "course";
  moduleId: string;
  moduleTitle: string;
  userEmail: string;
  notificationType: EmailEventType;
  batchId: string | null;
  batchLabel: string;
  triggeredBy: string | null;
  sentAt: string;
}

export interface EmailLearnerAggregate {
  track: "compliance" | "course";
  userEmail: string;
  moduleId: string;
  moduleTitle: string;
  batchId: string | null;
  batchLabel: string;
  inviteCount: number;
  reminderCount: number;
  failedGuidanceCount: number;
  completedCount: number;
  retakeApprovedCount: number;
  totalSends: number;
  lastSentAt: string | null;
}

export interface EmailMonitoringSummary {
  totalEvents: number;
  inviteCount: number;
  reminderCount: number;
  failedGuidanceCount: number;
  completedCount: number;
  retakeApprovedCount: number;
  uniqueLearners: number;
}

export interface EmailMonitoringModuleOption {
  id: string;
  title: string;
  track: "compliance" | "course";
}

export interface EmailMonitoringPayload {
  summary: EmailMonitoringSummary;
  events: EmailEventRow[];
  learners: EmailLearnerAggregate[];
  batches: { id: string; label: string }[];
  modules: EmailMonitoringModuleOption[];
  generatedAt: string;
}

const EMPTY_SUMMARY: EmailMonitoringSummary = {
  totalEvents: 0,
  inviteCount: 0,
  reminderCount: 0,
  failedGuidanceCount: 0,
  completedCount: 0,
  retakeApprovedCount: 0,
  uniqueLearners: 0,
};

function mapEvent(row: Record<string, unknown>): EmailEventRow {
  return {
    id: row.id as string,
    track: row.track as "compliance" | "course",
    moduleId: row.module_id as string,
    moduleTitle: (row.module_title as string) ?? (row.module_id as string),
    userEmail: (row.user_email as string) ?? "",
    notificationType: row.notification_type as EmailEventType,
    batchId: (row.batch_id as string) ?? null,
    batchLabel: (row.batch_label as string) ?? "—",
    triggeredBy: (row.triggered_by as string) ?? null,
    sentAt: row.sent_at as string,
  };
}

function mapLearner(row: Record<string, unknown>): EmailLearnerAggregate {
  return {
    track: row.track as "compliance" | "course",
    userEmail: (row.user_email as string) ?? "",
    moduleId: row.module_id as string,
    moduleTitle: (row.module_title as string) ?? (row.module_id as string),
    batchId: (row.batch_id as string) ?? null,
    batchLabel: (row.batch_label as string) ?? "—",
    inviteCount: Number(row.invite_count ?? 0),
    reminderCount: Number(row.reminder_count ?? 0),
    failedGuidanceCount: Number(row.failed_guidance_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    retakeApprovedCount: Number(row.retake_approved_count ?? 0),
    totalSends: Number(row.total_sends ?? 0),
    lastSentAt: (row.last_sent_at as string) ?? null,
  };
}

function mapSummary(row: Record<string, unknown> | undefined): EmailMonitoringSummary {
  if (!row) return { ...EMPTY_SUMMARY };
  return {
    totalEvents: Number(row.total_events ?? 0),
    inviteCount: Number(row.invite_count ?? 0),
    reminderCount: Number(row.reminder_count ?? 0),
    failedGuidanceCount: Number(row.failed_guidance_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    retakeApprovedCount: Number(row.retake_approved_count ?? 0),
    uniqueLearners: Number(row.unique_learners ?? 0),
  };
}

/**
 * Full email outreach monitoring — event log + per-learner aggregates.
 * Supports Compliance / Courses / All with batch + module + type filters.
 */
export async function getEmailMonitoring(
  sql: Sql,
  filters: EmailMonitoringFilters = {},
): Promise<EmailMonitoringPayload> {
  const track: EmailMonitoringTrack = filters.track ?? "all";
  const batchId = filters.batchId?.trim() || null;
  const moduleId = filters.moduleId?.trim() || null;
  const type =
    filters.type && filters.type !== "all" ? filters.type : null;
  const search = filters.search?.trim().toLowerCase() || null;
  const limit = Math.min(Math.max(filters.limit ?? 300, 1), 1000);

  try {
    const [summaryRows, eventRows, learnerRows, batchRows, moduleRows] =
      await Promise.all([
      sql`
        WITH events AS (
          SELECT
            'compliance'::text AS track,
            e.user_email,
            e.notification_type,
            e.batch_id,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            COALESCE(b.label, e.batch_id, '') AS batch_label
          FROM training_notification_events e
          LEFT JOIN training_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'compliance')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
          UNION ALL
          SELECT
            'course'::text AS track,
            e.user_email,
            e.notification_type,
            e.batch_id,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            COALESCE(b.label, e.batch_id, '') AS batch_label
          FROM course_notification_events e
          LEFT JOIN course_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'course')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
        )
        SELECT
          COUNT(*)::int AS total_events,
          COUNT(*) FILTER (WHERE notification_type = 'invited')::int AS invite_count,
          COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
          COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
          COUNT(*) FILTER (WHERE notification_type = 'completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE notification_type = 'retake_approved')::int AS retake_approved_count,
          COUNT(DISTINCT LOWER(user_email))::int AS unique_learners
        FROM events
      `,
      sql`
        (
          SELECT
            e.id::text AS id,
            'compliance'::text AS track,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            LOWER(e.user_email) AS user_email,
            e.notification_type,
            e.batch_id,
            COALESCE(b.label, e.batch_id, '—') AS batch_label,
            e.triggered_by,
            e.sent_at
          FROM training_notification_events e
          LEFT JOIN training_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'compliance')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
        )
        UNION ALL
        (
          SELECT
            e.id::text AS id,
            'course'::text AS track,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            LOWER(e.user_email) AS user_email,
            e.notification_type,
            e.batch_id,
            COALESCE(b.label, e.batch_id, '—') AS batch_label,
            e.triggered_by,
            e.sent_at
          FROM course_notification_events e
          LEFT JOIN course_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'course')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
        )
        ORDER BY sent_at DESC
        LIMIT ${limit}
      `,
      sql`
        WITH events AS (
          SELECT
            'compliance'::text AS track,
            LOWER(e.user_email) AS user_email,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            e.batch_id,
            COALESCE(b.label, e.batch_id, '—') AS batch_label,
            e.notification_type,
            e.sent_at
          FROM training_notification_events e
          LEFT JOIN training_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'compliance')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
          UNION ALL
          SELECT
            'course'::text AS track,
            LOWER(e.user_email) AS user_email,
            e.module_id,
            COALESCE(m.title, e.module_id) AS module_title,
            e.batch_id,
            COALESCE(b.label, e.batch_id, '—') AS batch_label,
            e.notification_type,
            e.sent_at
          FROM course_notification_events e
          LEFT JOIN course_modules m ON m.id = e.module_id
          LEFT JOIN batches b ON b.id = e.batch_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'course')
            AND (${batchId}::text IS NULL OR e.batch_id = ${batchId})
            AND (${moduleId}::text IS NULL OR e.module_id = ${moduleId})
            AND (${type}::text IS NULL OR e.notification_type = ${type})
            AND (
              ${search}::text IS NULL
              OR LOWER(e.user_email) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(m.title, e.module_id)) LIKE ${"%" + (search ?? "") + "%"}
              OR LOWER(COALESCE(b.label, e.batch_id, '')) LIKE ${"%" + (search ?? "") + "%"}
            )
        )
        SELECT
          track,
          user_email,
          module_id,
          module_title,
          batch_id,
          batch_label,
          COUNT(*) FILTER (WHERE notification_type = 'invited')::int AS invite_count,
          COUNT(*) FILTER (WHERE notification_type = 'reminder')::int AS reminder_count,
          COUNT(*) FILTER (WHERE notification_type = 'failed_review_guidance')::int AS failed_guidance_count,
          COUNT(*) FILTER (WHERE notification_type = 'completed')::int AS completed_count,
          COUNT(*) FILTER (WHERE notification_type = 'retake_approved')::int AS retake_approved_count,
          COUNT(*)::int AS total_sends,
          MAX(sent_at) AS last_sent_at
        FROM events
        GROUP BY track, user_email, module_id, module_title, batch_id, batch_label
        ORDER BY last_sent_at DESC NULLS LAST
        LIMIT ${limit}
      `,
      sql`
        SELECT id, label
        FROM batches
        ORDER BY label ASC
      `,
      // Assigned modules for the selected batch; when no batch, modules that
      // already appear in the notification log for the selected track.
      sql`
        (
          SELECT DISTINCT
            m.id,
            m.title,
            'compliance'::text AS track
          FROM training_modules m
          INNER JOIN module_batches mb ON mb.module_id = m.id
          WHERE (${track}::text = 'all' OR ${track}::text = 'compliance')
            AND ${batchId}::text IS NOT NULL
            AND mb.batch_id = ${batchId}
        )
        UNION
        (
          SELECT DISTINCT
            m.id,
            m.title,
            'course'::text AS track
          FROM course_modules m
          INNER JOIN course_module_batches mb ON mb.module_id = m.id
          WHERE (${track}::text = 'all' OR ${track}::text = 'course')
            AND ${batchId}::text IS NOT NULL
            AND mb.batch_id = ${batchId}
        )
        UNION
        (
          SELECT DISTINCT
            m.id,
            COALESCE(m.title, e.module_id) AS title,
            'compliance'::text AS track
          FROM training_notification_events e
          LEFT JOIN training_modules m ON m.id = e.module_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'compliance')
            AND ${batchId}::text IS NULL
        )
        UNION
        (
          SELECT DISTINCT
            m.id,
            COALESCE(m.title, e.module_id) AS title,
            'course'::text AS track
          FROM course_notification_events e
          LEFT JOIN course_modules m ON m.id = e.module_id
          WHERE (${track}::text = 'all' OR ${track}::text = 'course')
            AND ${batchId}::text IS NULL
        )
        ORDER BY title ASC
      `,
    ]);

    return {
      summary: mapSummary(summaryRows[0] as Record<string, unknown> | undefined),
      events: eventRows.map((r) => mapEvent(r as Record<string, unknown>)),
      learners: learnerRows.map((r) => mapLearner(r as Record<string, unknown>)),
      batches: batchRows.map((b) => ({
        id: b.id as string,
        label: (b.label as string) ?? (b.id as string),
      })),
      modules: moduleRows.map((m) => ({
        id: m.id as string,
        title: (m.title as string) ?? (m.id as string),
        track: m.track as "compliance" | "course",
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[email-monitoring]", err);
    return {
      summary: { ...EMPTY_SUMMARY },
      events: [],
      learners: [],
      batches: [],
      modules: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
