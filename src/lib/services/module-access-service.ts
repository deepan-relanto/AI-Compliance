import type { getSql } from "@/lib/db";
import { emailsMatch } from "@/lib/training-link";

type Sql = ReturnType<typeof getSql>;

export type ModuleAccessDenyCode =
  | "not_found"
  | "not_assigned"
  | "wrong_recipient";

export type ModuleAccessResult =
  | { ok: true; batchId: string }
  | { ok: false; code: ModuleAccessDenyCode; message: string };

/** Verify the signed-in learner may open this module (batch assignment + optional invitee). */
export async function verifyModuleAccess(
  sql: Sql,
  userEmail: string,
  moduleId: string,
  intendedEmail?: string | null,
): Promise<ModuleAccessResult> {
  if (intendedEmail && !emailsMatch(userEmail, intendedEmail)) {
    return {
      ok: false,
      code: "wrong_recipient",
      message: `This training link was sent to ${intendedEmail.trim().toLowerCase()}. Sign in with that Microsoft account.`,
    };
  }

  const [courseModuleRows, complianceModuleRows, userRows] = await Promise.all([
    sql`SELECT id FROM course_modules WHERE id = ${moduleId} LIMIT 1`,
    sql`SELECT id FROM training_modules WHERE id = ${moduleId} LIMIT 1`,
    sql`
      SELECT email, batch_id AS primary_batch_id
      FROM users
      WHERE LOWER(email) = LOWER(${userEmail})
      LIMIT 1
    `,
  ]);

  if (courseModuleRows.length === 0 && complianceModuleRows.length === 0) {
    return { ok: false, code: "not_found", message: "Module not found." };
  }

  if (userRows.length === 0) {
    return {
      ok: false,
      code: "not_assigned",
      message: "Your account is not enrolled for this training.",
    };
  }

  const primaryBatchId = (userRows[0].primary_batch_id as string | null) ?? null;
  const isCourse = courseModuleRows.length > 0;

  // Membership ∩ (currently assigned OR previously assigned with marks).
  // Prefer a batch that already has this learner's progress, then primary.
  const assigned = isCourse
    ? await sql`
        SELECT ub.batch_id
        FROM user_batches ub
        WHERE LOWER(ub.user_email) = LOWER(${userEmail})
          AND (
            EXISTS (
              SELECT 1 FROM course_module_batches cmb
              WHERE cmb.batch_id = ub.batch_id AND cmb.module_id = ${moduleId}
            )
            OR EXISTS (
              SELECT 1 FROM course_progress p
              WHERE p.batch_id = ub.batch_id
                AND p.module_id = ${moduleId}
                AND LOWER(p.user_email) = LOWER(${userEmail})
            )
          )
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM course_progress p
            WHERE p.batch_id = ub.batch_id
              AND p.module_id = ${moduleId}
              AND LOWER(p.user_email) = LOWER(${userEmail})
          ) THEN 0 ELSE 1 END,
          CASE WHEN ub.batch_id = ${primaryBatchId} THEN 0 ELSE 1 END,
          ub.created_at ASC
        LIMIT 1
      `
    : await sql`
        SELECT ub.batch_id
        FROM user_batches ub
        WHERE LOWER(ub.user_email) = LOWER(${userEmail})
          AND (
            EXISTS (
              SELECT 1 FROM module_batches mb
              WHERE mb.batch_id = ub.batch_id AND mb.module_id = ${moduleId}
            )
            OR EXISTS (
              SELECT 1 FROM assessment_progress p
              WHERE p.batch_id = ub.batch_id
                AND p.module_id = ${moduleId}
                AND LOWER(p.user_email) = LOWER(${userEmail})
            )
          )
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM assessment_progress p
            WHERE p.batch_id = ub.batch_id
              AND p.module_id = ${moduleId}
              AND LOWER(p.user_email) = LOWER(${userEmail})
          ) THEN 0 ELSE 1 END,
          CASE WHEN ub.batch_id = ${primaryBatchId} THEN 0 ELSE 1 END,
          ub.created_at ASC
        LIMIT 1
      `;

  // Legacy fallback while user_batches is backfilling: single users.batch_id.
  if (assigned.length === 0 && primaryBatchId) {
    const legacy = isCourse
      ? await sql`
          SELECT 1 FROM course_module_batches
          WHERE module_id = ${moduleId} AND batch_id = ${primaryBatchId}
          UNION
          SELECT 1 FROM course_progress
          WHERE module_id = ${moduleId} AND batch_id = ${primaryBatchId}
          LIMIT 1
        `
      : await sql`
          SELECT 1 FROM module_batches
          WHERE module_id = ${moduleId} AND batch_id = ${primaryBatchId}
          UNION
          SELECT 1 FROM assessment_progress
          WHERE module_id = ${moduleId} AND batch_id = ${primaryBatchId}
          LIMIT 1
        `;
    if (legacy.length > 0) {
      return { ok: true, batchId: primaryBatchId };
    }
  }

  if (assigned.length === 0) {
    return {
      ok: false,
      code: "not_assigned",
      message: "This training is not assigned to your batch.",
    };
  }

  return { ok: true, batchId: assigned[0].batch_id as string };
}
