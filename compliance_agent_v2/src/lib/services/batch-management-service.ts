import type { getSql } from "@/lib/db";
import { slugifyBatchId } from "@/lib/parse-hr-date";
import { invalidateLearnerAccess } from "@/lib/learner-access-cache";
import { invalidateAdminCaches } from "@/lib/invalidate-admin-cache";

type Sql = ReturnType<typeof getSql>;

const SSO_PLACEHOLDER = "microsoft-sso";

/**
 * Progress.batch_id is the batch where the attempt belongs.
 * Never rewrite it when a learner is added to another batch — that erased
 * Support_Function_Batch_1 history when people were also enrolled in a new test batch.
 *
 * Only heal orphaned rows: progress points at a batch that does not have the
 * module assigned, while exactly one batch does → snap back to that batch.
 */
export async function syncProgressBatchForEmails(
  sql: Sql,
  emails: string[],
): Promise<number> {
  const normalized = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (!normalized.length) return 0;

  const [compliance, course] = await Promise.all([
    sql`
      UPDATE assessment_progress ap
      SET batch_id = sole.batch_id,
          updated_at = NOW()
      FROM (
        SELECT module_id, MIN(batch_id) AS batch_id
        FROM module_batches
        GROUP BY module_id
        HAVING COUNT(*) = 1
      ) sole
      WHERE ap.module_id = sole.module_id
        AND LOWER(ap.user_email) = ANY(${normalized})
        AND ap.batch_id IS DISTINCT FROM sole.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM module_batches mb
          WHERE mb.module_id = ap.module_id
            AND mb.batch_id = ap.batch_id
        )
      RETURNING ap.user_email
    `,
    sql`
      UPDATE course_progress cp
      SET batch_id = sole.batch_id,
          updated_at = NOW()
      FROM (
        SELECT module_id, MIN(batch_id) AS batch_id
        FROM course_module_batches
        GROUP BY module_id
        HAVING COUNT(*) = 1
      ) sole
      WHERE cp.module_id = sole.module_id
        AND LOWER(cp.user_email) = ANY(${normalized})
        AND cp.batch_id IS DISTINCT FROM sole.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM course_module_batches mb
          WHERE mb.module_id = cp.module_id
            AND mb.batch_id = cp.batch_id
        )
      RETURNING cp.user_email
    `,
  ]);
  return compliance.length + course.length;
}

/** Heal orphaned progress for every learner (used on analytics read / admin ops). */
export async function healOrphanedProgressBatchIds(sql: Sql): Promise<number> {
  const [compliance, course] = await Promise.all([
    sql`
      UPDATE assessment_progress ap
      SET batch_id = sole.batch_id,
          updated_at = NOW()
      FROM (
        SELECT module_id, MIN(batch_id) AS batch_id
        FROM module_batches
        GROUP BY module_id
        HAVING COUNT(*) = 1
      ) sole
      WHERE ap.module_id = sole.module_id
        AND ap.batch_id IS DISTINCT FROM sole.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM module_batches mb
          WHERE mb.module_id = ap.module_id
            AND mb.batch_id = ap.batch_id
        )
      RETURNING ap.id
    `,
    sql`
      UPDATE course_progress cp
      SET batch_id = sole.batch_id,
          updated_at = NOW()
      FROM (
        SELECT module_id, MIN(batch_id) AS batch_id
        FROM course_module_batches
        GROUP BY module_id
        HAVING COUNT(*) = 1
      ) sole
      WHERE cp.module_id = sole.module_id
        AND cp.batch_id IS DISTINCT FROM sole.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM course_module_batches mb
          WHERE mb.module_id = cp.module_id
            AND mb.batch_id = cp.batch_id
        )
      RETURNING cp.id
    `,
  ]);
  return compliance.length + course.length;
}

