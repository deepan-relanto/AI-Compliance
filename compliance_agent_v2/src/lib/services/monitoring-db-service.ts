import type { getSql } from "@/lib/db";
import type {
  AssessmentAcknowledgement,
  AssessmentProgress,
  AuditLogEntry,
  ReviewRequest,
} from "@/lib/types";

type Sql = ReturnType<typeof getSql>;
type MonitoringTab = "violations" | "reviews" | "audit";

function parseJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function toMs(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

/** DB row may predate acknowledgement sync — infer from completion when attestation missing. */
function resolveAcknowledgement(row: Record<string, unknown>): AssessmentAcknowledgement | undefined {
  const parsed = parseJson<AssessmentAcknowledgement | undefined>(
    row.acknowledgement,
    undefined,
  );
  if (parsed?.accepted) return parsed;

  if (row.status === "completed" && row.completed_at) {
    return {
      userId: String(row.user_email),
      userName: String(row.user_email),
      assessmentId: String(row.module_id),
      assessmentName: String(row.module_title),
      accepted: true,
      timestamp: toMs(row.completed_at) ?? Date.now(),
    };
  }

  return parsed;
}

export async function listMonitoringProgress(
  sql: Sql,
  limit?: number,
  offset?: number,
): Promise<AssessmentProgress[]> {
  const rows = await sql`
    SELECT
      user_email, module_id, module_title, batch_id,
      current_slide, total_slides, status,
      warning_count, warning_history, archived_warnings,
      retake_count, failed_at, failed_reason,
      last_failure_at, last_failure_reason,
      acknowledgement, mcq_correct, mcq_total, score_percent,
      last_accessed_at, completed_at
    FROM assessment_progress
    ORDER BY last_accessed_at DESC
    ${typeof limit === "number" ? sql`LIMIT ${limit}` : sql``}
    ${typeof offset === "number" ? sql`OFFSET ${offset}` : sql``}
  `;

  return rows.map((r) => ({
    username: r.user_email as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    batchId: r.batch_id as string,
    currentSlide: Number(r.current_slide ?? 0),
    totalSlides: Number(r.total_slides ?? 1),
    status: r.status as AssessmentProgress["status"],
    lastAccessedAt: toMs(r.last_accessed_at) ?? Date.now(),
    completedAt: toMs(r.completed_at),
    warningCount: Number(r.warning_count ?? 0),
    warningHistory: parseJson(r.warning_history, []),
    failedAt: toMs(r.failed_at),
    failedReason: (r.failed_reason as string) ?? undefined,
    retakeCount: Number(r.retake_count ?? 0),
    lastFailureAt: toMs(r.last_failure_at),
    lastFailureReason: (r.last_failure_reason as string) ?? undefined,
    archivedWarnings: parseJson(r.archived_warnings, []),
    acknowledgement: resolveAcknowledgement(r),
    mcqCorrect: Number(r.mcq_correct ?? 0),
    mcqTotal: Number(r.mcq_total ?? 0),
    scorePercent: r.score_percent != null ? Number(r.score_percent) : null,
  }));
}

export async function listMonitoringReviews(sql: Sql): Promise<ReviewRequest[]> {
  const rows = await sql`
    SELECT *
    FROM review_requests
    ORDER BY submitted_timestamp DESC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    username: r.username as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    warningCount: Number(r.warning_count ?? 0),
    failureTimestamp: Number(r.failure_timestamp),
    userExplanation: r.user_explanation as string,
    status: r.status as ReviewRequest["status"],
    submittedTimestamp: Number(r.submitted_timestamp),
    decisionTimestamp: r.decision_timestamp != null ? Number(r.decision_timestamp) : undefined,
    approvedBy: (r.approved_by as string) ?? undefined,
    approvedAt: r.approved_at != null ? Number(r.approved_at) : undefined,
    rejectedBy: (r.rejected_by as string) ?? undefined,
    rejectedAt: r.rejected_at != null ? Number(r.rejected_at) : undefined,
    adminComment: (r.admin_comment as string) ?? undefined,
  }));
}

export async function listMonitoringReviewsPaginated(
  sql: Sql,
  limit?: number,
  offset?: number,
): Promise<ReviewRequest[]> {
  const rows = await sql`
    SELECT *
    FROM review_requests
    ORDER BY submitted_timestamp DESC
    ${typeof limit === "number" ? sql`LIMIT ${limit}` : sql``}
    ${typeof offset === "number" ? sql`OFFSET ${offset}` : sql``}
  `;

  return rows.map((r) => ({
    id: r.id as string,
    username: r.username as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    warningCount: Number(r.warning_count ?? 0),
    failureTimestamp: Number(r.failure_timestamp),
    userExplanation: r.user_explanation as string,
    status: r.status as ReviewRequest["status"],
    submittedTimestamp: Number(r.submitted_timestamp),
    decisionTimestamp: r.decision_timestamp != null ? Number(r.decision_timestamp) : undefined,
    approvedBy: (r.approved_by as string) ?? undefined,
    approvedAt: r.approved_at != null ? Number(r.approved_at) : undefined,
    rejectedBy: (r.rejected_by as string) ?? undefined,
    rejectedAt: r.rejected_at != null ? Number(r.rejected_at) : undefined,
    adminComment: (r.admin_comment as string) ?? undefined,
  }));
}

export async function listMonitoringAuditLogs(
  sql: Sql,
  limit?: number,
  offset?: number,
): Promise<AuditLogEntry[]> {
  const rows = await sql`
    SELECT id, action, actor, details, timestamp
    FROM audit_logs
    ORDER BY timestamp DESC
    ${typeof limit === "number" ? sql`LIMIT ${limit}` : sql``}
    ${typeof offset === "number" ? sql`OFFSET ${offset}` : sql``}
  `;

  return rows.map((r) => ({
    id: r.id as string,
    action: r.action as string,
    admin: r.actor as string,
    timestamp: Number(r.timestamp),
    details: (r.details as string) ?? undefined,
  }));
}

export async function getMonitoringPayload(sql: Sql) {
  const [records, reviews, auditLogs] = await Promise.all([
    listMonitoringProgress(sql),
    listMonitoringReviews(sql),
    listMonitoringAuditLogs(sql),
  ]);
  return { records, reviews, auditLogs };
}

export async function getMonitoringSummary(sql: Sql) {
  const [progressSummaryRows, pendingReviewRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS active_assessments,
        COUNT(*) FILTER (WHERE COALESCE(warning_count, 0) > 0)::int AS users_with_warnings,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_assessments,
        COUNT(*) FILTER (WHERE status = 'permanently_failed')::int AS permanently_failed_count,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings
      FROM assessment_progress
    `,
    sql`
      SELECT COUNT(*)::int AS pending_reviews
      FROM review_requests
      WHERE status = 'Pending'
    `,
  ]);

  const progressSummary = progressSummaryRows[0];
  const pendingSummary = pendingReviewRows[0];
  return {
    activeAssessments: Number(progressSummary.active_assessments ?? 0),
    usersWithWarnings: Number(progressSummary.users_with_warnings ?? 0),
    failedAssessments: Number(progressSummary.failed_assessments ?? 0),
    permanentlyFailedCount: Number(progressSummary.permanently_failed_count ?? 0),
    totalWarnings: Number(progressSummary.total_warnings ?? 0),
    pendingReviewsCount: Number(pendingSummary.pending_reviews ?? 0),
  };
}

