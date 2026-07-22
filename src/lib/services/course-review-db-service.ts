import type { getSql } from "@/lib/db";
import { invalidateLearnerProgressSnapshot } from "@/lib/learner-progress-cache";
import { sendRetakeApprovalEmail } from "@/lib/services/training-notification-service";
import type { ReviewRequest } from "@/lib/types";

type Sql = ReturnType<typeof getSql>;

function mapReviewRow(r: Record<string, unknown>): ReviewRequest {
  return {
    id: r.id as string,
    username: r.username as string,
    moduleId: r.module_id as string,
    moduleTitle: r.module_title as string,
    warningCount: Number(r.warning_count ?? 0),
    failureTimestamp: Number(r.failure_timestamp),
    userExplanation: r.user_explanation as string,
    status: r.status as ReviewRequest["status"],
    submittedTimestamp: Number(r.submitted_timestamp),
    decisionTimestamp:
      r.decision_timestamp != null ? Number(r.decision_timestamp) : undefined,
    approvedBy: (r.approved_by as string) ?? undefined,
    approvedAt: r.approved_at != null ? Number(r.approved_at) : undefined,
    rejectedBy: (r.rejected_by as string) ?? undefined,
    rejectedAt: r.rejected_at != null ? Number(r.rejected_at) : undefined,
    adminComment: (r.admin_comment as string) ?? undefined,
  };
}

function parseJsonArray<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

async function insertAuditLogDb(
  sql: Sql,
  action: string,
  actor: string,
  details?: string,
  moduleId?: string | null,
): Promise<void> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await sql`
    INSERT INTO course_audit_logs (id, action, actor, details, module_id, timestamp)
    VALUES (${id}, ${action}, ${actor}, ${details ?? null}, ${moduleId ?? null}, ${Date.now()})
  `;
}

export async function getPendingReviewDb(
  sql: Sql,
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const rows = await sql`
    SELECT *
    FROM course_review_requests
    WHERE username = ${username}
      AND module_id = ${moduleId}
      AND status = 'Pending'
    ORDER BY submitted_timestamp DESC
    LIMIT 1
  `;
  return rows.length ? mapReviewRow(rows[0]) : null;
}

export async function getLatestReviewDb(
  sql: Sql,
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const rows = await sql`
    SELECT *
    FROM course_review_requests
    WHERE username = ${username} AND module_id = ${moduleId}
    ORDER BY submitted_timestamp DESC
    LIMIT 1
  `;
  return rows.length ? mapReviewRow(rows[0]) : null;
}

/** Latest admin-approved retake that has not been started yet. */
export async function getActiveApprovedRetakeDb(
  sql: Sql,
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const rows = await sql`
    SELECT r.*
    FROM course_review_requests r
    INNER JOIN course_progress p
      ON LOWER(p.user_email) = LOWER(r.username) AND p.module_id = r.module_id
    WHERE r.username = ${username}
      AND r.module_id = ${moduleId}
      AND r.status = 'Approved'
      AND p.status = 'not_started'
    ORDER BY r.submitted_timestamp DESC
    LIMIT 1
  `;
  return rows.length ? mapReviewRow(rows[0]) : null;
}

/** Mark an approved retake as used when the learner actually begins the session. */
export async function consumeApprovedRetakeDb(
  sql: Sql,
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const rows = await sql`
    SELECT r.*
    FROM course_review_requests r
    INNER JOIN course_progress p
      ON LOWER(p.user_email) = LOWER(r.username) AND p.module_id = r.module_id
    WHERE r.username = ${username}
      AND r.module_id = ${moduleId}
      AND r.status = 'Approved'
      AND p.status IN ('not_started', 'in_progress')
      AND COALESCE(p.retake_count, 0) > 0
    ORDER BY r.submitted_timestamp DESC
    LIMIT 1
  `;
  if (!rows.length) return null;

  const request = mapReviewRow(rows[0]);
  const now = Date.now();

  await sql`
    UPDATE course_review_requests
    SET status = 'Consumed',
        decision_timestamp = ${now}
    WHERE id = ${request.id}
  `;

  await insertAuditLogDb(
    sql,
    "Retake Started",
    username,
    `Started approved retake for ${request.moduleTitle}`,
    moduleId,
  );

  return { ...request, status: "Consumed", decisionTimestamp: now };
}

