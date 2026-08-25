import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

/**
 * Admins may read any stored asset. Learners may read assets for a module
 * currently assigned to one of their batches, or previously assigned with
 * marks still on that batch.
 */
export async function canAccessCourseAsset(
  sql: Sql,
  email: string,
  assetUrl: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;

  const users = await sql`
    SELECT role FROM users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  if (!users.length) return false;
  if ((users[0].role as string) === "admin") return true;

  const filename = assetUrl.split("/").pop() ?? "";
  const hits = await sql`
    SELECT 1
    FROM course_module_steps s
    WHERE (
        s.config->>'assetUrl' = ${assetUrl}
        OR s.config->>'assetUrl' LIKE ${`%/course-assets/${filename}`}
      )
      AND EXISTS (
        SELECT 1
        FROM user_batches ub
        WHERE LOWER(ub.user_email) = LOWER(${email})
          AND (
            EXISTS (
              SELECT 1 FROM course_module_batches cmb
              WHERE cmb.module_id = s.module_id AND cmb.batch_id = ub.batch_id
            )
            OR EXISTS (
              SELECT 1 FROM course_progress p
              WHERE p.module_id = s.module_id AND p.batch_id = ub.batch_id
            )
          )
      )
    LIMIT 1
  `;
  return hits.length > 0;
}

export async function canAccessUploadPdf(
  sql: Sql,
  email: string,
  pdfUrl: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;

  const users = await sql`
    SELECT role FROM users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  if (!users.length) return false;
  if ((users[0].role as string) === "admin") return true;

  const filename = pdfUrl.split("/").pop() ?? "";
  const hits = await sql`
    SELECT 1
    FROM training_modules m
    WHERE (
        m.pdf_url = ${pdfUrl}
        OR m.pdf_url LIKE ${`%/uploads/${filename}`}
      )
      AND EXISTS (
        SELECT 1
        FROM user_batches ub
        WHERE LOWER(ub.user_email) = LOWER(${email})
          AND (
            EXISTS (
              SELECT 1 FROM module_batches mb
              WHERE mb.module_id = m.id AND mb.batch_id = ub.batch_id
            )
            OR EXISTS (
              SELECT 1 FROM assessment_progress p
              WHERE p.module_id = m.id AND p.batch_id = ub.batch_id
            )
          )
      )
    LIMIT 1
  `;
  return hits.length > 0;
}
