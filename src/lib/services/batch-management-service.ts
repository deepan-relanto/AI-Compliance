import type { getSql } from "@/lib/db";
import { slugifyBatchId } from "@/lib/parse-hr-date";

type Sql = ReturnType<typeof getSql>;

const SSO_PLACEHOLDER = "microsoft-sso";

/** Keep progress rows aligned when roster batch changes. */
export async function syncProgressBatchForEmails(
  sql: Sql,
  emails: string[],
): Promise<number> {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) return 0;

  const rows = await sql`
    UPDATE assessment_progress ap
    SET batch_id = u.batch_id,
        updated_at = NOW()
    FROM users u
    WHERE LOWER(ap.user_email) = LOWER(u.email)
      AND LOWER(u.email) = ANY(${normalized})
      AND u.batch_id IS NOT NULL
      AND ap.batch_id IS DISTINCT FROM u.batch_id
    RETURNING ap.user_email
  `;
  return rows.length;
}

export async function syncBatchMemberCount(sql: Sql, batchId: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS c FROM users WHERE batch_id = ${batchId} AND role = 'user'
  `;
  const count = Number(rows[0]?.c ?? 0);
  await sql`
    UPDATE batches SET member_count = ${count}, updated_at = NOW() WHERE id = ${batchId}
  `;
  return count;
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

  let assigned = 0;
  for (const email of normalized) {
    const displayName = emailToName.get(email) ?? email.split("@")[0];
    await sql`
      INSERT INTO users (email, password_hash, role, batch_id, display_name)
      VALUES (${email}, ${SSO_PLACEHOLDER}, 'user', ${batchId}, ${displayName})
      ON CONFLICT (email) DO UPDATE SET
        batch_id = EXCLUDED.batch_id,
        display_name = COALESCE(EXCLUDED.display_name, users.display_name),
        updated_at = NOW()
    `;
    assigned++;
  }
  await syncProgressBatchForEmails(sql, normalized);
  return assigned;
}

async function uniqueBatchId(sql: Sql, label: string): Promise<string> {
  const base = slugifyBatchId(label);
  let id = base;
  let n = 2;
  while (true) {
    const rows = await sql`SELECT id FROM batches WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return id;
    id = `${base}-${n}`;
    n++;
  }
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
    UPDATE users
    SET batch_id = NULL, updated_at = NOW()
    WHERE batch_id = ${batchId}
      AND LOWER(email) = ANY(${normalized})
    RETURNING email
  `;
  const removedEmails = rows.map((r) => r.email as string);
  if (removedEmails.length) {
    await syncProgressBatchForEmails(sql, removedEmails);
  }
  await syncBatchMemberCount(sql, batchId);
  return rows.length;
}
