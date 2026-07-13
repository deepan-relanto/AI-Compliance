import type { getSql } from "@/lib/db";
import type {
  AssessmentAcknowledgement,
  AssessmentProgress,
  AuditLogEntry,
  ReviewRequest,
} from "@/lib/types";

type Sql = ReturnType<typeof getSql>;

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

export interface MonitoringSummary {
  activeAssessments: number;
  usersWithWarnings: number;
  totalWarnings: number;
  failedAssessments: number;
  permanentlyFailedCount: number;
  pendingReviewsCount: number;
}

/** Lightweight summary query for KPI cards — no full row scans of all progress fields. */
export async function getMonitoringSummary(sql: Sql): Promise<MonitoringSummary> {
  const [progressRows, reviewRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS active_assessments,
        COUNT(*) FILTER (WHERE warning_count > 0)::int AS users_with_warnings,
        COALESCE(SUM(warning_count), 0)::int AS total_warnings,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_assessments,
        COUNT(*) FILTER (WHERE status = 'permanently_failed')::int AS permanently_failed
      FROM course_progress
    `,
    sql`
      SELECT COUNT(*)::int AS pending FROM course_review_requests WHERE status = 'Pending'
    `,
  ]);
  const p = progressRows[0] ?? {};
  const r = reviewRows[0] ?? {};
  return {
    activeAssessments: Number(p.active_assessments ?? 0),
    usersWithWarnings: Number(p.users_with_warnings ?? 0),
    totalWarnings: Number(p.total_warnings ?? 0),
    failedAssessments: Number(p.failed_assessments ?? 0),
    permanentlyFailedCount: Number(p.permanently_failed ?? 0),
    pendingReviewsCount: Number(r.pending ?? 0),
  };
}

export type ViolationStatusFilter =
  | "all"
  | "in_progress"
  | "completed"
  | "failed"
  | "permanently_failed"
  | "with_warnings";

export type MonitoringSort = "time" | "warnings";

export interface MonitoringViolationQuery {
  statusFilter?: ViolationStatusFilter;
  moduleId?: string;
  sort?: MonitoringSort;
}

export interface AssessmentFacet {
  moduleId: string;
  moduleTitle: string;
  count: number;
}

export interface PaginatedViolations {
  records: AssessmentProgress[];
  total: number;
  assessments: AssessmentFacet[];
}

function mapViolationRows(rows: Record<string, unknown>[]): AssessmentProgress[] {
  return rows.map((r) => ({
    username: r.user_email as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    batchId: r.batch_id as string,
    batchLabel: (r.batch_label as string | null) ?? undefined,
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

/** Distinct assessments for filter pills (most recent activity first). */
export async function getMonitoringAssessmentFacets(sql: Sql): Promise<AssessmentFacet[]> {
  const rows = await sql`
    SELECT
      module_id,
      module_title,
      COUNT(*)::int AS count
    FROM course_progress
    GROUP BY module_id, module_title
    ORDER BY MAX(last_accessed_at) DESC NULLS LAST
  `;
  return rows.map((r) => ({
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    count: Number(r.count ?? 0),
  }));
}

/** Paginated violations — default sort: latest activity first. */
export async function listMonitoringViolationsPaged(
  sql: Sql,
  page: number,
  pageSize: number,
  query: MonitoringViolationQuery = {},
): Promise<PaginatedViolations> {
  const statusFilter = query.statusFilter ?? "all";
  const moduleId = query.moduleId?.trim() || null;
  const sort = query.sort ?? "time";
  const offset = (page - 1) * pageSize;

  const countPromise = sql`
    SELECT COUNT(*)::int AS total
    FROM course_progress ap
    WHERE
      (
        ${statusFilter} = 'all'
        OR (${statusFilter} = 'with_warnings' AND ap.warning_count > 0)
        OR (
          ${statusFilter} NOT IN ('all', 'with_warnings')
          AND ap.status = ${statusFilter}
        )
      )
      AND (${moduleId}::text IS NULL OR ap.module_id = ${moduleId})
  `;

  const rowsPromise =
    sort === "warnings"
      ? sql`
          SELECT
            ap.user_email, ap.module_id, ap.module_title, ap.batch_id,
            COALESCE(b.label, ub.label) AS batch_label,
            ap.current_slide, ap.total_slides, ap.status,
            ap.warning_count, ap.warning_history, ap.archived_warnings,
            ap.retake_count, ap.failed_at, ap.failed_reason,
            ap.last_failure_at, ap.last_failure_reason,
            ap.acknowledgement, ap.mcq_correct, ap.mcq_total, ap.score_percent,
            ap.last_accessed_at, ap.completed_at
          FROM course_progress ap
          LEFT JOIN batches b ON b.id = ap.batch_id
          LEFT JOIN users u ON LOWER(u.email) = LOWER(ap.user_email)
          LEFT JOIN batches ub ON ub.id = u.batch_id
          WHERE
            (
              ${statusFilter} = 'all'
              OR (${statusFilter} = 'with_warnings' AND ap.warning_count > 0)
              OR (
                ${statusFilter} NOT IN ('all', 'with_warnings')
                AND ap.status = ${statusFilter}
              )
            )
            AND (${moduleId}::text IS NULL OR ap.module_id = ${moduleId})
          ORDER BY ap.warning_count DESC, ap.last_accessed_at DESC NULLS LAST
          LIMIT ${pageSize} OFFSET ${offset}
        `
      : sql`
          SELECT
            ap.user_email, ap.module_id, ap.module_title, ap.batch_id,
            COALESCE(b.label, ub.label) AS batch_label,
            ap.current_slide, ap.total_slides, ap.status,
            ap.warning_count, ap.warning_history, ap.archived_warnings,
            ap.retake_count, ap.failed_at, ap.failed_reason,
            ap.last_failure_at, ap.last_failure_reason,
            ap.acknowledgement, ap.mcq_correct, ap.mcq_total, ap.score_percent,
            ap.last_accessed_at, ap.completed_at
          FROM course_progress ap
          LEFT JOIN batches b ON b.id = ap.batch_id
          LEFT JOIN users u ON LOWER(u.email) = LOWER(ap.user_email)
          LEFT JOIN batches ub ON ub.id = u.batch_id
          WHERE
            (
              ${statusFilter} = 'all'
              OR (${statusFilter} = 'with_warnings' AND ap.warning_count > 0)
              OR (
                ${statusFilter} NOT IN ('all', 'with_warnings')
                AND ap.status = ${statusFilter}
              )
            )
            AND (${moduleId}::text IS NULL OR ap.module_id = ${moduleId})
          ORDER BY ap.last_accessed_at DESC NULLS LAST, ap.warning_count DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `;

  const [countRows, rows, assessments] = await Promise.all([
    countPromise,
    rowsPromise,
    getMonitoringAssessmentFacets(sql),
  ]);

  return {
    records: mapViolationRows(rows),
    total: Number(countRows[0]?.total ?? 0),
    assessments,
  };
}

export type ReviewStatusFilter = "all" | "Pending" | "Approved" | "Rejected";

export interface PaginatedReviews {
  reviews: ReviewRequest[];
  total: number;
}

/** Paginated review requests (latest submissions first). */
export async function listMonitoringReviewsPaged(
  sql: Sql,
  page: number,
  pageSize: number,
  statusFilter: ReviewStatusFilter = "all",
): Promise<PaginatedReviews> {
  const offset = (page - 1) * pageSize;
  const [countRows, rows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total
      FROM course_review_requests
      WHERE (${statusFilter} = 'all' OR status = ${statusFilter})
    `,
    sql`
      SELECT *
      FROM course_review_requests
      WHERE (${statusFilter} = 'all' OR status = ${statusFilter})
      ORDER BY submitted_timestamp DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
  ]);

  const reviews: ReviewRequest[] = rows.map((r) => ({
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

  return { reviews, total: Number(countRows[0]?.total ?? 0) };
}

export interface PaginatedAuditLogs {
  auditLogs: AuditLogEntry[];
  total: number;
}

export type AuditActionFilter = "all" | "failures" | "retakes" | "reviews" | "warnings";

const AUDIT_ACTION_GROUPS: Record<Exclude<AuditActionFilter, "all">, string[]> = {
  failures: ["Assessment Failed", "Assessment Permanently Failed"],
  retakes: ["Retake Started", "Retake Granted", "Assessment Reset", "Retake Limit Reached"],
  reviews: ["Request Submitted", "Request Approved", "Request Rejected"],
  warnings: ["Warning Issued"],
};

/** Paginated audit logs (latest events first). */
export async function listMonitoringAuditLogsPaged(
  sql: Sql,
  page: number,
  pageSize: number,
  actionFilter: AuditActionFilter = "all",
): Promise<PaginatedAuditLogs> {
  const offset = (page - 1) * pageSize;
  const actionList =
    actionFilter === "all" ? null : AUDIT_ACTION_GROUPS[actionFilter];

  const [countRows, rows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total
      FROM course_audit_logs
      WHERE (${actionList}::text[] IS NULL OR action = ANY(${actionList}))
    `,
    sql`
      SELECT id, action, actor, details, timestamp
      FROM course_audit_logs
      WHERE (${actionList}::text[] IS NULL OR action = ANY(${actionList}))
      ORDER BY timestamp DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
  ]);

  const auditLogs: AuditLogEntry[] = rows.map((r) => ({
    id: r.id as string,
    action: r.action as string,
    admin: r.actor as string,
    timestamp: Number(r.timestamp),
    details: (r.details as string) ?? undefined,
  }));

  return { auditLogs, total: Number(countRows[0]?.total ?? 0) };
}

// ── Legacy (full payload) ─────────────────────────────────────────────────────

export async function listMonitoringProgress(sql: Sql): Promise<AssessmentProgress[]> {
  const { records } = await listMonitoringViolationsPaged(sql, 1, 1000);
  return records;
}

export async function listMonitoringReviews(sql: Sql): Promise<ReviewRequest[]> {
  const { reviews } = await listMonitoringReviewsPaged(sql, 1, 1000);
  return reviews;
}

export async function listMonitoringAuditLogs(sql: Sql): Promise<AuditLogEntry[]> {
  const { auditLogs } = await listMonitoringAuditLogsPaged(sql, 1, 1000);
  return auditLogs;
}

export async function getMonitoringPayload(sql: Sql) {
  const [records, reviews, auditLogs] = await Promise.all([
    listMonitoringProgress(sql),
    listMonitoringReviews(sql),
    listMonitoringAuditLogs(sql),
  ]);
  return { records, reviews, auditLogs };
}