export async function submitReviewRequestDb(
  sql: Sql,
  input: {
    username: string;
    moduleId: string;
    moduleTitle: string;
    warningCount: number;
    failureTimestamp: number;
    userExplanation: string;
  },
): Promise<ReviewRequest> {
  const pending = await getPendingReviewDb(
    sql,
    input.username,
    input.moduleId,
  );
  if (pending) {
    throw new Error("A review request is already under review.");
  }

  const unusedApproval = await sql`
    SELECT r.id
    FROM course_review_requests r
    INNER JOIN course_progress p
      ON LOWER(p.user_email) = LOWER(r.username) AND p.module_id = r.module_id
    WHERE r.username = ${input.username}
      AND r.module_id = ${input.moduleId}
      AND r.status = 'Approved'
      AND p.status = 'not_started'
    LIMIT 1
  `;
  if (unusedApproval.length > 0) {
    throw new Error(
      "You still have an approved retake waiting. Open the training module to begin it.",
    );
  }

  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const submittedTimestamp = Date.now();

  await sql`
    INSERT INTO course_review_requests (
      id, username, module_id, module_title, warning_count,
      failure_timestamp, user_explanation, status, submitted_timestamp
    ) VALUES (
      ${id},
      ${input.username},
      ${input.moduleId},
      ${input.moduleTitle},
      ${input.warningCount},
      ${input.failureTimestamp},
      ${input.userExplanation},
      'Pending',
      ${submittedTimestamp}
    )
  `;

  await insertAuditLogDb(
    sql,
    "Request Submitted",
    input.username,
    `Submitted review request for ${input.moduleTitle}. Explanation: "${input.userExplanation}"`,
    input.moduleId,
  );

  return {
    id,
    username: input.username,
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle,
    warningCount: input.warningCount,
    failureTimestamp: input.failureTimestamp,
    userExplanation: input.userExplanation,
    status: "Pending",
    submittedTimestamp,
  };
}