export async function syncBatchMemberCount(sql: Sql, batchId: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS c FROM user_batches WHERE batch_id = ${batchId}
  `;
  const count = Number(rows[0]?.c ?? 0);
  await sql`
    UPDATE batches SET member_count = ${count}, updated_at = NOW() WHERE id = ${batchId}
  `;
  return count;
}

/** Recompute member_count for every batch from multi-batch membership. */
export async function syncAllBatchMemberCounts(sql: Sql): Promise<number> {
  const rows = await sql`
    UPDATE batches b
    SET member_count = COALESCE(u.c, 0),
        updated_at = NOW()
    FROM (
      SELECT batch_id, COUNT(*)::int AS c
      FROM user_batches
      GROUP BY batch_id
    ) u
    WHERE b.id = u.batch_id
    RETURNING b.id
  `;
  await sql`
    UPDATE batches b
    SET member_count = 0, updated_at = NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM user_batches ub WHERE ub.batch_id = b.id
    )
      AND b.member_count <> 0
  `;
  return rows.length;
}

async function assignEmployeesToBatch(
  sql: Sql,
  batchId: string,
  emails: string[],
): Promise<number> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) return 0;

  const employees = await sql`
    SELECT work_email, name FROM employees
    WHERE LOWER(work_email) = ANY(${normalized})
  `;
  const emailToName = new Map(
    employees.map((e) => [(e.work_email as string).toLowerCase(), e.name as string]),
  );

  const emails_arr = normalized;
  const names_arr = normalized.map((e) => emailToName.get(e) ?? e.split("@")[0]);
  const passwords_arr = normalized.map(() => SSO_PLACEHOLDER);
  const roles_arr = normalized.map(() => "user");
  const batches_arr = normalized.map(() => batchId);

  // Never overwrite role — adding an admin to a batch must not demote them.
  // Never overwrite an existing primary batch_id — adding to a new batch must
  // not steal the learner from their previous batch(es).
  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    SELECT * FROM unnest(
      ${emails_arr}::text[],
      ${passwords_arr}::text[],
      ${roles_arr}::text[],
      ${batches_arr}::text[],
      ${names_arr}::text[]
    ) AS t(email, password_hash, role, batch_id, display_name)
    ON CONFLICT (email) DO UPDATE SET
      batch_id = COALESCE(users.batch_id, EXCLUDED.batch_id),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO user_batches (user_email, batch_id)
    SELECT * FROM unnest(
      ${emails_arr}::text[],
      ${batches_arr}::text[]
    ) AS t(user_email, batch_id)
    ON CONFLICT DO NOTHING
  `;

  await syncProgressBatchForEmails(sql, normalized);
  for (const email of normalized) invalidateLearnerAccess(email);
  invalidateAdminCaches();
  return normalized.length;
}

async function uniqueBatchId(sql: Sql, label: string): Promise<string> {
  const base = slugifyBatchId(label);
  const rows = await sql`
    SELECT id FROM batches WHERE id = ${base} OR id LIKE ${base + "-%"}
  `;
  const existing = new Set(rows.map((r) => r.id as string));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function createBatch(
  sql: Sql,
  params: { label: string; description?: string; employeeEmails: string[] },
): Promise<{ id: string; label: string; memberCount: number }> {
  const id = await uniqueBatchId(sql, params.label);
  const description = params.description?.trim() ?? "";

  await sql`
    INSERT INTO batches (id, label, description, member_count, compliance, pass_rate, fail_rate, active_sessions)
    VALUES (${id}, ${params.label.trim()}, ${description}, 0, 0, 0, 0, 0)
  `;

  await assignEmployeesToBatch(sql, id, params.employeeEmails);
  const memberCount = await syncBatchMemberCount(sql, id);

  return { id, label: params.label.trim(), memberCount };
}

export async function deleteBatch(sql: Sql, batchId: string): Promise<boolean> {
  const rows = await sql`DELETE FROM batches WHERE id = ${batchId} RETURNING id`;
  return rows.length > 0;
}

export async function addBatchMembers(
  sql: Sql,
  batchId: string,
  employeeEmails: string[],
): Promise<number> {
  const assigned = await assignEmployeesToBatch(sql, batchId, employeeEmails);
  await syncBatchMemberCount(sql, batchId);
  return assigned;
}

export async function removeBatchMembers(
  sql: Sql,
  batchId: string,
  employeeEmails: string[],
): Promise<number> {
  const normalized = [...new Set(employeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) return 0;

  const rows = await sql`
    DELETE FROM user_batches
    WHERE batch_id = ${batchId}
      AND LOWER(user_email) = ANY(${normalized})
    RETURNING user_email
  `;
  const removedEmails = rows.map((r) => (r.user_email as string).toLowerCase());
  if (!removedEmails.length) {
    await syncBatchMemberCount(sql, batchId);
    return 0;
  }

  // If primary users.batch_id pointed at the removed batch, point it at another
  // remaining membership (or null).
  await sql`
    UPDATE users u
    SET batch_id = alt.batch_id,
        updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (LOWER(ub.user_email))
        LOWER(ub.user_email) AS email,
        ub.batch_id
      FROM user_batches ub
      WHERE LOWER(ub.user_email) = ANY(${removedEmails})
      ORDER BY LOWER(ub.user_email), ub.created_at ASC
    ) alt
    WHERE LOWER(u.email) = alt.email
      AND u.batch_id = ${batchId}
  `;

  await sql`
    UPDATE users
    SET batch_id = NULL, updated_at = NOW()
    WHERE batch_id = ${batchId}
      AND LOWER(email) = ANY(${removedEmails})
      AND NOT EXISTS (
        SELECT 1 FROM user_batches ub
        WHERE LOWER(ub.user_email) = LOWER(users.email)
      )
  `;

  await syncProgressBatchForEmails(sql, removedEmails);
  for (const email of removedEmails) invalidateLearnerAccess(email);
  invalidateAdminCaches();
  await syncBatchMemberCount(sql, batchId);
  return removedEmails.length;
}