export async function getMonitoringTabPayload(
  sql: Sql,
  tab: MonitoringTab,
  page: number,
  pageSize: number,
) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize)
    ? Math.min(Math.max(Math.floor(pageSize), 5), 100)
    : 25;
  const offset = (safePage - 1) * safePageSize;

  if (tab === "reviews") {
    const [reviews, countRows] = await Promise.all([
      listMonitoringReviewsPaginated(sql, safePageSize, offset),
      sql`SELECT COUNT(*)::int AS count FROM review_requests`,
    ]);
    return {
      records: [] as AssessmentProgress[],
      reviews,
      auditLogs: [] as AuditLogEntry[],
      totalCount: Number(countRows[0]?.count ?? 0),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  if (tab === "audit") {
    const [auditLogs, countRows] = await Promise.all([
      listMonitoringAuditLogs(sql, safePageSize, offset),
      sql`SELECT COUNT(*)::int AS count FROM audit_logs`,
    ]);
    return {
      records: [] as AssessmentProgress[],
      reviews: [] as ReviewRequest[],
      auditLogs,
      totalCount: Number(countRows[0]?.count ?? 0),
      page: safePage,
      pageSize: safePageSize,
    };
  }

  const [records, countRows] = await Promise.all([
    listMonitoringProgress(sql, safePageSize, offset),
    sql`SELECT COUNT(*)::int AS count FROM assessment_progress`,
  ]);
  return {
    records,
    reviews: [] as ReviewRequest[],
    auditLogs: [] as AuditLogEntry[],
    totalCount: Number(countRows[0]?.count ?? 0),
    page: safePage,
    pageSize: safePageSize,
  };
}