export async function approveReviewRequestDb(
  sql: Sql,
  requestId: string,
  adminUsername: string,
): Promise<void> {
  const reqRows = await sql`
    SELECT * FROM course_review_requests WHERE id = ${requestId} LIMIT 1
  `;
  if (reqRows.length === 0) {
    throw new Error("Review request not found.");
  }
  const request = mapReviewRow(reqRows[0]);
  if (request.status !== "Pending") {
    throw new Error("Only pending requests can be approved.");
  }

  const progRows = await sql`
    SELECT retake_count, warning_history, archived_warnings, module_title
    FROM course_progress
    WHERE user_email = ${request.username} AND module_id = ${request.moduleId}
    LIMIT 1
  `;
  if (progRows.length === 0) {
    throw new Error("Assessment progress not found.");
  }

  const retakeCount = Number(progRows[0].retake_count ?? 0);
  const moduleTitle = (progRows[0].module_title as string) || request.moduleTitle;

  if (retakeCount >= 2) {
    const now = Date.now();
    await sql`
      UPDATE course_progress
      SET status = 'permanently_failed',
          failed_reason = 'Maximum retake limit reached',
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE user_email = ${request.username} AND module_id = ${request.moduleId}
    `;
    invalidateLearnerProgressSnapshot(request.username, request.moduleId);
    await sql`
      UPDATE course_review_requests
      SET status = 'Rejected',
          decision_timestamp = ${now},
          rejected_by = ${adminUsername},
          rejected_at = ${now},
          admin_comment = 'Rejected automatically: maximum retake limit reached.'
      WHERE id = ${requestId}
    `;
    await insertAuditLogDb(
      sql,
      "Retake Limit Reached",
      adminUsername,
      `Retake blocked for ${request.username} on ${moduleTitle}. Already had 2 retakes.`,
      request.moduleId,
    );
    throw new Error("Maximum retake limit reached. No further attempts allowed.");
  }

  const warningHistory = parseJsonArray(progRows[0].warning_history, [] as {
    reason: string;
    timestamp: number;
  }[]);
  const archivedWarnings = parseJsonArray(progRows[0].archived_warnings, [] as {
    attempt: number;
    warnings: { reason: string; timestamp: number }[];
  }[]);

  archivedWarnings.push({
    attempt: retakeCount + 1,
    warnings: warningHistory,
  });

  const newRetakeCount = retakeCount + 1;
  const now = Date.now();

  await sql`
    UPDATE course_progress
    SET retake_count = ${newRetakeCount},
        warning_count = 0,
        warning_history = ${JSON.stringify([])}::jsonb,
        archived_warnings = ${JSON.stringify(archivedWarnings)}::jsonb,
        current_slide = 0,
        status = 'not_started',
        failed_at = NULL,
        failed_reason = NULL,
        last_failure_at = NULL,
        last_failure_reason = NULL,
        mcq_answers = ${JSON.stringify({})}::jsonb,
        mcq_correct = 0,
        score_percent = NULL,
        completed_at = NULL,
        acknowledgement = NULL,
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${request.username} AND module_id = ${request.moduleId}
  `;

  invalidateLearnerProgressSnapshot(request.username, request.moduleId);

  await sql`
    UPDATE course_review_requests
    SET status = 'Approved',
        decision_timestamp = ${now},
        approved_by = ${adminUsername},
        approved_at = ${now}
    WHERE id = ${requestId}
  `;

  await insertAuditLogDb(
    sql,
    "Request Approved",
    adminUsername,
    `Approved retake request for ${request.username} on ${moduleTitle}`,
    request.moduleId,
  );
  await insertAuditLogDb(
    sql,
    "Retake Granted",
    adminUsername,
    `Granted Retake #${newRetakeCount} to ${request.username} for ${moduleTitle}`,
    request.moduleId,
  );
  await insertAuditLogDb(
    sql,
    "Assessment Reset",
    adminUsername,
    `Reset progress and warnings for ${request.username} on ${moduleTitle} (Set to not_started)`,
    request.moduleId,
  );

  void sendRetakeApprovalEmail(sql, request.username, request.moduleId).catch((err) => {
    console.error("[review approve retake email]", request.username, err);
  });
}

export async function rejectReviewRequestDb(
  sql: Sql,
  requestId: string,
  adminUsername: string,
  comment?: string,
): Promise<void> {
  const reqRows = await sql`
    SELECT * FROM course_review_requests WHERE id = ${requestId} LIMIT 1
  `;
  if (reqRows.length === 0) {
    throw new Error("Review request not found.");
  }
  const request = mapReviewRow(reqRows[0]);
  if (request.status !== "Pending") {
    throw new Error("Only pending requests can be rejected.");
  }

  const trimmed = comment?.trim();
  const now = Date.now();

  await sql`
    UPDATE course_progress
    SET failed_reason = ${trimmed || "Review request rejected by administrator."},
        last_accessed_at = NOW(),
        updated_at = NOW()
    WHERE user_email = ${request.username} AND module_id = ${request.moduleId}
  `;

  await sql`
    UPDATE course_review_requests
    SET status = 'Rejected',
        decision_timestamp = ${now},
        rejected_by = ${adminUsername},
        rejected_at = ${now},
        admin_comment = ${trimmed ?? null}
    WHERE id = ${requestId}
  `;

  await insertAuditLogDb(
    sql,
    "Request Rejected",
    adminUsername,
    `Rejected retake request for ${request.username} on ${request.moduleTitle}. Comment: "${trimmed || "No comment"}"`,
    request.moduleId,
  );
}

