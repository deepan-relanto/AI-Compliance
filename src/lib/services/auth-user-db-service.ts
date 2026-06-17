import type { getSql } from "@/lib/db";
import { firstNameFromEmail } from "@/lib/auth-env";
import type { AuthUser, UserRole } from "@/lib/types";

type Sql = ReturnType<typeof getSql>;

export type DbAuthUser = {
  email: string;
  role: UserRole;
  batch_id: string | null;
  display_name: string | null;
};

const SSO_PLACEHOLDER = "microsoft-sso";

export async function getUserByEmail(
  sql: Sql,
  email: string,
): Promise<DbAuthUser | null> {
  const rows = await sql`
    SELECT email, role, batch_id, display_name
    FROM users
    WHERE LOWER(email) = LOWER(${email.trim()})
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    email: r.email as string,
    role: r.role as UserRole,
    batch_id: (r.batch_id as string) ?? null,
    display_name: (r.display_name as string) ?? null,
  };
}

/** Allow sign-in for existing users or HR roster matches (auto-provision). */
export async function ensureUserForSignIn(
  sql: Sql,
  email: string,
  displayNameHint?: string | null,
): Promise<DbAuthUser | null> {
  const normalized = email.trim().toLowerCase();
  const existing = await getUserByEmail(sql, normalized);
  if (existing) return existing;

  const employees = await sql`
    SELECT work_email, name FROM employees
    WHERE LOWER(work_email) = LOWER(${normalized})
    LIMIT 1
  `;
  if (employees.length === 0) return null;

  const workEmail = (employees[0].work_email as string).trim().toLowerCase();
  const name =
    displayNameHint?.trim() ||
    (employees[0].name as string) ||
    workEmail.split("@")[0];

  await sql`
    INSERT INTO users (email, password_hash, role, batch_id, display_name)
    VALUES (${workEmail}, ${SSO_PLACEHOLDER}, 'user', NULL, ${name})
    ON CONFLICT (email) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      updated_at = NOW()
  `;

  return getUserByEmail(sql, workEmail);
}

export function toAuthUser(db: DbAuthUser): AuthUser {
  return {
    username: db.email,
    role: db.role,
    batchId: db.batch_id ?? "",
    displayName:
      db.display_name?.trim() || firstNameFromEmail(db.email),
  };
}
