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

  const courseModuleRows = await sql`
    SELECT id FROM course_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (courseModuleRows.length > 0) {
    const users = await sql`
      SELECT batch_id FROM users
      WHERE LOWER(email) = LOWER(${userEmail})
      LIMIT 1
    `;
    if (users.length === 0) {
      return {
        ok: false,
        code: "not_assigned",
        message: "Your account is not enrolled for this training.",
      };
    }
    const batchId = users[0].batch_id as string | null;
    if (!batchId) {
      return {
        ok: false,
        code: "not_assigned",
        message: "You are not assigned to a batch for this training.",
      };
    }
    const assigned = await sql`
      SELECT 1 FROM course_module_batches
      WHERE module_id = ${moduleId} AND batch_id = ${batchId}
      LIMIT 1
    `;
    if (assigned.length === 0) {
      return {
        ok: false,
        code: "not_assigned",
        message: "This training is not assigned to your batch.",
      };
    }
    return { ok: true, batchId };
  }

  const moduleRows = await sql`
    SELECT id FROM training_modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (moduleRows.length === 0) {
    return { ok: false, code: "not_found", message: "Module not found." };
  }

  const users = await sql`
    SELECT batch_id FROM users
    WHERE LOWER(email) = LOWER(${userEmail})
    LIMIT 1
  `;
  if (users.length === 0) {
    return {
      ok: false,
      code: "not_assigned",
      message: "Your account is not enrolled for this training.",
    };
  }

  const batchId = users[0].batch_id as string | null;
  if (!batchId) {
    return {
      ok: false,
      code: "not_assigned",
      message: "You are not assigned to a batch for this training.",
    };
  }

  const assigned = await sql`
    SELECT 1 FROM module_batches
    WHERE module_id = ${moduleId} AND batch_id = ${batchId}
    LIMIT 1
  `;
  if (assigned.length === 0) {
    return {
      ok: false,
      code: "not_assigned",
      message: "This training is not assigned to your batch.",
    };
  }

  return { ok: true, batchId };
}
